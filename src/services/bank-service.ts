import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  AuthenticatedSessionContext,
  assertDossierAccess,
  AuthorizationError,
} from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";
import { MAX_MONETARY_MINOR, validateCalendarDate } from "./accounting-service.js";

function resolveActorRole(
  session: AuthenticatedSessionContext | null,
  organizationId: string
): string {
  if (!session) return "SYSTEM";
  const m = session.memberships.find((mb) => mb.organizationId === organizationId);
  return m ? m.role : "AUTHENTICATED_USER";
}

export interface ParsedBankTransaction {
  operationDate: string; // YYYY-MM-DD
  valueDate?: string;    // YYYY-MM-DD
  label: string;
  counterpartyName?: string;
  paymentReference?: string;
  amountMinor: number;   // Entier signé en centimes (débit négatif, crédit positif)
  currency: string;
  bankAccountIbanOrRef?: string;
  fitid?: string;
}

export interface BankTransactionRecord {
  id: string;
  organizationId: string;
  dossierId: string;
  importBatchId: string | null;
  bankAccountIbanOrRef: string | null;
  operationDate: string;
  valueDate: string | null;
  label: string;
  counterpartyName: string | null;
  paymentReference: string | null;
  amountMinor: number;
  currency: string;
  currencyMinorUnitExponent: number;
  reconciledAmountMinor: number;
  reconciliationStatus:
    | "UNRECONCILED"
    | "SUGGESTED_BY_AI"
    | "PARTIALLY_RECONCILED"
    | "RECONCILED"
    | "BANK_FEE_OR_NO_RECEIPT_FLAGGED";
  externalDedupHash: string;
  createdAt: string;
  updatedAt: string;
  suggestedMatch?: {
    invoiceId: string;
    invoiceNumber: string;
    thirdPartyName: string;
    invoiceTotalTtcMinor: number;
    remainingDueMinor: number;
    confidenceScore: number;
    matchReason: string;
  } | null;
}

export interface ImportBatchRecord {
  id: string;
  organizationId: string;
  dossierId: string;
  importType: "BANK_STATEMENT_CSV" | "BANK_STATEMENT_OFX";
  originalFilename: string;
  fileSha256Checksum: string;
  status: "COMMITTED" | "REJECTED_DUPLICATE" | "FAILED_ROLLED_BACK";
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  errorsReportJson: string;
  importedByUserId: string;
  committedAt: string;
  createdAt: string;
}

/**
 * Normalise un texte brut en détectant UTF-8 vs Latin-1 / Windows-1252.
 */
export function normalizeBankFileEncoding(buffer: Buffer): string {
  // Teste si le buffer est du UTF-8 valide
  const utf8Str = buffer.toString("utf8");
  // Si le remplacement de caractères invalides '\uFFFD' apparaît fréquemment, tenter latin1
  const uffdCount = (utf8Str.match(/\uFFFD/g) || []).length;
  if (uffdCount > 0 && buffer.length > 0 && uffdCount / buffer.length > 0.005) {
    return buffer.toString("latin1");
  }
  return utf8Str;
}

/**
 * Analyse une date issue d'un relevé bancaire (formats courants : DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, YYYYMMDD).
 */
export function parseBankDate(rawDate: string): string {
  const clean = (rawDate || "").trim().replace(/\//g, "-").replace(/\./g, "-");
  
  // Format YYYYMMDD (OFX)
  if (/^\d{8}$/.test(clean)) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return validateCalendarDate(`${y}-${m}-${d}`, "Date bancaire");
  }

  // Format DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split("-");
    return validateCalendarDate(`${y}-${m}-${d}`, "Date bancaire");
  }

  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return validateCalendarDate(clean, "Date bancaire");
  }

  throw new Error(`Format de date bancaire non reconnu : "${rawDate}".`);
}

/**
 * Convertit un montant monétaire texte en unités mineures entières (centimes).
 * Gère les séparateurs décimaux français (virgule) et anglo-saxons (point), ainsi que les espaces.
 */
export function parseBankAmountToMinor(rawAmount: string | number): number {
  if (typeof rawAmount === "number") {
    if (!Number.isFinite(rawAmount)) throw new Error("Montant bancaire invalide.");
    const minor = Math.round(rawAmount * 100);
    if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MONETARY_MINOR) {
      throw new Error("Montant bancaire hors limites de capacité autorisées.");
    }
    return minor;
  }

  const clean = String(rawAmount || "")
    .replace(/\s+/g, "")
    .replace(/[€$£]/g, "")
    .replace(/,/g, ".");

  if (!clean || clean === "-" || clean === "+") {
    throw new Error("Montant bancaire vide ou non renseigné.");
  }

  const parsed = parseFloat(clean);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Montant bancaire non numérique : "${rawAmount}".`);
  }

  const minor = Math.round(parsed * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MONETARY_MINOR) {
    throw new Error("Montant bancaire hors limites de capacité autorisées.");
  }

  return minor;
}

/**
 * Parseur de relevé bancaire CSV paramétrable et auto-détecteur d'en-têtes français.
 */
export function parseCsvBankStatement(
  content: string,
  currency = "EUR"
): { transactions: ParsedBankTransaction[]; errors: Array<{ row: number; error: string }> } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("Le fichier CSV doit comporter au moins une ligne d'en-tête et une ligne de données.");
  }

  // Détection du délimiteur (;, ,, \t)
  const firstLine = lines[0]!;
  const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

  const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  
  // Recherche des index de colonnes
  const dateIdx = headers.findIndex((h) => h.includes("date") && !h.includes("valeur"));
  const valueDateIdx = headers.findIndex((h) => h.includes("valeur"));
  const labelIdx = headers.findIndex((h) => h.includes("libell") || h.includes("label") || h.includes("description") || h.includes("operation"));
  const amountIdx = headers.findIndex((h) => (h.includes("montant") || h.includes("amount")) && !h.includes("debit") && !h.includes("credit"));
  const debitIdx = headers.findIndex((h) => h.includes("debit") || h.includes("débit"));
  const creditIdx = headers.findIndex((h) => h.includes("credit") || h.includes("crédit"));
  const refIdx = headers.findIndex((h) => h.includes("ref") || h.includes("reference") || h.includes("pièce"));
  const ibanIdx = headers.findIndex((h) => h.includes("iban") || h.includes("compte"));

  if (dateIdx === -1) {
    throw new Error("Colonne de date d'opération introuvable dans l'en-tête du fichier CSV.");
  }
  if (labelIdx === -1) {
    throw new Error("Colonne de libellé introuvable dans l'en-tête du fichier CSV.");
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new Error("Colonnes de montant introuvables (montant unique signé, ou colonnes Débit et Crédit séparées requises).");
  }

  const transactions: ParsedBankTransaction[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i]!.trim();
    if (!rawLine) continue;

    // Découpage en respectant les guillemets éventuels
    const cols = rawLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const rowNum = i + 1;

    try {
      const rawDate = cols[dateIdx];
      if (!rawDate) throw new Error("Date d'opération manquante.");
      const operationDate = parseBankDate(rawDate);

      let valueDate: string | undefined = undefined;
      if (valueDateIdx !== -1 && cols[valueDateIdx]) {
        try {
          valueDate = parseBankDate(cols[valueDateIdx]!);
        } catch {
          // Si date de valeur invalide, on conserve undefined
        }
      }

      const label = (cols[labelIdx] || "").trim();
      if (!label) throw new Error("Libellé d'opération manquant.");

      let amountMinor = 0;
      if (amountIdx !== -1 && cols[amountIdx]) {
        amountMinor = parseBankAmountToMinor(cols[amountIdx]!);
      } else {
        const rawDebit = debitIdx !== -1 ? cols[debitIdx] : "";
        const rawCredit = creditIdx !== -1 ? cols[creditIdx] : "";

        if (rawDebit && rawDebit.trim().length > 0) {
          const deb = Math.abs(parseBankAmountToMinor(rawDebit));
          amountMinor = -deb; // Débit négatif
        } else if (rawCredit && rawCredit.trim().length > 0) {
          amountMinor = Math.abs(parseBankAmountToMinor(rawCredit)); // Crédit positif
        } else {
          throw new Error("Aucun montant débit ou crédit renseigné.");
        }
      }

      if (amountMinor === 0) {
        throw new Error("Le montant de l'opération bancaire ne peut pas être nul.");
      }

      const paymentReference = refIdx !== -1 && cols[refIdx] ? cols[refIdx]!.trim() : undefined;
      const bankAccountIbanOrRef = ibanIdx !== -1 && cols[ibanIdx] ? cols[ibanIdx]!.trim() : undefined;

      transactions.push({
        operationDate,
        valueDate,
        label,
        paymentReference,
        amountMinor,
        currency: currency.toUpperCase(),
        bankAccountIbanOrRef,
      });
    } catch (err) {
      errors.push({
        row: rowNum,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { transactions, errors };
}

/**
 * Parseur de relevé bancaire au format standard OFX (SGML & XML).
 * Extrait les balises <STMTTRN> : <DTPOSTED>, <TRNAMT>, <FITID>, <NAME>, <MEMO>, <CHECKNUM>.
 */
export function parseOfxBankStatement(
  content: string,
  currency = "EUR"
): { transactions: ParsedBankTransaction[]; errors: Array<{ row: number; error: string }> } {
  const transactions: ParsedBankTransaction[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  // Détection des blocs <STMTTRN>...</STMTTRN> ou SGML <STMTTRN>
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi;
  let match: RegExpExecArray | null;
  let count = 0;

  function extractTag(block: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
    const m = block.match(regex);
    return m ? m[1]!.trim() : null;
  }

  while ((match = stmttrnRegex.exec(content)) !== null) {
    count++;
    const block = match[1]!;

    try {
      const dtPosted = extractTag(block, "DTPOSTED");
      if (!dtPosted) throw new Error("Balise <DTPOSTED> manquante dans la transaction OFX.");
      const operationDate = parseBankDate(dtPosted.slice(0, 8));

      const trnAmt = extractTag(block, "TRNAMT");
      if (!trnAmt) throw new Error("Balise <TRNAMT> manquante dans la transaction OFX.");
      const amountMinor = parseBankAmountToMinor(trnAmt);

      const fitid = extractTag(block, "FITID") || undefined;
      const name = extractTag(block, "NAME") || "";
      const memo = extractTag(block, "MEMO") || "";
      const checkNum = extractTag(block, "CHECKNUM") || undefined;

      const label = [name, memo].filter(Boolean).join(" - ").trim() || "Opération bancaire OFX";

      transactions.push({
        operationDate,
        label,
        counterpartyName: name || undefined,
        paymentReference: checkNum || fitid,
        amountMinor,
        currency: currency.toUpperCase(),
        fitid,
      });
    } catch (err) {
      errors.push({
        row: count,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (count === 0 && !content.includes("<STMTTRN>")) {
    throw new Error("Le fichier ne contient aucune balise de transaction bancaire <STMTTRN> valide.");
  }

  return { transactions, errors };
}

/**
 * Import transactionnel d'un relevé bancaire avec détection des doublons et prévention des réimports involontaires.
 */
export function importBankStatement(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  fileBuffer: Buffer;
  filename: string;
  importType: "BANK_STATEMENT_CSV" | "BANK_STATEMENT_OFX";
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): ImportBatchRecord & { importedTransactionsCount: number } {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "UPLOAD",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const dossierRow = db
    .prepare(
      `SELECT id, currency, is_active FROM client_dossiers WHERE id = ? AND organization_id = ?`
    )
    .get(params.dossierId, params.organizationId) as
    | { id: string; currency: string; is_active: number }
    | undefined;

  if (!dossierRow) {
    throw new AuthorizationError("Dossier client introuvable dans cette organisation.", 404);
  }

  if (Number(dossierRow.is_active) !== 1) {
    throw new Error("Opération impossible : le dossier client est archivé ou inactif.");
  }

  const fileSha256Checksum = crypto.createHash("sha256").update(params.fileBuffer).digest("hex");

  // Vérification de réimport involontaire du même fichier exact
  const existingBatch = db
    .prepare(
      `SELECT id, status, total_rows, valid_rows FROM import_batches 
       WHERE organization_id = ? AND dossier_id = ? AND file_sha256_checksum = ? AND status = 'COMMITTED'`
    )
    .get(params.organizationId, params.dossierId, fileSha256Checksum) as
    | { id: string; status: string; total_rows: number; valid_rows: number }
    | undefined;

  if (existingBatch) {
    throw new Error(
      `Ce fichier de relevé bancaire a déjà été importé pour ce dossier (Lot d'import : ${existingBatch.id}). Réimport involontaire bloqué.`
    );
  }

  const textContent = normalizeBankFileEncoding(params.fileBuffer);
  const parsed =
    params.importType === "BANK_STATEMENT_OFX"
      ? parseOfxBankStatement(textContent, dossierRow.currency)
      : parseCsvBankStatement(textContent, dossierRow.currency);

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = params.session ? params.session.user.id : "system-user";

  let validRows = 0;
  let duplicateRows = 0;
  const errorRows = parsed.errors.length;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insérer d'abord le lot d'import parent pour respecter la contrainte de clé étrangère
    db.prepare(
      `INSERT INTO import_batches (
        id, organization_id, dossier_id, import_type, original_filename,
        file_sha256_checksum, status, total_rows, valid_rows, duplicate_rows,
        error_rows, errors_report_json, imported_by_user_id, committed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'COMMITTED', ?, 0, 0, ?, ?, ?, ?, ?)`
    ).run(
      batchId,
      params.organizationId,
      params.dossierId,
      params.importType,
      params.filename,
      fileSha256Checksum,
      parsed.transactions.length + parsed.errors.length,
      errorRows,
      JSON.stringify(parsed.errors),
      userId,
      now,
      now
    );

    const insertTxStmt = db.prepare(
      `INSERT INTO bank_transactions (
        id, organization_id, dossier_id, import_batch_id, bank_account_iban_or_ref,
        operation_date, value_date, label, counterparty_name, payment_reference,
        amount_minor, currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 0, 'UNRECONCILED', ?, ?, ?)`
    );

    const checkDupStmt = db.prepare(
      `SELECT id FROM bank_transactions WHERE dossier_id = ? AND external_dedup_hash = ?`
    );

    for (const tx of parsed.transactions) {
      // Hachage normalisé d'idempotence
      const dedupPayload = `${params.dossierId}:${tx.operationDate}:${tx.amountMinor}:${tx.label}:${tx.fitid || ""}:${tx.bankAccountIbanOrRef || ""}`;
      const dedupHash = crypto.createHash("sha256").update(dedupPayload).digest("hex");

      const dup = checkDupStmt.get(params.dossierId, dedupHash);
      if (dup) {
        duplicateRows++;
        continue;
      }

      insertTxStmt.run(
        crypto.randomUUID(),
        params.organizationId,
        params.dossierId,
        batchId,
        tx.bankAccountIbanOrRef ?? null,
        tx.operationDate,
        tx.valueDate ?? null,
        tx.label,
        tx.counterpartyName ?? null,
        tx.paymentReference ?? null,
        tx.amountMinor,
        tx.currency,
        dedupHash,
        now,
        now
      );
      validRows++;
    }

    // 2. Mettre à jour les compteurs finaux du lot
    db.prepare(
      `UPDATE import_batches
       SET valid_rows = ?, duplicate_rows = ?
       WHERE id = ?`
    ).run(validRows, duplicateRows, batchId);

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: resolveActorRole(params.session, params.organizationId),
      action: "BANK_STATEMENT_IMPORTED",
      targetEntityType: "IMPORT_BATCH",
      targetEntityId: batchId,
      metadata: {
        filename: params.filename,
        importType: params.importType,
        totalRows: parsed.transactions.length + parsed.errors.length,
        validRows,
        duplicateRows,
        errorRows,
      },
    },
    db
  );

  return {
    id: batchId,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    importType: params.importType,
    originalFilename: params.filename,
    fileSha256Checksum,
    status: "COMMITTED",
    totalRows: parsed.transactions.length + parsed.errors.length,
    validRows,
    duplicateRows,
    errorRows,
    errorsReportJson: JSON.stringify(parsed.errors),
    importedByUserId: userId,
    committedAt: now,
    createdAt: now,
    importedTransactionsCount: validRows,
  };
}

/**
 * Consultation multi-critères des transactions bancaires avec calcul automatique des suggestions de rapprochement.
 */
export function listBankTransactions(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): { transactions: BankTransactionRecord[]; total: number } {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  let sql = `
    SELECT * FROM bank_transactions
    WHERE organization_id = ? AND dossier_id = ?
  `;
  const queryParams: Array<string | number> = [params.organizationId, params.dossierId];

  if (params.status && params.status !== "ALL") {
    sql += ` AND reconciliation_status = ?`;
    queryParams.push(params.status);
  }

  if (params.startDate) {
    sql += ` AND operation_date >= ?`;
    queryParams.push(params.startDate);
  }

  if (params.endDate) {
    sql += ` AND operation_date <= ?`;
    queryParams.push(params.endDate);
  }

  if (params.search && params.search.trim().length > 0) {
    const q = `%${params.search.trim().toLowerCase()}%`;
    sql += ` AND (LOWER(label) LIKE ? OR LOWER(COALESCE(payment_reference, '')) LIKE ?)`;
    queryParams.push(q, q);
  }

  const countRow = db
    .prepare(sql.replace("SELECT *", "SELECT COUNT(*) AS c"))
    .get(...queryParams) as { c: number };
  const total = Number(countRow.c);

  sql += ` ORDER BY operation_date DESC, created_at DESC`;

  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  const offset = Math.max(0, params.offset ?? 0);
  sql += ` LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  const rows = db.prepare(sql).all(...queryParams) as Array<Record<string, unknown>>;

  // Récupérer les factures ouvertes du dossier pour générer les suggestions déterministes
  const openInvoices = db
    .prepare(
      `SELECT i.id, i.invoice_number, COALESCE(i.gross_amount_minor, 0) AS gross_amount_minor,
              COALESCE(i.paid_amount_minor, 0) AS paid_amount_minor, i.third_party_name, i.issue_date, i.direction
       FROM invoices i
       WHERE i.organization_id = ? AND i.dossier_id = ? AND i.payment_status != 'PAID'`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  const transactions: BankTransactionRecord[] = rows.map((r) => {
    const amountMinor = Number(r.amount_minor);
    const absAmount = Math.abs(amountMinor);
    const labelUpper = String(r.label).toUpperCase();
    const currentStatus = String(r.reconciliation_status) as any;

    let suggestedMatch: BankTransactionRecord["suggestedMatch"] = null;

    if (currentStatus === "UNRECONCILED" || currentStatus === "SUGGESTED_BY_AI") {
      // Recherche de facture correspondante
      for (const inv of openInvoices) {
        const invTotal = Number(inv.gross_amount_minor);
        const invPaid = Number(inv.paid_amount_minor);
        const remainingDue = invTotal - invPaid;
        const invNumber = String(inv.invoice_number || "").toUpperCase();
        const clientName = String(inv.third_party_name || "").toUpperCase();

        // 1. Correspondance exacte sur le numéro de facture dans le libellé bancaire
        if (invNumber && labelUpper.includes(invNumber)) {
          suggestedMatch = {
            invoiceId: String(inv.id),
            invoiceNumber: String(inv.invoice_number),
            thirdPartyName: String(inv.third_party_name || ""),
            invoiceTotalTtcMinor: invTotal,
            remainingDueMinor: remainingDue,
            confidenceScore: 0.95,
            matchReason: `Référence facture "${inv.invoice_number}" détectée dans le libellé`,
          };
          break;
        }

        // 2. Correspondance exacte sur le montant restant dû
        if (absAmount === remainingDue) {
          suggestedMatch = {
            invoiceId: String(inv.id),
            invoiceNumber: String(inv.invoice_number),
            thirdPartyName: String(inv.third_party_name || ""),
            invoiceTotalTtcMinor: invTotal,
            remainingDueMinor: remainingDue,
            confidenceScore: clientName && labelUpper.includes(clientName.slice(0, 5)) ? 0.9 : 0.75,
            matchReason: `Montant exact concorde avec le reste dû (${(remainingDue / 100).toFixed(2)} €)`,
          };
          break;
        }
      }
    }

    return {
      id: String(r.id),
      organizationId: String(r.organizationId || r.organization_id),
      dossierId: String(r.dossierId || r.dossier_id),
      importBatchId: r.import_batch_id ? String(r.import_batch_id) : null,
      bankAccountIbanOrRef: r.bank_account_iban_or_ref ? String(r.bank_account_iban_or_ref) : null,
      operationDate: String(r.operation_date),
      valueDate: r.value_date ? String(r.value_date) : null,
      label: String(r.label),
      counterpartyName: r.counterparty_name ? String(r.counterparty_name) : null,
      paymentReference: r.payment_reference ? String(r.payment_reference) : null,
      amountMinor,
      currency: String(r.currency),
      currencyMinorUnitExponent: Number(r.currency_minor_unit_exponent ?? 2),
      reconciledAmountMinor: Number(r.reconciled_amount_minor ?? 0),
      reconciliationStatus: currentStatus,
      externalDedupHash: String(r.external_dedup_hash),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      suggestedMatch,
    };
  });

  return { transactions, total };
}

/**
 * Rapprochement bancaire formel assisté ou manuel avec validation humaine obligatoire.
 * Prend en charge les paiements complets et partiels.
 */
export function reconcileBankTransaction(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  transactionId: string;
  invoiceId: string;
  allocatedAmountMinor?: number; // Si omis, alloue le montant restant de la transaction ou de la facture
  matchOrigin?: "DETERMINISTIC_RULE" | "AI_SUGGESTION" | "MANUAL_USER";
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): {
  success: boolean;
  reconciliationLinkId: string;
  transactionStatus: string;
  invoicePaymentStatus: string;
  allocatedAmountMinor: number;
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const dossierRow = db
    .prepare(
      `SELECT id, is_active FROM client_dossiers WHERE id = ? AND organization_id = ?`
    )
    .get(params.dossierId, params.organizationId) as { id: string; is_active: number } | undefined;

  if (!dossierRow || Number(dossierRow.is_active) !== 1) {
    throw new Error("Opération impossible : le dossier client est archivé ou inactif.");
  }

  const tx = db
    .prepare(
      `SELECT * FROM bank_transactions WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.transactionId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!tx) {
    throw new AuthorizationError("Transaction bancaire introuvable dans ce dossier.", 404);
  }

  const invoice = db
    .prepare(
      `SELECT * FROM invoices WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.invoiceId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!invoice) {
    throw new AuthorizationError("Facture introuvable dans ce dossier client.", 404);
  }

  const txAmountAbs = Math.abs(Number(tx.amount_minor));
  const txReconciled = Number(tx.reconciled_amount_minor ?? 0);
  const txRemaining = txAmountAbs - txReconciled;

  if (txRemaining <= 0) {
    throw new Error("Cette transaction bancaire est déjà intégralement rapprochée.");
  }

  const invTotal = Number(invoice.gross_amount_minor ?? invoice.total_amount_ttc_minor);
  const invPaid = Number(invoice.paid_amount_minor ?? 0);
  const invRemaining = invTotal - invPaid;

  if (invRemaining <= 0) {
    throw new Error("Cette facture est déjà intégralement réglée et soldée.");
  }

  // Calcul du montant à allouer
  const requestedAllocation = params.allocatedAmountMinor !== undefined
    ? Number(params.allocatedAmountMinor)
    : Math.min(txRemaining, invRemaining);

  if (!Number.isSafeInteger(requestedAllocation) || requestedAllocation <= 0) {
    throw new Error("Le montant alloué doit être un entier positif strict (en centimes).");
  }

  if (requestedAllocation > txRemaining) {
    throw new Error(
      `Le montant alloué (${requestedAllocation} centimes) dépasse le solde disponible de la transaction (${txRemaining} centimes).`
    );
  }

  if (requestedAllocation > invRemaining) {
    throw new Error(
      `Le montant alloué (${requestedAllocation} centimes) dépasse le reste dû sur la facture (${invRemaining} centimes).`
    );
  }

  const newTxReconciled = txReconciled + requestedAllocation;
  const newTxStatus = newTxReconciled === txAmountAbs ? "RECONCILED" : "PARTIALLY_RECONCILED";

  const newInvPaid = invPaid + requestedAllocation;
  const newInvStatus = newInvPaid === invTotal ? "PAID" : "PARTIALLY_PAID";

  const linkId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = params.session ? params.session.user.id : "system-user";
  const matchOrigin = params.matchOrigin ?? "MANUAL_USER";

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Mettre à jour la transaction bancaire
    db.prepare(
      `UPDATE bank_transactions
       SET reconciled_amount_minor = ?, reconciliation_status = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    ).run(newTxReconciled, newTxStatus, now, params.transactionId, params.organizationId, params.dossierId);

    // 2. Mettre à jour la facture
    db.prepare(
      `UPDATE invoices
       SET paid_amount_minor = ?, payment_status = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    ).run(newInvPaid, newInvStatus, now, params.invoiceId, params.organizationId, params.dossierId);

    // 3. Créer le lien de rapprochement
    db.prepare(
      `INSERT INTO reconciliation_links (
        id, organization_id, dossier_id, bank_transaction_id, invoice_id,
        allocated_amount_minor, currency, confidence_score, match_origin,
        validation_status, validated_by_user_id, validated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, 'VALIDATED_BY_HUMAN', ?, ?, ?)`
    ).run(
      linkId,
      params.organizationId,
      params.dossierId,
      params.transactionId,
      params.invoiceId,
      requestedAllocation,
      String(tx.currency),
      matchOrigin,
      userId,
      now,
      now
    );

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: resolveActorRole(params.session, params.organizationId),
      action: "BANK_TRANSACTION_RECONCILED",
      targetEntityType: "BANK_TRANSACTION",
      targetEntityId: params.transactionId,
      metadata: {
        invoiceId: params.invoiceId,
        invoiceNumber: String(invoice.invoice_number),
        allocatedAmountMinor: requestedAllocation,
        transactionStatus: newTxStatus,
        invoicePaymentStatus: newInvStatus,
        matchOrigin,
      },
    },
    db
  );

  return {
    success: true,
    reconciliationLinkId: linkId,
    transactionStatus: newTxStatus,
    invoicePaymentStatus: newInvStatus,
    allocatedAmountMinor: requestedAllocation,
  };
}

/**
 * Rejette une proposition de rapprochement automatique.
 */
export function rejectReconciliationSuggestion(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  transactionId: string;
  reason?: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): { success: boolean } {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const tx = db
    .prepare(
      `SELECT id, reconciliation_status FROM bank_transactions WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.transactionId, params.organizationId, params.dossierId) as
    | { id: string; reconciliation_status: string }
    | undefined;

  if (!tx) {
    throw new AuthorizationError("Transaction bancaire introuvable.", 404);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE bank_transactions
     SET reconciliation_status = 'UNRECONCILED', updated_at = ?
     WHERE id = ? AND organization_id = ? AND dossier_id = ?`
  ).run(now, params.transactionId, params.organizationId, params.dossierId);

  const userId = params.session ? params.session.user.id : "system-user";
  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: resolveActorRole(params.session, params.organizationId),
      action: "BANK_RECONCILIATION_SUGGESTION_REJECTED",
      targetEntityType: "BANK_TRANSACTION",
      targetEntityId: params.transactionId,
      metadata: { reason: params.reason || "Rejet par l'opérateur" },
    },
    db
  );

  return { success: true };
}

/**
 * Marque une opération bancaire comme frais bancaires ou nécessitant un justificatif.
 */
export function flagBankTransactionNoReceipt(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  transactionId: string;
  notes?: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): { success: boolean } {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const tx = db
    .prepare(
      `SELECT id FROM bank_transactions WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.transactionId, params.organizationId, params.dossierId) as
    | { id: string }
    | undefined;

  if (!tx) {
    throw new AuthorizationError("Transaction bancaire introuvable.", 404);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE bank_transactions
     SET reconciliation_status = 'BANK_FEE_OR_NO_RECEIPT_FLAGGED', updated_at = ?
     WHERE id = ? AND organization_id = ? AND dossier_id = ?`
  ).run(now, params.transactionId, params.organizationId, params.dossierId);

  const userId = params.session ? params.session.user.id : "system-user";
  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: resolveActorRole(params.session, params.organizationId),
      action: "BANK_TRANSACTION_FLAGGED_NO_RECEIPT",
      targetEntityType: "BANK_TRANSACTION",
      targetEntityId: params.transactionId,
      metadata: params.notes ? { notes: params.notes } : undefined,
    },
    db
  );

  return { success: true };
}
