/**
 * Système d'internationalisation (i18n), de support RTL (droite-à-gauche, ex: arabe)
 * et de formatage régional des dates/heures/nombres (Section 6 — Extension Internationale).
 *
 * Langues prises en charge dans ce socle :
 * - `fr` (Français — LTR : France, Belgique, Luxembourg, Suisse romande, Maroc, Tunisie, Afrique francophone)
 * - `en` (Anglais — LTR : International, Moyen-Orient, Amériques, Asie-Pacifique)
 * - `ar` (Arabe — RTL : Maghreb, Émirats arabes unis, Arabie saoudite, Qatar, Bahreïn, Oman, Koweït)
 */

export type SupportedLanguageCode = "fr" | "en" | "ar";

export interface LocaleDescriptor {
  languageCode: SupportedLanguageCode;
  bcp47Locale: string;
  direction: "ltr" | "rtl";
  nativeLabel: string;
}

export const SUPPORTED_LOCALES_CATALOG: Record<SupportedLanguageCode, LocaleDescriptor> = {
  fr: {
    languageCode: "fr",
    bcp47Locale: "fr-FR",
    direction: "ltr",
    nativeLabel: "Français (LTR)",
  },
  en: {
    languageCode: "en",
    bcp47Locale: "en-US",
    direction: "ltr",
    nativeLabel: "English (LTR)",
  },
  ar: {
    languageCode: "ar",
    bcp47Locale: "ar-AE",
    direction: "rtl",
    nativeLabel: "العربية (RTL)",
  },
};

export interface UiDictionary {
  regulatoryBannerPrefix: string;
  humanValidationBadge: string;
  rbacActiveBadge: string;
  aiNonAutoValidatingBadge: string;
  activeOrganizationLabel: string;
  activeDossierLabel: string;
  activePeriodLabel: string;
  languageSelectorLabel: string;
  navDashboard: string;
  navDossiers: string;
  navDocuments: string;
  navInvoicing: string;
  navJournal: string;
  navBanking: string;
  navVat: string;
  navSimulator: string;
  navAnomalies: string;
  navOrganizations: string;
  navUsers: string;
  navCountries: string;
  navSettingsAudit: string;
  logoutButton: string;
  loginSubmitButton: string;
  kpiActiveDossiers: string;
  kpiAuthorizedUsers: string;
  kpiDocsPendingReview: string;
  kpiDocsValidated: string;
  kpiEntriesDraftOrAi: string;
  kpiAuditEvents: string;
  createDossierHeading: string;
  createOrgHeading: string;
  countriesHeading: string;
}

export const I18N_DICTIONARIES: Record<SupportedLanguageCode, UiDictionary> = {
  fr: {
    regulatoryBannerPrefix: "Positionnement réglementaire :",
    humanValidationBadge: "Validation Humaine Obligatoire",
    rbacActiveBadge: "Contrôle Serveur RBAC Actif",
    aiNonAutoValidatingBadge: "IA Assistive Non Auto-Validante",
    activeOrganizationLabel: "Organisation active (Tenant)",
    activeDossierLabel: "Dossier client actif",
    activePeriodLabel: "Période comptable",
    languageSelectorLabel: "Langue & Direction (i18n / RTL)",
    navDashboard: "Tableau de bord",
    navDossiers: "Dossiers clients",
    navDocuments: "Documents & OCR",
    navInvoicing: "Facturation & Devis",
    navJournal: "Journal comptable",
    navBanking: "Banque & Rapprochement",
    navVat: "TVA",
    navSimulator: "Simulateur micro-entrepreneur",
    navAnomalies: "Anomalies & Contrôles",
    navOrganizations: "Organisations (Tenants)",
    navUsers: "Utilisateurs & Rôles",
    navCountries: "Juridictions & Pays",
    navSettingsAudit: "Exports & Paramètres",
    logoutButton: "Déconnexion",
    loginSubmitButton: "Se connecter de manière sécurisée",
    kpiActiveDossiers: "Dossiers clients actifs",
    kpiAuthorizedUsers: "Utilisateurs habilités",
    kpiDocsPendingReview: "Documents en attente de révision",
    kpiDocsValidated: "Documents validés",
    kpiEntriesDraftOrAi: "Écritures en brouillon / suggestion IA",
    kpiAuditEvents: "Événements d'audit SHA-256",
    createDossierHeading: "Créer un nouveau dossier client (Multi-Juridictions & Multi-Devises)",
    createOrgHeading: "Créer une nouvelle organisation (Tenant isolé)",
    countriesHeading: "Registre des Juridictions & Versions Réglementaires",
  },
  en: {
    regulatoryBannerPrefix: "Regulatory positioning:",
    humanValidationBadge: "Mandatory Human Validation",
    rbacActiveBadge: "Server-Side RBAC Active",
    aiNonAutoValidatingBadge: "Non-Auto-Validating Assistive AI",
    activeOrganizationLabel: "Active Organization (Tenant)",
    activeDossierLabel: "Active Client Dossier",
    activePeriodLabel: "Accounting Period",
    languageSelectorLabel: "Language & Direction (i18n / RTL)",
    navDashboard: "Dashboard",
    navDossiers: "Client Dossiers",
    navDocuments: "Documents & OCR",
    navInvoicing: "Invoicing & Quotes",
    navJournal: "Accounting Journal",
    navBanking: "Bank & Reconciliation",
    navVat: "VAT",
    navSimulator: "Micro-Entrepreneur Simulator",
    navAnomalies: "Anomalies & Controls",
    navOrganizations: "Organizations (Tenants)",
    navUsers: "Users & Roles",
    navCountries: "Jurisdictions & Countries",
    navSettingsAudit: "Exports & Settings",
    logoutButton: "Sign out",
    loginSubmitButton: "Sign in securely",
    kpiActiveDossiers: "Active Client Dossiers",
    kpiAuthorizedUsers: "Authorized Users",
    kpiDocsPendingReview: "Documents Pending Review",
    kpiDocsValidated: "Validated Documents",
    kpiEntriesDraftOrAi: "Draft / AI Suggested Entries",
    kpiAuditEvents: "SHA-256 Audit Events",
    createDossierHeading: "Create a New Client Dossier (Multi-Jurisdiction & Multi-Currency)",
    createOrgHeading: "Create a New Organization (Isolated Tenant)",
    countriesHeading: "Jurisdictions & Versioned Regulatory Configurations",
  },
  ar: {
    regulatoryBannerPrefix: "الموقف التنظيمي:",
    humanValidationBadge: "اعتماد بشري إلزامي",
    rbacActiveBadge: "تحكم الصلاحيات الخادمي نشط",
    aiNonAutoValidatingBadge: "ذكاء اصطناعي مساعد غير معتمد تلقائياً",
    activeOrganizationLabel: "المؤسسة النشطة (المستأجر)",
    activeDossierLabel: "ملف العميل النشط",
    activePeriodLabel: "الفترة المحاسبية",
    languageSelectorLabel: "اللغة والاتجاه (RTL / LTR)",
    navDashboard: "لوحة القيادة",
    navDossiers: "ملفات العملاء",
    navDocuments: "المستندات والتعرف الضوئي",
    navInvoicing: "الفوترة وعروض الأسعار",
    navJournal: "دفتر اليومية المحاسبي",
    navBanking: "البنك والتسوية البنكية",
    navVat: "ضريبة القيمة المضافة",
    navSimulator: "محاكي المقاول الذاتي",
    navAnomalies: "الاختلالات والضوابط",
    navOrganizations: "المؤسسات (المستأجرون)",
    navUsers: "المستخدمون والأدوار",
    navCountries: "السلطات القضائية والدول",
    navSettingsAudit: "التصدير والإعدادات",
    logoutButton: "تسجيل الخروج",
    loginSubmitButton: "تسجيل الدخول بأمان",
    kpiActiveDossiers: "ملفات العملاء النشطة",
    kpiAuthorizedUsers: "المستخدمون المصرح لهم",
    kpiDocsPendingReview: "مستندات قيد المراجعة البشرية",
    kpiDocsValidated: "مستندات معتمدة",
    kpiEntriesDraftOrAi: "قيود مسودة أو مقترحة بالذكاء الاصطناعي",
    kpiAuditEvents: "أحداث التدقيق المشفرة SHA-256",
    createDossierHeading: "إنشاء ملف عميل جديد (متعدد الدول والعملات)",
    createOrgHeading: "إنشاء مؤسسة جديدة (مستأجر معزول)",
    countriesHeading: "سجل السلطات القضائية والإصدارات التنظيمية",
  },
};

export function resolveLocaleDescriptor(localeOrLang?: string): LocaleDescriptor {
  const normalized = (localeOrLang || "fr").trim().toLowerCase();
  if (normalized.startsWith("ar")) {
    return SUPPORTED_LOCALES_CATALOG.ar;
  }
  if (normalized.startsWith("en")) {
    return SUPPORTED_LOCALES_CATALOG.en;
  }
  return SUPPORTED_LOCALES_CATALOG.fr;
}

export function getDictionary(localeOrLang?: string): UiDictionary {
  const desc = resolveLocaleDescriptor(localeOrLang);
  return I18N_DICTIONARIES[desc.languageCode];
}

/**
 * Formate une date ISO selon la locale, le fuseau horaire IANA et le calendrier (ex: Grégorien ou Hijri si demandé).
 */
export function formatLocalizedDate(
  isoDateOrTimestamp: string,
  options: {
    locale?: string;
    timeZone?: string;
    calendar?: "gregory" | "islamic-umalqura";
  } = {}
): string {
  const locale = options.locale ?? "fr-FR";
  const timeZone = options.timeZone ?? "UTC";
  const dateObj = new Date(
    isoDateOrTimestamp.length === 10
      ? `${isoDateOrTimestamp}T00:00:00Z`
      : isoDateOrTimestamp
  );
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error(`Date invalide : "${isoDateOrTimestamp}"`);
  }

  const effectiveLocale = options.calendar
    ? `${locale}-u-ca-${options.calendar}`
    : locale;

  return new Intl.DateTimeFormat(effectiveLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(dateObj);
}
