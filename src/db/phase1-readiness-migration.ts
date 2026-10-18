import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database.js";

/**
 * Migration `003_phase1_readiness_schema` (Section F — Préparation de la Phase 1 France & International).
 *
 * Complète les fondations du modèle de données sans casser la compatibilité :
 * 1. `third_parties` : Tiers (Fournisseurs, Clients) avec pays d'établissement, juridiction fiscale, identifiant fiscal/TVA/SIREN et compte auxiliaire.
 * 2. `chart_of_accounts` : Plan comptable par dossier (initialisable depuis la configuration pays versionnée, ex: PCG France).
 * 3. `accounting_journals` : Journaux comptables par dossier (AC, VT, BQ, OD, AN...).
 * 4. `accounting_entry_lines` : Lignes d'écritures comptables multi-lignes (compte général, compte auxiliaire, libellé, débit, crédit, devise de transaction, lettrage) permettant de vérifier strictement `SUM(debit_minor) === SUM(credit_minor)` et `COUNT >= 2`.
 * 5. `import_batches` : Lots d'import (listings de factures CSV/Excel, relevés bancaires CSV/OFX) avec empreinte SHA-256 du fichier pour l'idempotence (empêcher qu'un ré-import du même fichier ne crée des doublons) et rapport d'erreurs par ligne.
 * 6. `bank_transactions` : Opérations bancaires normalisées issues des relevés CSV/OFX avec détection de doublons (`external_dedup_hash`) et statut de rapprochement.
 * 7. `reconciliation_links` : Liens de rapprochement entre `bank_transactions`, `invoices` et/ou `accounting_entries` supportant les paiements partiels (`allocated_amount_minor`), la distinction entre suggestion IA (`PROPOSED_BY_AI`) et rapprochement validé humainement (`VALIDATED_BY_HUMAN`).
 * 8. `anomalies` : Anomalies détectées par le moteur déterministe avec distinction explicite entre erreur certaine (`is_certain_error = 1`) et suspicion à vérifier (`is_certain_error = 0`), statut de traitement et historique de résolution.
 */

export const MIGRATION_003_PHASE1_READINESS_SQL = `
  -- 1. Tiers (Clients / Fournisseurs) multi-juridictions
  CREATE TABLE IF NOT EXISTS third_parties (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    party_type TEXT NOT NULL CHECK (party_type IN ('CUSTOMER', 'SUPPLIER', 'BOTH')),
    establishment_country_code TEXT NOT NULL,
    tax_jurisdiction_code TEXT NOT NULL,
    legal_registration_number TEXT,
    tax_identification_number TEXT,
    default_currency TEXT NOT NULL CHECK (LENGTH(default_currency) = 3),
    auxiliary_account_code TEXT,
    default_general_account_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(dossier_id, code)
  );

  CREATE INDEX IF NOT EXISTS idx_third_parties_org_dossier ON third_parties(organization_id, dossier_id);

  -- 2. Plan comptable par dossier (Chart of Accounts)
  CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    account_number TEXT NOT NULL,
    label TEXT NOT NULL,
    account_class INTEGER NOT NULL,
    allow_auxiliary INTEGER NOT NULL DEFAULT 0 CHECK (allow_auxiliary IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    source_rule_version_id TEXT REFERENCES country_config_versions(version_id),
    created_at TEXT NOT NULL,
    UNIQUE(dossier_id, account_number)
  );

  CREATE INDEX IF NOT EXISTS idx_coa_org_dossier ON chart_of_accounts(organization_id, dossier_id);

  -- 3. Journaux comptables par dossier
  CREATE TABLE IF NOT EXISTS accounting_journals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    journal_type TEXT NOT NULL CHECK (journal_type IN ('PURCHASES', 'SALES', 'BANK', 'CASH', 'MISC_OPERATIONS', 'OPENING_BALANCE')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE(dossier_id, code)
  );

  CREATE INDEX IF NOT EXISTS idx_journals_org_dossier ON accounting_journals(organization_id, dossier_id);

  -- 4. Lignes d'écritures comptables multi-lignes (Section 5.4 & Section F)
  CREATE TABLE IF NOT EXISTS accounting_entry_lines (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    general_account_code TEXT NOT NULL,
    auxiliary_account_code TEXT,
    third_party_id TEXT REFERENCES third_parties(id) ON DELETE SET NULL,
    label TEXT NOT NULL,
    debit_minor INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
    credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    transaction_amount_minor INTEGER,
    transaction_currency TEXT CHECK (transaction_currency IS NULL OR LENGTH(transaction_currency) = 3),
    reconciliation_lettrage_code TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(entry_id, line_number),
    CHECK (NOT (debit_minor > 0 AND credit_minor > 0))
  );

  CREATE INDEX IF NOT EXISTS idx_entry_lines_entry ON accounting_entry_lines(entry_id);
  CREATE INDEX IF NOT EXISTS idx_entry_lines_org_dossier_account ON accounting_entry_lines(organization_id, dossier_id, general_account_code);

  -- 5. Lots d'import (Listings de factures CSV/Excel & Relevés bancaires CSV/OFX - Sections 5.3 & 5.5)
  CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    import_type TEXT NOT NULL CHECK (import_type IN ('INVOICE_LISTING_CSV', 'INVOICE_LISTING_EXCEL', 'BANK_STATEMENT_CSV', 'BANK_STATEMENT_OFX')),
    original_filename TEXT NOT NULL,
    file_sha256_checksum TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PREVIEW_PENDING_VALIDATION', 'COMMITTED', 'FAILED_ROLLED_BACK', 'REJECTED_DUPLICATE')),
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
    duplicate_rows INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
    error_rows INTEGER NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
    column_mapping_json TEXT NOT NULL DEFAULT '{}',
    errors_report_json TEXT NOT NULL DEFAULT '[]',
    imported_by_user_id TEXT NOT NULL REFERENCES users(id),
    committed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_import_batches_org_dossier ON import_batches(organization_id, dossier_id, file_sha256_checksum);

  -- 6. Transactions bancaires normalisées (Section 5.5)
  CREATE TABLE IF NOT EXISTS bank_transactions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
    bank_account_iban_or_ref TEXT,
    operation_date TEXT NOT NULL,
    value_date TEXT,
    label TEXT NOT NULL,
    counterparty_name TEXT,
    payment_reference TEXT,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    reconciled_amount_minor INTEGER NOT NULL DEFAULT 0,
    reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('UNRECONCILED', 'SUGGESTED_BY_AI', 'PARTIALLY_RECONCILED', 'RECONCILED', 'BANK_FEE_OR_NO_RECEIPT_FLAGGED')),
    external_dedup_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(dossier_id, external_dedup_hash)
  );

  CREATE INDEX IF NOT EXISTS idx_bank_tx_org_dossier ON bank_transactions(organization_id, dossier_id, operation_date);

  -- 7. Liens de rapprochement bancaire (supportant paiements partiels et validation humaine obligatoire - Section 5.5)
  CREATE TABLE IF NOT EXISTS reconciliation_links (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
    accounting_entry_id TEXT REFERENCES accounting_entries(id) ON DELETE SET NULL,
    allocated_amount_minor INTEGER NOT NULL CHECK (allocated_amount_minor != 0),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    confidence_score REAL NOT NULL DEFAULT 1.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    match_origin TEXT NOT NULL CHECK (match_origin IN ('DETERMINISTIC_RULE', 'AI_SUGGESTION', 'MANUAL_USER')),
    validation_status TEXT NOT NULL CHECK (validation_status IN ('PROPOSED_BY_AI', 'NEEDS_HUMAN_REVIEW', 'VALIDATED_BY_HUMAN', 'REJECTED')),
    validated_by_user_id TEXT REFERENCES users(id),
    validated_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reconciliation_org_dossier ON reconciliation_links(organization_id, dossier_id);

  -- 8. Anomalies comptables et fiscales persistées (Section 5.6)
  CREATE TABLE IF NOT EXISTS anomalies (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    rule_code TEXT NOT NULL,
    rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL_CERTAIN', 'SUSPICION_TO_VERIFY')),
    is_certain_error INTEGER NOT NULL CHECK (is_certain_error IN (0, 1)),
    target_entity_type TEXT NOT NULL,
    target_entity_id TEXT,
    message TEXT NOT NULL,
    source_data_snapshot_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED_BY_CORRECTION', 'DISMISSED_WITH_JUSTIFICATION')),
    resolution_justification TEXT,
    resolved_by_user_id TEXT REFERENCES users(id),
    resolved_at TEXT,
    history_json TEXT NOT NULL DEFAULT '[]',
    detected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_anomalies_org_dossier_status ON anomalies(organization_id, dossier_id, status, severity);
`;

/**
 * DDL compatible PostgreSQL 16 permettant de vérifier sur l'instance PostgreSQL locale
 * que l'intégralité du modèle relationnel (Migrations 001 + 002 + 003) s'applique proprement,
 * respecte les contraintes d'intégrité (`CHECK`, `FOREIGN KEY`, `UNIQUE`) et supporte les transactions concurrentes.
 */
export const POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS country_config_versions (
    version_id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    deployment_priority_order INTEGER NOT NULL,
    version_number TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    validation_status TEXT NOT NULL CHECK (validation_status IN (
      'DRAFT', 'DRAFT_INCOMPLETE',
      'IN_REVIEW', 'PENDING_LEGAL_VALIDATION',
      'VALIDATED',
      'ACTIVE', 'VALIDATED_FOR_PRODUCTION',
      'SUSPENDED',
      'OBSOLETE', 'DEPRECATED'
    )),
    is_production_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_production_enabled IN (0, 1)),
    validated_by_professional TEXT,
    validated_at TEXT,
    default_currency TEXT NOT NULL CHECK (LENGTH(default_currency) = 3),
    statutory_retention_years INTEGER NOT NULL DEFAULT 10,
    config_payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    organization_type TEXT NOT NULL CHECK (organization_type IN ('ACCOUNTING_FIRM', 'COMPANY', 'SOLE_PROPRIETOR')),
    country_code TEXT NOT NULL,
    primary_tax_jurisdiction_code TEXT,
    operating_countries_json TEXT NOT NULL DEFAULT '[]',
    default_currency TEXT NOT NULL CHECK (LENGTH(default_currency) = 3),
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    default_locale TEXT NOT NULL DEFAULT 'fr-FR',
    quota_max_dossiers INTEGER NOT NULL DEFAULT 25,
    quota_max_users INTEGER NOT NULL DEFAULT 10,
    quota_max_documents_per_month INTEGER NOT NULL DEFAULT 500,
    quota_max_ai_calls_per_month INTEGER NOT NULL DEFAULT 500,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS organization_memberships (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('PLATFORM_ADMIN', 'FIRM_ADMIN', 'ACCOUNTANT_COLLABORATOR', 'CLIENT_DIRECTOR')),
    created_at TEXT NOT NULL,
    UNIQUE(organization_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS client_dossiers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    legal_form TEXT NOT NULL DEFAULT 'SAS',
    legal_registration_number TEXT,
    vat_intracommunity_number TEXT,
    address_line TEXT,
    postal_code TEXT,
    city TEXT,
    country_code TEXT NOT NULL,
    tax_jurisdiction_code TEXT NOT NULL,
    tax_residence_country_code TEXT NOT NULL,
    operating_countries_json TEXT NOT NULL DEFAULT '[]',
    country_config_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    allowed_currencies_json TEXT NOT NULL DEFAULT '[]',
    tax_regime_code TEXT NOT NULL,
    vat_regime_code TEXT NOT NULL DEFAULT 'FR_TVA_REEL_NORMAL',
    fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    fiscal_year_start_date TEXT,
    fiscal_year_end_date TEXT,
    dossier_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (dossier_status IN ('ACTIVE', 'TO_COMPLETE', 'SUSPENDED', 'ARCHIVED')),
    activity_sector TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    internal_notes TEXT,
    archived_at TEXT,
    archived_by_user_id TEXT,
    archive_reason TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(organization_id, code)
  );

  CREATE TABLE IF NOT EXISTS dossier_assignments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_view INTEGER NOT NULL DEFAULT 1 CHECK (can_view IN (0, 1)),
    can_upload INTEGER NOT NULL DEFAULT 0 CHECK (can_upload IN (0, 1)),
    can_edit_extraction INTEGER NOT NULL DEFAULT 0 CHECK (can_edit_extraction IN (0, 1)),
    can_validate_accounting INTEGER NOT NULL DEFAULT 0 CHECK (can_validate_accounting IN (0, 1)),
    can_export INTEGER NOT NULL DEFAULT 0 CHECK (can_export IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE(dossier_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    sha256_checksum TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('SUPPLIER_INVOICE', 'CUSTOMER_INVOICE', 'CREDIT_NOTE', 'RECEIPT_EXPENSE', 'BANK_STATEMENT', 'PAYMENT_PROOF', 'OTHER')),
    workflow_status TEXT NOT NULL CHECK (workflow_status IN ('RECEIVED', 'STORED', 'EXTRACTED', 'CHECKED', 'SUGGESTED', 'PENDING_REVIEW', 'CORRECTED', 'VALIDATED', 'REJECTED', 'EXPORTED')),
    extracted_data_json TEXT NOT NULL DEFAULT '{}',
    ai_model_version TEXT,
    rule_version_id TEXT REFERENCES country_config_versions(version_id),
    uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
    validated_by_user_id TEXT REFERENCES users(id),
    validated_at TEXT,
    rejection_reason TEXT,
    rejected_by_user_id TEXT REFERENCES users(id),
    rejected_at TEXT,
    override_duplicate_reason TEXT,
    heuristic_duplicate_of_id TEXT REFERENCES documents(id),
    quarantine_status TEXT NOT NULL DEFAULT 'CLEAN' CHECK (quarantine_status IN ('CLEAN', 'QUARANTINED', 'SCANNING')),
    retention_until_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(organization_id, dossier_id, workflow_status);

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('ISSUED', 'RECEIVED', 'CREDIT_NOTE')),
    invoice_number TEXT NOT NULL,
    third_party_name TEXT NOT NULL,
    third_party_country_code TEXT,
    third_party_tax_jurisdiction_code TEXT,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    net_amount_minor BIGINT NOT NULL,
    vat_amount_minor BIGINT NOT NULL,
    gross_amount_minor BIGINT NOT NULL,
    paid_amount_minor BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    presentation_currency TEXT CHECK (presentation_currency IS NULL OR LENGTH(presentation_currency) = 3),
    presentation_gross_amount_minor BIGINT,
    exchange_rate_audit_json TEXT,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
    validation_status TEXT NOT NULL CHECK (validation_status IN ('PROPOSED_BY_AI', 'NEEDS_HUMAN_REVIEW', 'RULE_CHECKED', 'VALIDATED_BY_HUMAN', 'REJECTED')),
    rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
    validated_by_user_id TEXT REFERENCES users(id),
    origin_quote_id TEXT,
    credit_note_for_invoice_id TEXT,
    cancelled_by_credit_note_id TEXT,
    legal_mentions_json TEXT NOT NULL DEFAULT '{}',
    third_party_id TEXT,
    third_party_address TEXT,
    third_party_siren_or_vat TEXT,
    is_b2b INTEGER NOT NULL DEFAULT 1 CHECK (is_b2b IN (0, 1)),
    invoice_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (invoice_status IN ('DRAFT', 'FINALIZED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED')),
    finalized_at TEXT,
    finalized_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounting_entries (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    journal_code TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    piece_number TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'AI_SUGGESTION', 'VALIDATED', 'EXPORTED', 'REVERSED')),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    transaction_currency TEXT CHECK (transaction_currency IS NULL OR LENGTH(transaction_currency) = 3),
    exchange_rate_audit_json TEXT,
    total_debit_minor BIGINT NOT NULL CHECK (total_debit_minor >= 0),
    total_credit_minor BIGINT NOT NULL CHECK (total_credit_minor >= 0),
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    validated_by_user_id TEXT REFERENCES users(id),
    validated_at TEXT,
    reversal_of_entry_id TEXT REFERENCES accounting_entries(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_entries_org_dossier_journal_date ON accounting_entries(organization_id, dossier_id, journal_code, entry_date);
  CREATE INDEX IF NOT EXISTS idx_entries_reversal_of ON accounting_entries(reversal_of_entry_id);

  CREATE TABLE IF NOT EXISTS simulations_history (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    simulation_type TEXT NOT NULL,
    rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
    input_params_json TEXT NOT NULL,
    result_json TEXT,
    assumptions_json TEXT NOT NULL,
    limitations_json TEXT NOT NULL,
    disclaimer_text TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    dossier_id TEXT,
    actor_user_id TEXT,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_entity_type TEXT NOT NULL,
    target_entity_id TEXT,
    justification TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT,
    previous_hash TEXT,
    integrity_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  ${MIGRATION_003_PHASE1_READINESS_SQL}

  CREATE TABLE IF NOT EXISTS dossier_numbering_sequences (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    sequence_type TEXT NOT NULL CHECK (sequence_type IN ('QUOTE', 'INVOICE', 'CREDIT_NOTE')),
    prefix TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(dossier_id, sequence_type, fiscal_year)
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    quote_number TEXT NOT NULL,
    quote_status TEXT NOT NULL CHECK (quote_status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED')),
    third_party_id TEXT REFERENCES third_parties(id) ON DELETE SET NULL,
    third_party_name TEXT NOT NULL,
    third_party_address TEXT,
    third_party_tax_number TEXT,
    issue_date TEXT NOT NULL,
    validity_date TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    total_net_minor BIGINT NOT NULL CHECK (total_net_minor >= 0),
    total_vat_minor BIGINT NOT NULL CHECK (total_vat_minor >= 0),
    total_gross_minor BIGINT NOT NULL CHECK (total_gross_minor >= 0),
    notes TEXT,
    terms_conditions TEXT,
    converted_to_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    converted_at TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(dossier_id, quote_number)
  );

  CREATE TABLE IF NOT EXISTS quote_lines (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    description TEXT NOT NULL,
    quantity_minor INTEGER NOT NULL DEFAULT 100 CHECK (quantity_minor > 0),
    unit_price_net_minor BIGINT NOT NULL CHECK (unit_price_net_minor >= 0),
    discount_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_rate_bps >= 0 AND discount_rate_bps <= 10000),
    vat_rate_bps INTEGER NOT NULL CHECK (vat_rate_bps >= 0),
    total_net_minor BIGINT NOT NULL CHECK (total_net_minor >= 0),
    total_vat_minor BIGINT NOT NULL CHECK (total_vat_minor >= 0),
    total_gross_minor BIGINT NOT NULL CHECK (total_gross_minor >= 0),
    general_account_code TEXT NOT NULL DEFAULT '706000',
    created_at TEXT NOT NULL,
    UNIQUE(quote_id, line_number)
  );

  CREATE TABLE IF NOT EXISTS invoice_lines (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    description TEXT NOT NULL,
    quantity_minor INTEGER NOT NULL DEFAULT 100 CHECK (quantity_minor > 0),
    unit_price_net_minor BIGINT NOT NULL CHECK (unit_price_net_minor >= 0),
    discount_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_rate_bps >= 0 AND discount_rate_bps <= 10000),
    vat_rate_bps INTEGER NOT NULL CHECK (vat_rate_bps >= 0),
    total_net_minor BIGINT NOT NULL,
    total_vat_minor BIGINT NOT NULL,
    total_gross_minor BIGINT NOT NULL,
    general_account_code TEXT NOT NULL DEFAULT '706000',
    created_at TEXT NOT NULL,
    UNIQUE(invoice_id, line_number)
  );

  CREATE TABLE IF NOT EXISTS invoice_payments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    payment_date TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK_TRANSFER', 'CHECK', 'CARD', 'DIRECT_DEBIT', 'CASH', 'OTHER')),
    transaction_reference TEXT,
    notes TEXT,
    recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    import_type TEXT NOT NULL CHECK (import_type IN ('INVOICE_LISTING_CSV', 'INVOICE_LISTING_EXCEL', 'BANK_STATEMENT_CSV', 'BANK_STATEMENT_OFX')),
    original_filename TEXT NOT NULL,
    file_sha256_checksum TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PREVIEW_PENDING_VALIDATION', 'COMMITTED', 'FAILED_ROLLED_BACK', 'REJECTED_DUPLICATE')),
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
    duplicate_rows INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
    error_rows INTEGER NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
    column_mapping_json TEXT NOT NULL DEFAULT '{}',
    errors_report_json TEXT NOT NULL DEFAULT '[]',
    imported_by_user_id TEXT NOT NULL REFERENCES users(id),
    committed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pg_import_batches_org_dossier ON import_batches(organization_id, dossier_id, file_sha256_checksum);

  CREATE TABLE IF NOT EXISTS bank_transactions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
    bank_account_iban_or_ref TEXT,
    operation_date TEXT NOT NULL,
    value_date TEXT,
    label TEXT NOT NULL,
    counterparty_name TEXT,
    payment_reference TEXT,
    amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
    reconciled_amount_minor BIGINT NOT NULL DEFAULT 0,
    reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('UNRECONCILED', 'SUGGESTED_BY_AI', 'PARTIALLY_RECONCILED', 'RECONCILED', 'BANK_FEE_OR_NO_RECEIPT_FLAGGED')),
    external_dedup_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(dossier_id, external_dedup_hash)
  );

  CREATE INDEX IF NOT EXISTS idx_pg_bank_tx_org_dossier ON bank_transactions(organization_id, dossier_id, operation_date);

  CREATE TABLE IF NOT EXISTS reconciliation_links (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
    accounting_entry_id TEXT REFERENCES accounting_entries(id) ON DELETE SET NULL,
    allocated_amount_minor BIGINT NOT NULL CHECK (allocated_amount_minor != 0),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    confidence_score REAL NOT NULL DEFAULT 1.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    match_origin TEXT NOT NULL CHECK (match_origin IN ('DETERMINISTIC_RULE', 'AI_SUGGESTION', 'MANUAL_USER')),
    validation_status TEXT NOT NULL CHECK (validation_status IN ('PROPOSED_BY_AI', 'NEEDS_HUMAN_REVIEW', 'VALIDATED_BY_HUMAN', 'REJECTED')),
    validated_by_user_id TEXT REFERENCES users(id),
    validated_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pg_reconciliation_org_dossier ON reconciliation_links(organization_id, dossier_id);

  CREATE TABLE IF NOT EXISTS anomalies (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
    rule_code TEXT NOT NULL,
    rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL_CERTAIN', 'SUSPICION_TO_VERIFY')),
    is_certain_error INTEGER NOT NULL CHECK (is_certain_error IN (0, 1)),
    target_entity_type TEXT NOT NULL,
    target_entity_id TEXT,
    message TEXT NOT NULL,
    source_data_snapshot_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED_BY_CORRECTION', 'DISMISSED_WITH_JUSTIFICATION')),
    resolution_justification TEXT,
    resolved_by_user_id TEXT REFERENCES users(id),
    resolved_at TEXT,
    history_json TEXT NOT NULL DEFAULT '[]',
    detected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pg_anomalies_org_dossier_status ON anomalies(organization_id, dossier_id, status, severity);

  -- SEC-OPEN-04 : Trigger PostgreSQL 16 garantissant l'inaltérabilité (append-only) de audit_logs
  CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION 'Violation d''inaltérabilité [SEC-OPEN-04] : modification ou suppression interdite sur audit_logs.';
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_pg_audit_logs_immutable ON audit_logs;
  CREATE TRIGGER trg_pg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_logs_mutation();
`;

/**
 * Crée et valide une écriture comptable multi-lignes en garantissant :
 * 1. Au moins 2 lignes d'écriture.
 * 2. Aucun montant négatif et pas de débit + crédit simultanés sur une même ligne.
 * 3. Équilibre strict `SUM(debit_minor) === SUM(credit_minor) > 0`.
 * 4. Toute écriture issue d'une suggestion IA (`AI_SUGGESTION`) ne peut JAMAIS être créée directement à l'état `VALIDATED` sans validation humaine séparée.
 */
export function recordMultiLineAccountingEntry(params: {
  id: string;
  organizationId: string;
  dossierId: string;
  journalCode: string;
  entryDate: string;
  pieceNumber: string;
  label: string;
  status: "DRAFT" | "AI_SUGGESTION";
  currency: string;
  currencyMinorUnitExponent: 0 | 2 | 3 | 4;
  ruleVersionId: string;
  createdByUserId: string;
  lines: ReadonlyArray<{
    generalAccountCode: string;
    auxiliaryAccountCode?: string | null;
    thirdPartyId?: string | null;
    label: string;
    debitMinor: number;
    creditMinor: number;
  }>;
  db?: DatabaseSync;
}): {
  entryId: string;
  totalDebitMinor: number;
  totalCreditMinor: number;
  linesCount: number;
} {
  const db = params.db ?? getDatabase();
  if (params.lines.length < 2) {
    throw new Error(
      "Une écriture comptable en partie double doit comporter au moins 2 lignes."
    );
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  for (const line of params.lines) {
    if (
      !Number.isSafeInteger(line.debitMinor) ||
      !Number.isSafeInteger(line.creditMinor) ||
      line.debitMinor < 0 ||
      line.creditMinor < 0
    ) {
      throw new Error("Les montants débit et crédit doivent être des entiers positifs ou nuls.");
    }
    if (line.debitMinor > 0 && line.creditMinor > 0) {
      throw new Error(
        "Une ligne d'écriture ne peut pas porter simultanément un débit et un crédit non nuls."
      );
    }
    if (line.debitMinor === 0 && line.creditMinor === 0) {
      throw new Error(
        "Une ligne d'écriture doit comporter un montant non nul au débit ou au crédit."
      );
    }
    totalDebitMinor += line.debitMinor;
    totalCreditMinor += line.creditMinor;
  }

  if (totalDebitMinor !== totalCreditMinor || totalDebitMinor <= 0) {
    throw new Error(
      `Écriture déséquilibrée rejetée : Total Débit (${totalDebitMinor}) ≠ Total Crédit (${totalCreditMinor}).`
    );
  }

  const now = new Date().toISOString();
  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(
      `INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, rule_version_id,
        created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.id,
      params.organizationId,
      params.dossierId,
      params.journalCode,
      params.entryDate,
      params.pieceNumber,
      params.label,
      params.status,
      params.currency,
      params.currencyMinorUnitExponent,
      totalDebitMinor,
      totalCreditMinor,
      params.ruleVersionId,
      params.createdByUserId,
      now
    );

    const insertLine = db.prepare(
      `INSERT INTO accounting_entry_lines (
        id, organization_id, dossier_id, entry_id, line_number,
        general_account_code, auxiliary_account_code, third_party_id,
        label, debit_minor, credit_minor, currency, currency_minor_unit_exponent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    params.lines.forEach((line, idx) => {
      insertLine.run(
        `${params.id}-L${idx + 1}`,
        params.organizationId,
        params.dossierId,
        params.id,
        idx + 1,
        line.generalAccountCode,
        line.auxiliaryAccountCode ?? null,
        line.thirdPartyId ?? null,
        line.label,
        line.debitMinor,
        line.creditMinor,
        params.currency,
        params.currencyMinorUnitExponent,
        now
      );
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return {
    entryId: params.id,
    totalDebitMinor,
    totalCreditMinor,
    linesCount: params.lines.length,
  };
}
