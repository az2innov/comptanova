import { CountryConfigValidationState } from "../domain/types.js";
import { CurrencyCode, RoundingMode } from "../domain/money.js";

/**
 * Niveau B & Niveau C — Couche de configuration par juridiction et interface de modules réglementaires spécialisés
 * (Sections 2.B, 2.C, 5 de l'extension internationale).
 *
 * Principes :
 * - Ne suppose pas que tous les pays utilisent la TVA (`indirectTaxSystem`: `"VAT" | "GST" | "SALES_TAX" | "NONE"`).
 * - Supporte les écritures de droite à gauche (`supportsRtl`), les fuseaux horaires IANA, les calendriers fiscaux et les devises à 0, 2 ou 3 décimales.
 * - Chaque règle et chaque version de configuration porte des dates d'entrée en vigueur (`effectiveFrom`) et de fin de validité (`effectiveTo`).
 * - Les changements de règles ne modifient jamais silencieusement les calculs historiques : `resolveCountryConfigForDate` retrouve la version applicable à la date d'effet demandée ou par `versionId` explicite.
 * - Une juridiction ne peut jamais être activée pour une utilisation réglementaire en production sans statut validé (`VALIDATED` / `ACTIVE` / `VALIDATED_FOR_PRODUCTION`), `validatedByProfessional` non vide et `isProductionEnabled === true`.
 */

export type IndirectTaxSystemType = "VAT" | "GST" | "SALES_TAX" | "NONE";

export interface VatRateRule {
  code: string;
  label: string;
  /** Type de taxe indirecte (VAT par défaut pour rétrocompatibilité) */
  taxType?: IndirectTaxSystemType;
  /** Taux en points de base (ex: 2000 = 20.00%, 1000 = 10.00%, 550 = 5.50%) */
  rateBasisPoints: number;
  effectiveFrom: string; // ISO Date YYYY-MM-DD
  effectiveTo: string | null;
  officialSourceUrl: string;
  isVerified: boolean;
}

export interface TaxThresholdRule {
  code: string;
  label: string;
  description: string;
  /** Seuil en unités monétaires mineures entières (null si non vérifié ou non applicable) */
  amountMinor: number | null;
  currency: CurrencyCode;
  effectiveFrom: string;
  effectiveTo: string | null;
  officialSourceUrl: string;
  isVerified: boolean;
}

export interface TaxRegimeConfig {
  code: string;
  label: string;
  description: string;
  supportsVatFranchise: boolean;
  requiresSalesBook: boolean;
  requiresPurchasesRegister: boolean;
  socialContributionRateBps: number | null;
  corporateOrIncomeTaxRateBps?: number | null;
  isVerified: boolean;
  officialSource: string;
}

export interface ChartOfAccountsEntry {
  accountNumber: string;
  label: string;
  accountClass: number;
  allowAuxiliary: boolean;
}

export interface CountryConfigurationVersion {
  versionId: string;
  /** Code ISO 3166-1 alpha-2 ou code de sous-juridiction (ex: FR, BE, LU, CH, MA, TN, AE, SA, XOF-UEMOA) */
  countryCode: string;
  countryName: string;
  /** Région géographique internationale */
  regionGroup?: "EUROPE" | "MAGHREB" | "MIDDLE_EAST_GCC" | "SUB_SAHARAN_AFRICA" | "AMERICAS" | "ASIA_PACIFIC" | "FICTIONAL_TEST";
  deploymentPriorityOrder: number;
  versionNumber: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  validationStatus: CountryConfigValidationState;
  isProductionEnabled: boolean;
  validatedByProfessional: string | null;
  validatedAt: string | null;

  /** Paramètres linguistiques, RTL, fuseaux horaires et régionaux */
  supportedLocales: string[];
  supportsRtl?: boolean;
  defaultTimezone?: string;
  calendarSystem?: "GREGORIAN" | "HIJRI_SUPPORTED" | "FISCAL_CUSTOM";
  defaultCurrency: CurrencyCode;
  allowedCurrencies?: CurrencyCode[];
  defaultRoundingMode?: RoundingMode;
  dateFormat: string;
  decimalSeparator: "." | ",";
  thousandsSeparator: " " | "." | "'" | ",";

  /** Système de taxe indirecte (ne suppose pas que tout pays a une TVA) */
  indirectTaxSystem?: IndirectTaxSystemType;

  /** Plan comptable national de base */
  accountingStandardName: string;
  chartOfAccountsSample: ChartOfAccountsEntry[];
  standardJournals: Array<{ code: string; label: string }>;

  /** Règles de taxes indirectes (TVA/GST/Sales Tax) et seuils */
  vatRates: VatRateRule[];
  thresholds: TaxThresholdRule[];
  taxRegimes: TaxRegimeConfig[];

  /** Numérotation, facturation électronique, exports et conservation */
  invoiceNumberingRuleDescription: string;
  eInvoicingFormats: string[];
  eInvoicingMandateStatusNote: string;
  accountingExportFormats: string[];
  statutoryRetentionYears: number;
  legalDisclaimers: string[];
  officialSources: string[];
}

/**
 * Niveau C — Interface des modules réglementaires spécialisés par juridiction (Section 2.C).
 * Permet d'isoler les règles complexes propres à une juridiction sans créer de couplage entre pays.
 */
export interface SpecializedJurisdictionPlugin {
  readonly jurisdictionCode: string;
  readonly pluginId: string;
  readonly supportedVersionIds: string[];
  validateCustomDocumentRules?(
    config: CountryConfigurationVersion,
    documentPayload: Record<string, unknown>
  ): Array<{ code: string; message: string; isBlocking: boolean }>;
}

const specializedPlugins = new Map<string, SpecializedJurisdictionPlugin>();

export function registerSpecializedJurisdictionPlugin(
  plugin: SpecializedJurisdictionPlugin
): void {
  specializedPlugins.set(plugin.jurisdictionCode.toUpperCase(), plugin);
}

export function getSpecializedJurisdictionPlugin(
  jurisdictionCode: string
): SpecializedJurisdictionPlugin | undefined {
  return specializedPlugins.get(jurisdictionCode.toUpperCase());
}

/**
 * Registre initial des configurations de juridictions.
 * - Marché initial opérationnel : France (avec historique versionné démontrant la conservation des règles par période).
 * - Extension européenne initiale : Belgique, Luxembourg, Suisse romande.
 * - Configurations exploratoires internationales clairement marquées comme `DRAFT_INCOMPLETE` / non validées (sans inventer de taux présentés comme officiels) :
 *   - Maroc (`MA` — Maghreb)
 *   - Tunisie (`TN` — Maghreb, devise `TND` à 3 décimales)
 *   - Émirats arabes unis (`AE` — Moyen-Orient/CCG, support arabe RTL `ar-AE`)
 *   - Zone UEMOA (`SN` — Afrique subsaharienne, devise `XOF` à 0 décimale)
 */
export const INITIAL_COUNTRY_CONFIGURATIONS: CountryConfigurationVersion[] = [
  {
    versionId: "FR-2025.1-HISTORICAL",
    countryCode: "FR",
    countryName: "France",
    regionGroup: "EUROPE",
    deploymentPriorityOrder: 1,
    versionNumber: "2025.1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-12-31",
    validationStatus: "OBSOLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-FR"],
    supportsRtl: false,
    defaultTimezone: "Europe/Paris",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "EUR",
    allowedCurrencies: ["EUR", "USD", "GBP", "CHF"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Plan Comptable Général (PCG - Millésime 2025)",
    chartOfAccountsSample: [
      { accountNumber: "401000", label: "Fournisseurs", accountClass: 4, allowAuxiliary: true },
      { accountNumber: "411000", label: "Clients", accountClass: 4, allowAuxiliary: true },
    ],
    standardJournals: [
      { code: "AC", label: "Journal des Achats" },
      { code: "VT", label: "Journal des Ventes" },
      { code: "BQ", label: "Journal de Banque" },
      { code: "OD", label: "Opérations Diverses" },
    ],
    vatRates: [
      {
        code: "FR_VAT_STANDARD_2000",
        label: "Taux normal (20,00 % — CGI art. 278)",
        taxType: "VAT",
        rateBasisPoints: 2000,
        effectiveFrom: "2014-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028416760",
        isVerified: true,
      },
      {
        code: "FR_VAT_REDUCED_550",
        label: "Taux réduit (5,50 % — CGI art. 278-0 bis)",
        taxType: "VAT",
        rateBasisPoints: 550,
        effectiveFrom: "2012-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048805514",
        isVerified: true,
      },
    ],
    thresholds: [],
    taxRegimes: [],
    invoiceNumberingRuleDescription: "Numérotation chronologique continue (CGI art. 242 nonies A).",
    eInvoicingFormats: ["Factur-X (EN 16931)"],
    eInvoicingMandateStatusNote: "Version historique 2025 conservée pour reproductibilité des calculs passés.",
    accountingExportFormats: ["FEC (art. L47 A-I LPF)", "CSV"],
    statutoryRetentionYears: 10,
    legalDisclaimers: [
      "Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable. Seul votre expert-comptable est habilité à valider vos choix fiscaux.",
    ],
    officialSources: ["Légifrance — CGI", "ANC — PCG"],
  },
  {
    versionId: "FR-2026.1-REV0",
    countryCode: "FR",
    countryName: "France",
    regionGroup: "EUROPE",
    deploymentPriorityOrder: 1,
    versionNumber: "2026.1.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    // Explicite : en attente de validation formelle par un expert-comptable / juriste fiscaliste avant usage fiscal de production
    validationStatus: "PENDING_LEGAL_VALIDATION",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-FR"],
    supportsRtl: false,
    defaultTimezone: "Europe/Paris",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "EUR",
    allowedCurrencies: ["EUR", "USD", "GBP", "CHF", "MAD", "TND", "AED"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Plan Comptable Général (PCG - ANC)",
    chartOfAccountsSample: [
      { accountNumber: "401000", label: "Fournisseurs", accountClass: 4, allowAuxiliary: true },
      { accountNumber: "411000", label: "Clients", accountClass: 4, allowAuxiliary: true },
      { accountNumber: "445660", label: "TVA déductible sur autres biens et services", accountClass: 4, allowAuxiliary: false },
      { accountNumber: "445710", label: "TVA collectée", accountClass: 4, allowAuxiliary: false },
      { accountNumber: "512000", label: "Banques", accountClass: 5, allowAuxiliary: false },
      { accountNumber: "606000", label: "Achats non stockés de matières et fournitures", accountClass: 6, allowAuxiliary: false },
      { accountNumber: "622600", label: "Honoraires", accountClass: 6, allowAuxiliary: false },
      { accountNumber: "627000", label: "Services bancaires et assimilés", accountClass: 6, allowAuxiliary: false },
      { accountNumber: "706000", label: "Prestations de services", accountClass: 7, allowAuxiliary: false },
      { accountNumber: "707000", label: "Ventes de marchandises", accountClass: 7, allowAuxiliary: false },
    ],
    standardJournals: [
      { code: "AC", label: "Journal des Achats" },
      { code: "VT", label: "Journal des Ventes" },
      { code: "BQ", label: "Journal de Banque" },
      { code: "OD", label: "Opérations Diverses" },
      { code: "AN", label: "À-Nouveaux" },
    ],
    vatRates: [
      {
        code: "FR_VAT_STANDARD_2000",
        label: "Taux normal (20,00 % — CGI art. 278)",
        taxType: "VAT",
        rateBasisPoints: 2000,
        effectiveFrom: "2014-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028416760",
        isVerified: true,
      },
      {
        code: "FR_VAT_INTERMEDIATE_1000",
        label: "Taux intermédiaire (10,00 % — CGI art. 278 bis et s.)",
        taxType: "VAT",
        rateBasisPoints: 1000,
        effectiveFrom: "2014-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006191653",
        isVerified: true,
      },
      {
        code: "FR_VAT_REDUCED_550",
        label: "Taux réduit (5,50 % — CGI art. 278-0 bis)",
        taxType: "VAT",
        rateBasisPoints: 550,
        effectiveFrom: "2012-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048805514",
        isVerified: true,
      },
      {
        code: "FR_VAT_PARTICULAR_210",
        label: "Taux particulier (2,10 % — CGI art. 281 octies)",
        taxType: "VAT",
        rateBasisPoints: 210,
        effectiveFrom: "2012-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006309500",
        isVerified: true,
      },
      {
        code: "FR_VAT_EXEMPT_293B",
        label: "Franchise en base de TVA (0,00 % — CGI art. 293 B)",
        taxType: "VAT",
        rateBasisPoints: 0,
        effectiveFrom: "2020-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047622719",
        isVerified: true,
      },
    ],
    thresholds: [
      {
        code: "FR_MICRO_SERVICES_THRESHOLD",
        label: "Plafond Micro-Entreprise Prestations de Services (BNC/BIC)",
        description: "Seuil soumis à révision législative triennale — validation formelle requise pour le millésime actif avant calcul fiscal engageant.",
        amountMinor: null,
        currency: "EUR",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://entreprendre.service-public.fr/vosdroits/F32353",
        isVerified: false,
      },
      {
        code: "FR_VAT_FRANCHISE_SERVICES_THRESHOLD",
        label: "Seuil de franchise en base de TVA — Prestations de services (CGI art. 293 B)",
        description: "Seuil soumis aux évolutions de la Loi de Finances — validation formelle requise avant alerte officielle.",
        amountMinor: null,
        currency: "EUR",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        officialSourceUrl: "https://entreprendre.service-public.fr/vosdroits/F21746",
        isVerified: false,
      },
    ],
    taxRegimes: [
      {
        code: "FR_REEL_NORMAL_IS",
        label: "Régime Réel Normal — Impôt sur les Sociétés (IS)",
        description: "Comptabilité d'engagement complète (bilan, compte de résultat, FEC).",
        supportsVatFranchise: false,
        requiresSalesBook: false,
        requiresPurchasesRegister: false,
        socialContributionRateBps: null,
        isVerified: true,
        officialSource: "Code général des impôts / Code de commerce L123-12",
      },
      {
        code: "FR_REEL_SIMPLIFIE",
        label: "Régime Réel Simplifié (BIC / IS)",
        description: "Comptabilité simplifiée avec obligations déclaratives adaptées.",
        supportsVatFranchise: true,
        requiresSalesBook: false,
        requiresPurchasesRegister: false,
        socialContributionRateBps: null,
        isVerified: true,
        officialSource: "Code général des impôts art. 302 septies A",
      },
      {
        code: "FR_MICRO_ENTREPRISE",
        label: "Régime Micro-Entrepreneur (Micro-BIC / Micro-BNC)",
        description: "Tenue obligatoire d'un livre des recettes chronologique et, selon l'activité, d'un registre des achats (conservation 10 ans).",
        supportsVatFranchise: true,
        requiresSalesBook: true,
        requiresPurchasesRegister: true,
        socialContributionRateBps: null,
        isVerified: false,
        officialSource: "Code de commerce L123-28 & URSSAF",
      },
    ],
    invoiceNumberingRuleDescription:
      "Numérotation chronologique, continue et sans rupture (CGI art. 242 nonies A). Toute facture validée ne peut être supprimée ; régularisation par avoir uniquement.",
    eInvoicingFormats: ["Factur-X (EN 16931)", "UBL 2.1", "CII D16B"],
    eInvoicingMandateStatusNote:
      "Anticipation de la réforme française de facturation électronique (réception obligatoire et émission progressive via PDP/PPF selon calendrier légal en vigueur).",
    accountingExportFormats: ["FEC (Fichier des Écritures Comptables - art. L47 A-I LPF)", "CSV Standard", "JSON Audit"],
    statutoryRetentionYears: 10,
    legalDisclaimers: [
      "Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable. Seul votre expert-comptable est habilité à valider vos choix fiscaux.",
      "TVA non applicable, art. 293 B du CGI (mention obligatoire en cas de franchise en base de TVA).",
    ],
    officialSources: [
      "Légifrance — Code général des impôts (CGI) et Livre des procédures fiscales (LPF)",
      "Autorité des Normes Comptables (ANC) — Recueil des normes comptables françaises (PCG)",
      "Code de commerce — Article L123-22 (conservation des documents comptables et pièces justificatives pendant 10 ans)",
    ],
  },
  {
    versionId: "BE-2026.0-DRAFT",
    countryCode: "BE",
    countryName: "Belgique",
    regionGroup: "EUROPE",
    deploymentPriorityOrder: 2,
    versionNumber: "2026.0.0-draft",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    validationStatus: "DRAFT_INCOMPLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-BE", "nl-BE"],
    supportsRtl: false,
    defaultTimezone: "Europe/Brussels",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "EUR",
    allowedCurrencies: ["EUR", "USD", "GBP"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Plan Comptable Minimum Normalisé (PCMN)",
    chartOfAccountsSample: [],
    standardJournals: [
      { code: "ACH", label: "Journal des Achats" },
      { code: "VTE", label: "Journal des Ventes" },
      { code: "FIN", label: "Journal Financier" },
      { code: "OD", label: "Opérations Diverses" },
    ],
    vatRates: [],
    thresholds: [],
    taxRegimes: [],
    invoiceNumberingRuleDescription: "Séquence chronologique continue par journal (SPF Finances).",
    eInvoicingFormats: ["Peppol BIS Billing 3.0 (UBL)"],
    eInvoicingMandateStatusNote: "Facturation électronique B2B structurée Peppol en Belgique — configuration en attente de Phase 3.",
    accountingExportFormats: ["CSV", "XML"],
    statutoryRetentionYears: 7,
    legalDisclaimers: [
      "Configuration Belgique à l'état de brouillon non activée pour les fonctions fiscales (Phase 3).",
    ],
    officialSources: ["SPF Finances (finances.belgium.be)", "Commission des Normes Comptables (CNC)"],
  },
  {
    versionId: "LU-2026.0-DRAFT",
    countryCode: "LU",
    countryName: "Luxembourg",
    regionGroup: "EUROPE",
    deploymentPriorityOrder: 3,
    versionNumber: "2026.0.0-draft",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    validationStatus: "DRAFT_INCOMPLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-LU", "de-LU"],
    supportsRtl: false,
    defaultTimezone: "Europe/Luxembourg",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "EUR",
    allowedCurrencies: ["EUR", "USD", "CHF"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Plan Comptable Normalisé (PCN 2020)",
    chartOfAccountsSample: [],
    standardJournals: [],
    vatRates: [],
    thresholds: [],
    taxRegimes: [],
    invoiceNumberingRuleDescription: "À documenter et valider en Phase 3 (AED Luxembourg).",
    eInvoicingFormats: ["Peppol BIS 3.0"],
    eInvoicingMandateStatusNote: "Brouillon structurel (Phase 3).",
    accountingExportFormats: ["FAIA (Fichier d'Audit Informatisé AED)", "CSV"],
    statutoryRetentionYears: 10,
    legalDisclaimers: [
      "Configuration Luxembourg à l'état de brouillon non activée pour les fonctions fiscales (Phase 3).",
    ],
    officialSources: ["Administration de l'enregistrement, des domaines et de la TVA (AED)"],
  },
  {
    versionId: "CH-2026.0-DRAFT",
    countryCode: "CH",
    countryName: "Suisse romande",
    regionGroup: "EUROPE",
    deploymentPriorityOrder: 4,
    versionNumber: "2026.0.0-draft",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    validationStatus: "DRAFT_INCOMPLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-CH"],
    supportsRtl: false,
    defaultTimezone: "Europe/Zurich",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "CHF",
    allowedCurrencies: ["CHF", "EUR", "USD"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD.MM.YYYY",
    decimalSeparator: ".",
    thousandsSeparator: "'",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Plan comptable PME suisse (Code des obligations CO art. 957 et s.)",
    chartOfAccountsSample: [],
    standardJournals: [],
    vatRates: [],
    thresholds: [],
    taxRegimes: [],
    invoiceNumberingRuleDescription: "À documenter et valider en Phase 3 (AFC Suisse).",
    eInvoicingFormats: ["QR-facture suisse (SIX)"],
    eInvoicingMandateStatusNote: "Brouillon structurel (Phase 3).",
    accountingExportFormats: ["CSV"],
    statutoryRetentionYears: 10,
    legalDisclaimers: [
      "Configuration Suisse romande à l'état de brouillon non activée pour les fonctions fiscales (Phase 3).",
    ],
    officialSources: ["Administration fédérale des contributions (AFC) / Code des obligations (CO)"],
  },
  // --- CONFIGURATIONS EXPLORATOIRES INTERNATIONALES (CLAIREMENT MARQUÉES COMME BROUILLONS NON VALIDÉS) ---
  {
    versionId: "MA-2026.0-DRAFT",
    countryCode: "MA",
    countryName: "Maroc (Maghreb — Brouillon non validé)",
    regionGroup: "MAGHREB",
    deploymentPriorityOrder: 5,
    versionNumber: "2026.0.0-draft",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    validationStatus: "DRAFT_INCOMPLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-MA", "ar-MA"],
    supportsRtl: true,
    defaultTimezone: "Africa/Casablanca",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "MAD",
    allowedCurrencies: ["MAD", "EUR", "USD"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Code Général de la Normalisation Comptable (CGNC — Maroc)",
    chartOfAccountsSample: [],
    standardJournals: [],
    vatRates: [], // Aucun taux non vérifié n'est présenté comme officiel
    thresholds: [],
    taxRegimes: [
      {
        code: "MA_IS_DROIT_COMMUN_DRAFT",
        label: "Maroc — Régime IS (Brouillon non validé)",
        description: "Configuration structurelle en attente de validation réglementaire locale.",
        supportsVatFranchise: false,
        requiresSalesBook: false,
        requiresPurchasesRegister: false,
        socialContributionRateBps: null,
        isVerified: false,
        officialSource: "Direction Générale des Impôts (DGI Maroc) — À valider",
      },
    ],
    invoiceNumberingRuleDescription: "À documenter et valider selon le CGI marocain (DGI).",
    eInvoicingFormats: [],
    eInvoicingMandateStatusNote: "Brouillon exploratoire international — non activé en production.",
    accountingExportFormats: ["CSV"],
    statutoryRetentionYears: 10,
    legalDisclaimers: [
      "Configuration Maroc à l'état de brouillon architectural non validé. Aucune règle fiscale n'est activée en production.",
    ],
    officialSources: ["Direction Générale des Impôts (DGI Maroc — tax.gov.ma)"],
  },
  {
    versionId: "TN-2026.0-DRAFT",
    countryCode: "TN",
    countryName: "Tunisie (Maghreb — Devise 3 décimales — Brouillon non validé)",
    regionGroup: "MAGHREB",
    deploymentPriorityOrder: 6,
    versionNumber: "2026.0.0-draft",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    validationStatus: "DRAFT_INCOMPLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["fr-TN", "ar-TN"],
    supportsRtl: true,
    defaultTimezone: "Africa/Tunis",
    calendarSystem: "GREGORIAN",
    defaultCurrency: "TND", // 3 décimales (millimes)
    allowedCurrencies: ["TND", "EUR", "USD"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    indirectTaxSystem: "VAT",
    accountingStandardName: "Système Comptable des Entreprises (SCE — Tunisie)",
    chartOfAccountsSample: [],
    standardJournals: [],
    vatRates: [],
    thresholds: [],
    taxRegimes: [
      {
        code: "TN_REEL_DRAFT",
        label: "Tunisie — Régime Réel (Brouillon non validé)",
        description: "Support natif du Dinar tunisien (TND à 3 décimales / millimes) — règles fiscales non activées.",
        supportsVatFranchise: false,
        requiresSalesBook: false,
        requiresPurchasesRegister: false,
        socialContributionRateBps: null,
        isVerified: false,
        officialSource: "Ministère des Finances (Tunisie) — À valider",
      },
    ],
    invoiceNumberingRuleDescription: "À documenter et valider selon la législation fiscale tunisienne.",
    eInvoicingFormats: ["El Fatoora (TTN - à intégrer et valider)"],
    eInvoicingMandateStatusNote: "Brouillon exploratoire international — non activé en production.",
    accountingExportFormats: ["CSV"],
    statutoryRetentionYears: 10,
    legalDisclaimers: [
      "Configuration Tunisie à l'état de brouillon architectural non validé. Aucune règle fiscale n'est activée en production.",
    ],
    officialSources: ["Ministère des Finances — République Tunisienne"],
  },
  {
    versionId: "AE-2026.0-DRAFT",
    countryCode: "AE",
    countryName: "Émirats arabes unis (CCG / Moyen-Orient — Brouillon non validé)",
    regionGroup: "MIDDLE_EAST_GCC",
    deploymentPriorityOrder: 7,
    versionNumber: "2026.0.0-draft",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    validationStatus: "DRAFT_INCOMPLETE",
    isProductionEnabled: false,
    validatedByProfessional: null,
    validatedAt: null,
    supportedLocales: ["ar-AE", "en-AE"],
    supportsRtl: true,
    defaultTimezone: "Asia/Dubai",
    calendarSystem: "HIJRI_SUPPORTED",
    defaultCurrency: "AED",
    allowedCurrencies: ["AED", "USD", "EUR", "SAR", "BHD", "KWD", "OMR", "QAR"],
    defaultRoundingMode: "HALF_UP",
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    indirectTaxSystem: "VAT",
    accountingStandardName: "IFRS (UAE Federal Tax Authority / Commercial Companies Law)",
    chartOfAccountsSample: [],
    standardJournals: [],
    vatRates: [],
    thresholds: [],
    taxRegimes: [
      {
        code: "AE_CORPORATE_TAX_DRAFT",
        label: "UAE Corporate Tax & VAT (Brouillon non validé)",
        description: "Support RTL arabe, fuseau Asia/Dubai et multi-devises CCG — règles fiscales en attente de validation locale.",
        supportsVatFranchise: false,
        requiresSalesBook: false,
        requiresPurchasesRegister: false,
        socialContributionRateBps: null,
        isVerified: false,
        officialSource: "UAE Federal Tax Authority (FTA — tax.gov.ae) — À valider",
      },
    ],
    invoiceNumberingRuleDescription: "À documenter et valider selon les exigences FTA (Émirats arabes unis).",
    eInvoicingFormats: ["Peppol PINT AE (Brouillon)"],
    eInvoicingMandateStatusNote: "Brouillon exploratoire international — non activé en production.",
    accountingExportFormats: ["FTA Audit File (FAF - à implémenter)", "CSV"],
    statutoryRetentionYears: 7,
    legalDisclaimers: [
      "Configuration Émirats arabes unis à l'état de brouillon architectural non validé. Aucune règle fiscale n'est activée en production.",
    ],
    officialSources: ["UAE Federal Tax Authority (FTA)"],
  },
];

/**
 * Vérifie si un statut correspond à un état validé et actif pour la production réglementaire.
 */
export function isProductionActiveValidationState(
  state: CountryConfigValidationState
): boolean {
  return state === "VALIDATED_FOR_PRODUCTION" || state === "ACTIVE";
}

/**
 * Vérifie si une configuration de juridiction peut être utilisée pour un calcul fiscal engageant.
 * Bloque explicitement tout calcul si le statut ou les paramètres requis ne sont pas vérifiés.
 */
export function evaluateCountryFiscalReadiness(config: CountryConfigurationVersion): {
  canRunProductionFiscalCalculation: boolean;
  canRunIndicativeSimulationWithVerifiedRates: boolean;
  blockingReasons: string[];
} {
  const blockingReasons: string[] = [];

  if (
    !isProductionActiveValidationState(config.validationStatus) ||
    !config.isProductionEnabled ||
    !config.validatedByProfessional
  ) {
    blockingReasons.push(
      `La configuration ${config.countryCode} (${config.versionId}) a le statut "${config.validationStatus}" et n'est pas activée pour des fonctions fiscales de production.`
    );
  }

  const indirectSystem = config.indirectTaxSystem ?? "VAT";
  if (indirectSystem !== "NONE" && config.vatRates.length === 0) {
    blockingReasons.push(
      `Aucun taux de taxe indirecte (${indirectSystem}) configuré pour ${config.countryCode}.`
    );
  }

  const unverifiedThresholds = config.thresholds.filter(
    (t) => !t.isVerified || t.amountMinor === null
  );
  if (unverifiedThresholds.length > 0) {
    blockingReasons.push(
      `${unverifiedThresholds.length} seuil(s) fiscal/social non vérifié(s) pour ${config.countryCode} (${unverifiedThresholds.map((t) => t.code).join(", ")}).`
    );
  }

  const isDraftOrObsolete =
    config.validationStatus === "DRAFT" ||
    config.validationStatus === "DRAFT_INCOMPLETE" ||
    config.validationStatus === "SUSPENDED" ||
    config.validationStatus === "OBSOLETE" ||
    config.validationStatus === "DEPRECATED";

  return {
    canRunProductionFiscalCalculation: blockingReasons.length === 0,
    canRunIndicativeSimulationWithVerifiedRates:
      (indirectSystem === "NONE" || config.vatRates.some((r) => r.isVerified)) &&
      !isDraftOrObsolete,
    blockingReasons,
  };
}

/**
 * Empêche formellement l'activation en production (`ACTIVE` / `VALIDATED_FOR_PRODUCTION`)
 * d'une configuration de juridiction incomplète ou non validée par un professionnel habilité (Section 5 & 7).
 */
export function assertCanActivateJurisdictionForProduction(
  config: CountryConfigurationVersion
): void {
  if (!config.validatedByProfessional || config.validatedByProfessional.trim().length < 3) {
    throw new Error(
      `Activation en production refusée pour ${config.countryCode} (${config.versionId}) : identité du validateur professionnel ou juridique manquante.`
    );
  }
  if (!config.validatedAt) {
    throw new Error(
      `Activation en production refusée pour ${config.countryCode} (${config.versionId}) : date de validation manquante.`
    );
  }
  if (config.officialSources.length === 0) {
    throw new Error(
      `Activation en production refusée pour ${config.countryCode} (${config.versionId}) : aucune source officielle référencée.`
    );
  }
  const indirectSystem = config.indirectTaxSystem ?? "VAT";
  if (indirectSystem !== "NONE") {
    const hasVerifiedRate = config.vatRates.some((r) => r.isVerified);
    if (!hasVerifiedRate) {
      throw new Error(
        `Activation en production refusée pour ${config.countryCode} (${config.versionId}) : aucun taux de taxe vérifié n'est disponible.`
      );
    }
  }
  const unverifiedThresholds = config.thresholds.filter(
    (t) => !t.isVerified || t.amountMinor === null
  );
  if (unverifiedThresholds.length > 0) {
    throw new Error(
      `Activation en production refusée pour ${config.countryCode} (${config.versionId}) : ${unverifiedThresholds.length} seuil(s) demeurent non vérifiés.`
    );
  }
}

/**
 * Résout la version exacte de configuration d'une juridiction applicable à une date donnée (`effectiveDate`),
 * garantissant que les changements de règles ultérieurs ne modifient jamais silencieusement les calculs historiques.
 */
export function resolveJurisdictionConfigForDate(
  allVersions: ReadonlyArray<CountryConfigurationVersion>,
  countryCode: string,
  effectiveDate: string
): CountryConfigurationVersion {
  const code = countryCode.trim().toUpperCase();
  const candidates = allVersions.filter(
    (v) =>
      v.countryCode.toUpperCase() === code &&
      v.effectiveFrom <= effectiveDate &&
      (v.effectiveTo === null || v.effectiveTo >= effectiveDate)
  );

  if (candidates.length === 0) {
    throw new Error(
      `Aucune version de configuration réglementaire trouvée pour la juridiction "${code}" à la date d'effet ${effectiveDate}.`
    );
  }

  // En cas de chevauchement, trier par date d'entrée en vigueur la plus récente
  candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0]!;
}
