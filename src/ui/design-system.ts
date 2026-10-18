import { AppConfig, appConfig } from "../config/app-config.js";

/**
 * Design System centralisé — ComptaNova Phase 1 (Sections 5, 6, 7 & 8).
 *
 * Règles d'architecture visuelle (Section G de la Directive de Pilotage) :
 * - Source unique de vérité pour l'ensemble des tokens de couleurs, typographie, espacements, rayons, ombres et états d'interface.
 * - Zéro couleur codée en dur en dehors de la déclaration `:root` générée depuis `AppConfig.brandColors`.
 * - Accessibilité clavier native (`:focus-visible` haute visibilité), contrastes conformes WCAG AA, et mises en page responsives (`>= 1024px`, `768px-1023px`, `< 768px`) et RTL (`dir="rtl"`).
 */

export interface NavigationModuleItem {
  id: string;
  tabId: string;
  navButtonId: string;
  i18nKey: string;
  defaultLabelFr: string;
  order: number;
}

/**
 * Les 10 entrées principales de navigation de la Phase 1 (Section 8).
 */
export const PHASE1_NAVIGATION_MODULES: ReadonlyArray<NavigationModuleItem> = [
  {
    id: "dashboard",
    tabId: "tab-dashboard",
    navButtonId: "i18n-nav-dashboard",
    i18nKey: "navDashboard",
    defaultLabelFr: "Tableau de bord",
    order: 1,
  },
  {
    id: "dossiers",
    tabId: "tab-dossiers",
    navButtonId: "i18n-nav-dossiers",
    i18nKey: "navDossiers",
    defaultLabelFr: "Dossiers clients",
    order: 2,
  },
  {
    id: "documents",
    tabId: "tab-documents",
    navButtonId: "i18n-nav-documents",
    i18nKey: "navDocuments",
    defaultLabelFr: "Documents & OCR",
    order: 3,
  },
  {
    id: "invoicing",
    tabId: "tab-invoicing",
    navButtonId: "i18n-nav-invoicing",
    i18nKey: "navInvoicing",
    defaultLabelFr: "Facturation & Devis",
    order: 4,
  },
  {
    id: "journal",
    tabId: "tab-journal",
    navButtonId: "i18n-nav-journal",
    i18nKey: "navJournal",
    defaultLabelFr: "Journal comptable",
    order: 5,
  },
  {
    id: "banking",
    tabId: "tab-banking",
    navButtonId: "i18n-nav-banking",
    i18nKey: "navBanking",
    defaultLabelFr: "Banque & Rapprochement",
    order: 6,
  },
  {
    id: "vat",
    tabId: "tab-vat",
    navButtonId: "i18n-nav-vat",
    i18nKey: "navVat",
    defaultLabelFr: "TVA",
    order: 7,
  },
  {
    id: "simulator",
    tabId: "tab-simulator",
    navButtonId: "i18n-nav-simulator",
    i18nKey: "navSimulator",
    defaultLabelFr: "Simulateur micro-entrepreneur",
    order: 8,
  },
  {
    id: "anomalies",
    tabId: "tab-anomalies",
    navButtonId: "i18n-nav-anomalies",
    i18nKey: "navAnomalies",
    defaultLabelFr: "Anomalies & Contrôles",
    order: 9,
  },
  {
    id: "settings",
    tabId: "tab-settings",
    navButtonId: "i18n-nav-settings",
    i18nKey: "navSettingsAudit",
    defaultLabelFr: "Exports & Paramètres",
    order: 10,
  },
];

/**
 * Calcule la luminance relative WCAG 2.1 d'une couleur hexadécimale `#RRGGBB`.
 */
export function calculateRelativeLuminance(hexColor: string): number {
  const clean = hexColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Format hexadécimal invalide pour le calcul de contraste : "${hexColor}"`);
  }
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calcule le ratio de contraste WCAG 2.1 entre deux couleurs `#RRGGBB` (valeur entre 1 et 21).
 */
export function calculateWcagContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = calculateRelativeLuminance(foregroundHex);
  const l2 = calculateRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * Génère la feuille de style CSS complète du Design System ComptaNova Phase 1.
 * Toutes les couleurs sont déclarées une seule fois dans `:root` et consommées via `var(--cn-...)`.
 */
export function buildDesignSystemStylesheet(config: AppConfig = appConfig): string {
  const c = config.brandColors;
  return `
    :root {
      --cn-primary: ${c.primaryDeepEmerald};
      --cn-action: ${c.secondaryJade};
      --cn-accent-amber: ${c.accentWarmAmber};
      --cn-bg-app: ${c.surfaceOffWhite};
      --cn-bg-surface: ${c.surfaceCard};
      --cn-text-primary: ${c.textGraphite};
      --cn-text-secondary: ${c.textSecondary};
      --cn-border: ${c.borderSubtle};
      --cn-success: ${c.statusSuccess};
      --cn-success-bg: ${c.statusSuccessBg};
      --cn-warning: ${c.statusWarning};
      --cn-warning-bg: ${c.statusWarningBg};
      --cn-danger: ${c.statusDanger};
      --cn-danger-bg: ${c.statusDangerBg};
      --cn-info: ${c.statusInfo};
      --cn-info-bg: ${c.statusInfoBg};

      --cn-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif;
      --cn-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

      --cn-radius-sm: 6px;
      --cn-radius-md: 8px;
      --cn-radius-lg: 12px;
      --cn-radius-pill: 999px;

      --cn-space-1: 0.25rem;
      --cn-space-2: 0.5rem;
      --cn-space-3: 0.75rem;
      --cn-space-4: 1rem;
      --cn-space-5: 1.25rem;
      --cn-space-6: 1.5rem;
      --cn-space-8: 2rem;

      --cn-shadow-card: 0 1px 3px rgba(23, 33, 43, 0.06);
      --cn-shadow-elevated: 0 8px 24px rgba(23, 33, 43, 0.12);

      /* Alias rétrocompatibles avec les composants existants */
      --bg-app: var(--cn-bg-app);
      --bg-surface: var(--cn-bg-surface);
      --bg-sidebar: var(--cn-primary);
      --text-main: var(--cn-text-primary);
      --text-muted: var(--cn-text-secondary);
      --border-color: var(--cn-border);
      --primary: var(--cn-primary);
      --primary-hover: var(--cn-action);
      --accent-amber: var(--cn-accent-amber);
      --ai-badge-bg: var(--cn-warning-bg);
      --ai-badge-text: var(--cn-warning);
      --ai-badge-border: var(--cn-accent-amber);
      --valid-badge-bg: var(--cn-success-bg);
      --valid-badge-text: var(--cn-success);
      --valid-badge-border: var(--cn-success);
      --danger-bg: var(--cn-danger-bg);
      --danger-text: var(--cn-danger);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: var(--cn-font-sans);
      background: var(--cn-bg-app);
      color: var(--cn-text-primary);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* Lien d'évitement clavier (WCAG 2.4.1) */
    .skip-link {
      position: absolute;
      inset-block-start: -999px;
      inset-inline-start: var(--cn-space-4);
      background: var(--cn-primary);
      color: var(--cn-bg-surface);
      padding: var(--cn-space-2) var(--cn-space-4);
      border-radius: var(--cn-radius-sm);
      border: 2px solid var(--cn-accent-amber);
      font-weight: 600;
      z-index: 9999;
      text-decoration: none;
    }
    .skip-link:focus {
      inset-block-start: var(--cn-space-2);
    }

    /* Visibilité universelle du focus clavier (WCAG 2.4.7) */
    a:focus-visible,
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    [tabindex]:focus-visible {
      outline: 2px solid var(--cn-accent-amber);
      outline-offset: 2px;
    }

    .font-mono-tabular {
      font-family: var(--cn-font-mono);
      font-variant-numeric: tabular-nums;
    }

    .regulatory-banner {
      background: var(--cn-primary);
      color: var(--cn-bg-surface);
      font-size: 0.82rem;
      padding: 0.55rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--cn-space-4);
      border-bottom: 2px solid var(--cn-accent-amber);
    }

    .layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: calc(100vh - 42px);
    }

    /* Tablette (768px - 1023px) */
    @media (max-width: 1023px) {
      .layout {
        grid-template-columns: 240px 1fr;
      }
      .main-area {
        padding: var(--cn-space-4) var(--cn-space-5);
      }
    }

    /* Mobile (< 768px) */
    @media (max-width: 767px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .sidebar-nav-list {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--cn-space-2);
      }
      .main-area {
        padding: var(--cn-space-4);
      }
    }

    .sidebar {
      background: var(--cn-primary);
      color: var(--cn-bg-surface);
      padding: var(--cn-space-5);
      display: flex;
      flex-direction: column;
      gap: var(--cn-space-4);
    }

    .brand-header {
      display: flex;
      align-items: center;
      gap: var(--cn-space-3);
    }

    .brand-monogram {
      width: 36px;
      height: 36px;
      border-radius: var(--cn-radius-md);
      background: var(--cn-action);
      border: 1px solid var(--cn-accent-amber);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--cn-bg-surface);
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--cn-bg-surface);
      margin: 0;
    }

    .brand-sub {
      font-size: 0.78rem;
      color: var(--cn-bg-app);
      margin-top: 0.15rem;
      opacity: 0.9;
    }

    .sidebar-nav-list {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      flex: 1;
    }

    .nav-btn {
      width: 100%;
      text-align: start;
      background: transparent;
      color: var(--cn-bg-surface);
      border: 1px solid transparent;
      padding: 0.6rem 0.85rem;
      border-radius: var(--cn-radius-sm);
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 500;
      transition: background 0.15s, border-color 0.15s;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cn-space-2);
    }

    .nav-btn:hover {
      background: var(--cn-action);
      color: var(--cn-bg-surface);
    }

    .nav-btn.active {
      background: var(--cn-action);
      color: var(--cn-bg-surface);
      border-color: var(--cn-accent-amber);
      font-weight: 600;
    }

    .main-area {
      padding: var(--cn-space-6) var(--cn-space-8);
      max-width: 1440px;
      width: 100%;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--cn-space-5);
      padding-bottom: var(--cn-space-4);
      border-bottom: 1px solid var(--cn-border);
      flex-wrap: wrap;
      gap: var(--cn-space-4);
    }

    .context-selectors-bar {
      background: var(--cn-bg-surface);
      border: 1px solid var(--cn-border);
      border-radius: var(--cn-radius-md);
      padding: var(--cn-space-3) var(--cn-space-4);
      margin-bottom: var(--cn-space-5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--cn-space-4);
      box-shadow: var(--cn-shadow-card);
    }

    .card {
      background: var(--cn-bg-surface);
      border: 1px solid var(--cn-border);
      border-radius: var(--cn-radius-md);
      padding: var(--cn-space-5);
      margin-bottom: var(--cn-space-5);
      box-shadow: var(--cn-shadow-card);
    }

    .card h2, .card h3, .card h4 {
      margin-top: 0;
      color: var(--cn-text-primary);
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--cn-space-4);
      margin-bottom: var(--cn-space-5);
    }

    .kpi-box {
      background: var(--cn-bg-surface);
      border: 1px solid var(--cn-border);
      border-radius: var(--cn-radius-md);
      padding: var(--cn-space-4);
      box-shadow: var(--cn-shadow-card);
    }

    .kpi-label {
      font-size: 0.78rem;
      color: var(--cn-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
    }

    .kpi-value {
      font-size: 1.7rem;
      font-weight: 700;
      margin-top: 0.3rem;
      font-family: var(--cn-font-mono);
      font-variant-numeric: tabular-nums;
      color: var(--cn-text-primary);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: var(--cn-radius-pill);
      border: 1px solid transparent;
    }

    .badge-ai {
      background: var(--cn-warning-bg);
      color: var(--cn-warning);
      border-color: var(--cn-accent-amber);
    }

    .badge-valid {
      background: var(--cn-success-bg);
      color: var(--cn-success);
      border-color: var(--cn-success);
    }

    .badge-draft {
      background: var(--cn-bg-app);
      color: var(--cn-text-secondary);
      border-color: var(--cn-border);
    }

    .badge-danger {
      background: var(--cn-danger-bg);
      color: var(--cn-danger);
      border-color: var(--cn-danger);
    }

    .badge-info {
      background: var(--cn-info-bg);
      color: var(--cn-info);
      border-color: var(--cn-info);
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 0.85rem;
      margin-bottom: var(--cn-space-4);
    }

    label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: var(--cn-text-primary);
    }

    input, select, textarea {
      width: 100%;
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--cn-border);
      border-radius: var(--cn-radius-sm);
      font-size: 0.9rem;
      font-family: var(--cn-font-sans);
      color: var(--cn-text-primary);
      background: var(--cn-bg-surface);
    }

    button.btn-primary {
      background: var(--cn-action);
      color: var(--cn-bg-surface);
      border: 1px solid var(--cn-primary);
      padding: 0.6rem 1.1rem;
      border-radius: var(--cn-radius-sm);
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    button.btn-primary:hover {
      background: var(--cn-primary);
    }

    button.btn-secondary {
      background: var(--cn-bg-app);
      color: var(--cn-text-primary);
      border: 1px solid var(--cn-border);
      padding: 0.5rem 0.9rem;
      border-radius: var(--cn-radius-sm);
      font-weight: 500;
      cursor: pointer;
    }

    button.btn-secondary:hover {
      border-color: var(--cn-text-secondary);
    }

    button.btn-danger {
      background: var(--cn-danger-bg);
      color: var(--cn-danger);
      border: 1px solid var(--cn-danger);
      padding: 0.5rem 0.9rem;
      border-radius: var(--cn-radius-sm);
      font-weight: 600;
      cursor: pointer;
    }

    .table-responsive {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    th, td {
      text-align: start;
      padding: 0.65rem 0.75rem;
      border-bottom: 1px solid var(--cn-border);
    }

    th {
      background: var(--cn-bg-app);
      font-weight: 600;
      color: var(--cn-text-primary);
    }

    /* Les 5 états d'interface obligatoires (Section 8 & Garde-fous Lot 1.1) */
    .cn-state-box {
      padding: var(--cn-space-4) var(--cn-space-5);
      border-radius: var(--cn-radius-md);
      margin-bottom: var(--cn-space-4);
      font-size: 0.9rem;
      border: 1px solid var(--cn-border);
    }

    .cn-state-loading {
      background: var(--cn-info-bg);
      color: var(--cn-info);
      border-color: var(--cn-info);
    }

    .cn-state-empty {
      background: var(--cn-bg-app);
      color: var(--cn-text-secondary);
      border-style: dashed;
      text-align: center;
      padding: var(--cn-space-6);
    }

    .cn-state-error, .alert-error {
      background: var(--cn-danger-bg);
      color: var(--cn-danger);
      border-color: var(--cn-danger);
    }

    .cn-state-confirm {
      background: var(--cn-warning-bg);
      color: var(--cn-text-primary);
      border: 2px solid var(--cn-accent-amber);
    }

    .cn-state-forbidden {
      background: var(--cn-warning-bg);
      color: var(--cn-warning);
      border-color: var(--cn-accent-amber);
    }

    .alert-box {
      padding: 0.8rem 1rem;
      border-radius: var(--cn-radius-sm);
      margin-bottom: var(--cn-space-4);
      font-size: 0.88rem;
      border: 1px solid var(--cn-border);
    }

    .alert-info {
      background: var(--cn-success-bg);
      color: var(--cn-primary);
      border-color: var(--cn-action);
    }

    .hidden {
      display: none !important;
    }
  `;
}
