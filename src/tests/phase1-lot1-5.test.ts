import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import { POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL } from "../db/phase1-readiness-migration.js";
import {
  authenticateUser,
  AuthorizationError,
} from "../auth/auth-service.js";
import {
  listDossiersForOrganization,
  createClientDossier,
  assignUserToDossier,
} from "../services/tenant-service.js";
import {
  getDossierAccounts,
  getDossierJournals,
  createAccountingEntry,
  updateDraftAccountingEntry,
  validateAccountingEntry,
  reverseAccountingEntry,
  deleteDraftAccountingEntry,
  getAccountingEntryDetails,
  listAccountingEntries,
  MAX_MONETARY_MINOR,
  validateCalendarDate,
} from "../services/accounting-service.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.5 : Module 5 — Saisie comptable et journaux", () => {
  // Base de données de test SQLite isolée
  const db = createDatabaseConnection(":memory:");
  runMigrations(db);
  seedDemoData(db);

  // Authentification des acteurs
  const firmAdmin = authenticateUser(
    "expert@cabinet-hexagone-demo.local",
    "DemoAdmin2026!",
    "127.0.0.1",
    "test-runner",
    db
  ).context;
  const orgAId = firmAdmin.memberships[0]!.organizationId;

  const tenantBAdmin = authenticateUser(
    "direction@atelier-lumiere-demo.local",
    "DemoAdmin2026!",
    "127.0.0.1",
    "test-runner",
    db
  ).context;
  const orgBId = tenantBAdmin.memberships[0]!.organizationId;

  const dossierA = listDossiersForOrganization({
    session: firmAdmin,
    organizationId: orgAId,
    db,
  })[0]!;

  const dossierB = listDossiersForOrganization({
    session: tenantBAdmin,
    organizationId: orgBId,
    db,
  })[0]!;

  it("1. Sélection des comptes PCG & Récupération des 5 journaux officiels (VE, AC, BQ, OD, AN)", () => {
    // 1.1 Récupération du plan de comptes du dossier
    const accounts = getDossierAccounts({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      db,
    });
    assert.ok(accounts.length >= 10, "Le dossier doit comporter les comptes PCG de référence");
    assert.ok(accounts.some((a) => a.accountNumber === "411000" && a.label.includes("Clients")));
    assert.ok(accounts.some((a) => a.accountNumber === "706000" && a.label.includes("Prestations")));
    assert.ok(accounts.some((a) => a.accountNumber === "445710" && a.label.includes("TVA collectée")));

    // Filtrage par classe et recherche
    const class7Accounts = getDossierAccounts({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      accountClass: 7,
      db,
    });
    assert.ok(class7Accounts.length > 0);
    assert.ok(class7Accounts.every((a) => a.accountClass === 7));

    const searchedAccounts = getDossierAccounts({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      search: "banque",
      db,
    });
    assert.ok(searchedAccounts.some((a) => a.accountNumber.startsWith("512")));

    // 1.2 Récupération des 5 journaux officiels français (VE, AC, BQ, OD, AN)
    const journals = getDossierJournals({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      db,
    });
    const journalCodes = journals.map((j) => j.code);
    assert.ok(journalCodes.includes("VE"), "Le journal VE (Ventes) doit être présent");
    assert.ok(journalCodes.includes("AC"), "Le journal AC (Achats) doit être présent");
    assert.ok(journalCodes.includes("BQ"), "Le journal BQ (Banque) doit être présent");
    assert.ok(journalCodes.includes("OD"), "Le journal OD (Opérations Diverses) doit être présent");
    assert.ok(journalCodes.includes("AN"), "Le journal AN (À-Nouveaux) doit être présent");
  });

  it("2. Création d'une écriture comptable multi-lignes en centimes (Saisie au kilomètre - DRAFT)", () => {
    const entry = createAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "VE",
      entryDate: "2026-10-18",
      pieceNumber: "FAC-2026-0099",
      label: "Facture conseil stratégique Dupont",
      status: "DRAFT",
      currency: "EUR",
      lines: [
        {
          lineNumber: 1,
          generalAccountCode: "411000",
          label: "Client Dupont SARL",
          debitMinor: 120000, // 1 200,00 €
          creditMinor: 0,
        },
        {
          lineNumber: 2,
          generalAccountCode: "706000",
          label: "Prestation de conseil HT",
          debitMinor: 0,
          creditMinor: 100000, // 1 000,00 €
        },
        {
          lineNumber: 3,
          generalAccountCode: "445710",
          label: "TVA collectée 20%",
          debitMinor: 0,
          creditMinor: 20000, // 200,00 €
        },
      ],
      db,
    });

    assert.ok(entry.id);
    assert.equal(entry.status, "DRAFT");
    assert.equal(entry.journalCode, "VE");
    assert.equal(entry.pieceNumber, "FAC-2026-0099");
    assert.equal(entry.totalDebitMinor, 120000);
    assert.equal(entry.totalCreditMinor, 120000);
    assert.equal(entry.isBalanced, true);
    assert.equal(entry.lines?.length, 3);
    assert.equal(entry.validatedByUserId, null);
    assert.equal(entry.validatedAt, null);
  });

  it("3. Rejet strict des écritures mal formées ou non conformes", () => {
    // 3.1 Moins de 2 lignes
    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "ERR-01",
          label: "Erreur une seule ligne",
          lines: [
            {
              generalAccountCode: "411000",
              label: "Client",
              debitMinor: 10000,
              creditMinor: 0,
            },
          ],
          db,
        });
      },
      /au moins 2 lignes/i
    );

    // 3.2 Montants négatifs ou non sécurisés
    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "ERR-02",
          label: "Erreur montant négatif",
          lines: [
            { generalAccountCode: "411000", label: "Client", debitMinor: -5000, creditMinor: 0 },
            { generalAccountCode: "706000", label: "Vente", debitMinor: 0, creditMinor: 5000 },
          ],
          db,
        });
      },
      /entiers positifs ou nuls/i
    );

    // 3.3 Débit ET Crédit non nuls sur la même ligne
    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "ERR-03",
          label: "Erreur double montant",
          lines: [
            { generalAccountCode: "411000", label: "Client", debitMinor: 1000, creditMinor: 500 },
            { generalAccountCode: "706000", label: "Vente", debitMinor: 0, creditMinor: 500 },
          ],
          db,
        });
      },
      /simultanément un débit et un crédit/i
    );

    // 3.4 Ligne entièrement nulle (débit = 0 et crédit = 0)
    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "ERR-04",
          label: "Erreur ligne à 0",
          lines: [
            { generalAccountCode: "411000", label: "Client", debitMinor: 0, creditMinor: 0 },
            { generalAccountCode: "706000", label: "Vente", debitMinor: 0, creditMinor: 500 },
          ],
          db,
        });
      },
      /montant non nul soit au débit, soit au crédit/i
    );

    // 3.5 Compte PCG non autorisé / inexistant dans le dossier
    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "ERR-05",
          label: "Erreur compte inconnu",
          lines: [
            { generalAccountCode: "999999", label: "Compte imaginaire", debitMinor: 1000, creditMinor: 0 },
            { generalAccountCode: "706000", label: "Vente", debitMinor: 0, creditMinor: 1000 },
          ],
          db,
        });
      },
      /n'est pas autorisé ou n'existe pas dans le plan de comptes/i
    );
  });

  it("4. Blocage strict de la validation pour une écriture déséquilibrée (Débit ≠ Crédit)", () => {
    // Création d'une écriture brouillon sciemment déséquilibrée
    const unbalancedDraft = createAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "OD",
      entryDate: "2026-10-18",
      pieceNumber: "OD-UNBAL-01",
      label: "Brouillon déséquilibré en cours de saisie",
      status: "DRAFT",
      lines: [
        { generalAccountCode: "622600", label: "Honoraires", debitMinor: 50000, creditMinor: 0 },
        { generalAccountCode: "401000", label: "Fournisseur", debitMinor: 0, creditMinor: 45000 }, // Écart de 5 000 centimes (50,00 €)
      ],
      db,
    });

    assert.equal(unbalancedDraft.isBalanced, false);
    assert.equal(unbalancedDraft.totalDebitMinor, 50000);
    assert.equal(unbalancedDraft.totalCreditMinor, 45000);

    // Tentative de validation -> Doit être rejetée immédiatement
    assert.throws(
      () => {
        validateAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: unbalancedDraft.id,
          db,
        });
      },
      /Validation impossible : l'écriture est déséquilibrée/i
    );

    // Vérification que le statut reste STRICTEMENT DRAFT
    const fresh = getAccountingEntryDetails({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: unbalancedDraft.id,
      db,
    });
    assert.equal(fresh.status, "DRAFT");
    assert.equal(fresh.validatedAt, null);

    // Équilibrage via updateDraftAccountingEntry
    const balanced = updateDraftAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: unbalancedDraft.id,
      lines: [
        { generalAccountCode: "622600", label: "Honoraires", debitMinor: 50000, creditMinor: 0 },
        { generalAccountCode: "401000", label: "Fournisseur", debitMinor: 0, creditMinor: 50000 },
      ],
      db,
    });
    assert.equal(balanced.isBalanced, true);
    assert.equal(balanced.totalDebitMinor, 50000);
    assert.equal(balanced.totalCreditMinor, 50000);
  });

  it("5. Validation humaine explicite avec contrôle RBAC serveur (VALIDATE_ACCOUNTING)", () => {
    // 5.1 Authentification du collaborateur du cabinet
    const collabSession = authenticateUser(
      "collab@cabinet-hexagone-demo.local",
      "DemoAdmin2026!",
      "127.0.0.1",
      "test-runner",
      db
    ).context;

    // Affectation au dossier avec canValidateAccounting = false
    assignUserToDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      targetUserId: collabSession.user.id,
      canView: true,
      canUpload: true,
      canEditExtraction: true,
      canValidateAccounting: false,
      canExport: false,
      db,
    });

    // Création d'une écriture équilibrée par le collaborateur (autorisé via canEditExtraction)
    const entryToValidate = createAccountingEntry({
      session: collabSession,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "BQ",
      entryDate: "2026-10-18",
      pieceNumber: "BQ-2026-0001",
      label: "Règlement fournisseur virement",
      status: "DRAFT",
      lines: [
        { generalAccountCode: "401000", label: "Fournisseur débit", debitMinor: 30000, creditMinor: 0 },
        { generalAccountCode: "512000", label: "Banque crédit", debitMinor: 0, creditMinor: 30000 },
      ],
      db,
    });

    // Tentative de validation par le collaborateur non habilité -> Rejet 403
    assert.throws(
      () => {
        validateAccountingEntry({
          session: collabSession,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: entryToValidate.id,
          db,
        });
      },
      (err: unknown) => {
        return err instanceof AuthorizationError && err.statusCode === 403;
      }
    );

    // Validation par l'administrateur du cabinet (FIRM_ADMIN habilité)
    const validated = validateAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: entryToValidate.id,
      db,
    });

    assert.equal(validated.status, "VALIDATED");
    assert.equal(validated.validatedByUserId, firmAdmin.user.id);
    assert.ok(validated.validatedAt !== null);

    // Tentative de re-valider une écriture déjà validée -> Rejet
    assert.throws(
      () => {
        validateAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: entryToValidate.id,
          db,
        });
      },
      /déjà validée/i
    );
  });

  it("6. Inaltérabilité & Immuabilité des écritures validées (Interdiction de modification directe)", () => {
    // Création et validation d'une écriture
    const lockedEntry = createAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "AC",
      entryDate: "2026-10-18",
      pieceNumber: "AC-LOCK-01",
      label: "Achat fournitures",
      status: "DRAFT",
      lines: [
        { generalAccountCode: "606400", label: "Fournitures administratives", debitMinor: 15000, creditMinor: 0 },
        { generalAccountCode: "401000", label: "Fournisseur", debitMinor: 0, creditMinor: 15000 },
      ],
      db,
    });

    validateAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: lockedEntry.id,
      db,
    });

    // Tentative de modification en place -> Rejet formel
    assert.throws(
      () => {
        updateDraftAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: lockedEntry.id,
          label: "Modification interdite",
          lines: [
            { generalAccountCode: "606400", label: "Fournitures administratives", debitMinor: 20000, creditMinor: 0 },
            { generalAccountCode: "401000", label: "Fournisseur", debitMinor: 0, creditMinor: 20000 },
          ],
          db,
        });
      },
      /Violation d'inaltérabilité comptable/i
    );

    // Tentative de suppression -> Rejet formel
    assert.throws(
      () => {
        deleteDraftAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: lockedEntry.id,
          db,
        });
      },
      /Violation d'inaltérabilité comptable/i
    );
  });

  it("7. Extourne comptable contrôlée (Reversal symétrique avec traçabilité inaltérable)", () => {
    // 7.1 Création et validation d'une écriture originale
    const original = createAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "OD",
      entryDate: "2026-10-18",
      pieceNumber: "OD-REV-01",
      label: "Écriture originale à contre-passer",
      status: "DRAFT",
      lines: [
        { generalAccountCode: "622600", label: "Honoraires conseil", debitMinor: 80000, creditMinor: 0 },
        { generalAccountCode: "401000", label: "Dette fournisseur", debitMinor: 0, creditMinor: 80000 },
      ],
      db,
    });

    validateAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: original.id,
      db,
    });

    // 7.2 Exécution de l'extourne
    const reversal = reverseAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: original.id,
      reversalReason: "Annulation pour erreur d'imputation",
      db,
    });

    assert.ok(reversal.id);
    assert.equal(reversal.reversalOfEntryId, original.id);
    assert.equal(reversal.status, "VALIDATED");
    assert.equal(reversal.pieceNumber, "EXT-OD-REV-01");
    assert.ok(reversal.label.includes("Extourne"));
    assert.equal(reversal.totalDebitMinor, 80000);
    assert.equal(reversal.totalCreditMinor, 80000);

    // Vérification de l'inversion symétrique stricte des lignes
    assert.equal(reversal.lines?.length, 2);
    const lineHonoraires = reversal.lines?.find((l) => l.generalAccountCode === "622600")!;
    assert.equal(lineHonoraires.debitMinor, 0);
    assert.equal(lineHonoraires.creditMinor, 80000); // Débit devenu crédit

    const lineFournisseur = reversal.lines?.find((l) => l.generalAccountCode === "401000")!;
    assert.equal(lineFournisseur.debitMinor, 80000); // Crédit devenu débit
    assert.equal(lineFournisseur.creditMinor, 0);

    // Vérification de la mise à jour de l'écriture originale en REVERSED
    const updatedOriginal = getAccountingEntryDetails({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: original.id,
      db,
    });
    assert.equal(updatedOriginal.status, "REVERSED");

    // Tentative d'extourner à nouveau l'écriture originale -> Bloquée (anti-duplication)
    assert.throws(
      () => {
        reverseAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: original.id,
          db,
        });
      },
      /Seule une écriture validée.*peut faire l'objet d'une extourne/i
    );
  });

  it("8. Consultation & Filtrage multi-critères du Livre-Journal avec totaux", () => {
    // 8.1 Filtrage par journal
    const veEntries = listAccountingEntries({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "VE",
      db,
    });
    assert.ok(veEntries.entries.length > 0);
    assert.ok(veEntries.entries.every((e) => e.journalCode === "VE"));

    // 8.2 Filtrage par statut
    const reversedEntries = listAccountingEntries({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      status: "REVERSED",
      db,
    });
    assert.ok(reversedEntries.entries.length > 0);
    assert.ok(reversedEntries.entries.every((e) => e.status === "REVERSED"));

    // 8.3 Filtrage par compte PCG (ex: 411%)
    const clientAccountEntries = listAccountingEntries({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      accountCode: "411",
      db,
    });
    assert.ok(clientAccountEntries.entries.length > 0);

    // 8.4 Totaux et équilibre global
    assert.ok(veEntries.totalDebitSumMinor >= 120000);
    assert.ok(veEntries.totalCreditSumMinor >= 120000);
    assert.equal(veEntries.isOverallBalanced, true);
  });

  it("9. Isolation Multi-Tenant stricte sur les écritures comptables (Tenant A vs Tenant B)", () => {
    // Octroi des droits d'édition à la dirigeante de l'Atelier Lumière sur son propre dossier
    db.prepare(
      "UPDATE dossier_assignments SET can_edit_extraction = 1, can_validate_accounting = 1 WHERE organization_id = ? AND user_id = ?"
    ).run(orgBId, tenantBAdmin.user.id);

    // Écriture créée par Tenant B dans son dossier
    const entryB = createAccountingEntry({
      session: tenantBAdmin,
      organizationId: orgBId,
      dossierId: dossierB.id,
      journalCode: "VE",
      entryDate: "2026-10-18",
      pieceNumber: "FAC-TENANT-B-01",
      label: "Prestation Tenant B",
      status: "DRAFT",
      lines: [
        { generalAccountCode: "411000", label: "Client B", debitMinor: 10000, creditMinor: 0 },
        { generalAccountCode: "706000", label: "Vente B", debitMinor: 0, creditMinor: 10000 },
      ],
      db,
    });

    // 9.1 Tenant A ne peut pas consulter l'écriture de Tenant B
    assert.throws(
      () => {
        getAccountingEntryDetails({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: entryB.id,
          db,
        });
      },
      /introuvable dans ce dossier client/i
    );

    // 9.2 Tenant A ne peut pas valider l'écriture de Tenant B même en altérant l'URL (IDOR croisé)
    assert.throws(
      () => {
        validateAccountingEntry({
          session: firmAdmin,
          organizationId: orgBId,
          dossierId: dossierB.id,
          entryId: entryB.id,
          db,
        });
      },
      (err: unknown) => {
        return err instanceof AuthorizationError && (err.statusCode === 403 || err.statusCode === 404);
      }
    );

    // 9.3 Tenant A ne peut pas lister les écritures de Tenant B
    assert.throws(
      () => {
        listAccountingEntries({
          session: firmAdmin,
          organizationId: orgBId,
          dossierId: dossierB.id,
          db,
        });
      },
      (err: unknown) => {
        return err instanceof AuthorizationError && (err.statusCode === 403 || err.statusCode === 404);
      }
    );
  });

  it("10. Test fonctionnel réel sur PostgreSQL 16 local (psql -U postgres -h /tmp)", () => {
    const versionOutput = execFileSync(
      "psql",
      ["-U", "postgres", "-h", "/tmp", "-t", "-A", "-c", "SELECT version();"],
      { encoding: "utf8" }
    ).trim();

    assert.ok(
      versionOutput.includes("PostgreSQL 16"),
      `PostgreSQL 16 attendu, reçu: ${versionOutput}`
    );

    const testSchema = `comptanova_lot1_5_${process.pid}_${Date.now()}`;
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
        'org-pg-lot1-5', 'Cabinet Test Module 5', 'cabinet-test-mod5', 'ACCOUNTING_FIRM',
        'FR', 'FR', 'EUR', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO users (
        id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at
      ) VALUES (
        'user-pg-lot1-5', 'expert@mod5-pg.fr', 'Expert PG Mod5', 'scrypt$test', 0, 1,
        '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO client_dossiers (
        id, organization_id, name, code, country_code, tax_jurisdiction_code,
        tax_residence_country_code, country_config_version_id, currency,
        currency_minor_unit_exponent, tax_regime_code,
        fiscal_year_start_month, is_active, created_at, updated_at
      ) VALUES (
        'dossier-pg-lot1-5', 'org-pg-lot1-5', 'SAS Module 5 PG', 'DOS-PG-005', 'FR', 'FR',
        'FR', 'FR-PCG-2026.1', 'EUR',
        2, 'REAL_NORMAL_MONTHLY',
        1, 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      -- Insertion de l'écriture en statut DRAFT
      INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, rule_version_id, created_by_user_id, created_at, updated_at
      ) VALUES (
        'entry-pg-orig', 'org-pg-lot1-5', 'dossier-pg-lot1-5', 'VE', '2026-10-18', 'FAC-PG-001',
        'Prestation PG conseil', 'DRAFT', 'EUR', 2,
        120000, 120000, 'FR-PCG-2026.1', 'user-pg-lot1-5', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO accounting_entry_lines (
        id, organization_id, dossier_id, entry_id, line_number,
        general_account_code, label, debit_minor, credit_minor,
        currency, currency_minor_unit_exponent, created_at
      ) VALUES
        ('line-pg-1', 'org-pg-lot1-5', 'dossier-pg-lot1-5', 'entry-pg-orig', 1, '411000', 'Client TTC', 120000, 0, 'EUR', 2, '2026-10-18T00:00:00Z'),
        ('line-pg-2', 'org-pg-lot1-5', 'dossier-pg-lot1-5', 'entry-pg-orig', 2, '706000', 'Prestation HT', 0, 100000, 'EUR', 2, '2026-10-18T00:00:00Z'),
        ('line-pg-3', 'org-pg-lot1-5', 'dossier-pg-lot1-5', 'entry-pg-orig', 3, '445710', 'TVA 20%', 0, 20000, 'EUR', 2, '2026-10-18T00:00:00Z');

      -- Validation sur PostgreSQL
      UPDATE accounting_entries
      SET status = 'VALIDATED', validated_by_user_id = 'user-pg-lot1-5', validated_at = '2026-10-18T10:00:00Z'
      WHERE id = 'entry-pg-orig';

      -- Extourne sur PostgreSQL
      UPDATE accounting_entries SET status = 'REVERSED' WHERE id = 'entry-pg-orig';

      INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, rule_version_id, created_by_user_id,
        validated_by_user_id, validated_at, reversal_of_entry_id, created_at, updated_at
      ) VALUES (
        'entry-pg-rev', 'org-pg-lot1-5', 'dossier-pg-lot1-5', 'VE', '2026-10-18', 'EXT-FAC-PG-001',
        'Extourne : Prestation PG conseil', 'VALIDATED', 'EUR', 2,
        120000, 120000, 'FR-PCG-2026.1', 'user-pg-lot1-5',
        'user-pg-lot1-5', '2026-10-18T10:05:00Z', 'entry-pg-orig', '2026-10-18T10:05:00Z', '2026-10-18T10:05:00Z'
      );

      DROP SCHEMA ${testSchema} CASCADE;
    `;

    const pgResult = execFileSync(
      "psql",
      ["-U", "postgres", "-h", "/tmp", "-v", "ON_ERROR_STOP=1"],
      { input: sqlScript, encoding: "utf8" }
    );
    assert.ok(pgResult !== null, "L'exécution PostgreSQL 16 doit réussir sans erreur");
  });

  it("11. Test d'intégration API REST complet sur les routes Module 5 (/accounting/...)", async () => {
    resetRateLimitBucketsForTests();
    const server = createAppServer(db);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;

    try {
      // 11.1 Authentification
      const loginPayload = JSON.stringify({
        email: "expert@cabinet-hexagone-demo.local",
        password: "DemoAdmin2026!",
      });

      const token = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          `${origin}/api/auth/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(loginPayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              const parsed = JSON.parse(body);
              if (parsed.token) resolve(parsed.token);
              else reject(new Error("Token manquant"));
            });
          }
        );
        req.write(loginPayload);
        req.end();
      });

      // 11.2 GET /api/organizations/:orgId/dossiers/:dossierId/accounting/accounts
      const accountsRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/accounts`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(accountsRes.status, 200);
      assert.ok(Array.isArray(accountsRes.data.accounts));
      assert.ok(accountsRes.data.accounts.length >= 10);

      // 11.3 GET /api/organizations/:orgId/dossiers/:dossierId/accounting/journals
      const journalsRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/journals`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(journalsRes.status, 200);
      assert.ok(Array.isArray(journalsRes.data.journals));
      const jCodes = journalsRes.data.journals.map((j: any) => j.code);
      assert.ok(jCodes.includes("VE"));
      assert.ok(jCodes.includes("AC"));

      // 11.4 POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries (Création brouillon)
      const createPayload = JSON.stringify({
        journalCode: "VE",
        entryDate: "2026-10-18",
        pieceNumber: "API-FAC-01",
        label: "Facture test API",
        status: "DRAFT",
        lines: [
          { generalAccountCode: "411000", label: "Client API", debitMinor: 60000, creditMinor: 0 },
          { generalAccountCode: "706000", label: "Prestation API HT", debitMinor: 0, creditMinor: 50000 },
          { generalAccountCode: "445710", label: "TVA 20% API", debitMinor: 0, creditMinor: 10000 },
        ],
      });

      const createRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(createPayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(createPayload);
        req.end();
      });
      assert.equal(createRes.status, 201);
      assert.equal(createRes.data.entry.status, "DRAFT");
      assert.equal(createRes.data.entry.totalDebitMinor, 60000);
      const createdEntryId = createRes.data.entry.id;

      // 11.5 GET /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId
      const detailRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries/${createdEntryId}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(detailRes.status, 200);
      assert.equal(detailRes.data.entry.pieceNumber, "API-FAC-01");
      assert.equal(detailRes.data.entry.lines.length, 3);

      // 11.6 PATCH /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId
      const updatePayload = JSON.stringify({
        label: "Facture test API modifiée",
        lines: [
          { generalAccountCode: "411000", label: "Client API", debitMinor: 72000, creditMinor: 0 },
          { generalAccountCode: "706000", label: "Prestation API HT", debitMinor: 0, creditMinor: 60000 },
          { generalAccountCode: "445710", label: "TVA 20% API", debitMinor: 0, creditMinor: 12000 },
        ],
      });

      const updateRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries/${createdEntryId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(updatePayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(updatePayload);
        req.end();
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.entry.totalDebitMinor, 72000);

      // 11.7 POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId/validate
      const validateRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries/${createdEntryId}/validate`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(validateRes.status, 200);
      assert.equal(validateRes.data.entry.status, "VALIDATED");

      // 11.8 POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId/reverse (Extourne)
      const reversePayload = JSON.stringify({
        reversalReason: "Extourne via API",
      });
      const reverseRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries/${createdEntryId}/reverse`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(reversePayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(reversePayload);
        req.end();
      });
      assert.equal(reverseRes.status, 201);
      assert.equal(reverseRes.data.entry.status, "VALIDATED");
      assert.equal(reverseRes.data.entry.reversalOfEntryId, createdEntryId);

      // 11.9 GET /api/organizations/:orgId/dossiers/:dossierId/accounting/entries (Liste globale)
      const listRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries?journalCode=VE`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(listRes.status, 200);
      assert.ok(listRes.data.entries.length >= 2);
      assert.equal(listRes.data.isOverallBalanced, true);

      // 11.10 Création puis DELETE d'un brouillon
      const tempDraftPayload = JSON.stringify({
        journalCode: "OD",
        entryDate: "2026-10-18",
        pieceNumber: "OD-DEL-01",
        label: "Brouillon éphémère",
        status: "DRAFT",
        lines: [
          { generalAccountCode: "606400", label: "Fournitures", debitMinor: 1000, creditMinor: 0 },
          { generalAccountCode: "401000", label: "Fournisseur", debitMinor: 0, creditMinor: 1000 },
        ],
      });
      const tempDraftRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(tempDraftPayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(tempDraftPayload);
        req.end();
      });
      assert.equal(tempDraftRes.status, 201);
      const tempEntryId = tempDraftRes.data.entry.id;

      const deleteRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/accounting/entries/${tempEntryId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.data.success, true);

      // 11.11 Test d'étanchéité multi-tenant sur l'API : accès interdit au dossier B avec token du cabinet A
      const crossTenantRes = await new Promise<{ status: number }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgBId}/dossiers/${dossierB.id}/accounting/entries`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            res.on("data", () => {});
            res.on("end", () => resolve({ status: res.statusCode || 0 }));
          }
        );
        req.end();
      });
      assert.equal(crossTenantRes.status, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("12. Contrôles ciblés de clôture Lot 1.5 : Arithmétique safe integer, dates calendaires, dossier archivé et concurrence", async () => {
    // 12.1 Arithmétique : Rejet des flottants, NaN, montants non entiers et dépassement de capacité
    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "FAC-ARITH-FLOAT",
          label: "Test rejet flottant",
          lines: [
            { generalAccountCode: "411000", label: "Client", debitMinor: 100.5, creditMinor: 0 },
            { generalAccountCode: "706000", label: "Prestation", debitMinor: 0, creditMinor: 100.5 },
          ],
          db,
        });
      },
      /entiers positifs ou nuls/,
      "Les montants non entiers (flottants IEEE-754) doivent être strictement rejetés"
    );

    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "FAC-ARITH-OVERFLOW",
          label: "Test rejet overflow",
          lines: [
            { generalAccountCode: "411000", label: "Client", debitMinor: MAX_MONETARY_MINOR + 1, creditMinor: 0 },
            { generalAccountCode: "706000", label: "Prestation", debitMinor: 0, creditMinor: MAX_MONETARY_MINOR + 1 },
          ],
          db,
        });
      },
      /dépasse la capacité monétaire autorisée/,
      "Les montants dépassant MAX_MONETARY_MINOR doivent être rejetés"
    );

    // 12.2 Dates calendaires : Rejet des dates invalides (ex: 31 février, mois 13)
    assert.throws(
      () => {
        validateCalendarDate("2026-02-31", "Date test");
      },
      /pas une date calendaire valide/,
      "Le 31 février doit être rejeté"
    );

    assert.throws(
      () => {
        validateCalendarDate("2026-13-01", "Date test");
      },
      /valeurs d'année, mois ou jour invalides/,
      "Le mois 13 doit être rejeté"
    );

    // Validation d'une année bissextile valide (2024-02-29) vs non bissextile (2025-02-29)
    assert.equal(validateCalendarDate("2024-02-29", "Date bissextile"), "2024-02-29");
    assert.throws(
      () => validateCalendarDate("2025-02-29", "Date non-bissextile"),
      /pas une date calendaire valide/
    );

    // 12.3 Blocage des opérations sur dossier archivé (is_active = 0)
    const archivedDossier = createClientDossier({
      session: firmAdmin,
      organizationId: orgAId,
      code: "DOSS-ARCH-TEST",
      name: "Dossier Test Archivé",
      countryCode: "FR",
      currency: "EUR",
      taxRegimeCode: "FR_TVA_REEL_NORMAL",
      db,
    });
    db.prepare("UPDATE client_dossiers SET is_active = 0 WHERE id = ?").run(archivedDossier.id);

    assert.throws(
      () => {
        createAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: archivedDossier.id,
          journalCode: "VE",
          entryDate: "2026-10-18",
          pieceNumber: "FAC-ARCH-TEST",
          label: "Test dossier inactif",
          lines: [
            { generalAccountCode: "411000", label: "Client", debitMinor: 1000, creditMinor: 0 },
            { generalAccountCode: "706000", label: "Vente", debitMinor: 0, creditMinor: 1000 },
          ],
          db,
        });
      },
      /archivé ou inactif/,
      "La création d'écriture doit être rejetée sur un dossier archivé"
    );

    // 12.4 Concurrence & Verrouillage optimiste sur la validation
    const concEntry = createAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      journalCode: "OD",
      entryDate: "2026-10-18",
      pieceNumber: "OD-CONC-01",
      label: "Test verrou optimiste concurrence",
      lines: [
        { generalAccountCode: "411000", label: "Client", debitMinor: 5000, creditMinor: 0 },
        { generalAccountCode: "706000", label: "Prestation", debitMinor: 0, creditMinor: 5000 },
      ],
      db,
    });

    // Validation première réussie
    const validatedConc = validateAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: concEntry.id,
      db,
    });
    assert.equal(validatedConc.status, "VALIDATED");

    // Tentative de double validation concurrente (doit échouer proprement sans écrasement)
    assert.throws(
      () => {
        validateAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: concEntry.id,
          db,
        });
      },
      /déjà validée/,
      "Une validation concurrente ou répétée doit être rejetée"
    );

    // Extourne
    const reversedConc = reverseAccountingEntry({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      entryId: concEntry.id,
      reversalReason: "Annulation pour test concurrence",
      db,
    });
    assert.equal(reversedConc.status, "VALIDATED");
    assert.equal(reversedConc.reversalOfEntryId, concEntry.id);

    // Tentative de ré-extourne concurrente
    assert.throws(
      () => {
        reverseAccountingEntry({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          entryId: concEntry.id,
          db,
        });
      },
      /(Seule une écriture validée|déjà fait l'objet d'une extourne)/,
      "Une double extourne doit être strictement bloquée"
    );
  });
});
