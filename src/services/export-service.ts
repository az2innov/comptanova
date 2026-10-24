import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  AuthenticatedSessionContext,
  assertDossierAccess,
  AuthorizationError,
} from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";
import { getClientDossierDetails } from "./tenant-service.js";

function resolveActorRole(
  session: AuthenticatedSessionContext | null,
  organizationId: string
): string {
  if (!session) return "SYSTEM";
  const m = session.memberships.find((mb) => mb.organizationId === organizationId);
  return m ? m.role : "AUTHENTICATED_USER";
}

export interface SanitizeCellOptions {
  isNumeric?: boolean;
}

/**
 * Assainit une cellule pour l'export CSV afin de neutraliser toute tentative de CSV Injection (DDE / formule malveillante).
 *
 * Règles strictes de sécurité et d'intégrité :
 * 1. Supprime les caractères de contrôle non imprimables (hors tabulation, retour chariot et saut de ligne).
 * 2. Vérification stricte des montants numériques :
 *    - Seules les valeurs explicitement reconnues et validées comme numériques (isNumeric: true ou typeof value === 'number')
 *      sont autorisées à conserver un signe négatif '-' sans préfixe apostrophe (ex: -120.50).
 *    - Cette exception ne s'applique JAMAIS aux libellés, désignations de tiers ou chaînes de texte non fiables.
 * 3. Protection CSV Injection / DDE :
 *    - Toute cellule textuelle dont le contenu (y compris précédé d'espaces, tabulations ou retours chariot)
 *      commence par un caractère déclencheur (=, +, -, @, \t, \r) est systématiquement neutralisée par un préfixe apostrophe (').
 * 4. Respect du standard RFC 4180 :
 *    - Si la cellule contient des guillemets doubles, virgules, points-virgules, tabulations ou sauts de ligne,
 *      elle est entourée de guillemets doubles et ses guillemets internes sont doublés ("").
 */
export function sanitizeCsvCell(
  value: unknown,
  options?: SanitizeCellOptions | number
): string {
  let isNumeric =
    typeof options === "object" && options !== null && options.isNumeric === true;
  let rawValue = value;

  // Support des cellules encapsulées avec métadonnées { value, isNumeric }
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "isNumeric" in value
  ) {
    rawValue = (value as { value: unknown }).value;
    isNumeric = (value as { isNumeric?: boolean }).isNumeric === true;
  }

  if (rawValue === null || rawValue === undefined) {
    return "";
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? String(rawValue) : "";
  }

  if (typeof rawValue === "boolean") {
    return rawValue ? "true" : "false";
  }

  let str = String(rawValue);

  // 1. Suppression des caractères de contrôle non imprimables
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Vérification stricte pour les montants numériques déclarés
  if (isNumeric) {
    const trimmedNum = str.trim();
    const isStrictNumber = /^-?\d+(\.\d+)?$/.test(trimmedNum);
    if (isStrictNumber && Number.isFinite(Number(trimmedNum))) {
      return trimmedNum;
    }
    // Si isNumeric était revendiqué mais que la valeur n'est pas un nombre strict,
    // on retire l'exemption pour la traiter comme texte non fiable.
  }

  // 3. Protection CSV Injection / DDE
  // Détecte si la cellule commence par un déclencheur (=, +, -, @, \t, \r), même précédé d'espaces ou de blancs
  const triggerMatch = str.match(/^[ \t\r\n]*([=+\-@\t\r])/);
  if (triggerMatch) {
    str = "'" + str;
  }

  // 4. Échappement RFC 4180
  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes(";") ||
    str.includes("\t") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  rowCount: number;
  disclaimer?: string;
}

/**
 * Service d'Exports Sécurisés et FEC Préliminaire (Module 9 — Phase 1, Lot 1.7).
 */
export class ExportService {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  /**
   * Export CSV sécurisé des factures du dossier.
   */
  exportInvoicesCsv(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    options: { delimiter?: "," | ";" } = {}
  ): ExportResult {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "EXPORT",
      db: this.db,
    });
    const dossier = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    }).dossier;
    const delimiter = options.delimiter || ",";

    const stmt = this.db.prepare(`
      SELECT
        id, invoice_number, direction, third_party_name, issue_date, due_date,
        net_amount_minor, vat_amount_minor, gross_amount_minor, paid_amount_minor,
        currency, payment_status, validation_status, created_at
      FROM invoices
      WHERE organization_id = ? AND dossier_id = ?
      ORDER BY issue_date DESC, invoice_number DESC
    `);

    const rows = stmt.all(organizationId, dossierId) as any[];

    const headers = [
      "ID",
      "Numero_Facture",
      "Type",
      "Tiers",
      "Date_Emission",
      "Date_Echeance",
      "Montant_HT",
      "Montant_TVA",
      "Montant_TTC",
      "Montant_Regle",
      "Reste_Du",
      "Devise",
      "Statut_Paiement",
      "Statut_Validation",
      "Date_Creation",
    ];

    const lines: string[] = [];
    lines.push(headers.map((h) => sanitizeCsvCell(h)).join(delimiter));

    for (const r of rows) {
      const net = (r.net_amount_minor / 100).toFixed(2);
      const vat = (r.vat_amount_minor / 100).toFixed(2);
      const gross = (r.gross_amount_minor / 100).toFixed(2);
      const paid = (r.paid_amount_minor / 100).toFixed(2);
      const remaining = ((r.gross_amount_minor - r.paid_amount_minor) / 100).toFixed(2);

      const cells: unknown[] = [
        r.id,
        r.invoice_number,
        r.direction,
        r.third_party_name,
        r.issue_date,
        r.due_date || "",
        { value: net, isNumeric: true },
        { value: vat, isNumeric: true },
        { value: gross, isNumeric: true },
        { value: paid, isNumeric: true },
        { value: remaining, isNumeric: true },
        r.currency,
        r.payment_status,
        r.validation_status,
        r.created_at,
      ];
      lines.push(cells.map((c) => sanitizeCsvCell(c)).join(delimiter));
    }

    // BOM UTF-8 (\uFEFF) pour compatibilité Excel
    const content = "\uFEFF" + lines.join("\r\n");
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
    const filename = `factures_${dossier.code || "dossier"}_${dateStr}.csv`;

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "DATA_EXPORTED",
      targetEntityType: "EXPORT_CSV",
      targetEntityId: filename,
      justification: `Export CSV sécurisé des factures (${rows.length} lignes)`,
      metadata: { exportType: "invoices", rowCount: rows.length, filename },
    });

    return {
      content,
      filename,
      mimeType: "text/csv; charset=utf-8",
      rowCount: rows.length,
    };
  }

  /**
   * Export CSV sécurisé des transactions bancaires et rapprochements.
   */
  exportBankTransactionsCsv(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    options: { delimiter?: "," | ";" } = {}
  ): ExportResult {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "EXPORT",
      db: this.db,
    });
    const dossier = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    }).dossier;
    const delimiter = options.delimiter || ",";

    const stmt = this.db.prepare(`
      SELECT
        bt.id, bt.operation_date, bt.value_date, bt.label, bt.counterparty_name,
        bt.payment_reference, bt.amount_minor, bt.currency, bt.reconciled_amount_minor,
        bt.reconciliation_status, bt.created_at,
        (
          SELECT GROUP_CONCAT(i.invoice_number, '; ')
          FROM reconciliation_links rl
          JOIN invoices i ON i.id = rl.invoice_id
          WHERE rl.bank_transaction_id = bt.id
        ) AS linked_invoices
      FROM bank_transactions bt
      WHERE bt.organization_id = ? AND bt.dossier_id = ?
      ORDER BY bt.operation_date DESC, bt.created_at DESC
    `);

    const rows = stmt.all(organizationId, dossierId) as any[];

    const headers = [
      "ID",
      "Date_Operation",
      "Date_Valeur",
      "Libelle",
      "Contrepartie",
      "Reference_Paiement",
      "Montant",
      "Montant_Rapproche",
      "Solde_Non_Rapproche",
      "Devise",
      "Statut_Rapprochement",
      "Factures_Liees",
      "Date_Import",
    ];

    const lines: string[] = [];
    lines.push(headers.map((h) => sanitizeCsvCell(h)).join(delimiter));

    for (const r of rows) {
      const amount = (r.amount_minor / 100).toFixed(2);
      const reconciled = (r.reconciled_amount_minor / 100).toFixed(2);
      const remaining = ((Math.abs(r.amount_minor) - r.reconciled_amount_minor) / 100).toFixed(2);

      const cells: unknown[] = [
        r.id,
        r.operation_date,
        r.value_date || "",
        r.label,
        r.counterparty_name || "",
        r.payment_reference || "",
        { value: amount, isNumeric: true },
        { value: reconciled, isNumeric: true },
        { value: remaining, isNumeric: true },
        r.currency,
        r.reconciliation_status,
        r.linked_invoices || "",
        r.created_at,
      ];
      lines.push(cells.map((c) => sanitizeCsvCell(c)).join(delimiter));
    }

    const content = "\uFEFF" + lines.join("\r\n");
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
    const filename = `banque_${dossier.code || "dossier"}_${dateStr}.csv`;

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "DATA_EXPORTED",
      targetEntityType: "EXPORT_CSV",
      targetEntityId: filename,
      justification: `Export CSV sécurisé des transactions bancaires (${rows.length} lignes)`,
      metadata: { exportType: "bank", rowCount: rows.length, filename },
    });

    return {
      content,
      filename,
      mimeType: "text/csv; charset=utf-8",
      rowCount: rows.length,
    };
  }

  /**
   * Export CSV sécurisé des écritures comptables du journal.
   */
  exportAccountingEntriesCsv(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    options: { delimiter?: "," | ";" } = {}
  ): ExportResult {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "EXPORT",
      db: this.db,
    });
    const dossier = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    }).dossier;
    const delimiter = options.delimiter || ",";

    const stmt = this.db.prepare(`
      SELECT
        e.id AS entry_id, e.journal_code, e.entry_date, e.piece_number, e.label AS entry_label,
        e.status AS entry_status, e.validated_at,
        l.id AS line_id, l.line_number, l.general_account_code, l.auxiliary_account_code,
        l.label AS line_label, l.debit_minor, l.credit_minor, l.reconciliation_lettrage_code,
        coa.label AS account_label
      FROM accounting_entries e
      JOIN accounting_entry_lines l ON l.entry_id = e.id
      LEFT JOIN chart_of_accounts coa ON coa.dossier_id = e.dossier_id AND coa.account_number = l.general_account_code
      WHERE e.organization_id = ? AND e.dossier_id = ?
      ORDER BY e.entry_date ASC, e.piece_number ASC, l.line_number ASC
    `);

    const rows = stmt.all(organizationId, dossierId) as any[];

    const headers = [
      "ID_Ecriture",
      "Journal",
      "Date_Ecriture",
      "Numero_Piece",
      "Libelle_Ecriture",
      "Statut",
      "Numero_Ligne",
      "Compte_General",
      "Libelle_Compte",
      "Compte_Auxiliaire",
      "Libelle_Ligne",
      "Debit",
      "Credit",
      "Lettrage",
      "Date_Validation",
    ];

    const lines: string[] = [];
    lines.push(headers.map((h) => sanitizeCsvCell(h)).join(delimiter));

    for (const r of rows) {
      const debit = (r.debit_minor / 100).toFixed(2);
      const credit = (r.credit_minor / 100).toFixed(2);

      const cells: unknown[] = [
        r.entry_id,
        r.journal_code,
        r.entry_date,
        r.piece_number,
        r.entry_label,
        r.entry_status,
        r.line_number,
        r.general_account_code,
        r.account_label || "",
        r.auxiliary_account_code || "",
        r.line_label,
        { value: debit, isNumeric: true },
        { value: credit, isNumeric: true },
        r.reconciliation_lettrage_code || "",
        r.validated_at || "",
      ];
      lines.push(cells.map((c) => sanitizeCsvCell(c)).join(delimiter));
    }

    const content = "\uFEFF" + lines.join("\r\n");
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
    const filename = `ecritures_${dossier.code || "dossier"}_${dateStr}.csv`;

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "DATA_EXPORTED",
      targetEntityType: "EXPORT_CSV",
      targetEntityId: filename,
      justification: `Export CSV sécurisé des écritures comptables (${rows.length} lignes)`,
      metadata: { exportType: "entries", rowCount: rows.length, filename },
    });

    return {
      content,
      filename,
      mimeType: "text/csv; charset=utf-8",
      rowCount: rows.length,
    };
  }

  /**
   * Export CSV sécurisé des anomalies du dossier.
   */
  exportAnomaliesCsv(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    options: { delimiter?: "," | ";" } = {}
  ): ExportResult {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "EXPORT",
      db: this.db,
    });
    const dossier = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    }).dossier;
    const delimiter = options.delimiter || ",";

    const stmt = this.db.prepare(`
      SELECT
        id, rule_code, category, severity, is_certain_error, status,
        message, target_entity_type, target_entity_id,
        resolution_justification, detected_at, resolved_at
      FROM anomalies
      WHERE organization_id = ? AND dossier_id = ?
      ORDER BY detected_at DESC
    `);

    const rows = stmt.all(organizationId, dossierId) as any[];

    const headers = [
      "ID",
      "Code_Regle",
      "Categorie",
      "Severite",
      "Erreur_Certaine",
      "Statut",
      "Message",
      "Type_Cible",
      "ID_Cible",
      "Justification_Resolution",
      "Date_Detection",
      "Date_Resolution",
    ];

    const lines: string[] = [];
    lines.push(headers.map((h) => sanitizeCsvCell(h)).join(delimiter));

    for (const r of rows) {
      const cells = [
        r.id,
        r.rule_code,
        r.category,
        r.severity,
        r.is_certain_error ? "OUI" : "NON",
        r.status,
        r.message,
        r.target_entity_type || "",
        r.target_entity_id || "",
        r.resolution_justification || "",
        r.detected_at,
        r.resolved_at || "",
      ];
      lines.push(cells.map((c) => sanitizeCsvCell(c)).join(delimiter));
    }

    const content = "\uFEFF" + lines.join("\r\n");
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
    const filename = `anomalies_${dossier.code || "dossier"}_${dateStr}.csv`;

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "DATA_EXPORTED",
      targetEntityType: "EXPORT_CSV",
      targetEntityId: filename,
      justification: `Export CSV sécurisé des anomalies (${rows.length} lignes)`,
      metadata: { exportType: "anomalies", rowCount: rows.length, filename },
    });

    return {
      content,
      filename,
      mimeType: "text/csv; charset=utf-8",
      rowCount: rows.length,
    };
  }

  /**
   * Export CSV sécurisé de la piste d'audit du dossier.
   */
  exportAuditLogsCsv(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    options: { delimiter?: "," | ";" } = {}
  ): ExportResult {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "EXPORT",
      db: this.db,
    });
    const dossier = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    }).dossier;
    const delimiter = options.delimiter || ",";

    const stmt = this.db.prepare(`
      SELECT
        id, created_at, actor_user_id, actor_role, action, target_entity_type,
        target_entity_id, justification, ip_address, integrity_hash
      FROM audit_logs
      WHERE organization_id = ? AND dossier_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(organizationId, dossierId) as any[];

    const headers = [
      "ID",
      "Date_Heure",
      "ID_Acteur",
      "Role_Acteur",
      "Action",
      "Type_Cible",
      "ID_Cible",
      "Justification",
      "IP",
      "Empreinte_SHA256",
    ];

    const lines: string[] = [];
    lines.push(headers.map((h) => sanitizeCsvCell(h)).join(delimiter));

    for (const r of rows) {
      const cells = [
        r.id,
        r.created_at,
        r.actor_user_id || "SYSTEM",
        r.actor_role,
        r.action,
        r.target_entity_type,
        r.target_entity_id || "",
        r.justification || "",
        r.ip_address || "",
        r.integrity_hash,
      ];
      lines.push(cells.map((c) => sanitizeCsvCell(c)).join(delimiter));
    }

    const content = "\uFEFF" + lines.join("\r\n");
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
    const filename = `audit_${dossier.code || "dossier"}_${dateStr}.csv`;

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "DATA_EXPORTED",
      targetEntityType: "EXPORT_CSV",
      targetEntityId: filename,
      justification: `Export CSV sécurisé de la piste d'audit (${rows.length} lignes)`,
      metadata: { exportType: "audit", rowCount: rows.length, filename },
    });

    return {
      content,
      filename,
      mimeType: "text/csv; charset=utf-8",
      rowCount: rows.length,
    };
  }

  /**
   * Export FEC Préliminaire (Fichier des Écritures Comptables — art. A.47 A-1 du LPF).
   *
   * Spécifications réglementaires strictes :
   * 1. 18 colonnes normalisées de la DGFiP séparées par tabulation (\t).
   * 2. Seules les écritures au statut VALIDATED sont exportées (intangibilité et validation formelle).
   * 3. Contrôle pré-export bloquant : chaque écriture doit être rigoureusement équilibrée (Débit === Crédit).
   * 4. Dates au format YYYYMMDD.
   * 5. Nom de fichier conforme : <SIREN>FEC<YYYYMMDD>.txt (ou <CODE>FEC<YYYYMMDD>.txt).
   * 6. Mention réglementaire obligatoire : « Export FEC préliminaire (génération technique) ».
   */
  exportFecTxt(
    session: AuthenticatedSessionContext | null,
    organizationId: string,
    dossierId: string,
    options: {
      fiscalYear?: number;
      startDate?: string;
      endDate?: string;
      decimalSeparator?: "." | ",";
    } = {}
  ): ExportResult {
    assertDossierAccess({
      session,
      organizationId,
      dossierId,
      permission: "EXPORT",
      db: this.db,
    });
    const dossier = getClientDossierDetails({
      session,
      organizationId,
      dossierId,
      db: this.db,
    }).dossier;
    const decimalSep = options.decimalSeparator || ",";

    // Récupérer les écritures validées du dossier
    let query = `
      SELECT
        e.id AS entry_id, e.journal_code, e.entry_date, e.piece_number, e.label AS entry_label,
        e.status AS entry_status, e.validated_at,
        l.id AS line_id, l.line_number, l.general_account_code, l.auxiliary_account_code,
        l.label AS line_label, l.debit_minor, l.credit_minor, l.reconciliation_lettrage_code,
        coa.label AS account_label,
        tp.name AS third_party_name,
        j.label AS journal_label
      FROM accounting_entries e
      JOIN accounting_entry_lines l ON l.entry_id = e.id
      LEFT JOIN chart_of_accounts coa ON coa.dossier_id = e.dossier_id AND coa.account_number = l.general_account_code
      LEFT JOIN accounting_journals j ON j.dossier_id = e.dossier_id AND j.code = e.journal_code
      LEFT JOIN third_parties tp ON tp.dossier_id = e.dossier_id AND (tp.auxiliary_account_code = l.auxiliary_account_code OR tp.id = l.third_party_id)
      WHERE e.organization_id = ? AND e.dossier_id = ? AND e.status = 'VALIDATED'
    `;

    const params: any[] = [organizationId, dossierId];

    if (options.startDate) {
      query += ` AND e.entry_date >= ?`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      query += ` AND e.entry_date <= ?`;
      params.push(options.endDate);
    }

    query += ` ORDER BY e.entry_date ASC, e.piece_number ASC, l.line_number ASC`;

    const rows = this.db.prepare(query).all(...params) as any[];

    // Contrôle d'équilibre par écriture
    const entriesMap = new Map<string, { totalDebit: number; totalCredit: number }>();
    for (const r of rows) {
      const cur = entriesMap.get(r.entry_id) || { totalDebit: 0, totalCredit: 0 };
      cur.totalDebit += r.debit_minor;
      cur.totalCredit += r.credit_minor;
      entriesMap.set(r.entry_id, cur);
    }

    for (const [entryId, balance] of entriesMap.entries()) {
      if (balance.totalDebit !== balance.totalCredit) {
        throw new Error(
          `Contrôle de conformité FEC échoué : L'écriture validée ${entryId} est déséquilibrée (Débit: ${balance.totalDebit}, Crédit: ${balance.totalCredit}).`
        );
      }
    }

    // En-tête officiel des 18 colonnes FEC (art. A.47 A-1 LPF)
    const fecHeaders = [
      "JournalCode",
      "JournalLib",
      "EcritureNum",
      "EcritureDate",
      "CompteNum",
      "CompteLib",
      "CompAuxNum",
      "CompAuxLib",
      "PieceRef",
      "PieceDate",
      "EcritureLib",
      "Debit",
      "Credit",
      "EcritureLet",
      "DateLet",
      "ValidDate",
      "Montantdevise",
      "Idevise",
    ];

    const lines: string[] = [];
    lines.push(fecHeaders.join("\t"));

    const cleanFecField = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      return String(val).replace(/[\t\r\n]/g, " ").trim();
    };

    for (const r of rows) {
      const ecritureDate = r.entry_date.replace(/-/g, "");
      const pieceDate = ecritureDate;
      const validDate = r.validated_at
        ? r.validated_at.substring(0, 10).replace(/-/g, "")
        : ecritureDate;

      const debitStr = (r.debit_minor / 100).toFixed(2).replace(".", decimalSep);
      const creditStr = (r.credit_minor / 100).toFixed(2).replace(".", decimalSep);

      const journalLib = r.journal_label || r.journal_code;
      const compteLib = r.account_label || `Compte ${r.general_account_code}`;
      const compAuxNum = r.auxiliary_account_code || "";
      const compAuxLib = r.third_party_name || "";
      const lettrage = r.reconciliation_lettrage_code || "";
      const dateLet = lettrage ? ecritureDate : "";

      const rowCols = [
        cleanFecField(r.journal_code),
        cleanFecField(journalLib),
        cleanFecField(r.piece_number),
        ecritureDate,
        cleanFecField(r.general_account_code),
        cleanFecField(compteLib),
        cleanFecField(compAuxNum),
        cleanFecField(compAuxLib),
        cleanFecField(r.piece_number),
        pieceDate,
        cleanFecField(r.line_label || r.entry_label),
        debitStr,
        creditStr,
        cleanFecField(lettrage),
        dateLet,
        validDate,
        "", // Montantdevise
        "", // Idevise
      ];

      lines.push(rowCols.join("\t"));
    }

    // Formatage texte standard avec fin de ligne CRLF
    const content = lines.join("\r\n");

    // Convention de nommage DGFiP (art. A.47 A-1 VII LPF) : <SIREN>FEC<YYYYMMDD>.txt
    const cleanRegNum = (dossier.legalRegistrationNumber || "").replace(/\D/g, "");
    let siren = "";
    if (cleanRegNum.length === 9) {
      siren = cleanRegNum;
    } else if (cleanRegNum.length === 14) {
      siren = cleanRegNum.substring(0, 9);
    }
    const closingDateStr = (options.endDate || new Date().toISOString().substring(0, 10)).replace(/-/g, "");
    const baseCode = siren || (dossier.code || "DOSSIER");
    const filename = `${baseCode}FEC${closingDateStr}.txt`;

    const disclaimer =
      "Export FEC préliminaire (génération technique) — La validation et la conformité fiscale définitive relèvent de la responsabilité de l'expert-comptable lors de la clôture des comptes.";

    recordAuditLog({
      organizationId,
      dossierId,
      actorUserId: session?.user.id || "SYSTEM",
      actorRole: resolveActorRole(session, organizationId),
      action: "DATA_EXPORTED",
      targetEntityType: "EXPORT_FEC",
      targetEntityId: filename,
      justification: `Export FEC préliminaire (art. A.47 A-1 LPF) contenant ${rows.length} lignes d'écritures validées`,
      metadata: {
        exportType: "fec",
        rowCount: rows.length,
        filename,
        entriesCount: entriesMap.size,
      },
    });

    return {
      content,
      filename,
      mimeType: "text/plain; charset=utf-8",
      rowCount: rows.length,
      disclaimer,
    };
  }
}
