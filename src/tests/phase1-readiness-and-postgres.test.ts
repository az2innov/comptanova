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
import { getAppConfig } from "../config/app-config.js";
import {
  authenticateUser,
  resolveSessionByToken,
  revokeSession,
} from "../auth/auth-service.js";
import {
  createAppServer,
  resetRateLimitBucketsForTests,
  getRateLimitBucketCountForTests,
  evictExpiredRateLimitBuckets,
  resolveClientIp,
} from "../server.js";

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

  it("3. Modèle de données Phase 1 France (Migrations 001 à 004) : partie double multi-lignes, tiers, imports, banque, rapprochement et anomalies", () => {
    const db = createDatabaseConnection(":memory:");
    resetSharedDatabaseForTests(db);
    runMigrations(db);
    seedDemoData(db);

    try {
      // 3.1 Vérifier que les 5 migrations (001 à 005) sont appliquées
      const migrations = db
        .prepare(`SELECT version FROM schema_migrations ORDER BY version ASC`)
        .all() as Array<{ version: string }>;
      assert.deepEqual(
        migrations.map((m) => m.version),
        [
          "001_phase0_foundations",
          "002_international_scope_extension",
          "003_phase1_readiness_schema",
          "004_audit_logs_immutability_triggers",
          "005_phase1_lot1_1_dossier_metadata",
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

  it("4. Test réel sur PostgreSQL 16 local (psql -U postgres -h /tmp) : application du schéma complet (20 tables), contraintes d'intégrité et trigger d'inaltérabilité audit_logs", () => {
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

      -- SEC-OPEN-04 sur PostgreSQL 16 : Insertion d'une ligne d'audit et test du trigger trg_pg_audit_logs_immutable
      INSERT INTO audit_logs (
        id, organization_id, dossier_id, actor_user_id, actor_role, action,
        target_entity_type, target_entity_id, metadata_json, integrity_hash, created_at
      ) VALUES (
        'audit-pg-1', 'org-pg-1', 'dossier-pg-1', 'user-pg-1', 'FIRM_ADMIN', 'PG_AUDIT_TEST',
        'ENTRY', 'entry-pg-1', '{}', 'sha256-test-hash', '2026-10-18T00:00:00Z'
      );

      DO $$
      DECLARE
        update_blocked BOOLEAN := FALSE;
        delete_blocked BOOLEAN := FALSE;
      BEGIN
        BEGIN
          UPDATE audit_logs SET action = 'TAMPERED' WHERE id = 'audit-pg-1';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM LIKE '%SEC-OPEN-04%' THEN
            update_blocked := TRUE;
          END IF;
        END;

        BEGIN
          DELETE FROM audit_logs WHERE id = 'audit-pg-1';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM LIKE '%SEC-OPEN-04%' THEN
            delete_blocked := TRUE;
          END IF;
        END;

        IF NOT update_blocked OR NOT delete_blocked THEN
          RAISE EXCEPTION 'Trigger trg_pg_audit_logs_immutable défaillant (update=%, delete=%)', update_blocked, delete_blocked;
        END IF;
      END;
      $$;

      -- Vérifie que la suppression d'un utilisateur ne provoque pas d'UPDATE implicite sur audit_logs et conserve l'ID historique
      DELETE FROM accounting_entry_lines WHERE entry_id = 'entry-pg-1';
      DELETE FROM accounting_entries WHERE id = 'entry-pg-1';
      DELETE FROM users WHERE id = 'user-pg-1';

      SELECT COUNT(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema = '${testSchema}';

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

  it("5. Remédiations Lot 0.5 + Lot 0.6 (SEC-OPEN-01 à SEC-OPEN-05 & REQ-002) : entropie/unicité secrets prod, RBAC CLIENT_DIRECTOR & UI non-admin, trustProxy/expiration rate-limit, triggers sans conflit FK et palette UI intégrale", async () => {
    // 5.1 SEC-OPEN-01 : Refus de démarrage en production pour chaque secret absent, trop court, de démo, identique ou de faible entropie
    assert.throws(
      () => getAppConfig({ NODE_ENV: "production" }),
      /FATAL \[SEC-OPEN-01\] : La variable d'environnement SESSION_SECRET/
    );
    assert.throws(
      () =>
        getAppConfig({
          NODE_ENV: "production",
          SESSION_SECRET: "prod_session_secret_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1",
        }),
      /FATAL \[SEC-OPEN-01\] : La variable d'environnement SIGNED_URL_SECRET/
    );
    assert.throws(
      () =>
        getAppConfig({
          NODE_ENV: "production",
          SIGNED_URL_SECRET: "prod_signed_url_secret_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
        }),
      /FATAL \[SEC-OPEN-01\] : La variable d'environnement SESSION_SECRET/
    );
    assert.throws(
      () =>
        getAppConfig({
          NODE_ENV: "production",
          SESSION_SECRET: "a".repeat(48),
          SIGNED_URL_SECRET: "prod_signed_url_secret_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
        }),
      /FATAL \[SEC-OPEN-01\] : La variable d'environnement SESSION_SECRET a une entropie insuffisante/
    );
    const sameSecret = "prod_shared_secret_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1";
    try {
      getAppConfig({
        NODE_ENV: "production",
        SESSION_SECRET: sameSecret,
        SIGNED_URL_SECRET: sameSecret,
      });
      assert.fail("Doit refuser SESSION_SECRET === SIGNED_URL_SECRET en production");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assert.match(
        msg,
        /FATAL \[SEC-OPEN-01\] : SESSION_SECRET et SIGNED_URL_SECRET doivent être strictement distincts/
      );
      assert.equal(msg.includes(sameSecret), false, "Aucun secret ne doit être divulgué dans l'erreur");
    }

    const prodCfg = getAppConfig({
      NODE_ENV: "production",
      SESSION_SECRET: "prod_session_secret_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1",
      SIGNED_URL_SECRET: "prod_signed_url_secret_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
      TRUST_PROXY: "true",
    });
    assert.equal(prodCfg.nodeEnv, "production");
    assert.equal(prodCfg.trustProxy, true);
    assert.equal(prodCfg.brandColors.primaryDeepEmerald, "#153D35");

    // 5.2 SEC-OPEN-03 : Vérification de resolveClientIp (anti-spoofing X-Forwarded-For par défaut)
    const fakeReq = {
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
    } as unknown as Parameters<typeof resolveClientIp>[0];
    assert.equal(resolveClientIp(fakeReq, false), "127.0.0.1");
    assert.equal(resolveClientIp(fakeReq, true), "203.0.113.50");

    // Préparation base en mémoire
    const db = createDatabaseConnection(":memory:");
    resetSharedDatabaseForTests(db);
    runMigrations(db);
    seedDemoData(db);
    resetRateLimitBucketsForTests();

    const server = createAppServer(db, {
      maxRequestsPerMinute: 100,
      maxLoginRequestsPerMinute: 3,
      rateLimitWindowMs: 350,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 5.3 SEC-OPEN-04 : Triggers d'inaltérabilité (append-only) sur audit_logs + préservation de l'ID historique en cas de suppression d'utilisateur
      assert.throws(() => {
        db.prepare(`UPDATE audit_logs SET action = 'TAMPERED'`).run();
      }, /Violation d'inaltérabilité \[SEC-OPEN-04\]/);

      assert.throws(() => {
        db.prepare(`DELETE FROM audit_logs`).run();
      }, /Violation d'inaltérabilité \[SEC-OPEN-04\]/);

      // Insertion d'un utilisateur éphémère + log d'audit, puis suppression de l'utilisateur : ne doit PAS déclencher ON DELETE SET NULL sur audit_logs
      db.prepare(
        `INSERT INTO users (id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at)
         VALUES ('usr-temp-del', 'temp@demo.local', 'Temp User', 'hash', 0, 1, datetime('now'), datetime('now'))`
      ).run();
      db.prepare(
        `INSERT INTO audit_logs (id, organization_id, dossier_id, actor_user_id, actor_role, action, target_entity_type, metadata_json, integrity_hash, created_at)
         VALUES ('audit-temp-del', NULL, NULL, 'usr-temp-del', 'ACCOUNTANT_COLLABORATOR', 'TEMP_ACTION', 'USER', '{}', 'hash-temp', datetime('now'))`
      ).run();
      db.prepare(`DELETE FROM users WHERE id = 'usr-temp-del'`).run();
      const preservedAudit = db
        .prepare(`SELECT actor_user_id FROM audit_logs WHERE id = 'audit-temp-del'`)
        .get() as { actor_user_id: string };
      assert.equal(preservedAudit.actor_user_id, "usr-temp-del");

      // 5.4 SEC-OPEN-03 (Sessions) : Révocation immédiate et expiration de session
      const authCollab = authenticateUser(
        "collab@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "node-test",
        db
      );
      assert.ok(resolveSessionByToken(authCollab.rawToken, db));

      const expiredAuth = authenticateUser(
        "collab@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "node-test",
        db
      );
      db.prepare(`UPDATE auth_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(
        expiredAuth.context.sessionId
      );
      assert.equal(resolveSessionByToken(expiredAuth.rawToken, db), null);

      const toRevokeAuth = authenticateUser(
        "collab@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "node-test",
        db
      );
      revokeSession(toRevokeAuth.rawToken, db);
      assert.equal(resolveSessionByToken(toRevokeAuth.rawToken, db), null);

      // 5.5 SEC-OPEN-02 : Matrice complète sur GET /api/organizations/:orgId/audit-logs (FIRM_ADMIN, CLIENT_DIRECTOR, ACCOUNTANT_COLLABORATOR, PLATFORM_ADMIN)
      const orgAId = authCollab.context.memberships[0]!.organizationId;
      const collabAuditRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/audit-logs`,
        {
          headers: { Authorization: `Bearer ${authCollab.rawToken}` },
        }
      );
      assert.equal(collabAuditRes.status, 403);

      const authFirmAdmin = authenticateUser(
        "expert@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "node-test",
        db
      );
      const adminAuditRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/audit-logs`,
        {
          headers: { Authorization: `Bearer ${authFirmAdmin.rawToken}` },
        }
      );
      assert.equal(adminAuditRes.status, 200);

      const authClientDirector = authenticateUser(
        "direction@atelier-lumiere-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "node-test",
        db
      );
      const orgBId = authClientDirector.context.memberships[0]!.organizationId;
      // CLIENT_DIRECTOR sur sa propre organisation (Tenant B) -> 200
      const directorOwnOrgAuditRes = await fetch(
        `${baseUrl}/api/organizations/${orgBId}/audit-logs`,
        {
          headers: { Authorization: `Bearer ${authClientDirector.rawToken}` },
        }
      );
      assert.equal(directorOwnOrgAuditRes.status, 200);

      // CLIENT_DIRECTOR sur l'organisation d'un autre tenant (Tenant A) -> 403
      const directorCrossOrgAuditRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/audit-logs`,
        {
          headers: { Authorization: `Bearer ${authClientDirector.rawToken}` },
        }
      );
      assert.equal(directorCrossOrgAuditRes.status, 403);

      // PLATFORM_ADMIN sans justification -> 403, avec justification -> 200
      const authPlatformAdmin = authenticateUser(
        "superadmin@demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "node-test",
        db
      );
      const superNoJustifRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/audit-logs`,
        {
          headers: { Authorization: `Bearer ${authPlatformAdmin.rawToken}` },
        }
      );
      assert.equal(superNoJustifRes.status, 403);

      const superJustifiedRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/audit-logs`,
        {
          headers: {
            Authorization: `Bearer ${authPlatformAdmin.rawToken}`,
            "X-Platform-Admin-Justification": "Vérification support ticket #901 sur la chaîne d'audit",
          },
        }
      );
      assert.equal(superJustifiedRes.status, 200);

      // 5.6 SEC-OPEN-05 & REQ-002 : En-têtes HTTP (HTML, JSON, 404) et palette de couleurs officielle intégrale sans couleurs héritées
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.equal(htmlRes.status, 200);
      assert.ok(htmlRes.headers.get("content-security-policy")?.includes("default-src 'self'"));
      assert.equal(htmlRes.headers.get("x-frame-options"), "DENY");
      assert.equal(htmlRes.headers.get("x-content-type-options"), "nosniff");
      assert.equal(htmlRes.headers.get("cache-control"), "no-store");
      const htmlText = await htmlRes.text();
      assert.ok(htmlText.includes("#153D35"), "Primaire #153D35 requis");
      assert.ok(htmlText.includes("#237D68"), "Secondaire #237D68 requis");
      assert.ok(htmlText.includes("#D9A441"), "Accent #D9A441 requis");
      assert.ok(htmlText.includes("#F7F8FA"), "Fond #F7F8FA (Phase 1 §5) requis");
      assert.ok(htmlText.includes("#17212B"), "Texte #17212B (Phase 1 §5) requis");
      assert.equal(
        /#1e293b|#334155|#60a5fa|#0f172a/i.test(htmlText),
        false,
        "Aucune couleur slate/blue héritée ne doit subsister dans l'UI"
      );
      assert.ok(
        htmlText.includes("Accès restreint RBAC [SEC-OPEN-02]"),
        "L'UI doit gérer gracieusement le 403 sur /audit-logs pour les rôles non-admin"
      );

      // 5.7 SEC-OPEN-03 (Rate Limit & Expiration de fenêtre) : 3 requêtes 200 -> 4e requête 429 -> attente expiration (60 ms) -> retour 200
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "expert@cabinet-hexagone-demo.local",
            password: "DemoAdmin2026!",
          }),
        });
        assert.equal(res.status, 200);
      }
      const rateLimitedRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
        }),
      });
      assert.equal(rateLimitedRes.status, 429);

      // Attente de l'expiration de la fenêtre de 350 ms
      await new Promise((resolve) => setTimeout(resolve, 380));
      evictExpiredRateLimitBuckets(Date.now());
      assert.equal(getRateLimitBucketCountForTests(), 0, "Les compteurs expirés doivent être purgés");

      const afterExpiryRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
        }),
      });
      assert.equal(afterExpiryRes.status, 200);
    } finally {
      resetRateLimitBucketsForTests();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    }
  });
});
