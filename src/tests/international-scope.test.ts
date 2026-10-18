import fs from "node:fs";
import path from "node:path";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createDatabaseConnection,
  runMigrations,
  resetSharedDatabaseForTests,
} from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import {
  authenticateUser,
  AuthorizationError,
} from "../auth/auth-service.js";
import {
  createOrganization,
  createClientDossier,
  listDossiersForOrganization,
  getCountryConfigurationByCode,
  registerCountryConfigurationVersion,
} from "../services/tenant-service.js";
import {
  parseDecimalToMinor,
  formatMinorToDecimal,
  formatMoneyLocalized,
  computeTaxFromBasisPoints,
  convertCurrencyWithAudit,
  computeRealizedExchangeDifference,
  getCurrencyExponent,
} from "../domain/money.js";
import {
  assertCanActivateJurisdictionForProduction,
  CountryConfigurationVersion,
} from "../countries/country-registry.js";
import {
  checkInvoiceAmountsDeterministically,
  runDeterministicSimulation,
} from "../rules/deterministic-engine.js";
import {
  resolveLocaleDescriptor,
  getDictionary,
  formatLocalizedDate,
} from "../i18n/translations.js";
import { renderAppHtml } from "../ui/app-view.js";
import { createAppServer } from "../server.js";

describe("EXTENSION DU SCOPE INTERNATIONAL — Tests Unitaires et d'Intégration Obligatoires (Section 7)", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createDatabaseConnection(":memory:");
    resetSharedDatabaseForTests(db);
    runMigrations(db);
    seedDemoData(db);
  });

  it("1. Calcul monétaire exact avec des devises à 0 décimale (XOF, JPY), 2 décimales (EUR, MAD, AED) et 3 décimales (TND, BHD, KWD, OMR)", () => {
    // 0 décimale : Franc CFA (XOF) et Yen japonais (JPY)
    assert.equal(getCurrencyExponent("XOF"), 0);
    assert.equal(getCurrencyExponent("JPY"), 0);
    const xof = parseDecimalToMinor("150000", "XOF");
    assert.equal(xof.amountMinor, 150000);
    assert.equal(xof.minorUnitExponent, 0);
    assert.equal(formatMinorToDecimal(xof.amountMinor, "XOF"), "150000");
    assert.throws(
      () => parseDecimalToMinor("150000.50", "XOF"),
      /Précision décimale excessive pour XOF \(max 0 décimale/
    );

    // 2 décimales : Dirham marocain (MAD) et Dirham émirati (AED)
    assert.equal(getCurrencyExponent("MAD"), 2);
    assert.equal(getCurrencyExponent("AED"), 2);
    const mad = parseDecimalToMinor("1250,75", "MAD");
    assert.equal(mad.amountMinor, 125075);
    assert.equal(mad.minorUnitExponent, 2);
    assert.equal(formatMinorToDecimal(mad.amountMinor, "MAD", ","), "1250,75");

    // 3 décimales : Dinar tunisien (TND — millimes) et Dinar bahreïni (BHD — fils)
    assert.equal(getCurrencyExponent("TND"), 3);
    assert.equal(getCurrencyExponent("BHD"), 3);
    assert.equal(getCurrencyExponent("KWD"), 3);
    assert.equal(getCurrencyExponent("OMR"), 3);
    const tnd = parseDecimalToMinor("450.125", "TND");
    assert.equal(tnd.amountMinor, 450125); // 450 dinars et 125 millimes
    assert.equal(tnd.minorUnitExponent, 3);
    assert.equal(formatMinorToDecimal(tnd.amountMinor, "TND", ","), "450,125");
    assert.throws(
      () => parseDecimalToMinor("450.1259", "TND"),
      /Précision décimale excessive pour TND \(max 3 décimale/
    );
  });

  it("2. Arrondis de taxes reproductibles selon la méthode d'arrondi de la juridiction (HALF_UP, HALF_EVEN, FLOOR, CEILING)", () => {
    // 105 unités mineures * 500 bps (5.00%) = 5.25 unités mineures
    // et 110 unités mineures * 500 bps = 5.50 unités mineures (exactement à mi-chemin .5)
    const amountHalfWayEven = { amountMinor: 110, currency: "EUR" as const }; // 110 * 500 / 10000 = 5.5 -> quotient 5 (impair)
    const amountHalfWayOdd = { amountMinor: 90, currency: "EUR" as const }; // 90 * 500 / 10000 = 4.5 -> quotient 4 (pair)

    // HALF_UP : 4.5 -> 5 et 5.5 -> 6
    assert.equal(
      computeTaxFromBasisPoints(amountHalfWayOdd, 500, "HALF_UP").amountMinor,
      5
    );
    assert.equal(
      computeTaxFromBasisPoints(amountHalfWayEven, 500, "HALF_UP").amountMinor,
      6
    );

    // HALF_EVEN (arrondi bancaire au pair le plus proche) : 4.5 -> 4 (pair) et 5.5 -> 6 (pair)
    assert.equal(
      computeTaxFromBasisPoints(amountHalfWayOdd, 500, "HALF_EVEN").amountMinor,
      4
    );
    assert.equal(
      computeTaxFromBasisPoints(amountHalfWayEven, 500, "HALF_EVEN").amountMinor,
      6
    );

    // FLOOR & CEILING
    assert.equal(
      computeTaxFromBasisPoints(amountHalfWayOdd, 500, "FLOOR").amountMinor,
      4
    );
    assert.equal(
      computeTaxFromBasisPoints(amountHalfWayOdd, 500, "CEILING").amountMinor,
      5
    );
  });

  it("3. Conversion de devises d'exposants différents, conservation du taux historique audité et calcul des écarts de change", () => {
    // Conversion de 1 000,00 EUR (100 000 centimes, exp=2) vers TND (exp=3) au taux de 1 EUR = 3.3545 TND
    // Attendu : 1 000 * 3.3545 = 3 354,500 TND = 3 354 500 millimes
    const eurToTnd = convertCurrencyWithAudit({
      amount: parseDecimalToMinor("1000.00", "EUR"),
      targetCurrency: "TND",
      rateDecimalString: "3.3545",
      effectiveDate: "2026-10-18",
      rateSource: "BCT_TUNISIA_REFERENCE",
      roundingMode: "HALF_UP",
    });

    assert.equal(eurToTnd.convertedAmount.currency, "TND");
    assert.equal(eurToTnd.convertedAmount.minorUnitExponent, 3);
    assert.equal(eurToTnd.convertedAmount.amountMinor, 3354500);
    assert.equal(eurToTnd.exchangeRateAudit.rateDecimalString, "3.3545");
    assert.equal(eurToTnd.exchangeRateAudit.effectiveDate, "2026-10-18");
    assert.equal(eurToTnd.exchangeRateAudit.rateSource, "BCT_TUNISIA_REFERENCE");

    // Conversion de 100,00 EUR (10 000 centimes, exp=2) vers XOF (exp=0) au taux fixe de 655.957 XOF
    // Attendu : 100 * 655.957 = 65 595.7 -> arrondi HALF_UP à 65 596 FCFA
    const eurToXof = convertCurrencyWithAudit({
      amount: parseDecimalToMinor("100.00", "EUR"),
      targetCurrency: "XOF",
      rateDecimalString: "655.957",
      effectiveDate: "2026-10-18",
      rateSource: "BCEAO_PARITY",
      roundingMode: "HALF_UP",
    });
    assert.equal(eurToXof.convertedAmount.minorUnitExponent, 0);
    assert.equal(eurToXof.convertedAmount.amountMinor, 65596);

    // Écart de change réalisé entre la comptabilisation de la facture (3 354,500 TND) et le règlement (3 360,000 TND)
    const fxDiff = computeRealizedExchangeDifference({
      bookedPresentationAmount: eurToTnd.convertedAmount,
      settledPresentationAmount: parseDecimalToMinor("3360.000", "TND"),
    });
    assert.equal(fxDiff.differenceAmount.amountMinor, 5500); // +5,500 TND
    assert.equal(fxDiff.forReceivableNature, "FX_GAIN");
    assert.equal(fxDiff.forPayableNature, "FX_LOSS");
  });

  it("4. Affichage localisé des montants et des dates selon différentes locales, fuseaux horaires et RTL (Arabe)", () => {
    const formattedFr = formatMoneyLocalized(
      parseDecimalToMinor("1250.50", "EUR"),
      "fr-FR"
    );
    const formattedUs = formatMoneyLocalized(
      parseDecimalToMinor("1250.50", "USD"),
      "en-US"
    );
    const formattedTndAr = formatMoneyLocalized(
      parseDecimalToMinor("450.125", "TND"),
      "ar-TN"
    );
    assert.ok(formattedFr.includes("1"));
    assert.ok(formattedUs.includes("$1,250.50"));
    assert.ok(formattedTndAr.length > 0);

    // 2026-10-18T21:00:00Z : en heure d'été Europe/Paris (UTC+2) il est 23h00 le 18/10/2026,
    // tandis qu'à Asia/Dubai (UTC+4) il est déjà 01h00 le 19/10/2026.
    const dateParis = formatLocalizedDate("2026-10-18T21:00:00Z", {
      locale: "fr-FR",
      timeZone: "Europe/Paris",
    });
    const dateDubaiNextDay = formatLocalizedDate("2026-10-18T21:00:00Z", {
      locale: "en-AE",
      timeZone: "Asia/Dubai",
    });
    assert.ok(dateParis.includes("18") && dateParis.includes("2026"));
    assert.ok(dateDubaiNextDay.includes("19") && dateDubaiNextDay.includes("2026"));

    // Vérification du support RTL et des textes arabes dans l'interface
    const arDesc = resolveLocaleDescriptor("ar-AE");
    assert.equal(arDesc.direction, "rtl");
    const arDict = getDictionary("ar");
    assert.equal(arDict.navDashboard, "لوحة القيادة");

    const rtlHtml = renderAppHtml("ar");
    assert.ok(rtlHtml.includes('lang="ar" dir="rtl"'));
    assert.ok(rtlHtml.includes("لوحة القيادة"));
    assert.ok(rtlHtml.includes("اعتماد بشري إلزامي"));
  });

  it("5. Versionnement réglementaire daté et reproductibilité historique : un changement de règle ne modifie jamais les calculs historiques", () => {
    // Ajout d'une nouvelle version fictive pour une juridiction test "ZZ" avec changement de taux au 01/07/2026
    const zzV1: CountryConfigurationVersion = {
      versionId: "ZZ-2026.H1",
      countryCode: "ZZ",
      countryName: "Juridiction Test H1",
      regionGroup: "FICTIONAL_TEST",
      deploymentPriorityOrder: 90,
      versionNumber: "2026.1.0",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
      validationStatus: "IN_REVIEW",
      isProductionEnabled: false,
      validatedByProfessional: null,
      validatedAt: null,
      supportedLocales: ["en-US"],
      defaultCurrency: "USD",
      dateFormat: "YYYY-MM-DD",
      decimalSeparator: ".",
      thousandsSeparator: ",",
      indirectTaxSystem: "VAT",
      accountingStandardName: "IFRS",
      chartOfAccountsSample: [],
      standardJournals: [],
      vatRates: [
        {
          code: "ZZ_VAT_1500",
          label: "Standard Rate H1 (15%)",
          rateBasisPoints: 1500,
          effectiveFrom: "2026-01-01",
          effectiveTo: "2026-06-30",
          officialSourceUrl: "https://example.org/zz-h1",
          isVerified: true,
        },
      ],
      thresholds: [],
      taxRegimes: [],
      invoiceNumberingRuleDescription: "Sequential",
      eInvoicingFormats: [],
      eInvoicingMandateStatusNote: "Test H1",
      accountingExportFormats: ["CSV"],
      statutoryRetentionYears: 10,
      legalDisclaimers: ["Test disclaimer"],
      officialSources: ["https://example.org/zz-h1"],
    };

    const zzV2: CountryConfigurationVersion = {
      ...zzV1,
      versionId: "ZZ-2026.H2",
      versionNumber: "2026.2.0",
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
      vatRates: [
        {
          code: "ZZ_VAT_1800",
          label: "Standard Rate H2 (18%)",
          rateBasisPoints: 1800,
          effectiveFrom: "2026-07-01",
          effectiveTo: null,
          officialSourceUrl: "https://example.org/zz-h2",
          isVerified: true,
        },
      ],
    };

    registerCountryConfigurationVersion(zzV1, db);
    registerCountryConfigurationVersion(zzV2, db);

    // Résolution pour une opération datée du 15 mars 2026 -> doit retrouver ZZ-2026.H1 (15%)
    const resolvedH1 = getCountryConfigurationByCode("ZZ", db, "2026-03-15");
    assert.equal(resolvedH1.versionId, "ZZ-2026.H1");
    const simH1 = runDeterministicSimulation({
      simulationType: "VAT_SUMMARY",
      countryConfig: resolvedH1,
      revenueNetMinor: 100000, // 1000.00 USD
      expensesNetMinor: 0,
      effectiveDate: "2026-03-15",
    });
    assert.equal(simH1.status, "COMPUTED_INDICATIVE");
    assert.equal(simH1.ruleVersionId, "ZZ-2026.H1");
    assert.equal(simH1.resultData?.collectedVatMinor, 15000); // 15%

    // Résolution pour une opération datée du 15 septembre 2026 -> doit retrouver ZZ-2026.H2 (18%)
    const resolvedH2 = getCountryConfigurationByCode("ZZ", db, "2026-09-15");
    assert.equal(resolvedH2.versionId, "ZZ-2026.H2");
    const simH2 = runDeterministicSimulation({
      simulationType: "VAT_SUMMARY",
      countryConfig: resolvedH2,
      revenueNetMinor: 100000,
      expensesNetMinor: 0,
      effectiveDate: "2026-09-15",
    });
    assert.equal(simH2.status, "COMPUTED_INDICATIVE");
    assert.equal(simH2.ruleVersionId, "ZZ-2026.H2");
    assert.equal(simH2.resultData?.collectedVatMinor, 18000); // 18%
  });

  it("6. Impossibilité d'activer une configuration non validée pour un usage réglementaire en production et isolation entre juridictions", () => {
    const maDraft = getCountryConfigurationByCode("MA", db);
    assert.equal(maDraft.validationStatus, "DRAFT_INCOMPLETE");
    assert.equal(maDraft.isProductionEnabled, false);

    assert.throws(
      () => assertCanActivateJurisdictionForProduction(maDraft),
      /Activation en production refusée pour MA/
    );

    const frPending = getCountryConfigurationByCode("FR", db);
    assert.throws(
      () => assertCanActivateJurisdictionForProduction(frPending),
      /Activation en production refusée pour FR/
    );

    // Une simulation sur la configuration brouillon MA est bloquée sans inventer de taux
    const maSim = runDeterministicSimulation({
      simulationType: "VAT_SUMMARY",
      countryConfig: maDraft,
      revenueNetMinor: 100000,
      expensesNetMinor: 20000,
    });
    assert.equal(maSim.status, "BLOCKED_MISSING_OR_UNVERIFIED_RULES");
    assert.equal(maSim.resultData, null);
  });

  it("7. Vérification statique de l'absence de taux ou seuils nationaux codés en dur dans le cœur métier (Niveau A)", () => {
    const coreFiles = [
      path.resolve(process.cwd(), "src/domain/money.ts"),
      path.resolve(process.cwd(), "src/domain/types.ts"),
      path.resolve(process.cwd(), "src/rules/deterministic-engine.ts"),
      path.resolve(process.cwd(), "src/services/tenant-service.ts"),
    ];

    for (const filePath of coreFiles) {
      const source = fs.readFileSync(filePath, "utf-8");
      // Vérifie qu'aucun fallback du type `?? 2000` (taux de TVA français 20%) ou seuil fiscal n'est codé dans le cœur métier
      assert.equal(
        source.includes("?? 2000"),
        false,
        `Le fichier du cœur métier ${path.basename(filePath)} ne doit contenir aucun taux national par défaut (?? 2000).`
      );
      assert.equal(
        source.includes("legifrance.gouv.fr"),
        false,
        `Le fichier du cœur métier ${path.basename(filePath)} ne doit contenir aucune référence légale nationale en dur.`
      );
    }
  });

  it("8. Test d'intégration API : création d'organisations et dossiers multi-juridictions (Maghreb TND 3 décimales, CCG AED RTL) et isolation entre tenants", async () => {
    const server = createAppServer(db);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. Vérifier le rendu HTML Arabe RTL via ?lang=ar
      const rtlPageRes = await fetch(`${baseUrl}/?lang=ar`);
      assert.equal(rtlPageRes.status, 200);
      const rtlHtml = await rtlPageRes.text();
      assert.ok(rtlHtml.includes('dir="rtl"'));

      // 2. Connexion avec Tenant A
      const loginARes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
        }),
      });
      const { token: tokenA } = (await loginARes.json()) as { token: string };

      // 3. Créer une organisation internationale aux Émirats arabes unis (AED)
      const createUaeOrgRes = await fetch(`${baseUrl}/api/organizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: "Gulf Advisory Partners [DEMO]",
          slug: "gulf-advisory-demo",
          organizationType: "ACCOUNTING_FIRM",
          countryCode: "AE",
          primaryTaxJurisdictionCode: "AE",
          operatingCountryCodes: ["AE", "SA", "QA", "OM"],
          defaultCurrency: "AED",
          defaultTimezone: "Asia/Dubai",
          defaultLocale: "ar-AE",
        }),
      });
      assert.equal(createUaeOrgRes.status, 201);
      const { organization: uaeOrg } = (await createUaeOrgRes.json()) as {
        organization: { id: string; defaultCurrency: string; operatingCountryCodes: string[] };
      };
      assert.equal(uaeOrg.defaultCurrency, "AED");
      assert.deepEqual(uaeOrg.operatingCountryCodes, ["AE", "SA", "QA", "OM"]);

      // 4. Créer dans cette organisation un dossier client établi en Tunisie (TND à 3 décimales)
      const createTnDossierRes = await fetch(
        `${baseUrl}/api/organizations/${uaeOrg.id}/dossiers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({
            name: "Carthage Digital SARL (שركة قرطاج)",
            code: "DOS-CARTHAGE-TN",
            countryCode: "TN",
            taxJurisdictionCode: "TN",
            taxResidenceCountryCode: "TN",
            operatingCountryCodes: ["TN", "MA", "FR"],
            currency: "TND",
          }),
        }
      );
      assert.equal(createTnDossierRes.status, 201);
      const { dossier: tnDossier } = (await createTnDossierRes.json()) as {
        dossier: { currency: string; countryConfigVersionId: string; operatingCountryCodes: string[] };
      };
      assert.equal(tnDossier.currency, "TND");
      assert.equal(tnDossier.countryConfigVersionId, "TN-2026.0-DRAFT");
      assert.deepEqual(tnDossier.operatingCountryCodes, ["TN", "MA", "FR"]);

      // 5. Vérifier qu'un utilisateur d'un autre tenant (Tenant B) ne peut pas accéder à la nouvelle organisation internationale
      const loginBRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "direction@atelier-lumiere-demo.local",
          password: "DemoAdmin2026!",
        }),
      });
      const { token: tokenB } = (await loginBRes.json()) as { token: string };

      const forbiddenRes = await fetch(
        `${baseUrl}/api/organizations/${uaeOrg.id}/dossiers`,
        {
          headers: { Authorization: `Bearer ${tokenB}` },
        }
      );
      assert.equal(forbiddenRes.status, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
