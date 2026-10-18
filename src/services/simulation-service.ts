import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  AuthenticatedSessionContext,
  assertDossierAccess,
  AuthorizationError,
} from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";
import {
  CountryConfigurationVersion,
  evaluateCountryFiscalReadiness,
} from "../countries/country-registry.js";
import { appConfig } from "../config/app-config.js";
import { computeTaxFromBasisPoints } from "../domain/money.js";
import {
  getClientDossierDetails,
  getCountryConfigurationByVersionId,
  getCountryConfigurationByCode,
} from "./tenant-service.js";

function resolveActorRole(
  session: AuthenticatedSessionContext | null,
  organizationId: string
): string {
  if (!session) return "SYSTEM";
  const m = session.memberships.find((mb) => mb.organizationId === organizationId);
  return m ? m.role : "AUTHENTICATED_USER";
}

export type SimulationType =
  | "VAT_SUMMARY"
  | "SOCIAL_CONTRIBUTIONS"
  | "INCOME_OR_CORPORATE_TAX"
  | "EXPENSE_IMPACT";

export interface SimulationInput {
  simulationType: SimulationType;
  effectiveDate?: string;
  ruleVersionId?: string;

  // Paramètres pour VAT_SUMMARY
  revenueNetMinor?: number;
  expensesNetMinor?: number;
  vatRateBps?: number;
  useActualDossierInvoices?: boolean;

  // Paramètres pour SOCIAL_CONTRIBUTIONS
  taxRegimeCode?: string;
  basisRevenueMinor?: number;
  basisProfitMinor?: number;
  customContributionRateBps?: number;

  // Paramètres pour INCOME_OR_CORPORATE_TAX
  taxableProfitMinor?: number;
  taxRegimeType?: "IS_PME" | "IS_NORMAL" | "IR_INDIVIDUAL";
  customTaxRateBps?: number;

  // Paramètres pour EXPENSE_IMPACT
  expenseNetMinor?: number;
  expenseVatRateBps?: number;
  isDeductibleVat?: boolean;
  corporateTaxRateBps?: number;
}

export interface SimulationResultRecord {
  id: string;
  organizationId: string;
  dossierId: string;
  simulationType: SimulationType;
  status: "COMPUTED_INDICATIVE" | "BLOCKED_MISSING_OR_UNVERIFIED_RULES";
  countryCode: string;
  ruleVersionId: string;
  effectiveDateUsed: string;
  inputParameters: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  assumptions: string[];
  limitations: string[];
  missingOrUnverifiedParameters: string[];
  disclaimerText: string;
  createdByUserId: string;
  createdAt: string;
}

/**
 * Service de Simulations Indicatives Versionnées (Module 7 — Phase 1, Lot 1.7).
 *
 * Principes stricts de conformité :
 * 1. Règles versionnées par juridiction, régime fiscal et période d'application.
 * 2. Conservation intégrale des hypothèses, paramètres d'entrée et limites de calcul (simulations_history).
 * 3. Reproductibilité absolue : deux calculs avec les mêmes données et la même version de règles
 *    produisent rigoureusement le même résultat en unités mineures entières (centimes).
 * 4. Avertissement réglementaire obligatoire inséré dans chaque simulation :
 *    "Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable.
 *     Seul votre expert-comptable est habilité à valider vos choix fiscaux."
 * 5. Aucun résultat n'est présenté comme une déclaration fiscale officielle ou un avis engageant.
 * 6. Blocage explicite (status = BLOCKED_MISSING_OR_UNVERIFIED_RULES) lorsqu'un barème réglementaire
 *    n'est pas formellement vérifié dans la version de la juridiction (ex: PENDING_LEGAL_VALIDATION).
 */
export class SimulationService {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  /**
   * Crée et persiste une simulation indicative pour un dossier client.
   */
  createSimulation(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    input: SimulationInput
  ): SimulationResultRecord {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "VIEW",
      db: this.db,
    });

    const dossierDetails = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    });
    const dossier = dossierDetails.dossier;

    const effectiveDate = input.effectiveDate || new Date().toISOString().substring(0, 10);
    const countryConfig = input.ruleVersionId
      ? getCountryConfigurationByVersionId(input.ruleVersionId, this.db)
      : getCountryConfigurationByCode(dossier.countryCode || "FR", this.db, effectiveDate);

    const now = new Date().toISOString();
    const simulationId = `sim_${crypto.randomUUID()}`;

    let simStatus: "COMPUTED_INDICATIVE" | "BLOCKED_MISSING_OR_UNVERIFIED_RULES" = "COMPUTED_INDICATIVE";
    const assumptions: string[] = [];
    const limitations: string[] = [];
    const missingParams: string[] = [];
    let resultData: Record<string, unknown> | null = null;

    const disclaimerText = appConfig.regulatoryDisclaimer ||
      "Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable. Seul votre expert-comptable est habilité à valider vos choix fiscaux.";

    if (countryConfig.validationStatus === "DRAFT_INCOMPLETE" || countryConfig.validationStatus === "OBSOLETE") {
      missingParams.push(`Le millésime réglementaire ${countryConfig.versionId} est en statut ${countryConfig.validationStatus} (non validé pour la production).`);
      limitations.push(`Calcul bloqué : la version de règles ${countryConfig.versionId} n'est pas validée pour la production.`);
      simStatus = "BLOCKED_MISSING_OR_UNVERIFIED_RULES";
    }

    if (simStatus !== "BLOCKED_MISSING_OR_UNVERIFIED_RULES") {
      switch (input.simulationType) {
      case "VAT_SUMMARY": {
        let revNet = input.revenueNetMinor ?? 0;
        let expNet = input.expensesNetMinor ?? 0;

        if (input.useActualDossierInvoices) {
          const invQuery = this.db.prepare(`
            SELECT
              COALESCE(SUM(CASE WHEN direction = 'ISSUED' THEN net_amount_minor ELSE 0 END), 0) AS total_sales_net,
              COALESCE(SUM(CASE WHEN direction = 'ISSUED' THEN vat_amount_minor ELSE 0 END), 0) AS total_sales_vat,
              COALESCE(SUM(CASE WHEN direction = 'RECEIVED' THEN net_amount_minor ELSE 0 END), 0) AS total_purchases_net,
              COALESCE(SUM(CASE WHEN direction = 'RECEIVED' THEN vat_amount_minor ELSE 0 END), 0) AS total_purchases_vat
            FROM invoices
            WHERE organization_id = ? AND dossier_id = ?
          `);
          const invRow = invQuery.get(organizationId, dossierId) as any;
          revNet = Number(invRow?.total_sales_net || 0);
          expNet = Number(invRow?.total_purchases_net || 0);
          assumptions.push("Montants agrégés automatiquement depuis les factures réelles enregistrées dans le dossier.");
        }

        if (!Number.isSafeInteger(revNet) || !Number.isSafeInteger(expNet) || revNet < 0 || expNet < 0) {
          throw new Error("Les montants de chiffre d'affaires et de dépenses doivent être des entiers positifs valides en centimes.");
        }

        // Taux de TVA sélectionné
        const appliedVatRateBps = input.vatRateBps !== undefined ? input.vatRateBps : 2000;
        if (!Number.isSafeInteger(appliedVatRateBps) || appliedVatRateBps < 0 || appliedVatRateBps > 10000) {
          throw new Error("Le taux de TVA (en points de base) doit être un entier valide compris entre 0 et 10000.");
        }

        const matchingVatRate = countryConfig.vatRates.find(
          (r: any) => r.rateBasisPoints === appliedVatRateBps && r.isVerified
        );

        if (!matchingVatRate && countryConfig.indirectTaxSystem !== "NONE") {
          assumptions.push(`Taux de TVA simulé : ${(appliedVatRateBps / 100).toFixed(2)} % (taux personnalisé ou non vérifié dans le millésime ${countryConfig.versionId}).`);
        } else {
          assumptions.push(`Taux de TVA officiel vérifié : ${matchingVatRate ? matchingVatRate.label : "Aucun (0 %)"}.`);
        }

        const collectedVatMinor = Math.round((revNet * appliedVatRateBps) / 10000);
        const deductibleVatMinor = Math.round((expNet * appliedVatRateBps) / 10000);
        const netVatPayableMinor = collectedVatMinor - deductibleVatMinor;

        resultData = {
          revenueNetMinor: revNet,
          expensesNetMinor: expNet,
          vatRateBps: appliedVatRateBps,
          vatRatePercent: (appliedVatRateBps / 100).toFixed(2),
          collectedVatMinor,
          deductibleVatMinor,
          netVatPayableMinor,
          isVatCredit: netVatPayableMinor < 0,
          vatCreditMinor: netVatPayableMinor < 0 ? Math.abs(netVatPayableMinor) : 0,
          currency: countryConfig.defaultCurrency,
        };
        break;
      }

      case "SOCIAL_CONTRIBUTIONS": {
        const regimeCode = input.taxRegimeCode || (dossier as any).taxRegimeCode || "FR_MICRO_ENTREPRISE";
        const regime = countryConfig.taxRegimes.find((r: any) => r.code === regimeCode);

        const basisMinor = input.basisRevenueMinor ?? input.basisProfitMinor ?? 0;
        if (!Number.isSafeInteger(basisMinor) || basisMinor < 0) {
          throw new Error("L'assiette de calcul des cotisations doit être un entier positif valide en centimes.");
        }

        // Si le régime officiel dans la juridiction n'est pas vérifié et qu'aucun taux personnalisé n'est fourni
        if ((!regime || !regime.isVerified || regime.socialContributionRateBps === null) && input.customContributionRateBps === undefined) {
          simStatus = "BLOCKED_MISSING_OR_UNVERIFIED_RULES";
          missingParams.push(
            `Le barème de cotisations sociales pour le régime "${regimeCode}" n'a pas encore fait l'objet d'une validation réglementaire formelle pour le millésime ${countryConfig.versionId}.`
          );
          limitations.push("Pour effectuer une simulation indicative, veuillez renseigner un taux de cotisation hypothétique (customContributionRateBps).");
          resultData = null;
        } else {
          const appliedRateBps = input.customContributionRateBps ?? (regime?.socialContributionRateBps || 2110);
          if (!Number.isSafeInteger(appliedRateBps) || appliedRateBps < 0 || appliedRateBps > 10000) {
            throw new Error("Le taux de cotisations sociales (en points de base) doit être un entier valide compris entre 0 et 10000.");
          }

          if (input.customContributionRateBps !== undefined) {
            assumptions.push(`Taux de cotisations hypothétique fourni par l'utilisateur : ${(appliedRateBps / 100).toFixed(2)} %.`);
          } else {
            assumptions.push(`Taux réglementaire vérifié pour ${regime?.label || regimeCode} : ${(appliedRateBps / 100).toFixed(2)} %.`);
          }

          const contributionsMinor = Math.round((basisMinor * appliedRateBps) / 10000);
          const netIncomeMinor = basisMinor - contributionsMinor;

          resultData = {
            regimeCode,
            regimeLabel: regime?.label || regimeCode,
            basisMinor,
            contributionRateBps: appliedRateBps,
            contributionRatePercent: (appliedRateBps / 100).toFixed(2),
            contributionsMinor,
            netIncomeAfterContributionsMinor: netIncomeMinor,
            currency: countryConfig.defaultCurrency,
          };
        }
        break;
      }

      case "INCOME_OR_CORPORATE_TAX": {
        const profitMinor = input.taxableProfitMinor ?? 0;
        if (!Number.isSafeInteger(profitMinor) || profitMinor < 0) {
          throw new Error("Le bénéfice imposable doit être un entier positif valide en centimes.");
        }

        const regimeType = input.taxRegimeType || "IS_PME";

        if (regimeType === "IS_PME") {
          // Barème PME France (art. 219-I-b du CGI) :
          // Taux réduit de 15% jusqu'à 42 500 € (4 250 000 centimes)
          // Taux normal de 25% au-delà
          const PME_THRESHOLD_MINOR = 4_250_000;
          const tranche1Base = Math.min(profitMinor, PME_THRESHOLD_MINOR);
          const tranche2Base = Math.max(0, profitMinor - PME_THRESHOLD_MINOR);

          const taxTranche1 = Math.round((tranche1Base * 1500) / 10000);
          const taxTranche2 = Math.round((tranche2Base * 2500) / 10000);
          const totalTaxMinor = taxTranche1 + taxTranche2;
          const effectiveRateBps = profitMinor > 0 ? Math.round((totalTaxMinor * 10000) / profitMinor) : 0;

          assumptions.push(
            "Hypothèse PME éligible au taux réduit d'IS de 15% (CGI art. 219-I-b) jusqu'à 42 500 € de bénéfice, et 25% au-delà.",
            "Condition d'éligibilité supposée satisfaite : capital entièrement libéré et détenu à 75% au moins par des personnes physiques, CA < 10 millions d'euros."
          );

          resultData = {
            regimeType: "IS_PME",
            taxableProfitMinor: profitMinor,
            tranche1BaseMinor: tranche1Base,
            tranche1RateBps: 1500,
            tranche1TaxMinor: taxTranche1,
            tranche2BaseMinor: tranche2Base,
            tranche2RateBps: 2500,
            tranche2TaxMinor: taxTranche2,
            totalTaxEstimatedMinor: totalTaxMinor,
            effectiveRateBps,
            effectiveRatePercent: (effectiveRateBps / 100).toFixed(2),
            netProfitAfterTaxMinor: profitMinor - totalTaxMinor,
            currency: countryConfig.defaultCurrency,
          };
        } else if (regimeType === "IS_NORMAL") {
          const rateBps = input.customTaxRateBps ?? 2500;
          const totalTaxMinor = Math.round((profitMinor * rateBps) / 10000);
          assumptions.push(`Impôt sur les sociétés au taux normal de ${(rateBps / 100).toFixed(2)} % sur l'intégralité du bénéfice imposable.`);

          resultData = {
            regimeType: "IS_NORMAL",
            taxableProfitMinor: profitMinor,
            taxRateBps: rateBps,
            effectiveRateBps: rateBps,
            taxRatePercent: (rateBps / 100).toFixed(2),
            totalTaxEstimatedMinor: totalTaxMinor,
            netProfitAfterTaxMinor: profitMinor - totalTaxMinor,
            currency: countryConfig.defaultCurrency,
          };
        } else {
          // IR Individual
          const rateBps = input.customTaxRateBps ?? 3000;
          const totalTaxMinor = Math.round((profitMinor * rateBps) / 10000);
          assumptions.push(`Simulation indicative IR avec taux moyen estimé à ${(rateBps / 100).toFixed(2)} % (hors quotient familial et crédits d'impôt).`);

          resultData = {
            regimeType: "IR_INDIVIDUAL",
            taxableProfitMinor: profitMinor,
            estimatedTaxRateBps: rateBps,
            totalTaxEstimatedMinor: totalTaxMinor,
            netProfitAfterTaxMinor: profitMinor - totalTaxMinor,
            currency: countryConfig.defaultCurrency,
          };
        }
        break;
      }

      case "EXPENSE_IMPACT": {
        const expNet = input.expenseNetMinor ?? 0;
        if (!Number.isSafeInteger(expNet) || expNet <= 0) {
          throw new Error("Le montant HT de la dépense doit être un entier strictement positif en centimes.");
        }

        const vatRateBps = input.expenseVatRateBps !== undefined ? input.expenseVatRateBps : 2000;
        if (!Number.isSafeInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10000) {
          throw new Error("Le taux de TVA de la dépense doit être un entier valide entre 0 et 10000 points de base.");
        }

        const isDeductible = input.isDeductibleVat !== false;
        const corpTaxRateBps = input.corporateTaxRateBps !== undefined ? input.corporateTaxRateBps : 2500;

        const vatAmountMinor = Math.round((expNet * vatRateBps) / 10000);
        const grossAmountMinor = expNet + vatAmountMinor;
        const recoverableVatMinor = isDeductible ? vatAmountMinor : 0;
        const nonRecoverableVatMinor = vatAmountMinor - recoverableVatMinor;
        const accountingExpenseMinor = expNet + nonRecoverableVatMinor;
        const taxSavingsMinor = Math.round((accountingExpenseMinor * corpTaxRateBps) / 10000);
        const netCashflowImpactMinor = grossAmountMinor - recoverableVatMinor - taxSavingsMinor;

        assumptions.push(
          `Dépense brute TTC de ${(grossAmountMinor / 100).toFixed(2)} € (HT ${(expNet / 100).toFixed(2)} € + TVA ${(vatAmountMinor / 100).toFixed(2)} €).`,
          isDeductible
            ? "TVA supposée récupérable à 100% selon les règles de déductibilité du CGI."
            : "TVA exclue du droit à déduction (ex: véhicule de tourisme, cadeaux sans valeur probante).",
          `Économie d'impôt calculée sur la base d'un taux marginal d'IS/IR de ${(corpTaxRateBps / 100).toFixed(2)} %.`
        );

        resultData = {
          expenseNetMinor: expNet,
          vatRateBps,
          vatAmountMinor,
          grossAmountMinor,
          isDeductibleVat: isDeductible,
          recoverableVatMinor,
          nonRecoverableVatMinor,
          accountingExpenseMinor,
          corporateTaxRateBps: corpTaxRateBps,
          taxSavingsEstimatedMinor: taxSavingsMinor,
          netCashflowCostMinor: netCashflowImpactMinor,
          currency: countryConfig.defaultCurrency,
        };
        break;
      }

      }
    }

    // Persistance dans simulations_history
    const insertStmt = this.db.prepare(`
      INSERT INTO simulations_history (
        id, organization_id, dossier_id, simulation_type, rule_version_id,
        input_params_json, result_json, assumptions_json, limitations_json,
        disclaimer_text, created_by_user_id, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    insertStmt.run(
      simulationId,
      organizationId,
      dossierId,
      input.simulationType,
      countryConfig.versionId,
      JSON.stringify(input),
      resultData ? JSON.stringify(resultData) : null,
      JSON.stringify(assumptions),
      JSON.stringify(limitations),
      disclaimerText,
      session?.user.id || "SYSTEM",
      now
    );

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "SIMULATION_EXECUTED",
      targetEntityType: "SIMULATION",
      targetEntityId: simulationId,
      justification: `Exécution d'une simulation indicative de type ${input.simulationType} (statut: ${simStatus})`,
      metadata: {
        simulationType: input.simulationType,
        ruleVersionId: countryConfig.versionId,
        status: simStatus,
      },
    });

    return {
      id: simulationId,
      organizationId,
      dossierId,
      simulationType: input.simulationType,
      status: simStatus,
      countryCode: countryConfig.countryCode,
      ruleVersionId: countryConfig.versionId,
      effectiveDateUsed: effectiveDate,
      inputParameters: input as unknown as Record<string, unknown>,
      resultData,
      assumptions,
      limitations,
      missingOrUnverifiedParameters: missingParams,
      disclaimerText,
      createdByUserId: session?.user.id || "SYSTEM",
      createdAt: now,
    };
  }

  /**
   * Liste l'historique des simulations d'un dossier client.
   */
  listSimulations(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string
  ): SimulationResultRecord[] {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "VIEW",
      db: this.db,
    });

    const stmt = this.db.prepare(`
      SELECT
        id, organization_id, dossier_id, simulation_type, rule_version_id,
        input_params_json, result_json, assumptions_json, limitations_json,
        disclaimer_text, created_by_user_id, created_at
      FROM simulations_history
      WHERE organization_id = ? AND dossier_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(organizationId, dossierId) as any[];
    return rows.map((r) => {
      const resultData = r.result_json ? JSON.parse(r.result_json) : null;
      return {
        id: r.id,
        organizationId: r.organization_id,
        dossierId: r.dossier_id,
        simulationType: r.simulation_type as SimulationType,
        status: resultData ? "COMPUTED_INDICATIVE" : "BLOCKED_MISSING_OR_UNVERIFIED_RULES",
        countryCode: "FR",
        ruleVersionId: r.rule_version_id,
        effectiveDateUsed: r.created_at.substring(0, 10),
        inputParameters: JSON.parse(r.input_params_json),
        resultData,
        assumptions: JSON.parse(r.assumptions_json || "[]"),
        limitations: JSON.parse(r.limitations_json || "[]"),
        missingOrUnverifiedParameters: [],
        disclaimerText: r.disclaimer_text,
        createdByUserId: r.created_by_user_id,
        createdAt: r.created_at,
      };
    });
  }

  /**
   * Récupère le détail d'une simulation spécifique.
   */
  getSimulationDetails(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    simulationId: string
  ): SimulationResultRecord {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "VIEW",
      db: this.db,
    });

    const stmt = this.db.prepare(`
      SELECT
        id, organization_id, dossier_id, simulation_type, rule_version_id,
        input_params_json, result_json, assumptions_json, limitations_json,
        disclaimer_text, created_by_user_id, created_at
      FROM simulations_history
      WHERE id = ? AND organization_id = ? AND dossier_id = ?
    `);

    const r = stmt.get(simulationId, organizationId, dossierId) as any;
    if (!r) {
      throw new Error(`Simulation introuvable : ${simulationId}`);
    }

    const resultData = r.result_json ? JSON.parse(r.result_json) : null;
    return {
      id: r.id,
      organizationId: r.organization_id,
      dossierId: r.dossier_id,
      simulationType: r.simulation_type as SimulationType,
      status: resultData ? "COMPUTED_INDICATIVE" : "BLOCKED_MISSING_OR_UNVERIFIED_RULES",
      countryCode: "FR",
      ruleVersionId: r.rule_version_id,
      effectiveDateUsed: r.created_at.substring(0, 10),
      inputParameters: JSON.parse(r.input_params_json),
      resultData,
      assumptions: JSON.parse(r.assumptions_json || "[]"),
      limitations: JSON.parse(r.limitations_json || "[]"),
      missingOrUnverifiedParameters: [],
      disclaimerText: r.disclaimer_text,
      createdByUserId: r.created_by_user_id,
      createdAt: r.created_at,
    };
  }
}
