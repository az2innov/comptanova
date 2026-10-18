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

/**
 * Service de Saisie Comptable et Journaux (Module 5 — Phase 1, Lot 1.5).
 *
 * Principes stricts de conformité comptable française et internationale :
 * 1. Partie double stricte : Au moins 2 lignes par écriture, Total Débit === Total Crédit en unités mineures (centimes).
 * 2. Arithmétique monétaire exacte : Entiers stricts sans flottants IEEE-754.
 * 3. Plan de comptes du dossier : Contrôle d'existence et d'éligibilité des comptes généraux (PCG ANC).
 * 4. 5 Journaux standards français : VE (Ventes), AC (Achats), BQ (Banque), OD (Opérations Diverses), AN (À-Nouveaux).
 * 5. Cycle de vie contrôlé : DRAFT / AI_SUGGESTION -> VALIDATED (humaine) -> EXPORTED / REVERSED.
 * 6. Inaltérabilité des écritures validées : Aucune modification ni suppression directe en place (LPF / FEC).
 * 7. Procédure d'extourne (Reversal) : Génération d'une contre-passation symétrique inversée avec traçabilité bidirectionnelle.
 * 8. Isolation Multi-Tenant absolue et permissions RBAC explicites (VALIDATE_ACCOUNTING).
 */

export interface AccountingEntryLineInput {
  lineNumber?: number;
  generalAccountCode: string;
  auxiliaryAccountCode?: string | null;
  thirdPartyId?: string | null;
  label: string;
  debitMinor: number;
  creditMinor: number;
}

export interface AccountingEntryLineRecord {
  id: string;
  lineNumber: number;
  generalAccountCode: string;
  generalAccountLabel?: string | null;
  auxiliaryAccountCode: string | null;
  thirdPartyId: string | null;
  thirdPartyName?: string | null;
  label: string;
  debitMinor: number;
  creditMinor: number;
  currency: string;
  currencyMinorUnitExponent: number;
  reconciliationLettrageCode: string | null;
  createdAt: string;
}

export interface AccountingEntryRecord {
  id: string;
  organizationId: string;
  dossierId: string;
  journalCode: string;
  journalLabel?: string | null;
  entryDate: string;
  pieceNumber: string;
  label: string;
  status: "DRAFT" | "AI_SUGGESTION" | "VALIDATED" | "EXPORTED" | "REVERSED";
  currency: string;
  currencyMinorUnitExponent: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  isBalanced: boolean;
  documentId: string | null;
  ruleVersionId: string;
  createdByUserId: string;
  createdByName?: string | null;
  validatedByUserId: string | null;
  validatedByName?: string | null;
  validatedAt: string | null;
  reversalOfEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: AccountingEntryLineRecord[];
}

export interface DossierAccountItem {
  id: string;
  accountNumber: string;
  label: string;
  accountClass: number;
  allowAuxiliary: boolean;
  isActive: boolean;
}

export interface DossierJournalItem {
  id: string;
  code: string;
  label: string;
  journalType: string;
  isActive: boolean;
}

export interface CreateAccountingEntryParams {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  journalCode: string;
  entryDate: string;
  pieceNumber: string;
  label: string;
  status?: "DRAFT" | "AI_SUGGESTION";
  currency?: string;
  lines: AccountingEntryLineInput[];
  documentId?: string | null;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}

export interface UpdateDraftAccountingEntryParams {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  entryId: string;
  journalCode?: string;
  entryDate?: string;
  pieceNumber?: string;
  label?: string;
  currency?: string;
  lines: AccountingEntryLineInput[];
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}

export interface ValidateAccountingEntryParams {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  entryId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}

export interface ReverseAccountingEntryParams {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  entryId: string;
  reversalDate?: string;
  reversalReason?: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}

export interface DeleteDraftAccountingEntryParams {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  entryId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}

export interface ListAccountingEntriesParams {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  journalCode?: string;
  status?: string;
  accountCode?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}

/**
 * Récupère les comptes du plan comptable (PCG) autorisés pour un dossier client.
 */
export function getDossierAccounts(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  accountClass?: number;
  search?: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): DossierAccountItem[] {
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
    SELECT id, account_number, label, account_class, allow_auxiliary, is_active
    FROM chart_of_accounts
    WHERE organization_id = ? AND dossier_id = ? AND is_active = 1
  `;
  const queryParams: Array<string | number | null> = [params.organizationId, params.dossierId];

  if (params.accountClass !== undefined && !Number.isNaN(params.accountClass)) {
    sql += ` AND account_class = ?`;
    queryParams.push(params.accountClass);
  }

  if (params.search && params.search.trim().length > 0) {
    const q = `%${params.search.trim().toLowerCase()}%`;
    sql += ` AND (LOWER(account_number) LIKE ? OR LOWER(label) LIKE ?)`;
    queryParams.push(q, q);
  }

  sql += ` ORDER BY account_number ASC`;

  const rows = db.prepare(sql).all(...queryParams) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    accountNumber: String(r.account_number),
    label: String(r.label),
    accountClass: Number(r.account_class),
    allowAuxiliary: Number(r.allow_auxiliary) === 1,
    isActive: Number(r.is_active) === 1,
  }));
}

/**
 * Récupère les journaux comptables autorisés pour un dossier client.
 */
export function getDossierJournals(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): DossierJournalItem[] {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const sql = `
    SELECT id, code, label, journal_type, is_active
    FROM accounting_journals
    WHERE organization_id = ? AND dossier_id = ? AND is_active = 1
    ORDER BY code ASC
  `;
  const rows = db.prepare(sql).all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.code),
    label: String(r.label),
    journalType: String(r.journal_type),
    isActive: Number(r.is_active) === 1,
  }));
}

/**
 * Validation interne d'une liste de lignes d'écriture comptable.
 */
function validateAccountingEntryLines(
  lines: AccountingEntryLineInput[],
  dossierAccountsSet: Set<string>
): {
  normalizedLines: Array<{
    lineNumber: number;
    generalAccountCode: string;
    auxiliaryAccountCode: string | null;
    thirdPartyId: string | null;
    label: string;
    debitMinor: number;
    creditMinor: number;
  }>;
  totalDebitMinor: number;
  totalCreditMinor: number;
} {
  if (!lines || !Array.isArray(lines) || lines.length < 2) {
    throw new Error(
      "Une écriture comptable en partie double doit comporter au moins 2 lignes."
    );
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  const normalizedLines: Array<{
    lineNumber: number;
    generalAccountCode: string;
    auxiliaryAccountCode: string | null;
    thirdPartyId: string | null;
    label: string;
    debitMinor: number;
    creditMinor: number;
  }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]!;
    const lineNumber = idx + 1;
    const generalAccountCode = (raw.generalAccountCode || "").trim();

    if (!generalAccountCode) {
      throw new Error(`Ligne ${lineNumber} : Le compte général est obligatoire.`);
    }

    if (!dossierAccountsSet.has(generalAccountCode)) {
      throw new Error(
        `Ligne ${lineNumber} : Le compte général "${generalAccountCode}" n'est pas autorisé ou n'existe pas dans le plan de comptes du dossier.`
      );
    }

    const label = (raw.label || "").trim();
    if (!label) {
      throw new Error(`Ligne ${lineNumber} : Le libellé de ligne est obligatoire.`);
    }

    const debitMinor = Number(raw.debitMinor ?? 0);
    const creditMinor = Number(raw.creditMinor ?? 0);

    if (
      !Number.isSafeInteger(debitMinor) ||
      !Number.isSafeInteger(creditMinor) ||
      debitMinor < 0 ||
      creditMinor < 0
    ) {
      throw new Error(
        `Ligne ${lineNumber} : Les montants débit et crédit doivent être des entiers positifs ou nuls (unités mineures).`
      );
    }

    if (debitMinor > 0 && creditMinor > 0) {
      throw new Error(
        `Ligne ${lineNumber} : Une ligne ne peut pas porter simultanément un débit et un crédit non nuls.`
      );
    }

    if (debitMinor === 0 && creditMinor === 0) {
      throw new Error(
        `Ligne ${lineNumber} : Une ligne doit comporter un montant non nul soit au débit, soit au crédit.`
      );
    }

    totalDebitMinor += debitMinor;
    totalCreditMinor += creditMinor;

    normalizedLines.push({
      lineNumber,
      generalAccountCode,
      auxiliaryAccountCode: raw.auxiliaryAccountCode ? raw.auxiliaryAccountCode.trim() : null,
      thirdPartyId: raw.thirdPartyId ? raw.thirdPartyId.trim() : null,
      label,
      debitMinor,
      creditMinor,
    });
  }

  return {
    normalizedLines,
    totalDebitMinor,
    totalCreditMinor,
  };
}

/**
 * Création d'une nouvelle écriture comptable multi-lignes (Saisie au kilomètre - Module 5).
 * Statut initial : DRAFT ou AI_SUGGESTION.
 */
export function createAccountingEntry(params: CreateAccountingEntryParams): AccountingEntryRecord {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "EDIT_EXTRACTION",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const dossierRow = db
    .prepare(
      `SELECT id, currency, country_config_version_id FROM client_dossiers WHERE id = ? AND organization_id = ?`
    )
    .get(params.dossierId, params.organizationId) as
    | { id: string; currency: string; country_config_version_id: string }
    | undefined;

  if (!dossierRow) {
    throw new AuthorizationError(
      "Dossier client introuvable dans cette organisation.",
      404
    );
  }

  const cleanJournal = (params.journalCode || "").trim().toUpperCase();
  if (!cleanJournal) {
    throw new Error("Le code journal est obligatoire.");
  }

  const journalExists = db
    .prepare(
      `SELECT code FROM accounting_journals WHERE organization_id = ? AND dossier_id = ? AND UPPER(code) = ? AND is_active = 1`
    )
    .get(params.organizationId, params.dossierId, cleanJournal) as { code: string } | undefined;

  if (!journalExists) {
    throw new Error(
      `Le journal "${cleanJournal}" n'est pas autorisé pour ce dossier client.`
    );
  }

  const cleanPieceNumber = (params.pieceNumber || "").trim();
  if (!cleanPieceNumber) {
    throw new Error("Le numéro de pièce comptable est obligatoire.");
  }

  const cleanLabel = (params.label || "").trim();
  if (!cleanLabel) {
    throw new Error("Le libellé de l'écriture comptable est obligatoire.");
  }

  const cleanEntryDate = (params.entryDate || "").trim();
  if (!cleanEntryDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanEntryDate)) {
    throw new Error("La date d'écriture doit être au format AAAA-MM-JJ (ex: 2026-10-18).");
  }

  // Récupérer le set des comptes du dossier
  const accountRows = db
    .prepare(
      `SELECT account_number FROM chart_of_accounts WHERE organization_id = ? AND dossier_id = ? AND is_active = 1`
    )
    .all(params.organizationId, params.dossierId) as Array<{ account_number: string }>;
  const dossierAccountsSet = new Set(accountRows.map((a) => a.account_number));

  const { normalizedLines, totalDebitMinor, totalCreditMinor } = validateAccountingEntryLines(
    params.lines,
    dossierAccountsSet
  );

  const entryId = crypto.randomUUID();
  const now = new Date().toISOString();
  const currency = (params.currency || dossierRow.currency || "EUR").trim().toUpperCase();
  const ruleVersionId = dossierRow.country_config_version_id || "FR-2026.1-REV0";
  const userId = params.session ? params.session.user.id : "system-user";
  const initialStatus = params.status === "AI_SUGGESTION" ? "AI_SUGGESTION" : "DRAFT";

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(
      `INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date,
        piece_number, label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, document_id, rule_version_id,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entryId,
      params.organizationId,
      params.dossierId,
      cleanJournal,
      cleanEntryDate,
      cleanPieceNumber,
      cleanLabel,
      initialStatus,
      currency,
      totalDebitMinor,
      totalCreditMinor,
      params.documentId ?? null,
      ruleVersionId,
      userId,
      now,
      now
    );

    const insertLineStmt = db.prepare(
      `INSERT INTO accounting_entry_lines (
        id, organization_id, dossier_id, entry_id, line_number,
        general_account_code, auxiliary_account_code, third_party_id,
        label, debit_minor, credit_minor, currency, currency_minor_unit_exponent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)`
    );

    for (const l of normalizedLines) {
      insertLineStmt.run(
        crypto.randomUUID(),
        params.organizationId,
        params.dossierId,
        entryId,
        l.lineNumber,
        l.generalAccountCode,
        l.auxiliaryAccountCode,
        l.thirdPartyId,
        l.label,
        l.debitMinor,
        l.creditMinor,
        currency,
        now
      );
    }

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
      action: "ACCOUNTING_ENTRY_CREATED",
      targetEntityType: "ACCOUNTING_ENTRY",
      targetEntityId: entryId,
      metadata: {
        journalCode: cleanJournal,
        pieceNumber: cleanPieceNumber,
        label: cleanLabel,
        status: initialStatus,
        totalDebitMinor,
        totalCreditMinor,
        linesCount: normalizedLines.length,
      },
    },
    db
  );

  return getAccountingEntryDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    entryId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });
}

/**
 * Mise à jour d'une écriture comptable au statut brouillon (DRAFT ou AI_SUGGESTION).
 * Strictement interdite si l'écriture est VALIDATED, EXPORTED ou REVERSED.
 */
export function updateDraftAccountingEntry(
  params: UpdateDraftAccountingEntryParams
): AccountingEntryRecord {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "EDIT_EXTRACTION",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const existing = db
    .prepare(
      `SELECT * FROM accounting_entries WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.entryId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!existing) {
    throw new AuthorizationError(
      "Écriture comptable introuvable dans ce dossier client.",
      404
    );
  }

  const currentStatus = String(existing.status);
  if (currentStatus !== "DRAFT" && currentStatus !== "AI_SUGGESTION") {
    throw new Error(
      `Violation d'inaltérabilité comptable : impossible de modifier une écriture au statut "${currentStatus}". Seules les écritures brouillon peuvent être modifiées en place.`
    );
  }

  const journalCode = (params.journalCode || String(existing.journal_code)).trim().toUpperCase();
  const entryDate = (params.entryDate || String(existing.entry_date)).trim();
  const pieceNumber = (params.pieceNumber || String(existing.piece_number)).trim();
  const label = (params.label || String(existing.label)).trim();
  const currency = (params.currency || String(existing.currency)).trim().toUpperCase();

  if (!journalCode) throw new Error("Le code journal est obligatoire.");
  if (!entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    throw new Error("La date d'écriture doit être au format AAAA-MM-JJ.");
  }
  if (!pieceNumber) throw new Error("Le numéro de pièce est obligatoire.");
  if (!label) throw new Error("Le libellé de l'écriture est obligatoire.");

  // Récupérer le set des comptes du dossier
  const accountRows = db
    .prepare(
      `SELECT account_number FROM chart_of_accounts WHERE organization_id = ? AND dossier_id = ? AND is_active = 1`
    )
    .all(params.organizationId, params.dossierId) as Array<{ account_number: string }>;
  const dossierAccountsSet = new Set(accountRows.map((a) => a.account_number));

  const { normalizedLines, totalDebitMinor, totalCreditMinor } = validateAccountingEntryLines(
    params.lines,
    dossierAccountsSet
  );

  const now = new Date().toISOString();
  const userId = params.session ? params.session.user.id : "system-user";

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(
      `UPDATE accounting_entries
       SET journal_code = ?, entry_date = ?, piece_number = ?, label = ?,
           currency = ?, total_debit_minor = ?, total_credit_minor = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    ).run(
      journalCode,
      entryDate,
      pieceNumber,
      label,
      currency,
      totalDebitMinor,
      totalCreditMinor,
      now,
      params.entryId,
      params.organizationId,
      params.dossierId
    );

    // Suppression et réinsertion des lignes
    db.prepare(`DELETE FROM accounting_entry_lines WHERE entry_id = ?`).run(params.entryId);

    const insertLineStmt = db.prepare(
      `INSERT INTO accounting_entry_lines (
        id, organization_id, dossier_id, entry_id, line_number,
        general_account_code, auxiliary_account_code, third_party_id,
        label, debit_minor, credit_minor, currency, currency_minor_unit_exponent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)`
    );

    for (const l of normalizedLines) {
      insertLineStmt.run(
        crypto.randomUUID(),
        params.organizationId,
        params.dossierId,
        params.entryId,
        l.lineNumber,
        l.generalAccountCode,
        l.auxiliaryAccountCode,
        l.thirdPartyId,
        l.label,
        l.debitMinor,
        l.creditMinor,
        currency,
        now
      );
    }

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
      action: "ACCOUNTING_ENTRY_UPDATED",
      targetEntityType: "ACCOUNTING_ENTRY",
      targetEntityId: params.entryId,
      metadata: {
        journalCode,
        pieceNumber,
        label,
        totalDebitMinor,
        totalCreditMinor,
        linesCount: normalizedLines.length,
      },
    },
    db
  );

  return getAccountingEntryDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    entryId: params.entryId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });
}

/**
 * Validation humaine explicite d'une écriture comptable.
 * Invariants stricts :
 * 1. Permission VALIDATE_ACCOUNTING vérifiée côté serveur.
 * 2. Équilibre Débit/Crédit exact : totalDebitMinor === totalCreditMinor > 0.
 * 3. Au moins 2 lignes.
 * 4. Immuabilité postérieure : statut VALIDATED verrouillé.
 */
export function validateAccountingEntry(
  params: ValidateAccountingEntryParams
): AccountingEntryRecord {
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
      `SELECT * FROM accounting_entries WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.entryId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!existing) {
    throw new AuthorizationError(
      "Écriture comptable introuvable dans ce dossier client.",
      404
    );
  }

  const currentStatus = String(existing.status);
  if (currentStatus === "VALIDATED") {
    throw new Error("Cette écriture comptable est déjà validée.");
  }
  if (currentStatus === "REVERSED") {
    throw new Error("Une écriture comptable extournée ne peut plus être validée.");
  }

  const lines = db
    .prepare(
      `SELECT * FROM accounting_entry_lines WHERE entry_id = ? ORDER BY line_number ASC`
    )
    .all(params.entryId) as Array<Record<string, unknown>>;

  if (lines.length < 2) {
    throw new Error(
      "Validation impossible : une écriture comptable doit comporter au moins 2 lignes."
    );
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += Number(l.debit_minor);
    totalCredit += Number(l.credit_minor);
  }

  if (totalDebit !== totalCredit || totalDebit <= 0) {
    throw new Error(
      `Validation impossible : l'écriture est déséquilibrée (Total Débit: ${totalDebit} minor units, Total Crédit: ${totalCredit} minor units).`
    );
  }

  const now = new Date().toISOString();
  const userId = params.session ? params.session.user.id : "system-user";

  db.prepare(
    `UPDATE accounting_entries
     SET status = 'VALIDATED', validated_by_user_id = ?, validated_at = ?,
         total_debit_minor = ?, total_credit_minor = ?, updated_at = ?
     WHERE id = ? AND organization_id = ? AND dossier_id = ?`
  ).run(
    userId,
    now,
    totalDebit,
    totalCredit,
    now,
    params.entryId,
    params.organizationId,
    params.dossierId
  );

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: resolveActorRole(params.session, params.organizationId),
      action: "ACCOUNTING_ENTRY_VALIDATED",
      targetEntityType: "ACCOUNTING_ENTRY",
      targetEntityId: params.entryId,
      metadata: {
        pieceNumber: String(existing.piece_number),
        totalDebitMinor: totalDebit,
        totalCreditMinor: totalCredit,
        linesCount: lines.length,
      },
    },
    db
  );

  return getAccountingEntryDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    entryId: params.entryId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });
}

/**
 * Extourne comptable contrôlée (Reversal / Contre-passation).
 * Invariants stricts :
 * 1. L'écriture d'origine doit être VALIDATED.
 * 2. L'écriture d'origine ne doit pas déjà être REVERSED.
 * 3. Génère une nouvelle écriture miroir avec inversion stricte Débit <-> Crédit.
 * 4. Lie de manière inaltérable reversal_of_entry_id à l'original.
 * 5. Marque l'originale comme REVERSED.
 */
export function reverseAccountingEntry(
  params: ReverseAccountingEntryParams
): AccountingEntryRecord {
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
      `SELECT * FROM accounting_entries WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.entryId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!existing) {
    throw new AuthorizationError(
      "Écriture comptable introuvable dans ce dossier client.",
      404
    );
  }

  const currentStatus = String(existing.status);
  if (currentStatus !== "VALIDATED") {
    throw new Error(
      `Seule une écriture validée (VALIDATED) peut faire l'objet d'une extourne comptable. Statut actuel : "${currentStatus}".`
    );
  }

  // Vérifier qu'une extourne n'existe pas déjà
  const existingReversal = db
    .prepare(
      `SELECT id FROM accounting_entries WHERE reversal_of_entry_id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.entryId, params.organizationId, params.dossierId) as { id: string } | undefined;

  if (existingReversal) {
    throw new Error(
      `Cette écriture comptable a déjà fait l'objet d'une extourne (ID: ${existingReversal.id}).`
    );
  }

  const originalLines = db
    .prepare(
      `SELECT * FROM accounting_entry_lines WHERE entry_id = ? ORDER BY line_number ASC`
    )
    .all(params.entryId) as Array<Record<string, unknown>>;

  if (originalLines.length < 2) {
    throw new Error("L'écriture d'origine ne possède pas le nombre minimal de lignes (2).");
  }

  const reversalId = crypto.randomUUID();
  const now = new Date().toISOString();
  const reversalDate = params.reversalDate || now.slice(0, 10);
  const userId = params.session ? params.session.user.id : "system-user";
  const origPieceNumber = String(existing.piece_number);
  const reversalPieceNumber = origPieceNumber.startsWith("EXT-")
    ? `REV-${origPieceNumber}`
    : `EXT-${origPieceNumber}`;
  const reversalLabel = `Extourne : ${String(existing.label)}`;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Marquer l'écriture originale comme REVERSED
    db.prepare(
      `UPDATE accounting_entries
       SET status = 'REVERSED', updated_at = ?
       WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    ).run(now, params.entryId, params.organizationId, params.dossierId);

    // 2. Créer la nouvelle écriture d'extourne (directement validée et liée)
    db.prepare(
      `INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date,
        piece_number, label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, document_id, rule_version_id,
        created_by_user_id, validated_by_user_id, validated_at,
        reversal_of_entry_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'VALIDATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reversalId,
      params.organizationId,
      params.dossierId,
      String(existing.journal_code),
      reversalDate,
      reversalPieceNumber,
      reversalLabel,
      String(existing.currency),
      Number(existing.currency_minor_unit_exponent ?? 2),
      Number(existing.total_credit_minor), // Inversé
      Number(existing.total_debit_minor),  // Inversé
      existing.document_id ? String(existing.document_id) : null,
      String(existing.rule_version_id),
      userId,
      userId,
      now,
      params.entryId,
      now,
      now
    );

    // 3. Insérer les lignes d'extourne avec inversion stricte Débit <-> Crédit
    const insertLineStmt = db.prepare(
      `INSERT INTO accounting_entry_lines (
        id, organization_id, dossier_id, entry_id, line_number,
        general_account_code, auxiliary_account_code, third_party_id,
        label, debit_minor, credit_minor, currency, currency_minor_unit_exponent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)`
    );

    for (const l of originalLines) {
      insertLineStmt.run(
        crypto.randomUUID(),
        params.organizationId,
        params.dossierId,
        reversalId,
        Number(l.line_number),
        String(l.general_account_code),
        l.auxiliary_account_code ? String(l.auxiliary_account_code) : null,
        l.third_party_id ? String(l.third_party_id) : null,
        `Extourne : ${String(l.label)}`,
        Number(l.credit_minor), // Le crédit devient débit
        Number(l.debit_minor),  // Le débit devient crédit
        String(l.currency),
        now
      );
    }

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
      action: "ACCOUNTING_ENTRY_REVERSED",
      targetEntityType: "ACCOUNTING_ENTRY",
      targetEntityId: params.entryId,
      metadata: {
        reversalEntryId: reversalId,
        reversalPieceNumber,
        originalPieceNumber: origPieceNumber,
        reversalReason: params.reversalReason || "Extourne comptable manuelle",
      },
    },
    db
  );

  return getAccountingEntryDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    entryId: reversalId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });
}

/**
 * Suppression d'une écriture comptable au statut brouillon.
 * Bloquée si l'écriture est VALIDATED ou REVERSED.
 */
export function deleteDraftAccountingEntry(params: DeleteDraftAccountingEntryParams): {
  success: boolean;
  deletedEntryId: string;
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "EDIT_EXTRACTION",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const existing = db
    .prepare(
      `SELECT id, status, piece_number FROM accounting_entries WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    )
    .get(params.entryId, params.organizationId, params.dossierId) as
    | { id: string; status: string; piece_number: string }
    | undefined;

  if (!existing) {
    throw new AuthorizationError(
      "Écriture comptable introuvable dans ce dossier client.",
      404
    );
  }

  if (existing.status !== "DRAFT" && existing.status !== "AI_SUGGESTION") {
    throw new Error(
      `Violation d'inaltérabilité comptable : impossible de supprimer une écriture au statut "${existing.status}". Seules les écritures brouillon peuvent être supprimées.`
    );
  }

  const userId = params.session ? params.session.user.id : "system-user";

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(`DELETE FROM accounting_entry_lines WHERE entry_id = ?`).run(params.entryId);
    db.prepare(
      `DELETE FROM accounting_entries WHERE id = ? AND organization_id = ? AND dossier_id = ?`
    ).run(params.entryId, params.organizationId, params.dossierId);
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
      action: "ACCOUNTING_ENTRY_DELETED",
      targetEntityType: "ACCOUNTING_ENTRY",
      targetEntityId: params.entryId,
      metadata: {
        pieceNumber: existing.piece_number,
      },
    },
    db
  );

  return { success: true, deletedEntryId: params.entryId };
}

/**
 * Consultation détaillée d'une écriture comptable avec ses lignes ordonnées.
 */
export function getAccountingEntryDetails(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  entryId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): AccountingEntryRecord {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const entry = db
    .prepare(
      `SELECT e.*,
              u1.full_name AS created_by_name,
              u2.full_name AS validated_by_name,
              j.label AS journal_label
       FROM accounting_entries e
       LEFT JOIN users u1 ON u1.id = e.created_by_user_id
       LEFT JOIN users u2 ON u2.id = e.validated_by_user_id
       LEFT JOIN accounting_journals j ON j.organization_id = e.organization_id AND j.dossier_id = e.dossier_id AND j.code = e.journal_code
       WHERE e.id = ? AND e.organization_id = ? AND e.dossier_id = ?`
    )
    .get(params.entryId, params.organizationId, params.dossierId) as
    | Record<string, unknown>
    | undefined;

  if (!entry) {
    throw new AuthorizationError(
      "Écriture comptable introuvable dans ce dossier client.",
      404
    );
  }

  const lines = db
    .prepare(
      `SELECT l.*,
              c.label AS general_account_label,
              tp.name AS third_party_name
       FROM accounting_entry_lines l
       LEFT JOIN chart_of_accounts c ON c.organization_id = l.organization_id AND c.dossier_id = l.dossier_id AND c.account_number = l.general_account_code
       LEFT JOIN third_parties tp ON tp.id = l.third_party_id
       WHERE l.entry_id = ?
       ORDER BY l.line_number ASC`
    )
    .all(params.entryId) as Array<Record<string, unknown>>;

  const formattedLines: AccountingEntryLineRecord[] = lines.map((l) => ({
    id: String(l.id),
    lineNumber: Number(l.line_number),
    generalAccountCode: String(l.general_account_code),
    generalAccountLabel: (l.general_account_label as string | null) ?? null,
    auxiliaryAccountCode: (l.auxiliary_account_code as string | null) ?? null,
    thirdPartyId: (l.third_party_id as string | null) ?? null,
    thirdPartyName: (l.third_party_name as string | null) ?? null,
    label: String(l.label),
    debitMinor: Number(l.debit_minor),
    creditMinor: Number(l.credit_minor),
    currency: String(l.currency),
    currencyMinorUnitExponent: Number(l.currency_minor_unit_exponent ?? 2),
    reconciliationLettrageCode: (l.reconciliation_lettrage_code as string | null) ?? null,
    createdAt: String(l.created_at),
  }));

  const totalDebit = Number(entry.total_debit_minor);
  const totalCredit = Number(entry.total_credit_minor);

  return {
    id: String(entry.id),
    organizationId: String(entry.organization_id),
    dossierId: String(entry.dossier_id),
    journalCode: String(entry.journal_code),
    journalLabel: (entry.journal_label as string | null) ?? null,
    entryDate: String(entry.entry_date),
    pieceNumber: String(entry.piece_number),
    label: String(entry.label),
    status: entry.status as AccountingEntryRecord["status"],
    currency: String(entry.currency),
    currencyMinorUnitExponent: Number(entry.currency_minor_unit_exponent ?? 2),
    totalDebitMinor: totalDebit,
    totalCreditMinor: totalCredit,
    isBalanced: totalDebit === totalCredit && totalDebit > 0,
    documentId: (entry.document_id as string | null) ?? null,
    ruleVersionId: String(entry.rule_version_id),
    createdByUserId: String(entry.created_by_user_id),
    createdByName: (entry.created_by_name as string | null) ?? null,
    validatedByUserId: (entry.validated_by_user_id as string | null) ?? null,
    validatedByName: (entry.validated_by_name as string | null) ?? null,
    validatedAt: (entry.validated_at as string | null) ?? null,
    reversalOfEntryId: (entry.reversal_of_entry_id as string | null) ?? null,
    createdAt: String(entry.created_at),
    updatedAt: String(entry.updated_at ?? entry.created_at),
    lines: formattedLines,
  };
}

/**
 * Liste paginée et filtrée des écritures comptables d'un dossier.
 */
export function listAccountingEntries(params: ListAccountingEntriesParams): {
  entries: AccountingEntryRecord[];
  totalCount: number;
  totalDebitSumMinor: number;
  totalCreditSumMinor: number;
  isOverallBalanced: boolean;
  limit: number;
  offset: number;
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

  let whereSql = ` WHERE e.organization_id = ? AND e.dossier_id = ?`;
  const queryParams: Array<string | number | null> = [params.organizationId, params.dossierId];

  if (params.journalCode && params.journalCode.trim().length > 0 && params.journalCode !== "ALL") {
    whereSql += ` AND UPPER(e.journal_code) = ?`;
    queryParams.push(params.journalCode.trim().toUpperCase());
  }

  if (params.status && params.status.trim().length > 0 && params.status !== "ALL") {
    whereSql += ` AND e.status = ?`;
    queryParams.push(params.status.trim());
  }

  if (params.startDate && params.startDate.trim().length > 0) {
    whereSql += ` AND e.entry_date >= ?`;
    queryParams.push(params.startDate.trim());
  }

  if (params.endDate && params.endDate.trim().length > 0) {
    whereSql += ` AND e.entry_date <= ?`;
    queryParams.push(params.endDate.trim());
  }

  if (params.accountCode && params.accountCode.trim().length > 0) {
    whereSql += ` AND EXISTS (
      SELECT 1 FROM accounting_entry_lines l
      WHERE l.entry_id = e.id AND l.general_account_code LIKE ?
    )`;
    queryParams.push(`${params.accountCode.trim()}%`);
  }

  if (params.search && params.search.trim().length > 0) {
    const q = `%${params.search.trim().toLowerCase()}%`;
    whereSql += ` AND (LOWER(e.piece_number) LIKE ? OR LOWER(e.label) LIKE ?)`;
    queryParams.push(q, q);
  }

  // Calcul des totaux globaux
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS total_count,
              COALESCE(SUM(e.total_debit_minor), 0) AS total_debit,
              COALESCE(SUM(e.total_credit_minor), 0) AS total_credit
       FROM accounting_entries e
       ${whereSql}`
    )
    .get(...queryParams) as { total_count: number; total_debit: number; total_credit: number };

  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  const offset = Math.max(0, params.offset ?? 0);

  const selectSql = `
    SELECT e.*,
           u1.full_name AS created_by_name,
           u2.full_name AS validated_by_name,
           j.label AS journal_label
    FROM accounting_entries e
    LEFT JOIN users u1 ON u1.id = e.created_by_user_id
    LEFT JOIN users u2 ON u2.id = e.validated_by_user_id
    LEFT JOIN accounting_journals j ON j.organization_id = e.organization_id AND j.dossier_id = e.dossier_id AND j.code = e.journal_code
    ${whereSql}
    ORDER BY e.entry_date DESC, e.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(selectSql).all(...queryParams, limit, offset) as Array<Record<string, unknown>>;

  const entries: AccountingEntryRecord[] = rows.map((entry) => {
    const totalDebit = Number(entry.total_debit_minor);
    const totalCredit = Number(entry.total_credit_minor);
    return {
      id: String(entry.id),
      organizationId: String(entry.organization_id),
      dossierId: String(entry.dossier_id),
      journalCode: String(entry.journal_code),
      journalLabel: (entry.journal_label as string | null) ?? null,
      entryDate: String(entry.entry_date),
      pieceNumber: String(entry.piece_number),
      label: String(entry.label),
      status: entry.status as AccountingEntryRecord["status"],
      currency: String(entry.currency),
      currencyMinorUnitExponent: Number(entry.currency_minor_unit_exponent ?? 2),
      totalDebitMinor: totalDebit,
      totalCreditMinor: totalCredit,
      isBalanced: totalDebit === totalCredit && totalDebit > 0,
      documentId: (entry.document_id as string | null) ?? null,
      ruleVersionId: String(entry.rule_version_id),
      createdByUserId: String(entry.created_by_user_id),
      createdByName: (entry.created_by_name as string | null) ?? null,
      validatedByUserId: (entry.validated_by_user_id as string | null) ?? null,
      validatedByName: (entry.validated_by_name as string | null) ?? null,
      validatedAt: (entry.validated_at as string | null) ?? null,
      reversalOfEntryId: (entry.reversal_of_entry_id as string | null) ?? null,
      createdAt: String(entry.created_at),
      updatedAt: String(entry.updated_at ?? entry.created_at),
    };
  });

  const totalDebitSum = Number(countRow.total_debit);
  const totalCreditSum = Number(countRow.total_credit);

  return {
    entries,
    totalCount: Number(countRow.total_count),
    totalDebitSumMinor: totalDebitSum,
    totalCreditSumMinor: totalCreditSum,
    isOverallBalanced: totalDebitSum === totalCreditSum,
    limit,
    offset,
  };
}
