import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import { authenticateUser, AuthorizationError } from "../auth/auth-service.js";
import { listDossiersForOrganization, createClientDossier } from "../services/tenant-service.js";
import {
  createSalesInvoice,
  finalizeSalesInvoice,
  createCreditNoteForInvoice,
  recordInvoicePayment,
  createQuote,
  convertQuoteToInvoice,
} from "../services/invoicing-service.js";
import {
  getDossierDashboardMetrics,
  getFirmDashboardMetrics,
  resolvePeriodDates,
} from "../services/dashboard-service.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.4 : Module 2 — Tableaux de Bord et Indicateurs de Pilotage", () => {
  // Préparation de la base de test isolée
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

  let inv1Id = "";

  it("1. Résolution stricte et déterministe des filtres de période temporelle", () => {
    // 1.1 ALL
    const pAll = resolvePeriodDates({ periodType: "ALL" });
    assert.equal(pAll.startDate, "1970-01-01");
    assert.equal(pAll.endDate, "2099-12-31");

    // 1.2 FISCAL_YEAR
    const pFy = resolvePeriodDates({ periodType: "FISCAL_YEAR", year: 2026 });
    assert.equal(pFy.startDate, "2026-01-01");
    assert.equal(pFy.endDate, "2026-12-31");

    // 1.3 QUARTER
    const pQ = resolvePeriodDates({ periodType: "QUARTER", year: 2026, quarter: 1 });
    assert.equal(pQ.startDate, "2026-01-01");
    assert.equal(pQ.endDate, "2026-03-31");

    // 1.4 MONTH
    const pM = resolvePeriodDates({ periodType: "MONTH", year: 2026, month: 2 });
    assert.equal(pM.startDate, "2026-02-01");
    assert.equal(pM.endDate, "2026-02-28");

    // 1.5 CUSTOM
    const pCustom = resolvePeriodDates({ periodType: "CUSTOM", startDate: "2026-03-01", endDate: "2026-03-31" });
    assert.equal(pCustom.startDate, "2026-03-01");
    assert.equal(pCustom.endDate, "2026-03-31");
  });

  it("2. Calcul 100% exact du Chiffre d'Affaires HT, TVA collectée, règlements et créances restantes", () => {
    // Création d'une première facture de vente finalisée (1 000 € HT + 20% TVA = 1 200 € TTC)
    const inv1 = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client Dashboard Test SAS",
      issueDate: "2026-02-15",
      dueDate: "2026-12-31",
      lines: [
        {
          description: "Prestation de conseil stratégique",
          quantityMinor: 100,
          unitPriceNetMinor: 100000,
          vatRateBps: 2000,
        },
      ],
      db,
    });
    inv1Id = inv1.id;
    const finalized1 = finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: inv1.id,
      db,
    });
    assert.equal(finalized1.grossAmountMinor, 120000);

    // Règlement partiel de 400 € sur cette facture
    recordInvoicePayment({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: inv1.id,
      paymentDate: "2026-02-20",
      amountMinor: 40000,
      paymentMethod: "BANK_TRANSFER",
      db,
    });

    // Création d'une deuxième facture de vente finalisée échue (500 € HT + 20% TVA = 600 € TTC, échéance 2026-01-10)
    const inv2 = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client En Retard SARL",
      issueDate: "2026-01-01",
      dueDate: "2026-01-10",
      lines: [
        {
          description: "Audit technique de rentrée",
          quantityMinor: 100,
          unitPriceNetMinor: 50000,
          vatRateBps: 2000,
        },
      ],
      db,
    });
    finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: inv2.id,
      db,
    });

    // Calcul des métriques pour l'exercice
    const metrics = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    // CA HT = 1 000 € + 500 € = 1 500 € = 150 000 minor
    assert.equal(metrics.sales.turnoverNetMinor, 150000);
    // TVA collectée = 200 € + 100 € = 300 € = 30 000 minor
    assert.equal(metrics.sales.vatCollectedMinor, 30000);
    // CA TTC = 1 200 € + 600 € = 1 800 € = 180 000 minor
    assert.equal(metrics.sales.turnoverGrossMinor, 180000);
    // Règlements encaissés = 400 € = 40 000 minor
    assert.equal(metrics.sales.paidAmountMinor, 40000);
    // Reste dû = 1 800 € - 400 € = 1 400 € = 140 000 minor
    assert.equal(metrics.sales.remainingDueMinor, 140000);
    // Factures échues = inv2 (600 € non payée, échue au 2026-01-10)
    assert.equal(metrics.sales.overdueInvoicesCount, 1);
    assert.equal(metrics.sales.overdueAmountMinor, 60000);
    assert.equal(metrics.sales.invoicesCount, 2);
  });

  it("3. Prise en compte rigoureuse des avoirs : avoir total et avoir partiel", () => {
    // 3.1 Création d'une 3ème facture de 800 € HT + 20% TVA = 960 € TTC
    const inv3 = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client Avoir Test",
      issueDate: "2026-03-01",
      dueDate: "2026-03-31",
      lines: [
        {
          description: "Mission de cadrage",
          quantityMinor: 100,
          unitPriceNetMinor: 80000,
          vatRateBps: 2000,
        },
      ],
      db,
    });
    finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: inv3.id,
      db,
    });

    // Émission d'un avoir partiel de 240 € TTC (200 € HT + 40 € TVA)
    const partialCredit = createCreditNoteForInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: inv3.id,
      reason: "Geste commercial sur dépassement de délai",
      partialGrossAmountMinor: 24000,
      db,
    });
    assert.equal(partialCredit.creditNote.direction, "CREDIT_NOTE");
    assert.equal(partialCredit.creditNote.grossAmountMinor, -24000);
    assert.equal(partialCredit.isPartial, true);

    // Métriques après avoir partiel
    const metricsPartial = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    // CA net minor avant = 150 000 + (80 000 - 20 000 de l'avoir) = 210 000 minor
    assert.equal(metricsPartial.sales.turnoverNetMinor, 210000);
    // TVA collectée avant = 30 000 + (16 000 - 4 000) = 42 000 minor
    assert.equal(metricsPartial.sales.vatCollectedMinor, 42000);
    // Reste dû = solde précédent (140 000) + solde restant de inv3 (96 000 - 24 000 = 72 000) = 212 000 minor
    assert.equal(metricsPartial.sales.remainingDueMinor, 212000);

    // 3.2 Émission d'un avoir total sur inv1
    createCreditNoteForInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: inv1Id,
      reason: "Annulation complète de la facture inv1 pour refacturation",
      db,
    });

    const metricsFull = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    // CA HT inv1 (100 000) entièrement annulé -> 210 000 - 100 000 = 110 000 minor
    assert.equal(metricsFull.sales.turnoverNetMinor, 110000);
    // TVA inv1 (20 000) entièrement annulée -> 42 000 - 20 000 = 22 000 minor
    assert.equal(metricsFull.sales.vatCollectedMinor, 22000);
  });

  it("4. Isolation temporelle des indicateurs par période", () => {
    // Facture sur janvier 2026 (inv2: 500 € HT, issueDate: 2026-01-01)
    const mJan = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "CUSTOM", startDate: "2026-01-01", endDate: "2026-01-31" },
      db,
    });
    assert.equal(mJan.sales.turnoverNetMinor, 50000);
    assert.equal(mJan.sales.invoicesCount, 1);

    // Période sans aucune émission (ex: novembre 2026)
    const mNov = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "CUSTOM", startDate: "2026-11-01", endDate: "2026-11-30" },
      db,
    });
    assert.equal(mNov.sales.turnoverNetMinor, 0);
    assert.equal(mNov.sales.invoicesCount, 0);
    assert.equal(mNov.sales.remainingDueMinor, 0);
  });

  it("5. Calcul des dépenses fournisseurs validées et suivi documentaire (Module 3)", () => {
    // Insertion manuelle de 2 documents réels en base
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO documents (
        id, organization_id, dossier_id, original_filename,
        mime_type, size_bytes, sha256_checksum, storage_key, category,
        workflow_status, extracted_data_json, uploaded_by_user_id, retention_until_date, created_at, updated_at
      ) VALUES
      (
        'doc-dash-1', '${orgAId}', '${dossierA.id}', 'facture_fournisseur_ovh.pdf',
        'application/pdf', 10240, 'hash_doc_1', 'storage/doc1.pdf', 'SUPPLIER_INVOICE',
        'VALIDATED',
        '{"extraction":{"netAmountMinor":{"value":30000},"vatAmountMinor":{"value":6000},"grossAmountMinor":{"value":36000}}}',
        '${firmAdmin.user.id}', '2036-12-31', '2026-02-10T10:00:00.000Z', '${now}'
      ),
      (
        'doc-dash-2', '${orgAId}', '${dossierA.id}', 'note_frais_sncf.pdf',
        'application/pdf', 5120, 'hash_doc_2', 'storage/doc2.pdf', 'RECEIPT_EXPENSE',
        'PENDING_REVIEW',
        '{"extraction":{"netAmountMinor":{"value":8500},"vatAmountMinor":{"value":850},"grossAmountMinor":{"value":9350}}}',
        '${firmAdmin.user.id}', '2036-12-31', '2026-02-12T10:00:00.000Z', '${now}'
      )
    `).run();

    const m = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    // Dépenses fournisseurs validées : doc-dash-1 (300 € HT = 30 000 minor, 60 € TVA = 6 000 minor)
    assert.equal(m.purchases.supplierExpensesNetMinor, 30000);
    assert.equal(m.purchases.supplierExpensesVatMinor, 6000);
    assert.equal(m.purchases.supplierExpensesGrossMinor, 36000);
    assert.equal(m.purchases.documentsValidatedCount, 1);

    // Suivi documentaire : 1 en attente de révision, 1 validé
    assert.equal(m.purchases.documentsPendingReviewCount, 1);
    assert.equal(m.purchases.documentsTotalCount, 2);
  });

  it("6. Suivi des devis et calcul exact du taux de conversion (Module 4)", () => {
    // Création d'un premier devis accepté et converti
    const q1 = createQuote({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client Devis 1",
      issueDate: "2026-02-01",
      validityDate: "2026-03-01",
      lines: [
        {
          description: "Projet de refonte",
          quantityMinor: 100,
          unitPriceNetMinor: 200000,
          vatRateBps: 2000,
        },
      ],
      db,
    });
    convertQuoteToInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      quoteId: q1.id,
      db,
    });

    // Création d'un second devis en brouillon (non converti)
    createQuote({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client Devis 2",
      issueDate: "2026-02-05",
      validityDate: "2026-03-05",
      lines: [
        {
          description: "Étude d'opportunité",
          quantityMinor: 100,
          unitPriceNetMinor: 100000,
          vatRateBps: 2000,
        },
      ],
      db,
    });

    const m = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    // 2 devis au total
    assert.equal(m.quotes.quotesTotalCount, 2);
    // 1 devis converti
    assert.equal(m.quotes.quotesConvertedCount, 1);
    // Taux de conversion : 1 sur 2 = 50.00%
    assert.equal(m.quotes.conversionRatePercent, 50);
  });

  it("7. Génération priorisée des alertes d'action directe (Actionable Alerts)", () => {
    // Insertion d'une anomalie critique non résolue
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO anomalies (
        id, organization_id, dossier_id, rule_code, rule_version_id, category, severity,
        is_certain_error, target_entity_type, target_entity_id, message,
        status, detected_at, updated_at
      ) VALUES
      (
        'anom-dash-1', '${orgAId}', '${dossierA.id}', 'TVA_TAUX_INCORRECT', '${dossierA.countryConfigVersionId}', 'VAT', 'CRITICAL_CERTAIN',
        1, 'INVOICE', 'inv-1', 'Taux de TVA à 25% non conforme au référentiel français',
        'OPEN', '${now}', '${now}'
      )
    `).run();

    const m = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    assert.ok(m.actionableAlerts.length >= 3);

    // Les alertes doivent être classées par sévérité : CRITICAL en tête
    const firstAlert = m.actionableAlerts[0]!;
    assert.equal(firstAlert.severity, "CRITICAL");

    // Vérifier les catégories d'alertes générées
    const anomalyAlert = m.actionableAlerts.find((a) => a.category === "CRITICAL_ANOMALY");
    assert.ok(anomalyAlert);
    assert.equal(anomalyAlert.targetEntityType, "ANOMALY");

    const overdueAlert = m.actionableAlerts.find((a) => a.category === "OVERDUE_INVOICE");
    assert.ok(overdueAlert);
    assert.equal(overdueAlert.targetEntityType, "INVOICE");
    assert.ok(overdueAlert.amountMinor && overdueAlert.amountMinor > 0);

    const docAlert = m.actionableAlerts.find((a) => a.category === "PENDING_DOCUMENT");
    assert.ok(docAlert);
    assert.equal(docAlert.targetEntityType, "DOCUMENT");
  });

  it("8. Dossier vierge : comportement propre de l'état vide (Empty State)", () => {
    // Création d'un dossier vierge dans Tenant A
    const emptyDossier = createClientDossier({
      session: firmAdmin,
      organizationId: orgAId,
      name: "Dossier Vierge SAS",
      code: "DOS-VIERGE-01",
      countryCode: "FR",
      currency: "EUR",
      taxRegimeCode: "FR_REEL_NORMAL_IS",
      fiscalYearStartMonth: 1,
      fiscalYearStartDate: "2026-01-01",
      fiscalYearEndDate: "2026-12-31",
      db,
    });

    const m = getDossierDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: emptyDossier.id,
      filter: { periodType: "FISCAL_YEAR", year: 2026 },
      db,
    });

    assert.equal(m.sales.turnoverNetMinor, 0);
    assert.equal(m.sales.invoicesCount, 0);
    assert.equal(m.sales.remainingDueMinor, 0);
    assert.equal(m.purchases.supplierExpensesNetMinor, 0);
    assert.equal(m.quotes.quotesTotalCount, 0);
    assert.equal(m.quotes.conversionRatePercent, 0);
    assert.equal(m.accounting.draftEntriesCount, 0);
    assert.equal(m.actionableAlerts.length, 0);
    assert.ok(m.disclaimer.includes("certifié"));
  });

  it("9. Vue Cabinet (Portefeuille Multi-Dossiers) consolidée", () => {
    const firmMetrics = getFirmDashboardMetrics({
      session: firmAdmin,
      organizationId: orgAId,
      db,
    });

    // Organisation A possède plusieurs dossiers (au moins dossierA et emptyDossier)
    assert.ok(firmMetrics.activeDossiersCount >= 2);
    assert.ok(firmMetrics.dossiersSummary.length >= 2);

    // Vérifier la présence du résumé par dossier
    const summaryA = firmMetrics.dossiersSummary.find((d) => d.dossierId === dossierA.id);
    assert.ok(summaryA);
    assert.equal(summaryA.dossierCode, dossierA.code);
    assert.ok(summaryA.unpaidInvoicesGrossMinor > 0);
    assert.ok(summaryA.pendingDocumentsCount >= 1);

    // Rétrocompatibilité avec les anciens champs Phase 0
    assert.ok(firmMetrics.documentsPendingReviewCount !== undefined);
    assert.ok(firmMetrics.activeDossiersCount !== undefined);
  });

  it("10. Isolation Multi-Tenant stricte sur le tableau de bord (Tenant A vs Tenant B)", () => {
    // firmAdmin (Tenant A) ne peut pas accéder au tableau de bord du dossierB (Tenant B)
    assert.throws(
      () => {
        getDossierDashboardMetrics({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierB.id,
          filter: { periodType: "FISCAL_YEAR", year: 2026 },
          db,
        });
      },
      (err: unknown) => {
        return err instanceof AuthorizationError || (err as Error).message.includes("Accès refusé");
      }
    );

    // tenantBAdmin (Tenant B) ne peut pas accéder à la vue cabinet du Tenant A
    assert.throws(
      () => {
        getFirmDashboardMetrics({
          session: tenantBAdmin,
          organizationId: orgAId,
          db,
        });
      },
      (err: unknown) => {
        return err instanceof AuthorizationError || (err as Error).message.includes("Accès refusé");
      }
    );
  });

  it("11. Intégration API REST complète : routes /dashboard Dossier et Cabinet", async () => {
    resetRateLimitBucketsForTests();
    const server = createAppServer(db);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    const origin = `http://127.0.0.1:${addr.port}`;

    try {
      // 11.1 Connexion pour obtenir un jeton JWT
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

      // 11.2 Appel GET /api/organizations/:orgId/dashboard (Vue Cabinet)
      const firmDashRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dashboard`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              resolve({ status: res.statusCode || 0, data: JSON.parse(body) });
            });
          }
        );
        req.end();
      });

      assert.equal(firmDashRes.status, 200);
      assert.ok(firmDashRes.data.activeDossiersCount >= 2);
      assert.ok(Array.isArray(firmDashRes.data.dossiersSummary));

      // 11.3 Appel GET /api/organizations/:orgId/dossiers/:dossierId/dashboard?period=FISCAL_YEAR (Vue Dossier)
      const dossierDashRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/dashboard?period=FISCAL_YEAR`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              resolve({ status: res.statusCode || 0, data: JSON.parse(body) });
            });
          }
        );
        req.end();
      });

      assert.equal(dossierDashRes.status, 200);
      assert.equal(dossierDashRes.data.dossierId, dossierA.id);
      assert.ok(dossierDashRes.data.sales.turnoverNetMinor > 0);
      assert.ok(Array.isArray(dossierDashRes.data.actionableAlerts));

      // 11.4 Test d'étanchéité API : tentative d'accès à dossierB avec le jeton de firmAdmin
      const crossTenantRes = await new Promise<{ status: number }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgBId}/dossiers/${dossierB.id}/dashboard`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            res.on("data", () => {});
            res.on("end", () => {
              resolve({ status: res.statusCode || 0 });
            });
          }
        );
        req.end();
      });

      assert.equal(crossTenantRes.status, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
