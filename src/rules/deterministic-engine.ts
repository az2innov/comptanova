import {
  MonetaryAmount,
  computeTaxFromBasisPoints,
  addMoney,
  verifyDebitCreditBalance,
  getCurrencyExponent,
} from "../domain/money.js";
import { AnomalySeverity } from "../domain/types.js";
import {
  CountryConfigurationVersion,
  evaluateCountryFiscalReadiness,
} from "../countries/country-registry.js";
import { appConfig } from "../config/app-config.js";

/**
 * Moteur de règles déterministe international (Niveau A — Sections 2.A, 4, 5).
 * - Aucun taux fiscal national (ex: 2000 bps) n'est codé en dur par défaut dans ce moteur.
 * - Prend en charge les juridictions avec TVA, GST, Sales Tax ou sans taxe indirecte (`indirectTaxSystem === "NONE"`).
 * - Utilise la méthode d'arrondi (`defaultRoundingMode`) et la précision monétaire de la devise de la juridiction.
 * - Conserve systématiquement `ruleVersionId`, `effectiveDate` et les paramètres d'entrée pour garantir la reproductibilité des calculs historiques.
 */

export interface DeterministicAnomalyResult {
  ruleCode: string;
  category:
    | "ARITHMETIC_VAT_INCONSISTENCY"
    | "UNVERIFIED_VAT_RATE"
    | "UNBALANCED_ACCOUNTING_ENTRY"
    | "DUPLICATE_DOCUMENT_CHECKSUM"
    | "MISSING_MANDATORY_FIELD";
  severity: AnomalySeverity;
  isCertainError: boolean;
  message: string;
  ruleVersionId: string;
  sourceDataSnapshot: Record<string, unknown>;
  detectedAt: string;
}

/**
 * Contrôle déterministe de cohérence arithmétique HT + Taxe = TTC et de validité du taux selon la configuration de la juridiction à la date de la pièce.
 */
export function checkInvoiceAmountsDeterministically(params: {
  netAmount: MonetaryAmount;
  vatAmount: MonetaryAmount;
  grossAmount: MonetaryAmount;
  appliedVatRateBps: number;
  countryConfig: CountryConfigurationVersion;
  invoiceDate: string;
}): DeterministicAnomalyResult[] {
  const anomalies: DeterministicAnomalyResult[] = [];
  const now = new Date().toISOString();
  const roundingMode = params.countryConfig.defaultRoundingMode ?? "HALF_UP";

  // 1. Vérifier Net + Taxe == Brut (TTC)
  const expectedGross = addMoney(params.netAmount, params.vatAmount);
  if (expectedGross.amountMinor !== params.grossAmount.amountMinor) {
    anomalies.push({
      ruleCode: "RULE_ARITH_HT_PLUS_TVA_EQ_TTC",
      category: "ARITHMETIC_VAT_INCONSISTENCY",
      severity: "CRITICAL_CERTAIN",
      isCertainError: true,
      message: `Incohérence arithmétique certaine : Net (${params.netAmount.amountMinor}) + Taxe (${params.vatAmount.amountMinor}) = ${expectedGross.amountMinor} ≠ Brut (${params.grossAmount.amountMinor}).`,
      ruleVersionId: params.countryConfig.versionId,
      sourceDataSnapshot: {
        netMinor: params.netAmount.amountMinor,
        vatMinor: params.vatAmount.amountMinor,
        grossMinor: params.grossAmount.amountMinor,
        currency: params.netAmount.currency,
        minorUnitExponent: getCurrencyExponent(params.netAmount.currency),
      },
      detectedAt: now,
    });
  }

  // Cas d'une juridiction sans taxe indirecte (indirectTaxSystem === "NONE")
  if (params.countryConfig.indirectTaxSystem === "NONE") {
    if (params.appliedVatRateBps !== 0 || params.vatAmount.amountMinor !== 0) {
      anomalies.push({
        ruleCode: "RULE_COUNTRY_VAT_RATE_VALIDITY",
        category: "UNVERIFIED_VAT_RATE",
        severity: "SUSPICION_TO_VERIFY",
        isCertainError: false,
        message: `La juridiction ${params.countryConfig.countryCode} (${params.countryConfig.versionId}) n'applique pas de taxe indirecte, mais un taux (${params.appliedVatRateBps} bps) ou montant (${params.vatAmount.amountMinor}) non nul est présent.`,
        ruleVersionId: params.countryConfig.versionId,
        sourceDataSnapshot: {
          appliedVatRateBps: params.appliedVatRateBps,
          vatMinor: params.vatAmount.amountMinor,
          countryCode: params.countryConfig.countryCode,
        },
        detectedAt: now,
      });
    }
    return anomalies;
  }

  // 2. Vérifier que le taux de taxe existe et est vérifié dans la configuration de la juridiction à la date de facture
  const matchingRate = params.countryConfig.vatRates.find(
    (r) =>
      r.rateBasisPoints === params.appliedVatRateBps &&
      r.isVerified &&
      r.effectiveFrom <= params.invoiceDate &&
      (r.effectiveTo === null || r.effectiveTo >= params.invoiceDate)
  );

  if (!matchingRate) {
    anomalies.push({
      ruleCode: "RULE_COUNTRY_VAT_RATE_VALIDITY",
      category: "UNVERIFIED_VAT_RATE",
      severity: "SUSPICION_TO_VERIFY",
      isCertainError: false,
      message: `Taux de taxe (${(params.appliedVatRateBps / 100).toFixed(2)} %) absent ou non vérifié dans la configuration ${params.countryConfig.countryCode} (${params.countryConfig.versionId}) à la date du ${params.invoiceDate}. Vérification humaine requise.`,
      ruleVersionId: params.countryConfig.versionId,
      sourceDataSnapshot: {
        appliedVatRateBps: params.appliedVatRateBps,
        invoiceDate: params.invoiceDate,
        countryCode: params.countryConfig.countryCode,
      },
      detectedAt: now,
    });
  } else {
    // 3. Vérifier la cohérence du montant de taxe par rapport au taux et au mode d'arrondi de la juridiction
    const expectedVat = computeTaxFromBasisPoints(
      params.netAmount,
      params.appliedVatRateBps,
      roundingMode
    );
    const vatDiff = Math.abs(
      expectedVat.amountMinor - params.vatAmount.amountMinor
    );
    if (vatDiff > 1) {
      anomalies.push({
        ruleCode: "RULE_VAT_CALCULATION_MISMATCH",
        category: "ARITHMETIC_VAT_INCONSISTENCY",
        severity: "CRITICAL_CERTAIN",
        isCertainError: true,
        message: `Montant de taxe incohérent avec le taux ${(params.appliedVatRateBps / 100).toFixed(2)} % : attendu ${expectedVat.amountMinor} unités mineures, trouvé ${params.vatAmount.amountMinor} unités mineures.`,
        ruleVersionId: params.countryConfig.versionId,
        sourceDataSnapshot: {
          netMinor: params.netAmount.amountMinor,
          expectedVatMinor: expectedVat.amountMinor,
          actualVatMinor: params.vatAmount.amountMinor,
          rateBps: params.appliedVatRateBps,
          roundingMode,
        },
        detectedAt: now,
      });
    }
  }

  return anomalies;
}

/**
 * Contrôle déterministe de l'équilibre d'une écriture comptable.
 */
export function checkAccountingEntryBalanceRule(params: {
  lines: ReadonlyArray<{ debitMinor: number; creditMinor: number }>;
  countryConfig: CountryConfigurationVersion;
}): DeterministicAnomalyResult[] {
  const result = verifyDebitCreditBalance(params.lines);
  if (result.balanced) {
    return [];
  }
  return [
    {
      ruleCode: "RULE_DOUBLE_ENTRY_BALANCE",
      category: "UNBALANCED_ACCOUNTING_ENTRY",
      severity: "CRITICAL_CERTAIN",
      isCertainError: true,
      message: `Écriture comptable déséquilibrée : Total Débit (${result.totalDebitMinor}) ≠ Total Crédit (${result.totalCreditMinor}), écart = ${result.diffMinor}.`,
      ruleVersionId: params.countryConfig.versionId,
      sourceDataSnapshot: result,
      detectedAt: new Date().toISOString(),
    },
  ];
}

export interface IndicativeSimulationResult {
  status: "COMPUTED_INDICATIVE" | "BLOCKED_MISSING_OR_UNVERIFIED_RULES";
  simulationType: "VAT_SUMMARY" | "SOCIAL_CONTRIBUTIONS" | "EXPENSE_IMPACT";
  countryCode: string;
  ruleVersionId: string;
  effectiveDateUsed: string;
  computedAt: string;
  mandatoryDisclaimer: string;
  inputParameters: Record<string, unknown>;
  assumptions: string[];
  limitations: string[];
  missingOrUnverifiedParameters: string[];
  resultData: Record<string, unknown> | null;
}

/**
 * Exécute une simulation indicative déterministe (Section 5.7 & Section 5 de l'extension internationale).
 * - Aucun taux par défaut (ex: 20%) n'est supposé si ni le paramètre d'entrée ni la configuration vérifiée de la juridiction ne le fournissent.
 * - Filtre les règles de la juridiction selon la date d'effet (`effectiveDate`), garantissant qu'un changement de barème ultérieur ne modifie jamais silencieusement un calcul historique.
 */
export function runDeterministicSimulation(params: {
  simulationType: "VAT_SUMMARY" | "SOCIAL_CONTRIBUTIONS";
  countryConfig: CountryConfigurationVersion;
  revenueNetMinor: number;
  expensesNetMinor: number;
  vatRateBps?: number;
  taxRegimeCode?: string;
  effectiveDate?: string;
}): IndicativeSimulationResult {
  const readiness = evaluateCountryFiscalReadiness(params.countryConfig);
  const now = new Date().toISOString();
  const effectiveDate = params.effectiveDate ?? params.countryConfig.effectiveFrom;
  const roundingMode = params.countryConfig.defaultRoundingMode ?? "HALF_UP";

  // Vérifier que la version de configuration couvre bien la période demandée
  if (
    effectiveDate < params.countryConfig.effectiveFrom ||
    (params.countryConfig.effectiveTo !== null &&
      effectiveDate > params.countryConfig.effectiveTo)
  ) {
    return {
      status: "BLOCKED_MISSING_OR_UNVERIFIED_RULES",
      simulationType: params.simulationType,
      countryCode: params.countryConfig.countryCode,
      ruleVersionId: params.countryConfig.versionId,
      effectiveDateUsed: effectiveDate,
      computedAt: now,
      mandatoryDisclaimer: appConfig.regulatoryDisclaimer,
      inputParameters: {
        revenueNetMinor: params.revenueNetMinor,
        expensesNetMinor: params.expensesNetMinor,
        effectiveDate,
      },
      assumptions: [],
      limitations: [
        `La version de règles ${params.countryConfig.versionId} (${params.countryConfig.effectiveFrom} -> ${params.countryConfig.effectiveTo ?? "en cours"}) ne couvre pas la date demandée (${effectiveDate}).`,
      ],
      missingOrUnverifiedParameters: [
        `Période d'effet hors validité de la version ${params.countryConfig.versionId}.`,
      ],
      resultData: null,
    };
  }

  if (params.simulationType === "SOCIAL_CONTRIBUTIONS") {
    const regime = params.countryConfig.taxRegimes.find(
      (r) => r.code === params.taxRegimeCode
    );
    if (!regime || !regime.isVerified || regime.socialContributionRateBps === null) {
      return {
        status: "BLOCKED_MISSING_OR_UNVERIFIED_RULES",
        simulationType: "SOCIAL_CONTRIBUTIONS",
        countryCode: params.countryConfig.countryCode,
        ruleVersionId: params.countryConfig.versionId,
        effectiveDateUsed: effectiveDate,
        computedAt: now,
        mandatoryDisclaimer: appConfig.regulatoryDisclaimer,
        inputParameters: {
          revenueNetMinor: params.revenueNetMinor,
          taxRegimeCode: params.taxRegimeCode ?? null,
        },
        assumptions: [],
        limitations: [
          "Aucun calcul de cotisations sociales n'est produit tant que le barème officiel du régime sélectionné n'est pas vérifié et validé pour la période.",
        ],
        missingOrUnverifiedParameters: [
          `Barème de cotisations sociales non validé pour le régime "${params.taxRegimeCode ?? "NON_SPECIFIE"}" dans la version ${params.countryConfig.versionId}.`,
          ...readiness.blockingReasons,
        ],
        resultData: null,
      };
    }
  }

  // Cas d'une juridiction sans taxe indirecte (indirectTaxSystem === "NONE")
  if (params.countryConfig.indirectTaxSystem === "NONE") {
    return {
      status: "COMPUTED_INDICATIVE",
      simulationType: "VAT_SUMMARY",
      countryCode: params.countryConfig.countryCode,
      ruleVersionId: params.countryConfig.versionId,
      effectiveDateUsed: effectiveDate,
      computedAt: now,
      mandatoryDisclaimer: appConfig.regulatoryDisclaimer,
      inputParameters: {
        revenueNetMinor: params.revenueNetMinor,
        expensesNetMinor: params.expensesNetMinor,
        vatRateBps: 0,
        currency: params.countryConfig.defaultCurrency,
      },
      assumptions: [
        `La juridiction ${params.countryConfig.countryCode} est configurée sans taxe indirecte sur la valeur ajoutée (indirectTaxSystem = NONE).`,
      ],
      limitations: readiness.blockingReasons,
      missingOrUnverifiedParameters: [],
      resultData: {
        collectedVatMinor: 0,
        deductibleVatMinor: 0,
        netVatPayableMinor: 0,
        currency: params.countryConfig.defaultCurrency,
        minorUnitExponent: getCurrencyExponent(params.countryConfig.defaultCurrency),
      },
    };
  }

  // Sélection du taux vérifié dans la configuration de la juridiction (sans jamais coder 2000 en dur)
  const verifiedRatesForDate = params.countryConfig.vatRates.filter(
    (r) =>
      r.isVerified &&
      r.effectiveFrom <= effectiveDate &&
      (r.effectiveTo === null || r.effectiveTo >= effectiveDate)
  );

  const selectedRate =
    params.vatRateBps !== undefined
      ? verifiedRatesForDate.find((r) => r.rateBasisPoints === params.vatRateBps)
      : verifiedRatesForDate[0];

  if (!selectedRate) {
    return {
      status: "BLOCKED_MISSING_OR_UNVERIFIED_RULES",
      simulationType: params.simulationType,
      countryCode: params.countryConfig.countryCode,
      ruleVersionId: params.countryConfig.versionId,
      effectiveDateUsed: effectiveDate,
      computedAt: now,
      mandatoryDisclaimer: appConfig.regulatoryDisclaimer,
      inputParameters: {
        revenueNetMinor: params.revenueNetMinor,
        expensesNetMinor: params.expensesNetMinor,
        vatRateBps: params.vatRateBps ?? null,
        effectiveDate,
      },
      assumptions: [],
      limitations: [
        "Simulation bloquée car le taux de taxe demandé est absent ou non vérifié dans la configuration de la juridiction pour la date d'effet spécifiée.",
      ],
      missingOrUnverifiedParameters: [
        `Taux de taxe (${params.vatRateBps ?? "par défaut"}) non vérifié pour ${params.countryConfig.countryCode} au ${effectiveDate}.`,
      ],
      resultData: null,
    };
  }

  const collectedVat = computeTaxFromBasisPoints(
    {
      amountMinor: params.revenueNetMinor,
      currency: params.countryConfig.defaultCurrency,
    },
    selectedRate.rateBasisPoints,
    roundingMode
  );
  const deductibleVat = computeTaxFromBasisPoints(
    {
      amountMinor: params.expensesNetMinor,
      currency: params.countryConfig.defaultCurrency,
    },
    selectedRate.rateBasisPoints,
    roundingMode
  );
  const netVatBalanceMinor =
    collectedVat.amountMinor - deductibleVat.amountMinor;

  return {
    status: "COMPUTED_INDICATIVE",
    simulationType: "VAT_SUMMARY",
    countryCode: params.countryConfig.countryCode,
    ruleVersionId: params.countryConfig.versionId,
    effectiveDateUsed: effectiveDate,
    computedAt: now,
    mandatoryDisclaimer: appConfig.regulatoryDisclaimer,
    inputParameters: {
      revenueNetMinor: params.revenueNetMinor,
      expensesNetMinor: params.expensesNetMinor,
      vatRateBps: selectedRate.rateBasisPoints,
      currency: params.countryConfig.defaultCurrency,
      minorUnitExponent: getCurrencyExponent(params.countryConfig.defaultCurrency),
      roundingMode,
    },
    assumptions: [
      `Application uniforme du taux vérifié "${selectedRate.label}" sur les montants hors taxes fournis.`,
      "Intégralité de la taxe sur dépenses supposée déductible (hors exclusions légales spécifiques à vérifier par le professionnel habilité).",
    ],
    limitations: [
      "Ne tient pas compte des acomptes déjà versés, des crédits de taxe reportés ni des prorata de déduction particuliers.",
      ...readiness.blockingReasons,
    ],
    missingOrUnverifiedParameters: [],
    resultData: {
      collectedVatMinor: collectedVat.amountMinor,
      deductibleVatMinor: deductibleVat.amountMinor,
      netVatPayableMinor: netVatBalanceMinor,
      currency: params.countryConfig.defaultCurrency,
      minorUnitExponent: getCurrencyExponent(params.countryConfig.defaultCurrency),
    },
  };
}
