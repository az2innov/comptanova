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
  initializeDossierAccountingReferential,
  assignUserToDossier,
  ingestDocumentIntoDossier,
  updateDocumentExtraction,
  validateDocument,
} from "../services/tenant-service.js";
import {
  createQuote,
  convertQuoteToInvoice,
  finalizeSalesInvoice,
  createCreditNoteForInvoice,
} from "../services/invoicing-service.js";
import {
  importBankStatement,
  reconcileBankTransaction,
  listBankTransactions,
} from "../services/bank-service.js";
import {
  createAccountingEntry,
  validateAccountingEntry,
  getDossierAccounts,
  getDossierJournals,
} from "../services/accounting-service.js";
import {
  scanDossierAnomalies,
  resolveDossierAnomaly,
} from "../services/anomaly-service.js";
import {
  SimulationService,
} from "../services/simulation-service.js";
import {
  ExportService,
  sanitizeCsvCell,
} from "../services/export-service.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.7 : Modules 7, 8 & 9 — Simulations, Exports CSV/FEC et Parcours E2E en 17 étapes", () => {
  // Base SQLite isolée
  const db = createDatabaseConnection(":memory:");
  runMigrations(db);
  seedDemoData(db);

  const simulationService = new SimulationService(db);
  const exportService = new ExportService(db);

  // Authentification
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

  // =========================================================================
  // 1. MODULE 7 : SIMULATIONS INDICATIVES VERSIONNÉES (§19)
  // =========================================================================
  describe("1. Simulations Indicatives Versionnées (Module 7)", () => {
    it("1.1 Simulation VAT_SUMMARY : calcul exact en centimes, solde TVA et crédit", () => {
      // Cas 1 : TVA due à payer (TVA collectée > TVA déductible)
      // CA HT = 12 500 € à 20% (TVA collectée = 2 500 €), Achats HT = 5 000 € à 20% (TVA déductible = 1 000 €)
      const simDue = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        dossierA.id,
        {
          simulationType: "VAT_SUMMARY",
          revenueNetMinor: 1250000,
          expensesNetMinor: 500000,
          vatRateBps: 2000,
        }
      );

      assert.equal(simDue.status, "COMPUTED_INDICATIVE");
      assert.ok(simDue.resultData);
      assert.equal(simDue.resultData.collectedVatMinor, 250000); // 2 500,00 €
      assert.equal(simDue.resultData.deductibleVatMinor, 100000); // 1 000,00 €
      assert.equal(simDue.resultData.netVatPayableMinor, 150000); // 1 500,00 € à payer
      assert.equal(simDue.resultData.vatCreditMinor, 0);
      assert.ok(simDue.disclaimerText.includes("Estimation à titre informatif uniquement"));
      assert.equal(simDue.ruleVersionId, dossierA.countryConfigVersionId);

      // Cas 2 : Crédit de TVA (TVA déductible > TVA collectée)
      // CA HT = 2 500 € à 20% (TVA collectée = 500 €), Achats HT = 9 000 € à 20% (TVA déductible = 1 800 €)
      const simCredit = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        dossierA.id,
        {
          simulationType: "VAT_SUMMARY",
          revenueNetMinor: 250000,
          expensesNetMinor: 900000,
          vatRateBps: 2000,
        }
      );

      assert.equal(simCredit.resultData?.netVatPayableMinor, -130000); // Crédit de 1 300,00 €
      assert.equal(simCredit.resultData?.isVatCredit, true);
      assert.equal(simCredit.resultData?.vatCreditMinor, 130000);
    });

    it("1.2 Simulation SOCIAL_CONTRIBUTIONS : barème URSSAF indépendant déterministe", () => {
      // 45 000 € de revenu net
      const simSoc = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        dossierA.id,
        {
          simulationType: "SOCIAL_CONTRIBUTIONS",
          basisRevenueMinor: 4500000,
          customContributionRateBps: 4350,
        }
      );

      assert.equal(simSoc.status, "COMPUTED_INDICATIVE");
      assert.ok(simSoc.resultData);
      assert.ok(Number(simSoc.resultData.contributionsMinor) > 0);
      assert.equal(
        Number(simSoc.resultData.netIncomeAfterContributionsMinor) + Number(simSoc.resultData.contributionsMinor),
        4500000
      );
      assert.ok(simSoc.assumptions.length >= 1);
    });

    it("1.3 Simulation INCOME_OR_CORPORATE_TAX : taux PME 15% / 25% et taux normal", () => {
      // Cas 1 : PME éligible au taux réduit jusqu'à 42 500 € sur bénéfice de 60 000 €
      // Tranche 1 (15%) : 42 500 * 0.15 = 6 375 €
      // Tranche 2 (25%) : 17 500 * 0.25 = 4 375 €
      // Total IS = 10 750 €
      const simPme = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        dossierA.id,
        {
          simulationType: "INCOME_OR_CORPORATE_TAX",
          taxableProfitMinor: 6000000,
          taxRegimeType: "IS_PME",
        }
      );

      assert.equal(simPme.resultData?.totalTaxEstimatedMinor, 1075000); // 10 750,00 €
      assert.equal(simPme.resultData?.effectiveRateBps, 1792); // ~17.92%

      // Cas 2 : Entreprise non éligible au taux réduit (taux plein 25% sur 60 000 €)
      // 60 000 * 0.25 = 15 000 €
      const simNormal = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        dossierA.id,
        {
          simulationType: "INCOME_OR_CORPORATE_TAX",
          taxableProfitMinor: 6000000,
          taxRegimeType: "IS_NORMAL",
        }
      );

      assert.equal(simNormal.resultData?.totalTaxEstimatedMinor, 1500000);
      assert.equal(simNormal.resultData?.effectiveRateBps, 2500);
    });

    it("1.4 Simulation EXPENSE_IMPACT : impact HT, TVA récupérable, économie IS et trésorerie", () => {
      // Achat de 1 000 € HT avec TVA 20% (200 €) et IS 25%
      // Économie IS = 1 000 * 0.25 = 250 €
      // TVA récupérée = 200 €
      // Sortie brute TTC = 1 200 €
      // Coût réel net de trésorerie = 1 200 - 200 - 250 = 750 € (Dépense HT * (1 - Taux IS))
      const simExp = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        dossierA.id,
        {
          simulationType: "EXPENSE_IMPACT",
          expenseNetMinor: 100000,
          expenseVatRateBps: 2000,
          isDeductibleVat: true,
          corporateTaxRateBps: 2500,
        }
      );

      assert.equal(simExp.resultData?.vatAmountMinor, 20000);
      assert.equal(simExp.resultData?.grossAmountMinor, 120000);
      assert.equal(simExp.resultData?.taxSavingsEstimatedMinor, 25000);
      assert.equal(simExp.resultData?.netCashflowCostMinor, 75000);
    });

    it("1.5 Persistance et consultation dans simulations_history", () => {
      const history = simulationService.listSimulations(firmAdmin, orgAId, dossierA.id);
      assert.ok(history.length >= 4);

      const first = history[0]!;
      const byId = simulationService.getSimulationDetails(firmAdmin, orgAId, dossierA.id, first.id);

      assert.equal(byId.id, first.id);
      assert.equal(byId.dossierId, dossierA.id);
      assert.ok(byId.resultData);
      assert.ok(byId.inputParameters);
    });

    it("1.6 Reproductibilité absolue : deux simulations identiques donnent des résultats identiques", () => {
      const input = {
        simulationType: "INCOME_OR_CORPORATE_TAX" as const,
        taxableProfitMinor: 8500000,
        taxRegimeType: "IS_PME" as const,
      };

      const sim1 = simulationService.createSimulation(firmAdmin, orgAId, dossierA.id, input);
      const sim2 = simulationService.createSimulation(firmAdmin, orgAId, dossierA.id, input);

      assert.deepEqual(sim1.resultData, sim2.resultData);
      assert.equal(sim1.ruleVersionId, sim2.ruleVersionId);
    });

    it("1.7 Blocage sur juridiction ou version de règles non vérifiée (BLOCKED_MISSING_OR_UNVERIFIED_RULES)", () => {
      // Dossier configuré sur une version de règles non validée pour la production
      const customDossierId = "dossier-unverified-rules";
      db.prepare(`
        INSERT INTO client_dossiers (
          id, organization_id, name, code, country_code, tax_jurisdiction_code,
          tax_residence_country_code, country_config_version_id, currency,
          currency_minor_unit_exponent, tax_regime_code, is_active, created_at, updated_at
        ) VALUES (
          ?, ?, 'Dossier Non Vérifié', 'DOS-UNVERIFIED', 'TN', 'TN',
          'TN', 'TN-2026.0-DRAFT', 'TND',
          3, 'REAL_NORMAL_MONTHLY', 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
        )
      `).run(customDossierId, orgAId);

      const blockedSim = simulationService.createSimulation(
        firmAdmin,
        orgAId,
        customDossierId,
        {
          simulationType: "VAT_SUMMARY",
          revenueNetMinor: 10000,
          expensesNetMinor: 5000,
        }
      );

      assert.equal(blockedSim.status, "BLOCKED_MISSING_OR_UNVERIFIED_RULES");
      assert.ok(blockedSim.limitations.some((l: string) => l.includes("validée") || l.includes("bloqué")));
    });

    it("1.8 Validation stricte : rejet des montants invalides et non safe integers", () => {
      assert.throws(() => {
        simulationService.createSimulation(
          firmAdmin,
          orgAId,
          dossierA.id,
          {
            simulationType: "VAT_SUMMARY",
            revenueNetMinor: -500,
          }
        );
      }, /positif/);

      assert.throws(() => {
        simulationService.createSimulation(
          firmAdmin,
          orgAId,
          dossierA.id,
          {
            simulationType: "INCOME_OR_CORPORATE_TAX",
            taxableProfitMinor: Number.MAX_SAFE_INTEGER + 10,
          }
        );
      }, /entier/);
    });
  });

  // =========================================================================
  // 2. MODULE 9 : EXPORTS SÉCURISÉS CSV ANTI-INJECTION (§21)
  // =========================================================================
  describe("2. Exports Sécurisés CSV Anti-Injection (Module 9)", () => {
    it("2.1 Neutralisation stricte des cellules tableur (CSV Injection / DDE)", () => {
      // 1. Formules directes avec signe =, +, @
      assert.equal(sanitizeCsvCell("=SUM(A1:A10)"), "'=SUM(A1:A10)");
      assert.equal(sanitizeCsvCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
      assert.equal(sanitizeCsvCell("@SUM(1,2)"), `"'@SUM(1,2)"`);

      // 2. Espaces et blancs précédant les caractères déclencheurs (=, +, @, -)
      assert.equal(sanitizeCsvCell("   =SUM(A1:A10)"), "'   =SUM(A1:A10)");
      assert.equal(sanitizeCsvCell("  +1234"), "'  +1234");
      assert.equal(sanitizeCsvCell("   @IMPORT(URL)"), "'   @IMPORT(URL)");
      assert.equal(sanitizeCsvCell("   -calc"), "'   -calc");

      // 3. Tabulations, retours à la ligne et combinaisons de caractères de contrôle
      assert.equal(sanitizeCsvCell("\t=1+1"), `"'\t=1+1"`);
      assert.equal(sanitizeCsvCell("\r=CMD"), `"'\r=CMD"`);
      assert.equal(sanitizeCsvCell(" \t +SUM(1,2)"), `"' \t +SUM(1,2)"`);
      assert.equal(sanitizeCsvCell("\r\n@EVIL"), `"'\r\n@EVIL"`);
      assert.equal(sanitizeCsvCell("\t"), `"'\t"`);
      assert.equal(sanitizeCsvCell("\r"), `"'\r"`);

      // 4. Montants négatifs numériques légitimes et vérifiés : PRÉSERVÉS SANS APOSTROPHE
      // A. Type number direct
      assert.equal(sanitizeCsvCell(-120.50), "-120.5");
      assert.equal(sanitizeCsvCell(-49), "-49");
      // B. Chaîne explicitement déclarée et validée numérique (isNumeric: true)
      assert.equal(sanitizeCsvCell("-120.50", { isNumeric: true }), "-120.50");
      assert.equal(sanitizeCsvCell("-49.00", { isNumeric: true }), "-49.00");
      assert.equal(sanitizeCsvCell("-1500", { isNumeric: true }), "-1500");
      assert.equal(sanitizeCsvCell({ value: "-120.50", isNumeric: true }), "-120.50");

      // 5. Chaînes textuelles non fiables (libellés, tiers, codes) commençant par '-' : SYSTEMATIQUEMENT NEUTRALISÉES
      // Sans l'option isNumeric, aucun texte n'est exempté
      assert.equal(sanitizeCsvCell("-120.50"), "'-120.50");
      assert.equal(sanitizeCsvCell("   -120.50"), "'   -120.50");
      assert.equal(sanitizeCsvCell("-Avoir client 2026"), "'-Avoir client 2026");
      assert.equal(sanitizeCsvCell("-cmd|' /C calc'!A0"), "'-cmd|' /C calc'!A0");
      // Valeur revendiquée isNumeric mais contenant du texte suspect : rejet de l'exemption et neutralisation
      assert.equal(sanitizeCsvCell("-120.50; DROP TABLE", { isNumeric: true }), `"'-120.50; DROP TABLE"`);

      // 6. Échappement RFC 4180 : guillemets doubles et sauts de ligne
      assert.equal(sanitizeCsvCell('Bonjour "Monde"'), '"Bonjour ""Monde"""');
      assert.equal(sanitizeCsvCell("Ligne1\nLigne2"), '"Ligne1\nLigne2"');
    });

    it("2.2 Génération des 5 types d'exports CSV avec BOM UTF-8 et délimiteur paramétrable", () => {
      // Invoices
      const expInv = exportService.exportInvoicesCsv(firmAdmin, orgAId, dossierA.id, { delimiter: "," });
      assert.ok(expInv.content.startsWith("\uFEFF"));
      assert.ok(expInv.filename.endsWith(".csv"));

      // Bank
      const expBank = exportService.exportBankTransactionsCsv(firmAdmin, orgAId, dossierA.id, { delimiter: ";" });
      assert.ok(expBank.content.startsWith("\uFEFF"));
      assert.ok(expBank.content.includes(";"));

      // Entries
      const expEntries = exportService.exportAccountingEntriesCsv(firmAdmin, orgAId, dossierA.id, { delimiter: "," });
      assert.ok(expEntries.content.startsWith("\uFEFF"));

      // Anomalies
      const expAno = exportService.exportAnomaliesCsv(firmAdmin, orgAId, dossierA.id, { delimiter: "," });
      assert.ok(expAno.content.startsWith("\uFEFF"));

      // Audit
      const expAudit = exportService.exportAuditLogsCsv(firmAdmin, orgAId, dossierA.id, { delimiter: ";" });
      assert.ok(expAudit.content.startsWith("\uFEFF"));
    });

    it("2.3 Contrôle RBAC : Interdiction d'exporter si can_export = 0", () => {
      const collabUser = authenticateUser(
        "collab@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "test-runner",
        db
      ).context;

      assignUserToDossier({
        session: firmAdmin,
        organizationId: orgAId,
        dossierId: dossierA.id,
        targetUserId: collabUser.user.id,
        canView: true,
        canUpload: true,
        canEditExtraction: true,
        canValidateAccounting: false,
        canExport: false,
        db,
      });

      assert.throws(() => {
        exportService.exportInvoicesCsv(collabUser, orgAId, dossierA.id);
      }, AuthorizationError);
    });

    it("2.4 Étanchéité multi-tenant sur les exports", () => {
      assert.throws(() => {
        exportService.exportInvoicesCsv(firmAdmin, orgBId, dossierB.id);
      }, AuthorizationError);
    });
  });

  // =========================================================================
  // 3. MODULE 9 : EXPORT FEC PRÉLIMINAIRE (ART. A.47 A-1 LPF)
  // =========================================================================
  describe("3. Export FEC Préliminaire (Module 9)", () => {
    it("3.1 Respect des 18 colonnes officielles séparées par tabulation et dates YYYYMMDD", () => {
      // Créer et valider des écritures pour s'assurer d'avoir des données
      const entry1 = createAccountingEntry({
        session: firmAdmin,
        organizationId: orgAId,
        dossierId: dossierA.id,
        journalCode: "VE",
        entryDate: "2026-03-15",
        pieceNumber: "FAC-TEST-FEC",
        label: "Vente Client Test FEC",
        status: "DRAFT",
        currency: "EUR",
        lines: [
          { lineNumber: 1, generalAccountCode: "411000", label: "Client Test FEC", debitMinor: 120000, creditMinor: 0 },
          { lineNumber: 2, generalAccountCode: "707000", label: "Vente de marchandises", debitMinor: 0, creditMinor: 100000 },
          { lineNumber: 3, generalAccountCode: "445710", label: "TVA collectée 20%", debitMinor: 0, creditMinor: 20000 },
        ],
        db,
      });

      validateAccountingEntry({
        session: firmAdmin,
        organizationId: orgAId,
        dossierId: dossierA.id,
        entryId: entry1.id,
        db,
      });

      const fec = exportService.exportFecTxt(firmAdmin, orgAId, dossierA.id, {
        endDate: "2026-12-31",
        decimalSeparator: ",",
      });

      assert.ok(fec.rowCount >= 3);
      assert.ok(fec.disclaimer?.includes("Export FEC préliminaire (génération technique)"));

      const lines = fec.content.trim().split("\r\n");
      const header = lines[0]!;
      const headerCols = header.split("\t");

      assert.equal(headerCols.length, 18, "L'en-tête FEC doit comporter exactement 18 colonnes");
      assert.equal(headerCols[0], "JournalCode");
      assert.equal(headerCols[3], "EcritureDate");
      assert.equal(headerCols[11], "Debit");
      assert.equal(headerCols[12], "Credit");

      // Vérifier les lignes de données
      const dataRow = lines[1]!.split("\t");
      assert.equal(dataRow.length, 18, "Chaque ligne FEC doit comporter exactement 18 colonnes");
      // Format date YYYYMMDD
      assert.match(dataRow[3]!, /^\d{8}$/);
      // Format décimal virgule
      assert.ok(dataRow[11]!.includes(",") || dataRow[11] === "0,00");
    });

    it("3.2 Exclusion stricte des écritures brouillon (DRAFT)", () => {
      // Créer une écriture brouillon
      createAccountingEntry({
        session: firmAdmin,
        organizationId: orgAId,
        dossierId: dossierA.id,
        journalCode: "OD",
        entryDate: "2026-03-20",
        pieceNumber: "DRAFT-EXCLUDED",
        label: "Brouillon OD non validé",
        status: "DRAFT",
        currency: "EUR",
        lines: [
          { lineNumber: 1, generalAccountCode: "606400", label: "Fournitures", debitMinor: 5000, creditMinor: 0 },
          { lineNumber: 2, generalAccountCode: "401000", label: "Fournisseur", debitMinor: 0, creditMinor: 5000 },
        ],
        db,
      });

      const fec = exportService.exportFecTxt(firmAdmin, orgAId, dossierA.id, {
        endDate: "2026-12-31",
        decimalSeparator: ".",
      });

      assert.ok(!fec.content.includes("DRAFT-EXCLUDED"), "Une écriture brouillon ne doit jamais être incluse dans le FEC");
    });

    it("3.3 Vérification approfondie du FEC : nommage DGFiP (SIREN/SIRET), 18 colonnes strictes, nettoyage tabulations/CRLF et filtres par période", () => {
      // 1. Mise à jour du SIRET du dossier (14 chiffres) pour tester l'extraction du SIREN (9 chiffres)
      db.prepare(`UPDATE client_dossiers SET legal_registration_number = '88899911100012' WHERE id = ?`).run(dossierA.id);

      // 2. Création d'une écriture validée en juin 2026 avec libellé contenant tabulations et retours à la ligne
      const entryTricky = createAccountingEntry({
        session: firmAdmin,
        organizationId: orgAId,
        dossierId: dossierA.id,
        journalCode: "AC",
        entryDate: "2026-06-15",
        pieceNumber: "AC-2026-0042",
        label: "Achat spécial\tFournitures\r\nBureautique",
        status: "DRAFT",
        currency: "EUR",
        lines: [
          { lineNumber: 1, generalAccountCode: "606400", label: "Ligne 1\tavec tab\net saut", debitMinor: 50000, creditMinor: 0 },
          { lineNumber: 2, generalAccountCode: "401000", label: "Fournisseur Test", debitMinor: 0, creditMinor: 50000 },
        ],
        db,
      });

      validateAccountingEntry({
        session: firmAdmin,
        organizationId: orgAId,
        dossierId: dossierA.id,
        entryId: entryTricky.id,
        db,
      });

      // 3. Export filtré sur juin 2026
      const fecJune = exportService.exportFecTxt(firmAdmin, orgAId, dossierA.id, {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        decimalSeparator: ",",
      });

      // Nommage conforme art. A.47 A-1 VII LPF : 9 chiffres SIREN + FEC + AAAAMMJJ
      assert.equal(fecJune.filename, "888999111FEC20260630.txt", "Le nom du fichier FEC doit extraire le SIREN à 9 chiffres du SIRET");

      const lines = fecJune.content.split("\r\n").filter((l) => l.length > 0);
      assert.ok(lines.length >= 3, "Le FEC filtré doit contenir l'en-tête et les 2 lignes d'écriture");

      // Vérifier chaque ligne : AUCUNE rupture de colonnes malgré les tabulations/sauts de ligne dans le libellé
      for (let i = 0; i < lines.length; i++) {
        const cols = lines[i]!.split("\t");
        assert.equal(cols.length, 18, `La ligne ${i} du FEC doit comporter rigoureusement 18 colonnes`);
      }

      // Vérifier que l'écriture de mars 2026 (entry1) est bien exclue par le filtre de période
      assert.ok(!fecJune.content.includes("FAC-TEST-FEC"), "Le filtre par date doit exclure les écritures hors période");
    });
  });

  // =========================================================================
  // 4. API REST : ENDPOINTS MODULES 7 & 9
  // =========================================================================
  describe("4. Routes API REST (Modules 7 & 9)", () => {
    it("4.1 Exécution API des simulations et téléchargement des exports", async () => {
      resetRateLimitBucketsForTests();
      const server = createAppServer(db);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const address = server.address() as any;
      const origin = `http://127.0.0.1:${address.port}`;

      try {
        // Authentification API
        const loginPayload = JSON.stringify({
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
        });

        const loginRes = await new Promise<{ status: number; token: string }>((resolve) => {
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
                const data = JSON.parse(body);
                resolve({ status: res.statusCode || 0, token: data.token });
              });
            }
          );
          req.write(loginPayload);
          req.end();
        });

        assert.equal(loginRes.status, 200);
        const token = loginRes.token;

        // 4.2 POST /api/.../simulations
        const simPayload = JSON.stringify({
          simulationType: "VAT_SUMMARY",
          parameters: { revenueNetMinor: 1200000, expensesNetMinor: 400000, vatRateBps: 2000 },
        });

        const postSimRes = await new Promise<{ status: number; data: any }>((resolve) => {
          const req = http.request(
            `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/simulations`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(simPayload),
              },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
            }
          );
          req.write(simPayload);
          req.end();
        });

        assert.equal(postSimRes.status, 201);
        assert.equal(postSimRes.data.simulation.status, "COMPUTED_INDICATIVE");
        assert.equal(postSimRes.data.simulation.resultData.netVatPayableMinor, 160000);

        // 4.3 GET /api/.../simulations
        const getSimsRes = await new Promise<{ status: number; data: any }>((resolve) => {
          const req = http.request(
            `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/simulations`,
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

        assert.equal(getSimsRes.status, 200);
        assert.ok(Array.isArray(getSimsRes.data.simulations));

        // 4.4 GET /api/.../exports/csv/invoices
        const csvRes = await new Promise<{ status: number; headers: any; body: string }>((resolve) => {
          const req = http.request(
            `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/exports/csv/invoices?delimiter=%2C`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${token}` },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
            }
          );
          req.end();
        });

        assert.equal(csvRes.status, 200);
        assert.ok(csvRes.headers["content-type"].includes("text/csv"));
        assert.ok(csvRes.headers["content-disposition"].includes("attachment; filename="));
        assert.ok(csvRes.body.startsWith("\uFEFF"));

        // 4.5 GET /api/.../exports/fec
        const fecRes = await new Promise<{ status: number; headers: any; body: string }>((resolve) => {
          const req = http.request(
            `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/exports/fec?decimalSeparator=%2C`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${token}` },
            },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
            }
          );
          req.end();
        });

        assert.equal(fecRes.status, 200);
        assert.ok(fecRes.headers["content-type"].includes("text/plain"));
        assert.ok(fecRes.headers["content-disposition"].includes("FEC"));
        assert.ok(fecRes.body.includes("JournalCode\tJournalLib"));
      } finally {
        server.close();
      }
    });
  });

  // =========================================================================
  // 5. TEST FONCTIONNEL SUR POSTGRESQL 16 LOCAL
  // =========================================================================
  describe("5. Validation d'intégrité sur PostgreSQL 16 local", () => {
    it("5.1 Persistance et contraintes de simulations_history sur PostgreSQL 16", () => {
      const testSchema = `test_lot1_7_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
          'org-pg-lot1-7', 'Cabinet Test Lot 1.7 PG', 'cabinet-test-lot1-7-pg', 'ACCOUNTING_FIRM',
          'FR', 'FR', 'EUR', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
        );

        INSERT INTO users (
          id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at
        ) VALUES (
          'user-pg-lot1-7', 'expert@mod7-pg.fr', 'Expert PG Mod7', 'scrypt$test', 0, 1,
          '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
        );

        INSERT INTO client_dossiers (
          id, organization_id, name, code, country_code, tax_jurisdiction_code,
          tax_residence_country_code, country_config_version_id, currency,
          currency_minor_unit_exponent, tax_regime_code,
          fiscal_year_start_month, is_active, created_at, updated_at
        ) VALUES (
          'dossier-pg-lot1-7', 'org-pg-lot1-7', 'SAS Lot 1.7 PG', 'DOS-PG-007', 'FR', 'FR',
          'FR', 'FR-PCG-2026.1', 'EUR',
          2, 'REAL_NORMAL_MONTHLY',
          1, 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
        );

        -- Insertion d'une simulation versionnée
        INSERT INTO simulations_history (
          id, organization_id, dossier_id, simulation_type, rule_version_id,
          input_params_json, result_json, assumptions_json, limitations_json,
          disclaimer_text, created_by_user_id, created_at
        ) VALUES (
          'sim-pg-1', 'org-pg-lot1-7', 'dossier-pg-lot1-7', 'VAT_SUMMARY', 'FR-PCG-2026.1',
          '{"revenueNetMinor": 1000000, "expensesNetMinor": 400000}',
          '{"collectedVatMinor": 200000, "deductibleVatMinor": 80000, "netVatDueMinor": 120000}',
          '["Hypothese PG"]', '["Limite PG"]',
          'Estimation a titre informatif uniquement',
          'user-pg-lot1-7', '2026-10-18T00:00:00Z'
        );

        SELECT id, simulation_type, rule_version_id FROM simulations_history WHERE id = 'sim-pg-1';

        DROP SCHEMA ${testSchema} CASCADE;
      `;

      const pgResult = execFileSync(
        "psql",
        ["-U", "postgres", "-h", "/tmp", "-v", "ON_ERROR_STOP=1"],
        { input: sqlScript, encoding: "utf8" }
      );

      assert.ok(pgResult.includes("sim-pg-1"));
      assert.ok(pgResult.includes("VAT_SUMMARY"));
    });
  });

  // =========================================================================
  // 6. GRAND PARCOURS E2E INTÉGRÉ EN 17 ÉTAPES (§36)
  // =========================================================================
  describe("6. Grand Parcours E2E Intégré en 17 Étapes (§36)", () => {
    it("Exécution séquentielle et sans faille du parcours de bout en bout", async () => {
      // -----------------------------------------------------------------------
      // ÉTAPE 1 : Authentification de l'utilisateur
      // -----------------------------------------------------------------------
      const authResult = authenticateUser(
        "expert@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "test-runner-e2e",
        db
      );
      assert.ok(authResult.rawToken, "Étape 1 : Le jeton de session brut doit être généré");
      const e2eSession = authResult.context;

      // -----------------------------------------------------------------------
      // ÉTAPE 2 : Sélection du dossier et vérification du référentiel comptable
      // -----------------------------------------------------------------------
      const dossier = dossierA;
      const refInit = initializeDossierAccountingReferential({
        organizationId: orgAId,
        dossierId: dossier.id,
        db,
      });
      assert.ok(refInit.totalAccountsCount >= 20, "Étape 2 : Le plan de comptes PCG doit être actif");
      assert.ok(refInit.totalJournalsCount >= 5, "Étape 2 : Les journaux (VE, AC, BQ, OD, AN) doivent être présents");

      // -----------------------------------------------------------------------
      // ÉTAPE 3 : Dépôt d'une pièce justificative (justificatif d'achat)
      // -----------------------------------------------------------------------
      const ingestion = await ingestDocumentIntoDossier({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        originalFilename: "facture_fournisseur_serveur.pdf",
        mimeType: "application/pdf",
        contentBuffer: Buffer.from("%PDF-1.4 Mock Invoice Content"),
        db,
      });
      const createdDoc = ingestion.document;
      assert.equal(createdDoc.workflowStatus, "PENDING_REVIEW", "Étape 3 : La pièce justificative doit être enregistrée");

      // -----------------------------------------------------------------------
      // ÉTAPE 4 : Extraction et validation humaine des données de la pièce
      // -----------------------------------------------------------------------
      updateDocumentExtraction({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        documentId: createdDoc.id,
        fields: {
          issuerName: "Fournisseur Hébergement Cloud SAS",
          invoiceNumber: "FC-CLOUD-2026-99",
          netAmountMinor: 100000,
          vatAmountMinor: 20000,
          grossAmountMinor: 120000,
        },
        db,
      });

      const validatedDoc = validateDocument({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        documentId: createdDoc.id,
        db,
      });
      assert.equal(validatedDoc.workflowStatus, "VALIDATED", "Étape 4 : La pièce doit être validée par l'humain");

      // -----------------------------------------------------------------------
      // ÉTAPE 5 : Création d'un devis de vente
      // -----------------------------------------------------------------------
      const createdQuote = createQuote({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        thirdPartyName: "Client Grand Compte E2E SAS",
        issueDate: "2026-03-05",
        validityDate: "2026-04-05",
        lines: [
          { description: "Prestation Audit & Conseil", quantityMinor: 100, unitPriceNetMinor: 300000, vatRateBps: 2000 },
        ],
        db,
      });
      assert.equal(createdQuote.quoteStatus, "DRAFT", "Étape 5 : Le devis doit être initialement en brouillon");
      assert.equal(createdQuote.totalNetMinor, 300000);
      assert.equal(createdQuote.totalVatMinor, 60000);
      assert.equal(createdQuote.totalGrossMinor, 360000);

      // -----------------------------------------------------------------------
      // ÉTAPE 6 : Acceptation du devis par le client
      // -----------------------------------------------------------------------
      db.prepare("UPDATE quotes SET quote_status = 'ACCEPTED' WHERE id = ?").run(createdQuote.id);
      const acceptedQuote = db.prepare("SELECT quote_status FROM quotes WHERE id = ?").get(createdQuote.id) as any;
      assert.equal(acceptedQuote.quote_status, "ACCEPTED", "Étape 6 : Le devis doit passer à ACCEPTED");

      // -----------------------------------------------------------------------
      // ÉTAPE 7 : Transformation contrôlée du devis en facture de vente
      // -----------------------------------------------------------------------
      const convertedInvoice = convertQuoteToInvoice({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        quoteId: createdQuote.id,
        db,
      });
      assert.ok(convertedInvoice.id);
      assert.equal(convertedInvoice.originQuoteId, createdQuote.id);
      assert.equal(convertedInvoice.invoiceStatus, "DRAFT");

      // -----------------------------------------------------------------------
      // ÉTAPE 8 : Finalisation irréversible de la facture avec séquence continue
      // -----------------------------------------------------------------------
      const finalized = finalizeSalesInvoice({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        invoiceId: convertedInvoice.id,
        db,
      });
      assert.equal(finalized.invoiceStatus, "FINALIZED", "Étape 8 : La facture doit être FINALIZED");
      assert.match(finalized.invoiceNumber, /^FAC-2026-\d{4}$/, "Étape 8 : Le numéro doit suivre le séquenceur continu");

      // -----------------------------------------------------------------------
      // ÉTAPE 9 : Émission d'un avoir partiel rattaché à la facture
      // -----------------------------------------------------------------------
      const creditNote = createCreditNoteForInvoice({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        invoiceId: finalized.id,
        reason: "Remise commerciale exceptionnelle négociée post-prestation",
        partialGrossAmountMinor: 60000,
        db,
      });
      assert.equal(creditNote.creditNote.invoiceStatus, "FINALIZED", "Étape 9 : L'avoir doit être finalisé");
      assert.equal(creditNote.creditNote.grossAmountMinor, -60000); // Avoir = -600 € TTC
      assert.equal(finalized.grossAmountMinor + creditNote.creditNote.grossAmountMinor, 300000, "Étape 9 : Le reste dû doit être déduit exactement (3 600 € - 600 € = 3 000 €)");

      // -----------------------------------------------------------------------
      // ÉTAPE 10 : Importation d'un relevé bancaire CSV et déduplication
      // -----------------------------------------------------------------------
      const bankCsv = `Date,Libelle,Montant,Reference\n2026-03-25,Reglement Client E2E,3000.00,VIR-CLI-E2E-3000`;
      const bankBatch = importBankStatement({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        importType: "BANK_STATEMENT_CSV",
        filename: "releve_e2e.csv",
        fileBuffer: Buffer.from(bankCsv),
        db,
      });
      assert.equal(bankBatch.validRows, 1, "Étape 10 : Une ligne bancaire doit être importée avec succès");

      const bankTxs = listBankTransactions({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        db,
      });
      const paymentTx = bankTxs.transactions.find((tx) => tx.amountMinor === 300000)!;
      assert.ok(paymentTx, "Étape 10 : La ligne bancaire de 3 000 € doit être présente");

      // -----------------------------------------------------------------------
      // ÉTAPE 11 : Rapprochement bancaire manuel ou assisté
      // -----------------------------------------------------------------------
      const recResult = reconcileBankTransaction({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        transactionId: paymentTx.id,
        invoiceId: finalized.id,
        allocatedAmountMinor: 300000,
        db,
      });
      assert.equal(recResult.transactionStatus, "RECONCILED", "Étape 11 : La transaction doit être réconciliée");
      assert.equal(recResult.invoicePaymentStatus, "PARTIALLY_PAID", "Étape 11 : Le règlement bancaire partiel (3 000 € sur 3 600 € initiaux) passe la facture à PARTIALLY_PAID");

      // -----------------------------------------------------------------------
      // ÉTAPE 12 : Saisie manuelle d'une écriture comptable en brouillon
      // -----------------------------------------------------------------------
      const draftEntry = createAccountingEntry({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        journalCode: "BQ",
        entryDate: "2026-03-25",
        pieceNumber: "VIR-CLI-E2E-3000",
        label: "Encaissement Facture Client E2E",
        status: "DRAFT",
        currency: "EUR",
        lines: [
          { lineNumber: 1, generalAccountCode: "512000", label: "Banque BNP", debitMinor: 300000, creditMinor: 0 },
          { lineNumber: 2, generalAccountCode: "411000", label: "Client E2E", debitMinor: 0, creditMinor: 300000 },
        ],
        db,
      });
      assert.equal(draftEntry.status, "DRAFT", "Étape 12 : L'écriture doit être en brouillon");

      // -----------------------------------------------------------------------
      // ÉTAPE 13 : Contrôle de l'équilibre Débit/Crédit et validation irréversible
      // -----------------------------------------------------------------------
      const validatedEntry = validateAccountingEntry({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        entryId: draftEntry.id,
        db,
      });
      assert.equal(validatedEntry.status, "VALIDATED", "Étape 13 : L'écriture équilibrée doit être validée");

      // -----------------------------------------------------------------------
      // ÉTAPE 14 : Scan déterministe des anomalies comptables (10 règles)
      // -----------------------------------------------------------------------
      const scan = scanDossierAnomalies({
        session: e2eSession,
        organizationId: orgAId,
        dossierId: dossier.id,
        db,
      });
      assert.equal(scan.scannedRulesCount, 10, "Étape 14 : Les 10 règles doivent être analysées");

      // -----------------------------------------------------------------------
      // ÉTAPE 15 : Traitement et clôture tracée d'une anomalie avec justification
      // -----------------------------------------------------------------------
      if (scan.totalOpenAnomalies > 0) {
        const anoToResolve = scan.anomalies[0]!;
        const resolvedAno = resolveDossierAnomaly({
          session: e2eSession,
          organizationId: orgAId,
          dossierId: dossier.id,
          anomalyId: anoToResolve.id,
          resolutionStatus: "DISMISSED_WITH_JUSTIFICATION",
          resolutionJustification: "Faux positif contrôlé avec succès dans le cadre de la recette E2E",
          db,
        });
        assert.equal(resolvedAno.status, "DISMISSED_WITH_JUSTIFICATION", "Étape 15 : L'anomalie doit être classée");
      }

      // -----------------------------------------------------------------------
      // ÉTAPE 16 : Exécution et archivage d'une simulation indicative versionnée
      // -----------------------------------------------------------------------
      const sim = simulationService.createSimulation(
        e2eSession,
        orgAId,
        dossier.id,
        {
          simulationType: "INCOME_OR_CORPORATE_TAX",
          taxableProfitMinor: 5000000, // 50 000 €
          taxRegimeType: "IS_PME",
        }
      );
      assert.equal(sim.status, "COMPUTED_INDICATIVE", "Étape 16 : La simulation doit aboutir");
      assert.ok(Number(sim.resultData?.totalTaxEstimatedMinor) > 0);
      assert.ok(sim.disclaimerText.length > 20);

      // -----------------------------------------------------------------------
      // ÉTAPE 17 : Génération et téléchargement des exports sécurisés (CSV & FEC)
      // -----------------------------------------------------------------------
      const csvExport = exportService.exportInvoicesCsv(e2eSession, orgAId, dossier.id, { delimiter: ";" });
      assert.ok(csvExport.content.startsWith("\uFEFF"), "Étape 17 : L'export CSV doit avoir le BOM UTF-8");
      assert.ok(csvExport.content.includes("FAC-2026-"), "Étape 17 : La facture finalisée doit figurer dans le CSV");

      const fecExport = exportService.exportFecTxt(e2eSession, orgAId, dossier.id, {
        endDate: "2026-12-31",
        decimalSeparator: ",",
      });
      assert.ok(fecExport.rowCount >= 1, "Étape 17 : Le FEC préliminaire doit comporter des lignes");
      assert.ok(fecExport.content.includes("BQ\t"), "Étape 17 : L'écriture validée dans le journal BQ doit figurer dans le FEC");
    });
  });
});
