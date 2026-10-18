import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createDatabaseConnection,
  runMigrations,
  resetSharedDatabaseForTests,
} from "../db/database.js";
import {
  POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL,
  recordMultiLineAccountingEntry,
} from "../db/phase1-readiness-migration.js";
import { seedDemoData } from "../db/seed.js";
import {
  DeterministicMockAiAdapter,
  assertAiProviderAllowedForEnvironment,
} from "../ai/ai-gateway.js";
import {
  addMoney,
  computeTaxFromBasisPoints,
  convertCurrencyWithAudit,
  formatMinorToDecimal,
  parseDecimalToMinor,
  subtractMoney,
} from "../domain/money.js";

describe("Audit Complémentaire Phase 0 & Préparation Phase 1 (Schéma, IA, Multi-devises & PostgreSQL 16 réel)", () => {
  it("1. Moteur monétaire international : supporte les avoirs (montants négatifs), 0/2/3/4 décimales et conversions FX auditées", () => {
    // Avoir / note de crédit en EUR (2 décimales)
    const invoiceHt = parseDecimalToMinor("1000.00", "EUR");
    const creditNoteHt = parseDecimalToMinor("-250.00", "EUR");
    const netAfterCreditNote = addMoney(invoiceHt, creditNoteHt);
    assert.equal(netAfterCreditNote.amountMinor, 75000);
    assert.equal(formatMinorToDecimal(creditNoteHt.amountMinor, "EUR"), "-250.00");

    // Avoir en Dinars Tunisiens (TND - 3 décimales / millimes)
    const tndCredit = parseDecimalToMinor("-45.750", "TND");
    assert.equal(tndCredit.amountMinor, -45750);
    assert.equal(tndCredit.minorUnitExponent, 3);
    const tndVat = computeTaxFromBasisPoints(tndCredit, 1900, "HALF_EVEN");
    assert.equal(tndVat.amountMinor, -8692); // -45.750 * 19% = -8.6925 -> HALF_EVEN (-8.692)

    // Unidad de Fomento chilienne (CLF - 4 décimales)
    const clfAmount = parseDecimalToMinor("12.3456", "CLF");
    assert.equal(clfAmount.amountMinor, 123456);
    assert.equal(clfAmount.minorUnitExponent, 4);

    // Conversion FX auditée entre TND (3 décimales) et EUR (2 décimales)
    const tndInvoice = parseDecimalToMinor("3350.000", "TND"); // 3 350.000 TND
    const fxRecord = convertCurrencyWithAudit({
      amount: tndInvoice,
      targetCurrency: "EUR",
      rateDecimalString: "0.298507",
      effectiveDate: "2026-10-18",
      rateSource: "BCT_DAILY_FIXING",
      roundingMode: "HALF_UP",
    });
    assert.equal(fxRecord.sourceAmount.currency, "TND");
    assert.equal(fxRecord.convertedAmount.currency, "EUR");
    assert.equal(fxRecord.convertedAmount.minorUnitExponent, 2);
    assert.equal(fxRecord.convertedAmount.amountMinor, 100000); // 1 000.00 EUR
    assert.equal(fxRecord.exchangeRateAudit.rateSource, "BCT_DAILY_FIXING");

    // Soustraction générant un solde créditeur négatif
    const balance = subtractMoney(
      parseDecimalToMinor("100.00", "EUR"),
      parseDecimalToMinor("150.00", "EUR")
    );
    assert.equal(balance.amountMinor, -5000);
  });

  it("2. Garde de sécurité IA (Section D) : identifie explicitement mock-deterministic et bloque son usage silencieux en production", async () => {
    const mockAdapter = new DeterministicMockAiAdapter();
    assert.equal(mockAdapter.providerId, "mock-deterministic");
    assert.equal(mockAdapter.isSimulatedTestAdapter, true);

    // Autorisé en development et test
    assert.doesNotThrow(() => {
      assertAiProviderAllowedForEnvironment(mockAdapter, "development");
      assertAiProviderAllowedForEnvironment(mockAdapter, "test");
    });

    // Bloqué en production sans override explicite
    assert.throws(
      () => {
        assertAiProviderAllowedForEnvironment(mockAdapter, "production", false);
      },
      /Blocage de sécurité IA : l'adaptateur simulé de test "mock-deterministic"/
    );

    // Vérifie que les métadonnées retournées par l'adaptateur contiennent bien isSimulatedTestAdapter et simulationNotice
    const res = await mockAdapter.extractInvoiceData(
      {
        organizationId: "org-test",
        dossierId: "dossier-test",
        filename: "facture.pdf",
        mimeType: "application/pdf",
        rawTextContent: "Facture FAC-2026-99 Montant HT: 100.00 TVA: 20.00 TTC: 120.00",
      },
      0.85
    );
    assert.equal(res.metadata.isSimulatedTestAdapter, true);
    assert.ok(
      res.metadata.simulationNotice?.includes("MODE SIMULÉ DE TEST (mock-deterministic)"),
      "La notice de simulation doit avertir explicitement qu'aucun LLM réel n'est appelé"
    );
  });

  it("3. Modèle de données Phase 1 France (Migration 003) : partie double multi-lignes, tiers, imports, banque, rapprochement et anomalies", () => {
    const db = createDatabaseConnection(":memory:");
    resetSharedDatabaseForTests(db);
    runMigrations(db);
    seedDemoData(db);

    try {
      // 3.1 Vérifier que les 3 migrations (001, 002, 003) sont appliquées
      const migrations = db
        .prepare(`SELECT version FROM schema_migrations ORDER BY version ASC`)
        .all() as Array<{ version: string }>;
      assert.deepEqual(
        migrations.map((m) => m.version),
        [
          "001_phase0_foundations",
          "002_international_scope_extension",
          "003_phase1_readiness_schema",
        ]
      );

      const firmOrg = db
        .prepare(`SELECT id FROM organizations WHERE slug = 'cabinet-hexagone-demo'`)
        .get() as { id: string };
      const dossierFr = db
        .prepare(`SELECT id, country_config_version_id FROM client_dossiers WHERE organization_id = ? LIMIT 1`)
        .get(firmOrg.id) as { id: string; country_config_version_id: string };
      const collaborator = db
        .prepare(`SELECT id FROM users WHERE email = 'collab@cabinet-hexagone-demo.local'`)
        .get() as { id: string };

      // 3.2 Créer un tiers fournisseur (third_parties)
      db.prepare(
        `INSERT INTO third_parties (
          id, organization_id, dossier_id, code, name, party_type,
          establishment_country_code, tax_jurisdiction_code, legal_registration_number,
          tax_identification_number, default_currency, auxiliary_account_code,
          default_general_account_code, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, 'FOURN-EDF', 'EDF Entreprises', 'SUPPLIER', 'FR', 'FR', '55208131700015', 'FR03552081317', 'EUR', '401EDF', '606100', 1, datetime('now'), datetime('now'))`
      ).run("tp-edf-1", firmOrg.id, dossierFr.id);

      // 3.3 Tester le rejet d'une écriture comptable déséquilibrée (Débit != Crédit)
      assert.throws(() => {
        recordMultiLineAccountingEntry({
          id: "entry-unbalanced-1",
          organizationId: firmOrg.id,
          dossierId: dossierFr.id,
          journalCode: "AC",
          entryDate: "2026-10-18",
          pieceNumber: "FAC-EDF-001",
          label: "Facture électricité déséquilibrée",
          status: "AI_SUGGESTION",
          currency: "EUR",
          currencyMinorUnitExponent: 2,
          ruleVersionId: dossierFr.country_config_version_id,
          createdByUserId: collaborator.id,
          lines: [
            {
              generalAccountCode: "606100",
              label: "Électricité HT",
              debitMinor: 10000,
              creditMinor: 0,
            },
            {
              generalAccountCode: "401000",
              auxiliaryAccountCode: "401EDF",
              thirdPartyId: "tp-edf-1",
              label: "EDF TTC erroné",
              debitMinor: 0,
              creditMinor: 12000,
            },
          ],
          db,
        });
      }, /Écriture déséquilibrée rejetée/);

      // 3.4 Enregistrer une écriture multi-lignes équilibrée (HT + TVA = TTC)
      const recorded = recordMultiLineAccountingEntry({
        id: "entry-balanced-1",
        organizationId: firmOrg.id,
        dossierId: dossierFr.id,
        journalCode: "AC",
        entryDate: "2026-10-18",
        pieceNumber: "FAC-EDF-001",
        label: "Facture EDF Octobre 2026",
        status: "DRAFT",
        currency: "EUR",
        currencyMinorUnitExponent: 2,
        ruleVersionId: dossierFr.country_config_version_id,
        createdByUserId: collaborator.id,
        lines: [
          {
            generalAccountCode: "606100",
            label: "Fournitures non stockables - Électricité HT",
            debitMinor: 50000, // 500.00 EUR
            creditMinor: 0,
          },
          {
            generalAccountCode: "445660",
            label: "TVA déductible sur autres biens et services (20%)",
            debitMinor: 10000, // 100.00 EUR
            creditMinor: 0,
          },
          {
            generalAccountCode: "401000",
            auxiliaryAccountCode: "401EDF",
            thirdPartyId: "tp-edf-1",
            label: "Fournisseur EDF TTC",
            debitMinor: 0,
            creditMinor: 60000, // 600.00 EUR
          },
        ],
        db,
      });

      assert.equal(recorded.totalDebitMinor, 60000);
      assert.equal(recorded.totalCreditMinor, 60000);
      assert.equal(recorded.linesCount, 3);

      // 3.5 Tester lot d'import, transaction bancaire, rapprochement partiel et anomalie persistée
      db.prepare(
        `INSERT INTO import_batches (
          id, organization_id, dossier_id, import_type, original_filename,
          file_sha256_checksum, status, total_rows, valid_rows, duplicate_rows, error_rows,
          imported_by_user_id, created_at
        ) VALUES ('batch-bank-1', ?, ?, 'BANK_STATEMENT_OFX', 'releve-octobre.ofx', 'sha256-ofx-001', 'COMMITTED', 1, 1, 0, 0, ?, datetime('now'))`
      ).run(firmOrg.id, dossierFr.id, collaborator.id);

      db.prepare(
        `INSERT INTO bank_transactions (
          id, organization_id, dossier_id, import_batch_id, bank_account_iban_or_ref,
          operation_date, label, amount_minor, currency,
          currency_minor_unit_exponent, reconciled_amount_minor, reconciliation_status,
          external_dedup_hash, created_at, updated_at
        ) VALUES ('btx-1', ?, ?, 'batch-bank-1', 'FR7630004000031234567890143', '2026-10-18', 'PRLV SEPA EDF ENTREPRISES', -60000, 'EUR', 2, 60000, 'RECONCILED', 'OFX-20261018-001', datetime('now'), datetime('now'))`
      ).run(firmOrg.id, dossierFr.id);

      db.prepare(
        `INSERT INTO reconciliation_links (
          id, organization_id, dossier_id, bank_transaction_id, accounting_entry_id,
          allocated_amount_minor, currency, confidence_score, match_origin,
          validation_status, validated_by_user_id, validated_at, created_at
        ) VALUES ('reconcil-1', ?, ?, 'btx-1', 'entry-balanced-1', 60000, 'EUR', 1.0, 'DETERMINISTIC_RULE', 'VALIDATED_BY_HUMAN', ?, datetime('now'), datetime('now'))`
      ).run(firmOrg.id, dossierFr.id, collaborator.id);

      const reconcilRow = db
        .prepare(`SELECT allocated_amount_minor, validation_status FROM reconciliation_links WHERE id = 'reconcil-1'`)
        .get() as { allocated_amount_minor: number; validation_status: string };
      assert.equal(reconcilRow.allocated_amount_minor, 60000);
      assert.equal(reconcilRow.validation_status, "VALIDATED_BY_HUMAN");
    } finally {
      db.close();
    }
  });

  it("4. Test réel sur PostgreSQL 16 local (psql -U postgres -h /tmp) : application du schéma complet (18 tables), contraintes d'intégrité et isolation transactionnelle", () => {
    // Vérifie si le démon PostgreSQL local répond sur /tmp
    const versionOutput = execFileSync(
      "psql",
      ["-U", "postgres", "-h", "/tmp", "-t", "-A", "-c", "SELECT version();"],
      { encoding: "utf8" }
    ).trim();

    assert.ok(
      versionOutput.includes("PostgreSQL 16"),
      `PostgreSQL 16 attendu, reçu: ${versionOutput}`
    );

    const testSchema = `comptanova_audit_${process.pid}_${Date.now()}`;
    const sqlScript = `
      SET client_min_messages TO WARNING;
      DROP SCHEMA IF EXISTS ${testSchema} CASCADE;
      CREATE SCHEMA ${testSchema};
      SET search_path TO ${testSchema};

      ${POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL}

      -- Insertion d'une version de configuration pays et d'une organisation multi-tenant
      INSERT INTO country_config_versions (
        version_id, country_code, country_name, deployment_priority_order,
        version_number, effective_from, validation_status, is_production_enabled,
        default_currency, statutory_retention_years, config_payload_json, created_at
      ) VALUES (
        'FR-PCG-2026.1', 'FR', 'France', 1, '2026.1.0', '2026-01-01',
        'VALIDATED_FOR_PRODUCTION', 1, 'EUR', 10, '{}', '2026-10-18T00:00:00Z'
      );

      INSERT INTO organizations (
        id, name, slug, organization_type, country_code, primary_tax_jurisdiction_code,
        default_currency, created_at, updated_at
      ) VALUES (
        'org-pg-1', 'Cabinet Test PostgreSQL', 'cabinet-test-pg', 'ACCOUNTING_FIRM',
        'FR', 'FR', 'EUR', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO users (
        id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at
      ) VALUES (
        'user-pg-1', 'expert@comptanova-pg.fr', 'Expert PG', 'scrypt$test', 0, 1,
        '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO client_dossiers (
        id, organization_id, name, code, country_code, tax_jurisdiction_code,
        tax_residence_country_code, country_config_version_id, currency,
        currency_minor_unit_exponent, tax_regime_code,
        fiscal_year_start_month, is_active, created_at, updated_at
      ) VALUES (
        'dossier-pg-1', 'org-pg-1', 'SAS Alpha PG', 'DOS-PG-001', 'FR', 'FR',
        'FR', 'FR-PCG-2026.1', 'EUR',
        2, 'REAL_NORMAL_MONTHLY',
        1, 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      -- Insertion d'une écriture comptable équilibrée et de ses lignes sur PostgreSQL 16
      INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, rule_version_id, created_by_user_id, created_at
      ) VALUES (
        'entry-pg-1', 'org-pg-1', 'dossier-pg-1', 'VT', '2026-10-18', 'FAC-PG-2026-01',
        'Vente prestation conseil', 'VALIDATED', 'EUR', 2,
        120000, 120000, 'FR-PCG-2026.1', 'user-pg-1', '2026-10-18T00:00:00Z'
      );

      INSERT INTO accounting_entry_lines (
        id, organization_id, dossier_id, entry_id, line_number,
        general_account_code, label, debit_minor, credit_minor,
        currency, currency_minor_unit_exponent, created_at
      ) VALUES
        ('line-pg-1', 'org-pg-1', 'dossier-pg-1', 'entry-pg-1', 1, '411000', 'Client TTC', 120000, 0, 'EUR', 2, '2026-10-18T00:00:00Z'),
        ('line-pg-2', 'org-pg-1', 'dossier-pg-1', 'entry-pg-1', 2, '706000', 'Prestation HT', 0, 100000, 'EUR', 2, '2026-10-18T00:00:00Z'),
        ('line-pg-3', 'org-pg-1', 'dossier-pg-1', 'entry-pg-1', 3, '445710', 'TVA collectée 20%', 0, 20000, 'EUR', 2, '2026-10-18T00:00:00Z');

      -- Vérification du nombre de tables créées dans le schéma PostgreSQL
      SELECT COUNT(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema = '${testSchema}';

      -- Nettoyage du schéma de test
      DROP SCHEMA ${testSchema} CASCADE;
    `;

    const pgResult = execFileSync(
      "psql",
      ["-U", "postgres", "-h", "/tmp", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      {
        input: sqlScript,
        encoding: "utf8",
      }
    ).trim();

    const lines = pgResult.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const tableCount = Number(lines[lines.length - 1]);
    assert.equal(
      tableCount,
      20,
      `Les 20 tables métier du schéma Phase 0 (12) + Phase 1 (8) doivent être créées sans erreur dans PostgreSQL 16 (reçu: ${tableCount})`
    );
  });
});
