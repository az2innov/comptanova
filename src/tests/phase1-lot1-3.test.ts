import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import { authenticateUser, AuthorizationError } from "../auth/auth-service.js";
import { listDossiersForOrganization } from "../services/tenant-service.js";
import {
  getNextSequenceNumber,
  computeDocumentLines,
  computeLegalMentions,
  createQuote,
  getQuoteDetails,
  listQuotesForDossier,
  convertQuoteToInvoice,
  createSalesInvoice,
  finalizeSalesInvoice,
  createCreditNoteForInvoice,
  recordInvoicePayment,
  getSalesInvoiceDetails,
  listSalesInvoicesForDossier,
  generatePrintableInvoiceHtml,
  generateFacturXXml,
} from "../services/invoicing-service.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.3 : Module 4 — Facturation, Devis, Transformation et Aperçu imprimable", () => {
  // Préparation de la base isolée
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

  it("1. Séquenceur de numérotation atomique, continu et sans trou", () => {
    // 1.1 Séquence Devis (QUOTE)
    const q1 = getNextSequenceNumber({
      organizationId: orgAId,
      dossierId: dossierA.id,
      sequenceType: "QUOTE",
      fiscalYear: 2026,
      db,
    });
    const q2 = getNextSequenceNumber({
      organizationId: orgAId,
      dossierId: dossierA.id,
      sequenceType: "QUOTE",
      fiscalYear: 2026,
      db,
    });
    assert.equal(q1, "DEV-2026-0001");
    assert.equal(q2, "DEV-2026-0002");

    // 1.2 Séquence Facture (INVOICE)
    const f1 = getNextSequenceNumber({
      organizationId: orgAId,
      dossierId: dossierA.id,
      sequenceType: "INVOICE",
      fiscalYear: 2026,
      db,
    });
    const f2 = getNextSequenceNumber({
      organizationId: orgAId,
      dossierId: dossierA.id,
      sequenceType: "INVOICE",
      fiscalYear: 2026,
      db,
    });
    assert.equal(f1, "FAC-2026-0001");
    assert.equal(f2, "FAC-2026-0002");

    // 1.3 Séquence Avoir (CREDIT_NOTE)
    const a1 = getNextSequenceNumber({
      organizationId: orgAId,
      dossierId: dossierA.id,
      sequenceType: "CREDIT_NOTE",
      fiscalYear: 2026,
      db,
    });
    assert.equal(a1, "AV-2026-0001");

    // 1.4 Isolation par dossier : le Dossier B commence à 0001 indépendamment
    const qB1 = getNextSequenceNumber({
      organizationId: orgBId,
      dossierId: dossierB.id,
      sequenceType: "QUOTE",
      fiscalYear: 2026,
      db,
    });
    assert.equal(qB1, "DEV-2026-0001");
  });

  it("2. Arithmétique monétaire exacte en unités mineures sans flottants IEEE-754", () => {
    // Ligne 1 : 2.50 unités à 120.00 € avec 10% de remise et 20% de TVA
    // Ligne 2 : 1.00 unité à 50.00 € sans remise et TVA à 10%
    const linesInput = [
      {
        description: "Prestation A",
        quantityMinor: 250, // 2.50
        unitPriceNetMinor: 12000, // 120.00 €
        discountRateBps: 1000, // 10.0%
        vatRateBps: 2000, // 20.0%
      },
      {
        description: "Prestation B",
        quantityMinor: 100, // 1.00
        unitPriceNetMinor: 5000, // 50.00 €
        discountRateBps: 0,
        vatRateBps: 1000, // 10.0%
      },
    ];

    const result = computeDocumentLines(linesInput, false);

    // Ligne 1 : brut = (12000 * 250) / 100 = 30000 (300.00 €)
    // remise = (30000 * 1000) / 10000 = 3000 (30.00 €)
    // net = 27000 (270.00 €)
    // tva = (27000 * 2000) / 10000 = 5400 (54.00 €)
    // ttc = 32400 (324.00 €)
    assert.equal(result.computedLines[0]!.totalNetMinor, 27000);
    assert.equal(result.computedLines[0]!.totalVatMinor, 5400);
    assert.equal(result.computedLines[0]!.totalGrossMinor, 32400);

    // Ligne 2 : brut = 5000 (50.00 €), remise = 0, tva = 500 (5.00 €), ttc = 5500 (55.00 €)
    assert.equal(result.computedLines[1]!.totalNetMinor, 5000);
    assert.equal(result.computedLines[1]!.totalVatMinor, 500);
    assert.equal(result.computedLines[1]!.totalGrossMinor, 5500);

    // Totaux : Total Net = 32000 (320.00 €), Total TVA = 5900 (59.00 €), Total TTC = 37900 (379.00 €)
    assert.equal(result.totalNetMinor, 32000);
    assert.equal(result.totalVatMinor, 5900);
    assert.equal(result.totalGrossMinor, 37900);
    assert.equal(result.totalNetMinor + result.totalVatMinor, result.totalGrossMinor);

    // Ventilation TVA
    assert.equal(result.vatBreakdown.length, 2);
  });

  it("3. Cycle complet d'un Devis (création, consultation, liste)", () => {
    const quote = createQuote({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client Projets Digitaux SAS",
      thirdPartyAddress: "42 avenue de l'Opéra, 75002 Paris",
      thirdPartyTaxNumber: "FR88990011223",
      issueDate: "2026-10-15",
      validityDate: "2026-11-15",
      notes: "Acompte de 30% à la commande",
      lines: [
        {
          description: "Audit d'architecture cloud",
          quantityMinor: 100,
          unitPriceNetMinor: 150000, // 1500.00 €
          discountRateBps: 0,
          vatRateBps: 2000,
        },
      ],
      db,
    });

    assert.ok(quote.id);
    assert.ok(quote.quoteNumber.startsWith("DEV-2026-"));
    assert.equal(quote.quoteStatus, "DRAFT");
    assert.equal(quote.totalNetMinor, 150000);
    assert.equal(quote.totalVatMinor, 30000);
    assert.equal(quote.totalGrossMinor, 180000);

    // Détail
    const detail = getQuoteDetails({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      quoteId: quote.id,
      db,
    });
    assert.equal(detail.quoteNumber, quote.quoteNumber);
    assert.equal(detail.lines?.length, 1);
    assert.equal(detail.lines[0]?.description, "Audit d'architecture cloud");

    // Liste filtrée
    const list = listQuotesForDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      status: "DRAFT",
      db,
    });
    assert.ok(list.some((q) => q.id === quote.id));
  });

  it("4. Transformation contrôlée d'un Devis en Facture & Protection stricte anti-duplication", () => {
    // 4.1 Création d'un devis
    const quote = createQuote({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "InnovLab SAS",
      issueDate: "2026-10-18",
      validityDate: "2026-11-18",
      lines: [
        {
          description: "Développement MVP Phase 1",
          quantityMinor: 100,
          unitPriceNetMinor: 400000, // 4000.00 €
          discountRateBps: 500, // 5%
          vatRateBps: 2000,
        },
      ],
      db,
    });

    // 4.2 Transformation contrôlée en facture
    const invoice = convertQuoteToInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      quoteId: quote.id,
      dueDate: "2026-11-30",
      isB2B: true,
      db,
    });

    assert.ok(invoice.id);
    assert.equal(invoice.originQuoteId, quote.id);
    assert.equal(invoice.invoiceStatus, "DRAFT");
    assert.equal(invoice.thirdPartyName, "InnovLab SAS");
    assert.equal(invoice.netAmountMinor, 380000); // 4000 - 5% = 3800
    assert.equal(invoice.vatAmountMinor, 76000); // 3800 * 20% = 760
    assert.equal(invoice.grossAmountMinor, 456000);

    // 4.3 Statut du devis basculé à CONVERTED
    const updatedQuote = getQuoteDetails({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      quoteId: quote.id,
      db,
    });
    assert.equal(updatedQuote.quoteStatus, "CONVERTED");
    assert.equal(updatedQuote.convertedToInvoiceId, invoice.id);
    assert.ok(updatedQuote.convertedAt);

    // 4.4 TENTATIVE DE RE-TRANSFORMATION -> REJET IMMÉDIAT
    assert.throws(
      () =>
        convertQuoteToInvoice({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          quoteId: quote.id,
          db,
        }),
      /Le devis .* a déjà été transformé en facture/
    );
  });

  it("5. Finalisation irréversible d'une facture de vente & Numérotation officielle", () => {
    // 5.1 Création d'une facture brouillon
    const draft = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Cabinet Conseil Lyon",
      issueDate: "2026-10-18",
      lines: [
        {
          description: "Formation Comptabilité Générale",
          quantityMinor: 200,
          unitPriceNetMinor: 60000, // 600.00 € x 2 = 1200.00 €
          vatRateBps: 2000,
        },
      ],
      db,
    });
    assert.equal(draft.invoiceStatus, "DRAFT");
    assert.ok(draft.invoiceNumber.startsWith("BROUILLON-"));

    // 5.2 Finalisation
    const finalized = finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: draft.id,
      db,
    });
    assert.equal(finalized.invoiceStatus, "FINALIZED");
    assert.ok(finalized.invoiceNumber.startsWith("FAC-2026-"));
    assert.ok(finalized.finalizedAt);
    assert.equal(finalized.finalizedByUserId, firmAdmin.user.id);

    // 5.3 Re-finalisation interdite
    assert.throws(
      () =>
        finalizeSalesInvoice({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          invoiceId: draft.id,
          db,
        }),
      /est déjà finalisée/
    );
  });

  it("6. Traçabilité des annulations par Avoir (CREDIT_NOTE) avec motif obligatoire", () => {
    // 6.1 Création et finalisation d'une facture à annuler
    const draft = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client À Annuler SARL",
      issueDate: "2026-10-18",
      lines: [
        {
          description: "Prestation Annulée suite à rétractation",
          quantityMinor: 100,
          unitPriceNetMinor: 100000, // 1000.00 €
          vatRateBps: 2000,
        },
      ],
      db,
    });
    const finalized = finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: draft.id,
      db,
    });

    // 6.2 Émission d'un Avoir sans motif -> Rejet
    assert.throws(
      () =>
        createCreditNoteForInvoice({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          invoiceId: finalized.id,
          reason: "   ", // vide
          db,
        }),
      /Le motif d'émission d'un avoir est obligatoire/
    );

    // 6.3 Émission d'un Avoir valide
    const { creditNote, originalInvoice } = createCreditNoteForInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: finalized.id,
      reason: "Annulation pour cause de double commande du client",
      db,
    });

    assert.equal(creditNote.direction, "CREDIT_NOTE");
    assert.ok(creditNote.invoiceNumber.startsWith("AV-2026-"));
    assert.equal(creditNote.creditNoteForInvoiceId, finalized.id);
    assert.equal(creditNote.grossAmountMinor, -120000); // Montant inversé
    assert.equal(creditNote.invoiceStatus, "FINALIZED");

    // Facture d'origine marquée CANCELLED
    assert.equal(originalInvoice.invoiceStatus, "CANCELLED");
    assert.equal(originalInvoice.cancelledByCreditNoteId, creditNote.id);

    // 6.4 Tentative de ré-annulation de la même facture -> Rejet
    assert.throws(
      () =>
        createCreditNoteForInvoice({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          invoiceId: finalized.id,
          reason: "Deuxième tentative d'annulation",
          db,
        }),
      /Cette facture a déjà été annulée par l'avoir/
    );
  });

  it("7. Gestion des règlements & Calcul exact du solde restant dû", () => {
    // 7.1 Création et finalisation d'une facture de 1200.00 € TTC
    const draft = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Grand Compte Logistique SA",
      issueDate: "2026-10-18",
      lines: [
        {
          description: "Licence logicielle annuelle",
          quantityMinor: 100,
          unitPriceNetMinor: 100000, // 1000.00 HT -> 1200.00 TTC
          vatRateBps: 2000,
        },
      ],
      db,
    });
    const finalized = finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: draft.id,
      db,
    });

    // 7.2 Premier règlement partiel de 500.00 € (50000 minor)
    const part1 = recordInvoicePayment({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: finalized.id,
      amountMinor: 50000,
      paymentDate: "2026-10-19",
      paymentMethod: "BANK_TRANSFER",
      transactionReference: "VIR-20261019-01",
      notes: "Premier acompte 500€",
      db,
    });

    assert.equal(part1.invoice.paidAmountMinor, 50000);
    assert.equal(part1.invoice.remainingAmountMinor, 70000); // 1200 - 500 = 700€
    assert.equal(part1.invoice.paymentStatus, "PARTIALLY_PAID");
    assert.equal(part1.invoice.invoiceStatus, "PARTIALLY_PAID");

    // 7.3 Tentative de règlement excédant le solde restant dû (ex: 800€ au lieu de 700€) -> Rejet
    assert.throws(
      () =>
        recordInvoicePayment({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          invoiceId: finalized.id,
          amountMinor: 80000,
          paymentDate: "2026-10-20",
          paymentMethod: "BANK_TRANSFER",
          db,
        }),
      /dépasse le solde restant dû/
    );

    // 7.4 Règlement du solde exact (700.00 € -> 70000 minor)
    const part2 = recordInvoicePayment({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: finalized.id,
      amountMinor: 70000,
      paymentDate: "2026-10-20",
      paymentMethod: "BANK_TRANSFER",
      db,
    });

    assert.equal(part2.invoice.paidAmountMinor, 120000);
    assert.equal(part2.invoice.remainingAmountMinor, 0);
    assert.equal(part2.invoice.paymentStatus, "PAID");
    assert.equal(part2.invoice.invoiceStatus, "PAID");
  });

  it("8. Mentions légales obligatoires (LPF, Code de commerce & art. 293 B CGI)", () => {
    // 8.1 Mention B2B avec pénalités de retard et indemnité forfaitaire de 40 €
    const mentionsB2B = computeLegalMentions({
      dossier: {
        legal_form: "SAS",
        legal_registration_number: "800123456",
        city: "Paris",
        vat_intracommunity_number: "FR12800123456",
        vat_regime_code: "FR_TVA_REEL_NORMAL",
      },
      thirdPartyName: "Client Entreprise SAS",
      thirdPartyAddress: "10 rue de la Paix, Paris",
      thirdPartyTaxNumber: "FR99887766554",
      isB2B: true,
      dueDate: "2026-11-30",
    });

    assert.ok(mentionsB2B.latePaymentPenaltiesMention?.includes("taux BCE"));
    assert.ok(mentionsB2B.recoveryIndemnityMention?.includes("40 €"));
    assert.equal(mentionsB2B.vatExemptionMention, undefined);

    // 8.2 Mention Franchise en base de TVA (Micro-entreprise / art. 293 B)
    const mentionsMicro = computeLegalMentions({
      dossier: {
        legal_form: "EI",
        vat_regime_code: "FR_TVA_FRANCHISE_BASE",
      },
      thirdPartyName: "Client Particulier",
      isB2B: false,
    });

    assert.ok(mentionsMicro.vatExemptionMention?.includes("art. 293 B"));
    assert.equal(mentionsMicro.recoveryIndemnityMention, undefined); // Pas d'indemnité 40€ pour B2C
  });

  it("9. Facturation Électronique : Génération Factur-X XML (Niveau 2) & Cadrage PDP (Niveau 3)", () => {
    const draft = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Partenaire Technologique SARL",
      thirdPartyAddress: "8 rue Royale, 75008 Paris",
      thirdPartyTaxNumber: "FR11223344556",
      issueDate: "2026-10-18",
      lines: [
        {
          description: "Abonnement Annuel SaaS",
          quantityMinor: 100,
          unitPriceNetMinor: 120000,
          vatRateBps: 2000,
        },
      ],
      db,
    });
    const finalized = finalizeSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      invoiceId: draft.id,
      db,
    });

    // Génération Factur-X XML profil MINIMUM
    const xml = generateFacturXXml({
      invoice: finalized,
      dossier: dossierA,
      profile: "MINIMUM",
    });

    assert.ok(xml.includes("<rsm:CrossIndustryInvoice"));
    assert.ok(xml.includes("<ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>"));
    assert.ok(xml.includes(`<ram:ID>${finalized.invoiceNumber}</ram:ID>`));
    assert.ok(xml.includes("<ram:TypeCode>380</ram:TypeCode>"));
    assert.ok(xml.includes("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>"));
    assert.ok(xml.includes("<ram:GrandTotalAmount>1440.00</ram:GrandTotalAmount>"));
    assert.ok(xml.includes("Partenaire Technologique SARL"));
  });

  it("10. Aperçu imprimable HTML (format A4)", () => {
    const draft = createSalesInvoice({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Client Pour Aperçu",
      issueDate: "2026-10-18",
      lines: [
        {
          description: "Prestation Édition Graphique",
          quantityMinor: 100,
          unitPriceNetMinor: 25000,
          vatRateBps: 2000,
        },
      ],
      db,
    });
    const html = generatePrintableInvoiceHtml({
      invoice: draft,
      dossier: dossierA,
    });

    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("@page { size: A4;"));
    assert.ok(html.includes("Prestation Édition Graphique"));
    assert.ok(html.includes("Client Pour Aperçu"));
    assert.ok(html.includes("Total Hors Taxes (HT)"));
    assert.ok(html.includes("window.print()"));
  });

  it("11. Isolation Multi-Tenant stricte sur les devis et factures (Tenant A vs Tenant B)", () => {
    // Création d'un devis et facture sur Tenant A
    const quoteA = createQuote({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      thirdPartyName: "Confidentiel Tenant A",
      issueDate: "2026-10-18",
      validityDate: "2026-11-18",
      lines: [{ description: "Conseil Privé", quantityMinor: 100, unitPriceNetMinor: 50000, vatRateBps: 2000 }],
      db,
    });

    // Tenant B tente d'accéder au devis de Tenant A -> Rejet
    assert.throws(
      () =>
        getQuoteDetails({
          session: tenantBAdmin,
          organizationId: orgBId,
          dossierId: dossierB.id,
          quoteId: quoteA.id,
          db,
        }),
      /Devis introuvable/
    );

    // Tenant B tente de transformer le devis de Tenant A -> Rejet
    assert.throws(
      () =>
        convertQuoteToInvoice({
          session: tenantBAdmin,
          organizationId: orgBId,
          dossierId: dossierB.id,
          quoteId: quoteA.id,
          db,
        }),
      /Devis introuvable/
    );
  });

  it("12. Test d'intégration API REST complet sur les routes Module 4 (/quotes, /sales-invoices, payments, printable, facturx)", async () => {
    resetRateLimitBucketsForTests();
    const server = createAppServer(db);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // Authentification
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
        }),
      });
      assert.equal(loginRes.status, 200);
      const { token: sessionToken } = (await loginRes.json()) as { token: string };
      assert.ok(sessionToken);

      // 12.1 POST /api/organizations/:orgId/dossiers/:dossierId/quotes (Création Devis)
      const quotePostRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/quotes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            thirdPartyName: "API Test Client SAS",
            issueDate: "2026-10-18",
            validityDate: "2026-11-18",
            lines: [
              {
                description: "Prestation API Facturation",
                quantityMinor: 100,
                unitPriceNetMinor: 80000,
                vatRateBps: 2000,
              },
            ],
          }),
        }
      );
      assert.equal(quotePostRes.status, 201);
      const quotePostJson = (await quotePostRes.json()) as any;
      const createdQuoteId = quotePostJson.quote.id;
      assert.ok(createdQuoteId);

      // 12.2 POST .../quotes/:quoteId/convert-to-invoice (Transformation en Facture)
      const convertRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/quotes/${createdQuoteId}/convert-to-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ isB2B: true }),
        }
      );
      assert.equal(convertRes.status, 201);
      const convertJson = (await convertRes.json()) as any;
      const createdInvoiceId = convertJson.invoice.id;
      assert.ok(createdInvoiceId);
      assert.equal(convertJson.invoice.invoiceStatus, "DRAFT");

      // 12.3 POST .../sales-invoices/:invId/finalize (Finalisation)
      const finalizeRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/sales-invoices/${createdInvoiceId}/finalize`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(finalizeRes.status, 200);
      const finalizeJson = (await finalizeRes.json()) as any;
      assert.equal(finalizeJson.invoice.invoiceStatus, "FINALIZED");
      assert.ok(finalizeJson.invoice.invoiceNumber.startsWith("FAC-2026-"));

      // 12.4 POST .../sales-invoices/:invId/payments (Règlement partiel)
      const paymentRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/sales-invoices/${createdInvoiceId}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            amountMinor: 50000,
            paymentMethod: "BANK_TRANSFER",
            transactionReference: "VIR-API-TEST",
          }),
        }
      );
      assert.equal(paymentRes.status, 201);
      const paymentJson = (await paymentRes.json()) as any;
      assert.equal(paymentJson.invoice.paidAmountMinor, 50000);

      // 12.5 GET .../sales-invoices/:invId/printable (Aperçu HTML A4)
      const printableRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/sales-invoices/${createdInvoiceId}/printable`,
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(printableRes.status, 200);
      assert.equal(printableRes.headers.get("content-type"), "text/html; charset=utf-8");
      const printableHtml = await printableRes.text();
      assert.ok(printableHtml.includes("API Test Client SAS"));

      // 12.6 GET .../sales-invoices/:invId/facturx-xml (Flux Factur-X XML)
      const xmlRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/sales-invoices/${createdInvoiceId}/facturx-xml?profile=MINIMUM`,
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(xmlRes.status, 200);
      assert.equal(xmlRes.headers.get("content-type"), "application/xml; charset=utf-8");
      const xmlText = await xmlRes.text();
      assert.ok(xmlText.includes("<rsm:CrossIndustryInvoice"));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
