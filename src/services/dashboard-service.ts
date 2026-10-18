import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  AuthenticatedSessionContext,
  assertDossierAccess,
  assertOrganizationAccess,
} from "../auth/auth-service.js";
import { getClientDossierDetails, getOrganizationById } from "./tenant-service.js";
import { Organization } from "../domain/types.js";
import { getCurrencyDefinition } from "../domain/money.js";

/**
 * Service de Tableaux de Bord et Indicateurs de Pilotage (Module 2 — Phase 1, Lot 1.4).
 *
 * Principes stricts de conformité :
 * 1. Les indicateurs sont calculés EXCLUSIVEMENT à partir de données réelles persistées en base.
 *    Aucune donnée fictive ou simulée n'est injectée dans les indicateurs de production.
 * 2. Tout montant monétaire est calculé en unités mineures entières (centimes) sans erreur d'arrondi IEEE-754.
 * 3. Filtrage temporel cohérent (Exercice, Mois, Trimestre, Période personnalisée) respectant le fuseau et les dates.
 * 4. Distinction nette entre la vue Entreprise (dossier actif) et la vue Cabinet (consolidation du portefeuille).
 * 5. Liens d'action directs cliquables vers les pièces sources (documents à traiter, factures impayées, anomalies ouvertes).
 * 6. Mentions légales et disclaimers explicites : les indicateurs sont des outils de gestion et ne constituent pas
 *    un bilan comptable certifié ni un audit légal.
 */

export type PeriodFilterType = "ALL" | "FISCAL_YEAR" | "QUARTER" | "MONTH" | "CUSTOM";

export interface PeriodFilterInput {
  periodType?: PeriodFilterType;
  year?: number;
  month?: number;
  quarter?: 1 | 2 | 3 | 4;
  startDate?: string;
  endDate?: string;
}

export interface ResolvedPeriod {
  periodType: PeriodFilterType;
  startDate: string;
  endDate: string;
  label: string;
}

export interface ActionableAlert {
  id: string;
  category: "UNPAID_INVOICE" | "OVERDUE_INVOICE" | "PENDING_DOCUMENT" | "CRITICAL_ANOMALY" | "QUOTE_TO_FOLLOW";
  title: string;
  subtitle: string;
  amountMinor?: number;
  dueDateOrDate?: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  targetEntityType: "INVOICE" | "DOCUMENT" | "ANOMALY" | "QUOTE";
  targetEntityId: string;
  actionUrl: string;
}

export interface DossierDashboardMetrics {
  dossierId: string;
  dossierCode: string;
  dossierName: string;
  currency: string;
  currencyMinorUnitExponent: number;
  period: ResolvedPeriod;

  // 1. Chiffre d'Affaires et Ventes
  sales: {
    turnoverNetMinor: number;
    vatCollectedMinor: number;
    turnoverGrossMinor: number;
    invoicesCount: number;
    paidAmountMinor: number;
    remainingDueMinor: number;
    overdueInvoicesCount: number;
    overdueAmountMinor: number;
  };

  // 2. Dépenses et Pièces justificatives
  purchases: {
    supplierExpensesNetMinor: number;
    supplierExpensesVatMinor: number;
    supplierExpensesGrossMinor: number;
    documentsTotalCount: number;
    documentsPendingReviewCount: number;
    documentsValidatedCount: number;
    documentsRejectedCount: number;
  };

  // 3. Devis et Activité Commerciale
  quotes: {
    quotesTotalCount: number;
    quotesDraftCount: number;
    quotesSentCount: number;
    quotesAcceptedCount: number;
    quotesConvertedCount: number;
    quotesConvertedTotalMinor: number;
    conversionRatePercent: number;
  };

  // 4. Synthèse Comptable
  accounting: {
    draftEntriesCount: number;
    validatedEntriesCount: number;
    reversedEntriesCount: number;
    totalDebitMinor: number;
    totalCreditMinor: number;
    isBalanced: boolean;
  };

  // 5. Contrôles et Anomalies
  anomalies: {
    totalOpenAnomalies: number;
    criticalErrorsCount: number;
    suspicionsCount: number;
    resolvedAnomaliesCount: number;
  };

  // 6. Alertes et Actions prioritaires
  actionableAlerts: ActionableAlert[];

  // 7. Mention de non-certification
  isCertifiedAudit: false;
  disclaimer: string;
}

export interface FirmDossierSummary {
  dossierId: string;
  dossierCode: string;
  dossierName: string;
  currency: string;
  status: string;
  pendingDocumentsCount: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesGrossMinor: number;
  openAnomaliesCount: number;
  lastActivityAt: string;
  dossierUrl: string;
}

export interface FirmDashboardMetrics {
  organizationId: string;
  organizationName: string;
  organization: Organization;
  activeDossiersCount: number;
  membersCount: number;
  documentsPendingReviewCount: number;
  documentsValidatedCount: number;
  draftOrSuggestedEntriesCount: number;
  auditEventsCount: number;
  totalActiveDossiers: number;
  totalArchivedDossiers: number;
  totalPendingDocuments: number;
  totalUnresolvedAnomalies: number;
  dossiersSummary: FirmDossierSummary[];
  disclaimer: string;
}

export function resolvePeriodDates(filter?: PeriodFilterInput): ResolvedPeriod {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const periodType = filter?.periodType || "ALL";

  if (periodType === "FISCAL_YEAR") {
    const year = filter?.year || currentYear;
    return {
      periodType: "FISCAL_YEAR",
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      label: `Exercice fiscal ${year}`,
    };
  }

  if (periodType === "QUARTER") {
    const year = filter?.year || currentYear;
    const quarter = filter?.quarter || (Math.floor(now.getUTCMonth() / 3) + 1);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const startStr = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = endMonth === 3 ? "31" : endMonth === 6 ? "30" : endMonth === 9 ? "30" : "31";
    const endStr = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    return {
      periodType: "QUARTER",
      startDate: startStr,
      endDate: endStr,
      label: `Trimestre T${quarter} ${year}`,
    };
  }

  if (periodType === "MONTH") {
    const year = filter?.year || currentYear;
    const month = filter?.month || (now.getUTCMonth() + 1);
    const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
    // Dernier jour du mois
    const nextMonthDate = new Date(Date.UTC(year, month, 0));
    const lastDay = String(nextMonthDate.getUTCDate()).padStart(2, "0");
    const endStr = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    return {
      periodType: "MONTH",
      startDate: startStr,
      endDate: endStr,
      label: `Mois ${String(month).padStart(2, "0")}/${year}`,
    };
  }

  if (periodType === "CUSTOM") {
    const startDate = filter?.startDate || "1970-01-01";
    const endDate = filter?.endDate || "2099-12-31";
    return {
      periodType: "CUSTOM",
      startDate,
      endDate,
      label: `Du ${startDate} au ${endDate}`,
    };
  }

  // ALL par défaut
  return {
    periodType: "ALL",
    startDate: "1970-01-01",
    endDate: "2099-12-31",
    label: "Toute la période",
  };
}

/**
 * Calcule les métriques du tableau de bord d'un dossier client (Vue Entreprise).
 * Toutes les données sont calculées en temps réel à partir des tables persistées.
 */
export function getDossierDashboardMetrics(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  filter?: PeriodFilterInput;
  db?: DatabaseSync;
}): DossierDashboardMetrics {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  const dossierDetails = getClientDossierDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    db,
  });
  const dossier = dossierDetails.dossier;

  const period = resolvePeriodDates(params.filter);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Factures de vente émises et Avoirs
  const invoiceRows = db
    .prepare(
      `SELECT
        id, invoice_number, third_party_name, direction,
        net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, due_date, issue_date, payment_status, invoice_status, legal_mentions_json
       FROM invoices
       WHERE organization_id = ? AND dossier_id = ?
         AND issue_date >= ? AND issue_date <= ?`
    )
    .all(params.organizationId, params.dossierId, period.startDate, period.endDate) as any[];

  let turnoverNetMinor = 0;
  let vatCollectedMinor = 0;
  let turnoverGrossMinor = 0;
  let invoicesCount = 0;
  let paidAmountMinor = 0;
  let remainingDueMinor = 0;
  let overdueInvoicesCount = 0;
  let overdueAmountMinor = 0;

  let supplierExpensesNetMinor = 0;
  let supplierExpensesVatMinor = 0;
  let supplierExpensesGrossMinor = 0;

  const actionableAlerts: ActionableAlert[] = [];

  for (const inv of invoiceRows) {
    const net = Number(inv.net_amount_minor);
    const vat = Number(inv.vat_amount_minor);
    const gross = Number(inv.gross_amount_minor);
    const paid = Number(inv.paid_amount_minor || 0);
    const remaining = Math.max(0, gross - paid);

    if (inv.direction === "ISSUED") {
      // Les factures de vente émises (hors brouillons DRAFT)
      if (inv.invoice_status !== "DRAFT") {
        invoicesCount += 1;
        turnoverNetMinor += net;
        vatCollectedMinor += vat;
        turnoverGrossMinor += gross;
        paidAmountMinor += paid;

        // Seules les factures non annulées contribuent au reste dû et aux alertes d'impayés
        if (inv.invoice_status !== "CANCELLED") {
          remainingDueMinor += remaining;

          // Factures en retard de paiement
          if (remaining > 0 && inv.due_date && inv.due_date < today) {
            overdueInvoicesCount += 1;
            overdueAmountMinor += remaining;

            actionableAlerts.push({
              id: `alert-overdue-${inv.id}`,
              category: "OVERDUE_INVOICE",
              title: `Facture échue ${inv.invoice_number}`,
              subtitle: `Client : ${inv.third_party_name} — Échéance dépassée le ${inv.due_date}`,
              amountMinor: remaining,
              dueDateOrDate: inv.due_date,
              severity: "CRITICAL",
              targetEntityType: "INVOICE",
              targetEntityId: inv.id,
              actionUrl: `/api/organizations/${params.organizationId}/dossiers/${params.dossierId}/sales-invoices/${inv.id}`,
            });
          } else if (remaining > 0) {
            actionableAlerts.push({
              id: `alert-unpaid-${inv.id}`,
              category: "UNPAID_INVOICE",
              title: `Facture en attente de règlement ${inv.invoice_number}`,
              subtitle: `Client : ${inv.third_party_name} — Échéance au ${inv.due_date || "N/A"}`,
              amountMinor: remaining,
              dueDateOrDate: inv.due_date || undefined,
              severity: "INFO",
              targetEntityType: "INVOICE",
              targetEntityId: inv.id,
              actionUrl: `/api/organizations/${params.organizationId}/dossiers/${params.dossierId}/sales-invoices/${inv.id}`,
            });
          }
        }
      }
    } else if (inv.direction === "CREDIT_NOTE") {
      // Les avoirs réduisent le chiffre d'affaires et la TVA (montants négatifs stockés)
      turnoverNetMinor += net;
      vatCollectedMinor += vat;
      turnoverGrossMinor += gross;
      let isPartialCredit = false;
      try {
        const mentions = JSON.parse(inv.legal_mentions_json || "{}");
        isPartialCredit = mentions.isPartialCreditNote === true;
      } catch {}
      if (isPartialCredit) {
        remainingDueMinor = Math.max(0, remainingDueMinor + gross); // gross est négatif
      }
    } else if (inv.direction === "RECEIVED") {
      // Dépenses / Factures fournisseurs reçues
      if (inv.invoice_status !== "CANCELLED") {
        supplierExpensesNetMinor += net;
        supplierExpensesVatMinor += vat;
        supplierExpensesGrossMinor += gross;
      }
    }
  }

  // 2. Pièces et Documents
  const docRows = db
    .prepare(
      `SELECT
        id, original_filename, category, workflow_status, created_at, extracted_data_json
       FROM documents
       WHERE organization_id = ? AND dossier_id = ?
         AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?`
    )
    .all(params.organizationId, params.dossierId, period.startDate, period.endDate) as any[];

  let documentsTotalCount = docRows.length;
  let documentsPendingReviewCount = 0;
  let documentsValidatedCount = 0;
  let documentsRejectedCount = 0;

  for (const doc of docRows) {
    if (doc.workflow_status === "VALIDATED") {
      documentsValidatedCount += 1;
      try {
        const ext = JSON.parse(doc.extracted_data_json || "{}").extraction || {};
        if (doc.category === "SUPPLIER_INVOICE" || doc.category === "RECEIPT_EXPENSE") {
          const docNet = Number(ext.netAmountMinor?.value) || 0;
          const docVat = Number(ext.vatAmountMinor?.value) || 0;
          const docGross = Number(ext.grossAmountMinor?.value) || (docNet + docVat);
          supplierExpensesNetMinor += docNet;
          supplierExpensesVatMinor += docVat;
          supplierExpensesGrossMinor += docGross;
        }
      } catch {}
    } else if (doc.workflow_status === "REJECTED") {
      documentsRejectedCount += 1;
    } else {
      // RECEIVED, EXTRACTED, PENDING_REVIEW, CORRECTED
      documentsPendingReviewCount += 1;
      actionableAlerts.push({
        id: `alert-doc-${doc.id}`,
        category: "PENDING_DOCUMENT",
        title: `Justificatif à vérifier : ${doc.original_filename}`,
        subtitle: `Catégorie : ${doc.category} — Statut : ${doc.workflow_status}`,
        dueDateOrDate: doc.created_at ? doc.created_at.slice(0, 10) : undefined,
        severity: "WARNING",
        targetEntityType: "DOCUMENT",
        targetEntityId: doc.id,
        actionUrl: `/api/organizations/${params.organizationId}/dossiers/${params.dossierId}/documents/${doc.id}`,
      });
    }
  }

  // 3. Devis de vente
  const quoteRows = db
    .prepare(
      `SELECT
        id, quote_number, quote_status, total_gross_minor, validity_date, third_party_name
       FROM quotes
       WHERE organization_id = ? AND dossier_id = ?
         AND issue_date >= ? AND issue_date <= ?`
    )
    .all(params.organizationId, params.dossierId, period.startDate, period.endDate) as any[];

  let quotesTotalCount = quoteRows.length;
  let quotesDraftCount = 0;
  let quotesSentCount = 0;
  let quotesAcceptedCount = 0;
  let quotesConvertedCount = 0;
  let quotesConvertedTotalMinor = 0;

  for (const q of quoteRows) {
    const gross = Number(q.total_gross_minor);
    if (q.quote_status === "DRAFT") quotesDraftCount += 1;
    else if (q.quote_status === "SENT") quotesSentCount += 1;
    else if (q.quote_status === "ACCEPTED") quotesAcceptedCount += 1;
    else if (q.quote_status === "CONVERTED") {
      quotesConvertedCount += 1;
      quotesConvertedTotalMinor += gross;
    }

    if (q.quote_status === "SENT" || q.quote_status === "ACCEPTED") {
      actionableAlerts.push({
        id: `alert-quote-${q.id}`,
        category: "QUOTE_TO_FOLLOW",
        title: `Devis à transformer : ${q.quote_number}`,
        subtitle: `Client : ${q.third_party_name} — Validité au ${q.validity_date}`,
        amountMinor: gross,
        dueDateOrDate: q.validity_date,
        severity: "INFO",
        targetEntityType: "QUOTE",
        targetEntityId: q.id,
        actionUrl: `/api/organizations/${params.organizationId}/dossiers/${params.dossierId}/quotes/${q.id}`,
      });
    }
  }

  const conversionRatePercent =
    quotesTotalCount > 0 ? Math.round((quotesConvertedCount / quotesTotalCount) * 10000) / 100 : 0;

  // 4. Écritures comptables
  const entryRows = db
    .prepare(
      `SELECT status, total_debit_minor, total_credit_minor
       FROM accounting_entries
       WHERE organization_id = ? AND dossier_id = ?
         AND entry_date >= ? AND entry_date <= ?`
    )
    .all(params.organizationId, params.dossierId, period.startDate, period.endDate) as any[];

  let draftEntriesCount = 0;
  let validatedEntriesCount = 0;
  let reversedEntriesCount = 0;
  let totalDebitMinor = 0;
  let totalCreditMinor = 0;

  for (const e of entryRows) {
    if (e.status === "DRAFT" || e.status === "AI_SUGGESTION") draftEntriesCount += 1;
    else if (e.status === "VALIDATED") {
      validatedEntriesCount += 1;
      totalDebitMinor += Number(e.total_debit_minor);
      totalCreditMinor += Number(e.total_credit_minor);
    } else if (e.status === "REVERSED") reversedEntriesCount += 1;
  }

  // 5. Anomalies détectées
  const anomalyRows = db
    .prepare(
      `SELECT id, rule_code, category, severity, is_certain_error, status, message, target_entity_type, target_entity_id, detected_at
       FROM anomalies
       WHERE organization_id = ? AND dossier_id = ?`
    )
    .all(params.organizationId, params.dossierId) as any[];

  let totalOpenAnomalies = 0;
  let criticalErrorsCount = 0;
  let suspicionsCount = 0;
  let resolvedAnomaliesCount = 0;

  for (const a of anomalyRows) {
    if (a.status === "OPEN" || a.status === "IN_REVIEW") {
      totalOpenAnomalies += 1;
      const isCertain = Number(a.is_certain_error) === 1 || a.severity === "CRITICAL_CERTAIN";
      if (isCertain) {
        criticalErrorsCount += 1;
        actionableAlerts.push({
          id: `alert-anom-${a.id}`,
          category: "CRITICAL_ANOMALY",
          title: `Anomalie critique : ${a.rule_code}`,
          subtitle: a.message,
          severity: "CRITICAL",
          dueDateOrDate: a.detected_at ? a.detected_at.slice(0, 10) : undefined,
          targetEntityType: "ANOMALY",
          targetEntityId: a.id,
          actionUrl: `/api/organizations/${params.organizationId}/dossiers/${params.dossierId}/anomalies/${a.id}`,
        });
      } else {
        suspicionsCount += 1;
      }
    } else {
      resolvedAnomaliesCount += 1;
    }
  }

  // Trier les alertes par sévérité : CRITICAL en premier, puis WARNING, puis INFO
  const severityScore = { CRITICAL: 3, WARNING: 2, INFO: 1 };
  actionableAlerts.sort((a, b) => severityScore[b.severity] - severityScore[a.severity]);

  return {
    dossierId: dossier.id,
    dossierCode: dossier.code,
    dossierName: dossier.name,
    currency: dossier.currency,
    currencyMinorUnitExponent: getCurrencyDefinition(dossier.currency).minorUnitExponent,
    period,
    sales: {
      turnoverNetMinor,
      vatCollectedMinor,
      turnoverGrossMinor,
      invoicesCount,
      paidAmountMinor,
      remainingDueMinor,
      overdueInvoicesCount,
      overdueAmountMinor,
    },
    purchases: {
      supplierExpensesNetMinor,
      supplierExpensesVatMinor,
      supplierExpensesGrossMinor,
      documentsTotalCount,
      documentsPendingReviewCount,
      documentsValidatedCount,
      documentsRejectedCount,
    },
    quotes: {
      quotesTotalCount,
      quotesDraftCount,
      quotesSentCount,
      quotesAcceptedCount,
      quotesConvertedCount,
      quotesConvertedTotalMinor,
      conversionRatePercent,
    },
    accounting: {
      draftEntriesCount,
      validatedEntriesCount,
      reversedEntriesCount,
      totalDebitMinor,
      totalCreditMinor,
      isBalanced: totalDebitMinor === totalCreditMinor,
    },
    anomalies: {
      totalOpenAnomalies,
      criticalErrorsCount,
      suspicionsCount,
      resolvedAnomaliesCount,
    },
    actionableAlerts: actionableAlerts.slice(0, 15), // Top 15 alertes prioritaires
    isCertifiedAudit: false,
    disclaimer:
      "Ces indicateurs de pilotage sont calculés en temps réel à partir des pièces, factures et écritures enregistrées dans le dossier. Ils ne constituent pas des états financiers certifiés ni un bilan comptable audité.",
  };
}

/**
 * Calcule les métriques consolidées du cabinet d'expertise comptable (Vue Cabinet).
 * Résume l'état de l'ensemble des dossiers accessibles à l'utilisateur au sein de l'organisation.
 */
export function getFirmDashboardMetrics(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  db?: DatabaseSync;
}): FirmDashboardMetrics {
  const db = params.db ?? getDatabase();
  assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    db,
  });

  const org = getOrganizationById({
    session: params.session,
    organizationId: params.organizationId,
    db,
  });

  const organizationName = org.name;

  const membersCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM organization_memberships WHERE organization_id = ?"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const docsValidated = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM documents WHERE organization_id = ? AND workflow_status = 'VALIDATED'"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const draftEntries = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM accounting_entries WHERE organization_id = ? AND status IN ('DRAFT', 'AI_SUGGESTION')"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const auditEvents = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM audit_logs WHERE organization_id = ?"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  // Récupérer les dossiers accessibles
  const dossierRows = db
    .prepare(
      `SELECT id, code, name, currency, dossier_status, is_active, updated_at
       FROM client_dossiers
       WHERE organization_id = ?
       ORDER BY code ASC`
    )
    .all(params.organizationId) as any[];

  let totalActiveDossiers = 0;
  let totalArchivedDossiers = 0;
  let totalPendingDocuments = 0;
  let totalUnresolvedAnomalies = 0;

  const dossiersSummary: FirmDossierSummary[] = [];

  for (const d of dossierRows) {
    if (d.dossier_status === "ARCHIVED" || Number(d.is_active) === 0) {
      totalArchivedDossiers += 1;
    } else {
      totalActiveDossiers += 1;
    }

    // Documents en attente
    const pendingDocs = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM documents
           WHERE organization_id = ? AND dossier_id = ?
             AND workflow_status NOT IN ('VALIDATED', 'REJECTED')`
        )
        .get(params.organizationId, d.id) as { c: number }
    ).c;

    // Factures impayées
    const unpaidInv = (
      db
        .prepare(
          `SELECT COUNT(*) as c, COALESCE(SUM(gross_amount_minor - paid_amount_minor), 0) as s
           FROM invoices
           WHERE organization_id = ? AND dossier_id = ?
             AND direction = 'ISSUED' AND invoice_status != 'CANCELLED'
             AND (gross_amount_minor - paid_amount_minor) > 0`
        )
        .get(params.organizationId, d.id) as { c: number; s: number }
    );

    // Anomalies ouvertes
    const openAnom = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM anomalies
           WHERE organization_id = ? AND dossier_id = ?
             AND status IN ('OPEN', 'IN_REVIEW')`
        )
        .get(params.organizationId, d.id) as { c: number }
    ).c;

    totalPendingDocuments += pendingDocs;
    totalUnresolvedAnomalies += openAnom;

    dossiersSummary.push({
      dossierId: d.id,
      dossierCode: d.code,
      dossierName: d.name,
      currency: d.currency,
      status: d.dossier_status || "ACTIVE",
      pendingDocumentsCount: pendingDocs,
      unpaidInvoicesCount: unpaidInv.c,
      unpaidInvoicesGrossMinor: Number(unpaidInv.s),
      openAnomaliesCount: openAnom,
      lastActivityAt: d.updated_at || new Date().toISOString(),
      dossierUrl: `/api/organizations/${params.organizationId}/dossiers/${d.id}`,
    });
  }

  return {
    organizationId: params.organizationId,
    organizationName,
    organization: org,
    activeDossiersCount: totalActiveDossiers,
    membersCount,
    documentsPendingReviewCount: totalPendingDocuments,
    documentsValidatedCount: docsValidated,
    draftOrSuggestedEntriesCount: draftEntries,
    auditEventsCount: auditEvents,
    totalActiveDossiers,
    totalArchivedDossiers,
    totalPendingDocuments,
    totalUnresolvedAnomalies,
    dossiersSummary,
    disclaimer:
      "Ce tableau de bord consolidé est un outil de suivi opérationnel du portefeuille de dossiers. Il est calculé en continu à partir des pièces et factures enregistrées.",
  };
}
