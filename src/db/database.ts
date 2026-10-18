import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { appConfig } from "../config/app-config.js";
import { MIGRATION_003_PHASE1_READINESS_SQL } from "./phase1-readiness-migration.js";

/**
 * Gestionnaire de base de données relationnelle et migrations versionnées (Étape 0.3, 0.7 & Extension Internationale).
 * - Utilise `node:sqlite` (`DatabaseSync` avec `PRAGMA foreign_keys = ON` et `WAL`) pour une exécution locale et des tests 100% autonomes et reproductibles.
 * - Migration `002_international_scope_extension` :
 *   - Supprime les contraintes `CHECK (currency IN ('EUR', 'CHF', 'USD', 'GBP'))` limitantes au profit d'un contrôle générique ISO 4217 + colonne explicite `currency_minor_unit_exponent` (0, 2, 3, 4 décimales).
 *   - Ajoute la distinction entre pays d'établissement, juridiction fiscale, résidence fiscale, pays d'activité, fuseau horaire et locale.
 *   - Ajoute la traçabilité multi-devises (devise de transaction, devise de compte, devise de présentation, taux de change historique, date et source du taux) sur les factures et écritures.
 *   - Étend les états de validation des configurations de juridiction (`DRAFT`, `IN_REVIEW`, `VALIDATED`, `ACTIVE`, `SUSPENDED`, `OBSOLETE`).
 */

let sharedDbInstance: DatabaseSync | null = null;

export function createDatabaseConnection(dbPath: string = appConfig.databasePath): DatabaseSync {
  if (dbPath !== ":memory:") {
    const resolvedDir = path.dirname(path.resolve(process.cwd(), dbPath));
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  return db;
}

export function getDatabase(): DatabaseSync {
  if (!sharedDbInstance) {
    sharedDbInstance = createDatabaseConnection(appConfig.databasePath);
  }
  return sharedDbInstance;
}

export function resetSharedDatabaseForTests(customDb?: DatabaseSync): void {
  if (sharedDbInstance && !customDb) {
    try {
      sharedDbInstance.close();
    } catch {
      // ignore
    }
  }
  sharedDbInstance = customDb ?? createDatabaseConnection(":memory:");
}

export interface MigrationDefinition {
  version: string;
  description: string;
  upSql: string;
}

export const MIGRATIONS: MigrationDefinition[] = [
  {
    version: "001_phase0_foundations",
    description:
      "Création des tables fondamentales : organisations, utilisateurs, adhésions, rôles, dossiers clients, configurations pays versionnées, documents, journaux d'audit chaînés et tables préparatoires (factures, paiements, écritures, simulations).",
    upSql: `
      -- 1. Configurations Pays et Versions (Section 4.2 & Étape 0.5)
      CREATE TABLE IF NOT EXISTS country_config_versions (
        version_id TEXT PRIMARY KEY,
        country_code TEXT NOT NULL,
        country_name TEXT NOT NULL,
        deployment_priority_order INTEGER NOT NULL,
        version_number TEXT NOT NULL,
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        validation_status TEXT NOT NULL CHECK (validation_status IN ('DRAFT_INCOMPLETE', 'PENDING_LEGAL_VALIDATION', 'VALIDATED_FOR_PRODUCTION', 'DEPRECATED')),
        is_production_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_production_enabled IN (0, 1)),
        validated_by_professional TEXT,
        validated_at TEXT,
        default_currency TEXT NOT NULL,
        statutory_retention_years INTEGER NOT NULL DEFAULT 10,
        config_payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_country_config_code ON country_config_versions(country_code);

      -- 2. Organisations (Tenants - Section 3 & 11)
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        organization_type TEXT NOT NULL CHECK (organization_type IN ('ACCOUNTING_FIRM', 'COMPANY', 'SOLE_PROPRIETOR')),
        country_code TEXT NOT NULL,
        default_currency TEXT NOT NULL CHECK (default_currency IN ('EUR', 'CHF', 'USD', 'GBP')),
        quota_max_dossiers INTEGER NOT NULL DEFAULT 25,
        quota_max_users INTEGER NOT NULL DEFAULT 10,
        quota_max_documents_per_month INTEGER NOT NULL DEFAULT 500,
        quota_max_ai_calls_per_month INTEGER NOT NULL DEFAULT 500,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 3. Utilisateurs (Section 3)
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

      -- 4. Adhésions Organisation / Rôles (Multi-tenant RBAC)
      CREATE TABLE IF NOT EXISTS organization_memberships (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('PLATFORM_ADMIN', 'FIRM_ADMIN', 'ACCOUNTANT_COLLABORATOR', 'CLIENT_DIRECTOR')),
        created_at TEXT NOT NULL,
        UNIQUE(organization_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_memberships_org ON organization_memberships(organization_id);
      CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id);

      -- 5. Sessions Authentifiées Côté Serveur (Étape 0.4)
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

      CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions(token_hash);

      -- 6. Dossiers Clients (Section 3 & 4.1)
      CREATE TABLE IF NOT EXISTS client_dossiers (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        legal_registration_number TEXT,
        country_code TEXT NOT NULL,
        country_config_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
        currency TEXT NOT NULL CHECK (currency IN ('EUR', 'CHF', 'USD', 'GBP')),
        tax_regime_code TEXT NOT NULL,
        fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(organization_id, code)
      );

      CREATE INDEX IF NOT EXISTS idx_dossiers_org ON client_dossiers(organization_id);

      -- 7. Permissions Fines par Dossier Client (Section 3)
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

      CREATE INDEX IF NOT EXISTS idx_dossier_assignments_lookup ON dossier_assignments(organization_id, dossier_id, user_id);

      -- 8. Documents Stockés & Workflow de Validation Humaine (Section 5.2, 7 & 8)
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
        workflow_status TEXT NOT NULL CHECK (workflow_status IN ('RECEIVED', 'STORED', 'EXTRACTED', 'CHECKED', 'SUGGESTED', 'PENDING_REVIEW', 'CORRECTED', 'VALIDATED', 'EXPORTED')),
        extracted_data_json TEXT NOT NULL DEFAULT '{}',
        ai_model_version TEXT,
        rule_version_id TEXT REFERENCES country_config_versions(version_id),
        uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
        validated_by_user_id TEXT REFERENCES users(id),
        validated_at TEXT,
        retention_until_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_documents_org_dossier ON documents(organization_id, dossier_id);
      CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents(organization_id, dossier_id, sha256_checksum);

      -- 9. Fondations préparatoires pour Factures, Paiements, Écritures et Simulations (Étape 0.3)
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
        document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
        direction TEXT NOT NULL CHECK (direction IN ('ISSUED', 'RECEIVED', 'CREDIT_NOTE')),
        invoice_number TEXT NOT NULL,
        third_party_name TEXT NOT NULL,
        issue_date TEXT NOT NULL,
        due_date TEXT,
        net_amount_minor INTEGER NOT NULL,
        vat_amount_minor INTEGER NOT NULL,
        gross_amount_minor INTEGER NOT NULL,
        paid_amount_minor INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL CHECK (currency IN ('EUR', 'CHF', 'USD', 'GBP')),
        payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
        validation_status TEXT NOT NULL CHECK (validation_status IN ('PROPOSED_BY_AI', 'NEEDS_HUMAN_REVIEW', 'RULE_CHECKED', 'VALIDATED_BY_HUMAN', 'REJECTED')),
        rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
        validated_by_user_id TEXT REFERENCES users(id),
        validated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_org_dossier ON invoices(organization_id, dossier_id);

      CREATE TABLE IF NOT EXISTS accounting_entries (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
        journal_code TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        piece_number TEXT NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'AI_SUGGESTION', 'VALIDATED', 'EXPORTED', 'REVERSED')),
        currency TEXT NOT NULL CHECK (currency IN ('EUR', 'CHF', 'USD', 'GBP')),
        total_debit_minor INTEGER NOT NULL CHECK (total_debit_minor >= 0),
        total_credit_minor INTEGER NOT NULL CHECK (total_credit_minor >= 0),
        document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
        rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        validated_by_user_id TEXT REFERENCES users(id),
        validated_at TEXT,
        reversal_of_entry_id TEXT REFERENCES accounting_entries(id),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entries_org_dossier ON accounting_entries(organization_id, dossier_id);

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

      -- 10. Journaux d'Audit Inaltérables par Chaînage de Hachage SHA-256 (Section 3, 7 & 8)
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
        dossier_id TEXT REFERENCES client_dossiers(id) ON DELETE SET NULL,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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

      CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at);
    `,
  },
  {
    version: "002_international_scope_extension",
    description:
      "Extension internationale du schéma : suppression des contraintes limitées à 4 devises, ajout de la précision monétaire explicite (0, 2, 3, 4 décimales), de la séparation pays d'établissement / juridiction fiscale / résidence fiscale / pays d'activité, et de la traçabilité des conversions de devises.",
    upSql: `
      -- 1. Mise à jour de country_config_versions pour accepter tous les états du cycle de vie international
      CREATE TABLE country_config_versions_new (
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

      INSERT INTO country_config_versions_new SELECT * FROM country_config_versions;
      DROP TABLE country_config_versions;
      ALTER TABLE country_config_versions_new RENAME TO country_config_versions;
      CREATE INDEX IF NOT EXISTS idx_country_config_code ON country_config_versions(country_code, effective_from);

      -- 2. Mise à jour de organizations : support de toutes les devises ISO 4217 et attributs multi-juridictions
      CREATE TABLE organizations_new (
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

      INSERT INTO organizations_new (
        id, name, slug, organization_type, country_code, primary_tax_jurisdiction_code,
        operating_countries_json, default_currency, default_timezone, default_locale,
        quota_max_dossiers, quota_max_users, quota_max_documents_per_month, quota_max_ai_calls_per_month,
        is_active, created_at, updated_at
      )
      SELECT
        id, name, slug, organization_type, country_code, country_code,
        json_array(country_code), default_currency, 'Europe/Paris', 'fr-FR',
        quota_max_dossiers, quota_max_users, quota_max_documents_per_month, quota_max_ai_calls_per_month,
        is_active, created_at, updated_at
      FROM organizations;

      DROP TABLE organizations;
      ALTER TABLE organizations_new RENAME TO organizations;

      -- 3. Mise à jour de client_dossiers : devises internationales + distinction établissement / juridiction fiscale / résidence fiscale
      CREATE TABLE client_dossiers_new (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        legal_registration_number TEXT,
        country_code TEXT NOT NULL,
        tax_jurisdiction_code TEXT NOT NULL,
        tax_residence_country_code TEXT NOT NULL,
        operating_countries_json TEXT NOT NULL DEFAULT '[]',
        country_config_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
        currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
        currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
        allowed_currencies_json TEXT NOT NULL DEFAULT '[]',
        tax_regime_code TEXT NOT NULL,
        fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(organization_id, code)
      );

      INSERT INTO client_dossiers_new (
        id, organization_id, name, code, legal_registration_number,
        country_code, tax_jurisdiction_code, tax_residence_country_code, operating_countries_json,
        country_config_version_id, currency, currency_minor_unit_exponent, allowed_currencies_json,
        tax_regime_code, fiscal_year_start_month, is_active, created_at, updated_at
      )
      SELECT
        id, organization_id, name, code, legal_registration_number,
        country_code, country_code, country_code, json_array(country_code),
        country_config_version_id, currency, 2, json_array(currency),
        tax_regime_code, fiscal_year_start_month, is_active, created_at, updated_at
      FROM client_dossiers;

      DROP TABLE client_dossiers;
      ALTER TABLE client_dossiers_new RENAME TO client_dossiers;
      CREATE INDEX IF NOT EXISTS idx_dossiers_org ON client_dossiers(organization_id);

      -- 4. Mise à jour de invoices : support multi-devises avec exposant explicite et audit du taux de change
      CREATE TABLE invoices_new (
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
        net_amount_minor INTEGER NOT NULL,
        vat_amount_minor INTEGER NOT NULL,
        gross_amount_minor INTEGER NOT NULL,
        paid_amount_minor INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
        currency_minor_unit_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_unit_exponent IN (0, 2, 3, 4)),
        presentation_currency TEXT CHECK (presentation_currency IS NULL OR LENGTH(presentation_currency) = 3),
        presentation_gross_amount_minor INTEGER,
        exchange_rate_audit_json TEXT,
        payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
        validation_status TEXT NOT NULL CHECK (validation_status IN ('PROPOSED_BY_AI', 'NEEDS_HUMAN_REVIEW', 'RULE_CHECKED', 'VALIDATED_BY_HUMAN', 'REJECTED')),
        rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
        validated_by_user_id TEXT REFERENCES users(id),
        validated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO invoices_new (
        id, organization_id, dossier_id, document_id, direction, invoice_number,
        third_party_name, issue_date, due_date, net_amount_minor, vat_amount_minor,
        gross_amount_minor, paid_amount_minor, currency, currency_minor_unit_exponent,
        payment_status, validation_status, rule_version_id, validated_by_user_id, validated_at,
        created_at, updated_at
      )
      SELECT
        id, organization_id, dossier_id, document_id, direction, invoice_number,
        third_party_name, issue_date, due_date, net_amount_minor, vat_amount_minor,
        gross_amount_minor, paid_amount_minor, currency, 2,
        payment_status, validation_status, rule_version_id, validated_by_user_id, validated_at,
        created_at, updated_at
      FROM invoices;

      DROP TABLE invoices;
      ALTER TABLE invoices_new RENAME TO invoices;
      CREATE INDEX IF NOT EXISTS idx_invoices_org_dossier ON invoices(organization_id, dossier_id);

      -- 5. Mise à jour de accounting_entries : support multi-devises avec exposant explicite et audit du taux de change
      CREATE TABLE accounting_entries_new (
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
        total_debit_minor INTEGER NOT NULL CHECK (total_debit_minor >= 0),
        total_credit_minor INTEGER NOT NULL CHECK (total_credit_minor >= 0),
        document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
        rule_version_id TEXT NOT NULL REFERENCES country_config_versions(version_id),
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        validated_by_user_id TEXT REFERENCES users(id),
        validated_at TEXT,
        reversal_of_entry_id TEXT REFERENCES accounting_entries(id),
        created_at TEXT NOT NULL
      );

      INSERT INTO accounting_entries_new (
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, document_id, rule_version_id,
        created_by_user_id, validated_by_user_id, validated_at, reversal_of_entry_id, created_at
      )
      SELECT
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, 2,
        total_debit_minor, total_credit_minor, document_id, rule_version_id,
        created_by_user_id, validated_by_user_id, validated_at, reversal_of_entry_id, created_at
      FROM accounting_entries;

      DROP TABLE accounting_entries;
      ALTER TABLE accounting_entries_new RENAME TO accounting_entries;
      CREATE INDEX IF NOT EXISTS idx_entries_org_dossier ON accounting_entries(organization_id, dossier_id);
    `,
  },
  {
    version: "003_phase1_readiness_schema",
    description:
      "Préparation complète du modèle de données pour la Phase 1 France et internationale : third_parties, chart_of_accounts, accounting_journals, accounting_entry_lines (partie double multi-lignes), import_batches, bank_transactions, reconciliation_links et anomalies.",
    upSql: `
      ${MIGRATION_003_PHASE1_READINESS_SQL}
    `,
  },
  {
    version: "004_audit_logs_immutability_triggers",
    description:
      "SEC-OPEN-04 : Suppression des cascades ON DELETE SET NULL sur audit_logs (conservation des identifiants historiques) et installation des triggers d'inaltérabilité (append-only) sur les bases neuves et existantes.",
    upSql: `
      DROP TRIGGER IF EXISTS trg_audit_logs_immutable_update;
      DROP TRIGGER IF EXISTS trg_audit_logs_immutable_delete;

      CREATE TABLE audit_logs_new (
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

      INSERT INTO audit_logs_new (
        id, organization_id, dossier_id, actor_user_id, actor_role, action,
        target_entity_type, target_entity_id, justification, metadata_json,
        ip_address, previous_hash, integrity_hash, created_at
      )
      SELECT
        id, organization_id, dossier_id, actor_user_id, actor_role, action,
        target_entity_type, target_entity_id, justification, metadata_json,
        ip_address, previous_hash, integrity_hash, created_at
      FROM audit_logs;

      DROP TABLE audit_logs;
      ALTER TABLE audit_logs_new RENAME TO audit_logs;
      CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at);

      CREATE TRIGGER trg_audit_logs_immutable_update
      BEFORE UPDATE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'Violation d''inaltérabilité [SEC-OPEN-04] : modification interdite sur audit_logs.');
      END;

      CREATE TRIGGER trg_audit_logs_immutable_delete
      BEFORE DELETE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'Violation d''inaltérabilité [SEC-OPEN-04] : suppression interdite sur audit_logs.');
      END;
    `,
  },
  {
    version: "005_phase1_lot1_1_dossier_metadata",
    description:
      "Lot 1.1 (Module 1 — Gestion des dossiers clients) : Ajout des métadonnées complètes du dossier (forme juridique, n° TVA intracommunautaire, adresse, régime TVA, dates d'exercice, statut, contact, notes internes et archivage logique tracé).",
    upSql: `
      ALTER TABLE client_dossiers ADD COLUMN legal_form TEXT NOT NULL DEFAULT 'SAS';
      ALTER TABLE client_dossiers ADD COLUMN vat_intracommunity_number TEXT;
      ALTER TABLE client_dossiers ADD COLUMN address_line TEXT;
      ALTER TABLE client_dossiers ADD COLUMN postal_code TEXT;
      ALTER TABLE client_dossiers ADD COLUMN city TEXT;
      ALTER TABLE client_dossiers ADD COLUMN vat_regime_code TEXT NOT NULL DEFAULT 'FR_TVA_REEL_NORMAL';
      ALTER TABLE client_dossiers ADD COLUMN fiscal_year_start_date TEXT;
      ALTER TABLE client_dossiers ADD COLUMN fiscal_year_end_date TEXT;
      ALTER TABLE client_dossiers ADD COLUMN dossier_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (dossier_status IN ('ACTIVE', 'TO_COMPLETE', 'SUSPENDED', 'ARCHIVED'));
      ALTER TABLE client_dossiers ADD COLUMN activity_sector TEXT;
      ALTER TABLE client_dossiers ADD COLUMN contact_name TEXT;
      ALTER TABLE client_dossiers ADD COLUMN contact_email TEXT;
      ALTER TABLE client_dossiers ADD COLUMN contact_phone TEXT;
      ALTER TABLE client_dossiers ADD COLUMN internal_notes TEXT;
      ALTER TABLE client_dossiers ADD COLUMN archived_at TEXT;
      ALTER TABLE client_dossiers ADD COLUMN archived_by_user_id TEXT;
      ALTER TABLE client_dossiers ADD COLUMN archive_reason TEXT;
    `,
  },
  {
    version: "006_phase1_lot1_2_document_lifecycle",
    description:
      "Lot 1.2 (Module 3 — Collecte documentaire, OCR et cycle de vie à 6 statuts) : Ajout du statut REJECTED, motifs de rejet, traçabilité de rejet, détection de doublons et statut de quarantaine sur documents.",
    upSql: `
      CREATE TABLE documents_new (
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
        heuristic_duplicate_of_id TEXT REFERENCES documents_new(id),
        quarantine_status TEXT NOT NULL DEFAULT 'CLEAN' CHECK (quarantine_status IN ('CLEAN', 'QUARANTINED', 'SCANNING')),
        retention_until_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO documents_new (
        id, organization_id, dossier_id, original_filename, mime_type,
        size_bytes, sha256_checksum, storage_key, category, workflow_status,
        extracted_data_json, ai_model_version, rule_version_id, uploaded_by_user_id,
        validated_by_user_id, validated_at, retention_until_date, created_at, updated_at
      )
      SELECT
        id, organization_id, dossier_id, original_filename, mime_type,
        size_bytes, sha256_checksum, storage_key, category, workflow_status,
        extracted_data_json, ai_model_version, rule_version_id, uploaded_by_user_id,
        validated_by_user_id, validated_at, retention_until_date, created_at, updated_at
      FROM documents;

      DROP TABLE documents;
      ALTER TABLE documents_new RENAME TO documents;

      CREATE INDEX IF NOT EXISTS idx_documents_org_dossier ON documents(organization_id, dossier_id);
      CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents(organization_id, dossier_id, sha256_checksum);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(organization_id, dossier_id, workflow_status);
    `,
  },
  {
    version: "007_phase1_lot1_3_quotes_and_invoicing",
    description:
      "Lot 1.3 (Module 4 — Facturation et Devis) : Tables quotes, quote_lines, invoice_lines, invoice_payments, séquences de numérotation ininterrompues et traçabilité des mentions obligatoires LPF.",
    upSql: `
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

      CREATE INDEX IF NOT EXISTS idx_sequences_lookup ON dossier_numbering_sequences(dossier_id, sequence_type, fiscal_year);

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
        total_net_minor INTEGER NOT NULL CHECK (total_net_minor >= 0),
        total_vat_minor INTEGER NOT NULL CHECK (total_vat_minor >= 0),
        total_gross_minor INTEGER NOT NULL CHECK (total_gross_minor >= 0),
        notes TEXT,
        terms_conditions TEXT,
        converted_to_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
        converted_at TEXT,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(dossier_id, quote_number)
      );

      CREATE INDEX IF NOT EXISTS idx_quotes_org_dossier ON quotes(organization_id, dossier_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(organization_id, dossier_id, quote_status);

      CREATE TABLE IF NOT EXISTS quote_lines (
        id TEXT PRIMARY KEY,
        quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL CHECK (line_number >= 1),
        description TEXT NOT NULL,
        quantity_minor INTEGER NOT NULL DEFAULT 100 CHECK (quantity_minor > 0),
        unit_price_net_minor INTEGER NOT NULL CHECK (unit_price_net_minor >= 0),
        discount_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_rate_bps >= 0 AND discount_rate_bps <= 10000),
        vat_rate_bps INTEGER NOT NULL CHECK (vat_rate_bps >= 0),
        total_net_minor INTEGER NOT NULL CHECK (total_net_minor >= 0),
        total_vat_minor INTEGER NOT NULL CHECK (total_vat_minor >= 0),
        total_gross_minor INTEGER NOT NULL CHECK (total_gross_minor >= 0),
        general_account_code TEXT NOT NULL DEFAULT '706000',
        created_at TEXT NOT NULL,
        UNIQUE(quote_id, line_number)
      );

      CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);

      CREATE TABLE IF NOT EXISTS invoice_lines (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL CHECK (line_number >= 1),
        description TEXT NOT NULL,
        quantity_minor INTEGER NOT NULL DEFAULT 100 CHECK (quantity_minor > 0),
        unit_price_net_minor INTEGER NOT NULL CHECK (unit_price_net_minor >= 0),
        discount_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_rate_bps >= 0 AND discount_rate_bps <= 10000),
        vat_rate_bps INTEGER NOT NULL CHECK (vat_rate_bps >= 0),
        total_net_minor INTEGER NOT NULL,
        total_vat_minor INTEGER NOT NULL,
        total_gross_minor INTEGER NOT NULL,
        general_account_code TEXT NOT NULL DEFAULT '706000',
        created_at TEXT NOT NULL,
        UNIQUE(invoice_id, line_number)
      );

      CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

      CREATE TABLE IF NOT EXISTS invoice_payments (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        dossier_id TEXT NOT NULL REFERENCES client_dossiers(id) ON DELETE CASCADE,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        payment_date TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK_TRANSFER', 'CHECK', 'CARD', 'DIRECT_DEBIT', 'CASH', 'OTHER')),
        transaction_reference TEXT,
        notes TEXT,
        recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_org_dossier ON invoice_payments(organization_id, dossier_id);

      -- Colonnes complémentaires sur invoices
      ALTER TABLE invoices ADD COLUMN origin_quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL;
      ALTER TABLE invoices ADD COLUMN credit_note_for_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL;
      ALTER TABLE invoices ADD COLUMN cancelled_by_credit_note_id TEXT REFERENCES invoices(id) ON DELETE SET NULL;
      ALTER TABLE invoices ADD COLUMN legal_mentions_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE invoices ADD COLUMN third_party_id TEXT REFERENCES third_parties(id) ON DELETE SET NULL;
      ALTER TABLE invoices ADD COLUMN third_party_address TEXT;
      ALTER TABLE invoices ADD COLUMN third_party_siren_or_vat TEXT;
      ALTER TABLE invoices ADD COLUMN is_b2b INTEGER NOT NULL DEFAULT 1 CHECK (is_b2b IN (0, 1));
      ALTER TABLE invoices ADD COLUMN invoice_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (invoice_status IN ('DRAFT', 'FINALIZED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'));
      ALTER TABLE invoices ADD COLUMN finalized_at TEXT;
      ALTER TABLE invoices ADD COLUMN finalized_by_user_id TEXT REFERENCES users(id);
    `,
  },
];

export function runMigrations(db: DatabaseSync = getDatabase()): {
  appliedVersions: string[];
  totalMigrations: number;
} {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions: string[] = [];
  const checkStmt = db.prepare(
    "SELECT version FROM schema_migrations WHERE version = ?"
  );
  const insertStmt = db.prepare(
    "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)"
  );

  for (const migration of MIGRATIONS) {
    const existing = checkStmt.get(migration.version) as
      | { version: string }
      | undefined;
    if (!existing) {
      db.exec("PRAGMA foreign_keys = OFF;");
      db.exec("BEGIN TRANSACTION;");
      try {
        db.exec(migration.upSql);
        insertStmt.run(
          migration.version,
          migration.description,
          new Date().toISOString()
        );
        db.exec("COMMIT;");
        db.exec("PRAGMA foreign_keys = ON;");
        appliedVersions.push(migration.version);
      } catch (err) {
        db.exec("ROLLBACK;");
        db.exec("PRAGMA foreign_keys = ON;");
        throw err;
      }
    }
  }

  return {
    appliedVersions,
    totalMigrations: MIGRATIONS.length,
  };
}
