import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  AuthenticatedSessionContext,
  assertDossierAccess,
  AuthorizationError,
} from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";

function resolveActorRole(
  session: AuthenticatedSessionContext | null,
  organizationId: string
): string {
  if (!session) return "SYSTEM";
  const m = session.memberships.find((mb) => mb.organizationId === organizationId);
  return m ? m.role : "AUTHENTICATED_USER";
}

export interface AnomalyRecord {
  id: string;
  organizationId: string;
  dossierId: string;
  ruleCode: string;
  ruleVersionId: string;
  category: string;
  severity: "INFO" | "WARNING" | "CRITICAL_CERTAIN" | "SUSPICION_TO_VERIFY";
  isCertainError: boolean;
  targetEntityType: string;
  targetEntityId: string | null;
  message: string;
  sourceDataSnapshot: Record<string, unknown>;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED_BY_CORRECTION" | "DISMISSED_WITH_JUSTIFICATION";
  resolutionJustification: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  historyJson: Array<Record<string, unknown>>;
  detectedAt: string;
  updatedAt: string;
}

export interface DetectedAnomalyItem {
  ruleCode: string;
  category: string;
  severity: "INFO" | "WARNING" | "CRITICAL_CERTAIN" | "SUSPICION_TO_VERIFY";
  isCertainError: boolean;
  targetEntityType: string;
  targetEntityId: string | null;
  message: string;
  sourceDataSnapshot: Record<string, unknown>;
}

/**
 * Exécute le moteur de scan des 10 règles de contrôles comptables déterministes sur un dossier (§18).
 * Persiste les anomalies détectées de manière idempotente dans la table `anomalies`.
 */
export function scanDossierAnomalies(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): {
  scannedRulesCount: number;
  newAnomaliesCount: number;
  existingOpenAnomaliesCount: number;
  totalOpenAnomalies: number;
  anomalies: AnomalyRecord[];
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const dossierRow = db
    .prepare(
      `SELECT id, currency, country_config_version_id, is_active FROM client_dossiers WHERE id = ? AND organization_id = ?`
    )
    .get(params.dossierId, params.organizationId) as
    | { id: string; currency: string; country_config_version_id: string; is_active: number }
    | undefined;

  if (!dossierRow) {
    throw new AuthorizationError("Dossier client introuvable.", 404);
  }

  const ruleVersionId = dossierRow.country_config_version_id || "FR-2026.1-REV0";
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const detectedList: DetectedAnomalyItem[] = [];

  // =========================================================================
  // RÈGLE 1 : Incohérence arithmétique de TVA (HT + TVA != TTC ou taux erroné)
  // =========================================================================
  const invoiceRows = db
    .prepare(
      `SELECT id, invoice_number, COALESCE(net_amount_minor, 0) AS net_amount_minor,
              COALESCE(vat_amount_minor, 0) AS vat_amount_minor,
              COALESCE(gross_amount_minor, 0) AS gross_amount_minor,
              third_party_name, issue_date
       FROM invoices
       WHERE organization_id = ? AND dossier_id = ?`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const inv of invoiceRows) {
    const ht = Number(inv.net_amount_minor);
    const tva = Number(inv.vat_amount_minor);
    const ttc = Number(inv.gross_amount_minor);
    if (ht + tva !== ttc) {
      detectedList.push({
        ruleCode: "RULE_01_VAT_ARITHMETIC_MISMATCH",
        category: "ARITHMETIC_VAT_INCONSISTENCY",
        severity: "CRITICAL_CERTAIN",
        isCertainError: true,
        targetEntityType: "INVOICE",
        targetEntityId: String(inv.id),
        message: `Incohérence arithmétique de TVA sur la facture ${inv.invoice_number || inv.id} : HT (${ht}) + TVA (${tva}) = ${ht + tva} ≠ TTC (${ttc}).`,
        sourceDataSnapshot: { invoiceNumber: inv.invoice_number, ht, tva, ttc, expectedTtc: ht + tva },
      });
    }
  }

  // =========================================================================
  // RÈGLE 2 : Écriture comptable déséquilibrée (Total Débit != Total Crédit)
  // =========================================================================
  const entryRows = db
    .prepare(
      `SELECT id, piece_number, total_debit_minor, total_credit_minor, status
       FROM accounting_entries
       WHERE organization_id = ? AND dossier_id = ?`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const ent of entryRows) {
    const deb = Number(ent.total_debit_minor);
    const cred = Number(ent.total_credit_minor);
    if (deb !== cred) {
      detectedList.push({
        ruleCode: "RULE_02_UNBALANCED_ACCOUNTING_ENTRY",
        category: "UNBALANCED_ACCOUNTING_ENTRY",
        severity: "CRITICAL_CERTAIN",
        isCertainError: true,
        targetEntityType: "ACCOUNTING_ENTRY",
        targetEntityId: String(ent.id),
        message: `Écriture comptable déséquilibrée ${ent.piece_number || ent.id} : Débit (${deb}) ≠ Crédit (${cred}) [écart: ${Math.abs(deb - cred)}].`,
        sourceDataSnapshot: { pieceNumber: ent.piece_number, deb, cred, diff: Math.abs(deb - cred), status: ent.status },
      });
    }
  }

  // =========================================================================
  // RÈGLE 3 : Doublons potentiels de factures (même tiers + même montant + même date)
  // =========================================================================
  const dupInvoices = db
    .prepare(
      `SELECT i1.id AS id1, i2.id AS id2, i1.invoice_number AS num1, i2.invoice_number AS num2,
              i1.third_party_name, i1.gross_amount_minor, i1.issue_date
       FROM invoices i1
       JOIN invoices i2 ON i1.organization_id = i2.organization_id 
                       AND i1.dossier_id = i2.dossier_id
                       AND i1.id < i2.id
                       AND i1.third_party_name = i2.third_party_name
                       AND i1.gross_amount_minor = i2.gross_amount_minor
                       AND i1.issue_date = i2.issue_date
       WHERE i1.organization_id = ? AND i1.dossier_id = ?`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const d of dupInvoices) {
    detectedList.push({
      ruleCode: "RULE_03_POTENTIAL_DUPLICATE_INVOICE",
      category: "POTENTIAL_DUPLICATE",
      severity: "SUSPICION_TO_VERIFY",
      isCertainError: false,
      targetEntityType: "INVOICE",
      targetEntityId: String(d.id1),
      message: `Suspicion de facture en double : la facture ${d.num1} présente le même tiers (${d.third_party_name}), date (${d.issue_date}) et montant (${d.gross_amount_minor}) que la facture ${d.num2}.`,
      sourceDataSnapshot: { invoiceId1: d.id1, invoiceId2: d.id2, num1: d.num1, num2: d.num2 },
    });
  }

  // =========================================================================
  // RÈGLE 4 : Rupture de séquence dans la numérotation des factures émises
  // =========================================================================
  const seqInvoices = db
    .prepare(
      `SELECT id, invoice_number, issue_date
       FROM invoices
       WHERE organization_id = ? AND dossier_id = ? AND direction = 'ISSUED' AND invoice_number LIKE 'FAC-%'
       ORDER BY invoice_number ASC`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (let idx = 0; idx < seqInvoices.length - 1; idx++) {
    const cur = String(seqInvoices[idx]!.invoice_number);
    const next = String(seqInvoices[idx + 1]!.invoice_number);

    // Extraction du préfixe et suffixe numérique (ex: FAC-2026-0001 -> prefix: FAC-2026-, num: 1)
    const curMatch = cur.match(/^(FAC-\d{4}-)(\d+)$/);
    const nextMatch = next.match(/^(FAC-\d{4}-)(\d+)$/);

    if (curMatch && nextMatch && curMatch[1] === nextMatch[1]) {
      const curNum = parseInt(curMatch[2]!, 10);
      const nextNum = parseInt(nextMatch[2]!, 10);
      if (nextNum > curNum + 1) {
        detectedList.push({
          ruleCode: "RULE_04_INVOICE_SEQUENCE_GAP",
          category: "NUMBERING_GAP",
          severity: "SUSPICION_TO_VERIFY",
          isCertainError: false,
          targetEntityType: "INVOICE",
          targetEntityId: String(seqInvoices[idx]!.id),
          message: `Rupture de séquence détectée dans les factures émises entre ${cur} et ${next} (trou de numérotation potentiel).`,
          sourceDataSnapshot: { currentInvoice: cur, nextInvoice: next, missingCount: nextNum - curNum - 1 },
        });
      }
    }
  }

  // =========================================================================
  // RÈGLE 5 : Transaction bancaire débitrice importante sans facture associée
  // =========================================================================
  const unreconciledDebits = db
    .prepare(
      `SELECT id, label, amount_minor, operation_date
       FROM bank_transactions
       WHERE organization_id = ? AND dossier_id = ?
         AND amount_minor < -100000 -- Débit supérieur à 1 000 €
         AND reconciliation_status = 'UNRECONCILED'`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const tx of unreconciledDebits) {
    detectedList.push({
      ruleCode: "RULE_05_UNRECONCILED_DEBIT_WITHOUT_INVOICE",
      category: "MISSING_INVOICE_FOR_BANK_TX",
      severity: "SUSPICION_TO_VERIFY",
      isCertainError: false,
      targetEntityType: "BANK_TRANSACTION",
      targetEntityId: String(tx.id),
      message: `Opération bancaire débitrice de ${Math.abs(Number(tx.amount_minor) / 100).toFixed(2)} € (${tx.label}) non rapprochée et sans facture/justificatif associé.`,
      sourceDataSnapshot: { transactionId: tx.id, label: tx.label, amountMinor: tx.amount_minor, date: tx.operation_date },
    });
  }

  // =========================================================================
  // RÈGLE 6 : Dépense / facture fournisseur enregistrée sans justificatif documentaire
  // =========================================================================
  const expenseWithoutReceipt = db
    .prepare(
      `SELECT id, invoice_number, third_party_name, COALESCE(gross_amount_minor, 0) AS gross_amount_minor, issue_date
       FROM invoices
       WHERE organization_id = ? AND dossier_id = ? AND (direction = 'RECEIVED' OR direction = 'PURCHASE') AND document_id IS NULL`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const exp of expenseWithoutReceipt) {
    detectedList.push({
      ruleCode: "RULE_06_EXPENSE_WITHOUT_RECEIPT",
      category: "MISSING_RECEIPT_EXPENSE",
      severity: "SUSPICION_TO_VERIFY",
      isCertainError: false,
      targetEntityType: "INVOICE",
      targetEntityId: String(exp.id),
      message: `Facture de dépense ${exp.invoice_number || exp.id} (${exp.third_party_name}) enregistrée sans pièce justificative numérisée rattachée.`,
      sourceDataSnapshot: { invoiceId: exp.id, invoiceNumber: exp.invoice_number, amountMinor: exp.gross_amount_minor },
    });
  }

  // =========================================================================
  // RÈGLE 7 : Écart de montant entre facture et document extrait associé
  // =========================================================================
  const docMismatches = db
    .prepare(
      `SELECT i.id AS inv_id, i.invoice_number, COALESCE(i.gross_amount_minor, 0) AS gross_amount_minor, d.id AS doc_id, d.extracted_data_json
       FROM invoices i
       JOIN documents d ON i.document_id = d.id
       WHERE i.organization_id = ? AND i.dossier_id = ? AND d.extracted_data_json != '{}'`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const dm of docMismatches) {
    try {
      const extracted = JSON.parse(String(dm.extracted_data_json));
      const extractedTtc = extracted.totalTtcMinor !== undefined ? Number(extracted.totalTtcMinor) : null;
      const invTtc = Number(dm.gross_amount_minor);
      if (extractedTtc !== null && extractedTtc !== invTtc) {
        detectedList.push({
          ruleCode: "RULE_07_AMOUNT_MISMATCH_INVOICE_DOCUMENT",
          category: "AMOUNT_MISMATCH",
          severity: "CRITICAL_CERTAIN",
          isCertainError: true,
          targetEntityType: "INVOICE",
          targetEntityId: String(dm.inv_id),
          message: `Discordance de montant sur ${dm.invoice_number || dm.inv_id} : Montant facture (${invTtc}) ≠ Donnée extraite du document (${extractedTtc}).`,
          sourceDataSnapshot: { invoiceId: dm.inv_id, invoiceTtc: invTtc, extractedTtc },
        });
      }
    } catch {
      // Ignorer si JSON invalide
    }
  }

  // =========================================================================
  // RÈGLE 8 : Incohérence facture / règlement (montant payé supérieur au montant TTC)
  // =========================================================================
  const overallocatedInvoices = db
    .prepare(
      `SELECT id, invoice_number, COALESCE(gross_amount_minor, 0) AS gross_amount_minor, COALESCE(paid_amount_minor, 0) AS paid_amount_minor
       FROM invoices
       WHERE organization_id = ? AND dossier_id = ? AND paid_amount_minor > gross_amount_minor`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  for (const ov of overallocatedInvoices) {
    detectedList.push({
      ruleCode: "RULE_08_OVERALLOCATED_OR_MISMATCHED_PAYMENT",
      category: "OVERALLOCATED_PAYMENT",
      severity: "CRITICAL_CERTAIN",
      isCertainError: true,
      targetEntityType: "INVOICE",
      targetEntityId: String(ov.id),
      message: `Sur-paiement anormal sur la facture ${ov.invoice_number || ov.id} : Montant réglé (${ov.paid_amount_minor}) supérieur au TTC (${ov.gross_amount_minor}).`,
      sourceDataSnapshot: { invoiceId: ov.id, ttc: ov.gross_amount_minor, paid: ov.paid_amount_minor },
    });
  }

  // =========================================================================
  // RÈGLE 9 : Facture impayée dont la date d'échéance est dépassée
  // =========================================================================
  const overdueInvoices = db
    .prepare(
      `SELECT id, invoice_number, third_party_name, COALESCE(gross_amount_minor, 0) AS gross_amount_minor,
              COALESCE(paid_amount_minor, 0) AS paid_amount_minor, due_date
       FROM invoices
       WHERE organization_id = ? AND dossier_id = ?
         AND payment_status != 'PAID'
         AND due_date IS NOT NULL
         AND due_date < ?`
    )
    .all(params.organizationId, params.dossierId, today) as Array<Record<string, unknown>>;

  for (const od of overdueInvoices) {
    const remaining = Number(od.gross_amount_minor) - Number(od.paid_amount_minor);
    detectedList.push({
      ruleCode: "RULE_09_OVERDUE_UNPAID_INVOICE",
      category: "OVERDUE_INVOICE",
      severity: "WARNING",
      isCertainError: false,
      targetEntityType: "INVOICE",
      targetEntityId: String(od.id),
      message: `Facture impayée en retard d'échéance (${od.invoice_number}) : Reste dû de ${(remaining / 100).toFixed(2)} € échu le ${od.due_date}.`,
      sourceDataSnapshot: { invoiceId: od.id, invoiceNumber: od.invoice_number, remaining, dueDate: od.due_date },
    });
  }

  // =========================================================================
  // RÈGLE 10 : Opérations bancaires anciennes non rapprochées (> 60 jours)
  // =========================================================================
  const oldDateThreshold = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const oldBankTx = db
    .prepare(
      `SELECT id, label, amount_minor, operation_date
       FROM bank_transactions
       WHERE organization_id = ? AND dossier_id = ?
         AND reconciliation_status = 'UNRECONCILED'
         AND operation_date < ?`
    )
    .all(params.organizationId, params.dossierId, oldDateThreshold) as Array<Record<string, unknown>>;

  for (const ot of oldBankTx) {
    detectedList.push({
      ruleCode: "RULE_10_OLD_UNRECONCILED_BANK_TX",
      category: "OLD_UNRECONCILED_TRANSACTION",
      severity: "WARNING",
      isCertainError: false,
      targetEntityType: "BANK_TRANSACTION",
      targetEntityId: String(ot.id),
      message: `Opération bancaire ancienne (${ot.operation_date}) non rapprochée depuis plus de 60 jours : ${ot.label} (${(Number(ot.amount_minor) / 100).toFixed(2)} €).`,
      sourceDataSnapshot: { transactionId: ot.id, label: ot.label, amountMinor: ot.amount_minor, date: ot.operation_date },
    });
  }

  // =========================================================================
  // Persistance idempotente dans la table `anomalies`
  // =========================================================================
  let newCount = 0;
  let existingCount = 0;

  const findAnomalyStmt = db.prepare(
    `SELECT id, status, history_json FROM anomalies
     WHERE organization_id = ? AND dossier_id = ? AND rule_code = ? AND target_entity_type = ? AND target_entity_id = ?
       AND status IN ('OPEN', 'IN_REVIEW')`
  );

  const insertAnomalyStmt = db.prepare(
    `INSERT INTO anomalies (
      id, organization_id, dossier_id, rule_code, rule_version_id,
      category, severity, is_certain_error, target_entity_type, target_entity_id,
      message, source_data_snapshot_json, status, history_json,
      detected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', '[]', ?, ?)`
  );

  const updateAnomalyStmt = db.prepare(
    `UPDATE anomalies
     SET updated_at = ?, source_data_snapshot_json = ?, message = ?
     WHERE id = ?`
  );

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const d of detectedList) {
      const existing = findAnomalyStmt.get(
        params.organizationId,
        params.dossierId,
        d.ruleCode,
        d.targetEntityType,
        d.targetEntityId ?? ""
      ) as { id: string } | undefined;

      if (existing) {
        existingCount++;
        updateAnomalyStmt.run(now, JSON.stringify(d.sourceDataSnapshot), d.message, existing.id);
      } else {
        newCount++;
        insertAnomalyStmt.run(
          crypto.randomUUID(),
          params.organizationId,
          params.dossierId,
          d.ruleCode,
          ruleVersionId,
          d.category,
          d.severity,
          d.isCertainError ? 1 : 0,
          d.targetEntityType,
          d.targetEntityId ?? null,
          d.message,
          JSON.stringify(d.sourceDataSnapshot),
          now,
          now
        );
      }
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  const allAnomalies = listDossierAnomalies({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  return {
    scannedRulesCount: 10,
    newAnomaliesCount: newCount,
    existingOpenAnomaliesCount: existingCount,
    totalOpenAnomalies: allAnomalies.total,
    anomalies: allAnomalies.anomalies,
  };
}

/**
 * Consultation multi-critères des anomalies d'un dossier client.
 */
export function listDossierAnomalies(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  status?: string;
  severity?: string;
  isCertainError?: boolean;
  category?: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): { anomalies: AnomalyRecord[]; total: number } {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  let sql = `SELECT * FROM anomalies WHERE organization_id = ? AND dossier_id = ?`;
  const queryParams: Array<string | number> = [params.organizationId, params.dossierId];

  if (params.status && params.status !== "ALL") {
    sql += ` AND status = ?`;
    queryParams.push(params.status);
  }

  if (params.severity && params.severity !== "ALL") {
    sql += ` AND severity = ?`;
    queryParams.push(params.severity);
  }

  if (params.isCertainError !== undefined) {
    sql += ` AND is_certain_error = ?`;
    queryParams.push(params.isCertainError ? 1 : 0);
  }

  if (params.category) {
    sql += ` AND category = ?`;
    queryParams.push(params.category);
  }

  sql += ` ORDER BY is_certain_error DESC, detected_at DESC`;

  const rows = db.prepare(sql).all(...queryParams) as Array<Record<string, unknown>>;

  const anomalies: AnomalyRecord[] = rows.map((r) => {
    let snapshot = {};
    let hist: Array<Record<string, unknown>> = [];
    try {
      snapshot = JSON.parse(String(r.source_data_snapshot_json || "{}"));
    } catch {}
    try {
      hist = JSON.parse(String(r.history_json || "[]"));
    } catch {}

    return {
      id: String(r.id),
      organizationId: String(r.organizationId || r.organization_id),
      dossierId: String(r.dossierId || r.dossier_id),
      ruleCode: String(r.rule_code),
      ruleVersionId: String(r.rule_version_id),
      category: String(r.category),
      severity: String(r.severity) as any,
      isCertainError: Number(r.is_certain_error) === 1,
      targetEntityType: String(r.target_entity_type),
      targetEntityId: r.target_entity_id ? String(r.target_entity_id) : null,
      message: String(r.message),
      sourceDataSnapshot: snapshot,
      status: String(r.status) as any,
      resolutionJustification: r.resolution_justification ? String(r.resolution_justification) : null,
      resolvedByUserId: r.resolved_by_user_id ? String(r.resolved_by_user_id) : null,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      historyJson: hist,
      detectedAt: String(r.detected_at),
      updatedAt: String(r.updated_at),
    };
  });

  return { anomalies, total: anomalies.length };
}

/**
 * Résolution ou classement d'une anomalie détectée (Gestion des faux positifs).
 */
export function resolveDossierAnomaly(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  anomalyId: string;
  resolutionStatus: "RESOLVED_BY_CORRECTION" | "DISMISSED_WITH_JUSTIFICATION";
  resolutionJustification: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): AnomalyRecord {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const existing = db
    .prepare(
      `SELECT * FROM anomalies WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.anomalyId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!existing) {
    throw new AuthorizationError("Anomalie introuvable dans ce dossier client.", 404);
  }

  const cleanJustification = (params.resolutionJustification || "").trim();

  // Si classement en faux positif / rejet, justification obligatoire d'au moins 10 caractères
  if (params.resolutionStatus === "DISMISSED_WITH_JUSTIFICATION") {
    if (!cleanJustification || cleanJustification.length < 10) {
      throw new Error(
        "Pour classer une anomalie (faux positif / dérogation), une justification motivée d'au moins 10 caractères est obligatoire."
      );
    }
  }

  const now = new Date().toISOString();
  const userId = params.session ? params.session.user.id : "system-user";

  let history: Array<Record<string, unknown>> = [];
  try {
    history = JSON.parse(String(existing.history_json || "[]"));
  } catch {}

  history.push({
    action: params.resolutionStatus,
    previousStatus: existing.status,
    newStatus: params.resolutionStatus,
    justification: cleanJustification,
    userId,
    timestamp: now,
  });

  db.prepare(
    `UPDATE anomalies
     SET status = ?, resolution_justification = ?, resolved_by_user_id = ?,
         resolved_at = ?, history_json = ?, updated_at = ?
     WHERE id = ? AND organization_id = ? AND dossier_id = ?`
  ).run(
    params.resolutionStatus,
    cleanJustification,
    userId,
    now,
    JSON.stringify(history),
    now,
    params.anomalyId,
    params.organizationId,
    params.dossierId
  );

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: resolveActorRole(params.session, params.organizationId),
      action: "ANOMALY_RESOLVED",
      targetEntityType: "ANOMALY",
      targetEntityId: params.anomalyId,
      metadata: {
        ruleCode: String(existing.rule_code),
        resolutionStatus: params.resolutionStatus,
        justification: cleanJustification,
      },
    },
    db
  );

  const updatedList = listDossierAnomalies({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  return updatedList.anomalies.find((a) => a.id === params.anomalyId)!;
}
