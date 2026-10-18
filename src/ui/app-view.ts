import { appConfig } from "../config/app-config.js";
import {
  resolveLocaleDescriptor,
  getDictionary,
  I18N_DICTIONARIES,
  SUPPORTED_LOCALES_CATALOG,
} from "../i18n/translations.js";

/**
 * Interface initiale internationalisée et responsive (Section 6 — Extension Internationale).
 * - Utilise exclusivement `appConfig.appName`.
 * - Supporte plusieurs langues (`fr`, `en`, `ar`) sans texte métier figé dans la logique JS.
 * - Supporte les écritures et mises en page de droite à gauche (`dir="rtl"` pour l'arabe `ar`) avec propriétés logiques CSS (`text-align: start`, `padding-inline`, etc.).
 * - Charge dynamiquement les juridictions et régimes fiscaux depuis l'API `/api/countries` (plus d'options limitées aux 4 pays européens).
 */

export function renderAppHtml(requestedLang: string = "fr"): string {
  const localeDesc = resolveLocaleDescriptor(requestedLang);
  const dict = getDictionary(localeDesc.languageCode);

  const escapedAppName = appConfig.appName.replace(/</g, "&lt;");
  const escapedTagline = appConfig.appTagline.replace(/</g, "&lt;");
  const escapedDisclaimer = appConfig.regulatoryDisclaimer.replace(/</g, "&lt;");
  const escapedAiWarning = appConfig.aiSuggestionWarning.replace(/</g, "&lt;");

  const serializedDictionaries = JSON.stringify(I18N_DICTIONARIES);
  const serializedLocales = JSON.stringify(SUPPORTED_LOCALES_CATALOG);

  return `<!DOCTYPE html>
<html lang="${localeDesc.languageCode}" dir="${localeDesc.direction}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedAppName} — International Multi-Tenant &amp; Multi-Jurisdiction SaaS</title>
  <style>
    :root {
      --bg-app: #f4f6f9;
      --bg-surface: #ffffff;
      --bg-sidebar: #0f172a;
      --text-main: #0f172a;
      --text-muted: #475569;
      --border-color: #e2e8f0;
      --primary: #1d4ed8;
      --primary-hover: #1e40af;
      --ai-badge-bg: #fef3c7;
      --ai-badge-text: #92400e;
      --ai-badge-border: #f59e0b;
      --valid-badge-bg: #dcfce7;
      --valid-badge-text: #166534;
      --valid-badge-border: #22c55e;
      --danger-bg: #fee2e2;
      --danger-text: #991b1b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, "Noto Sans Arabic", Tahoma, sans-serif;
      background: var(--bg-app);
      color: var(--text-main);
      line-height: 1.5;
    }
    .regulatory-banner {
      background: #1e293b;
      color: #f8fafc;
      font-size: 0.82rem;
      padding: 0.55rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      border-bottom: 2px solid #f59e0b;
    }
    .layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: calc(100vh - 38px);
    }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
    }
    .sidebar {
      background: var(--bg-sidebar);
      color: #f8fafc;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .brand-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin: 0;
    }
    .brand-sub {
      font-size: 0.78rem;
      color: #94a3b8;
      margin-top: 0.25rem;
    }
    .nav-btn {
      width: 100%;
      text-align: start;
      background: transparent;
      color: #cbd5e1;
      border: 1px solid transparent;
      padding: 0.65rem 0.85rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.15s;
    }
    .nav-btn:hover, .nav-btn:focus-visible {
      background: #1e293b;
      color: #ffffff;
      outline: 2px solid #60a5fa;
    }
    .nav-btn.active {
      background: var(--primary);
      color: #ffffff;
    }
    .main-area {
      padding: 1.5rem 2rem;
      max-width: 1380px;
      width: 100%;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .card h2, .card h3 {
      margin-top: 0;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .kpi-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
    }
    .kpi-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-value {
      font-size: 1.75rem;
      font-weight: 700;
      margin-top: 0.3rem;
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 999px;
      border: 1px solid transparent;
    }
    .badge-ai {
      background: var(--ai-badge-bg);
      color: var(--ai-badge-text);
      border-color: var(--ai-badge-border);
    }
    .badge-valid {
      background: var(--valid-badge-bg);
      color: var(--valid-badge-text);
      border-color: var(--valid-badge-border);
    }
    .badge-draft {
      background: #e2e8f0;
      color: #334155;
      border-color: #94a3b8;
    }
    .badge-danger {
      background: var(--danger-bg);
      color: var(--danger-text);
      border-color: #f87171;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 0.85rem;
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: #334155;
    }
    input, select {
      width: 100%;
      padding: 0.55rem 0.7rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    button.btn-primary {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.6rem 1.1rem;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    button.btn-primary:hover { background: var(--primary-hover); }
    button.btn-secondary {
      background: #e2e8f0;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      padding: 0.5rem 0.9rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    th, td {
      text-align: start;
      padding: 0.65rem 0.75rem;
      border-bottom: 1px solid var(--border-color);
    }
    th {
      background: #f8fafc;
      font-weight: 600;
      color: #334155;
    }
    .alert-box {
      padding: 0.8rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.88rem;
    }
    .alert-error {
      background: var(--danger-bg);
      color: var(--danger-text);
      border: 1px solid #f87171;
    }
    .alert-info {
      background: #eff6ff;
      color: #1e3a8a;
      border: 1px solid #93c5fd;
    }
    .hidden { display: none !important; }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 1rem;
    }
  </style>
</head>
<body>
  <div class="regulatory-banner" role="region" aria-label="Regulatory Notice">
    <span><strong id="i18n-reg-prefix">${dict.regulatoryBannerPrefix}</strong> ${escapedDisclaimer}</span>
    <span id="i18n-human-badge" class="badge badge-ai">${dict.humanValidationBadge}</span>
  </div>

  <!-- VUE CONNEXION (Étape 0.6) -->
  <div id="login-view" style="max-width: 540px; margin: 3.5rem auto; padding: 0 1rem;">
    <div class="card">
      <h1 style="margin-top:0; font-size:1.5rem;">${escapedAppName}</h1>
      <p style="color:var(--text-muted); font-size:0.9rem;">${escapedTagline}</p>
      <div id="login-error" class="alert-box alert-error hidden" role="alert"></div>
      <form id="login-form">
        <div style="margin-bottom:0.85rem;">
          <label for="login-email">Email</label>
          <input id="login-email" type="email" required value="expert@cabinet-hexagone-demo.local" />
        </div>
        <div style="margin-bottom:1rem;">
          <label for="login-password">Password / Mot de passe</label>
          <input id="login-password" type="password" required value="DemoAdmin2026!" />
        </div>
        <button id="i18n-login-submit" type="submit" class="btn-primary" style="width:100%;">${dict.loginSubmitButton}</button>
      </form>

      <hr style="margin: 1.25rem 0; border: none; border-top: 1px solid var(--border-color);" />
      <p style="font-size:0.82rem; font-weight:600; margin-bottom:0.5rem;">Comptes de démonstration (isolation multi-tenant &amp; RBAC) :</p>
      <div style="display:flex; flex-direction:column; gap:0.4rem;">
        <button type="button" class="btn-secondary demo-fill" data-email="expert@cabinet-hexagone-demo.local">
          1. Admin de Cabinet (Cabinet Hexagone — Tenant A)
        </button>
        <button type="button" class="btn-secondary demo-fill" data-email="collab@cabinet-hexagone-demo.local">
          2. Collaborateur Comptable (Accès limité aux dossiers affectés — Tenant A)
        </button>
        <button type="button" class="btn-secondary demo-fill" data-email="direction@atelier-lumiere-demo.local">
          3. Dirigeante PME (Atelier Lumière SAS — Tenant B isolé)
        </button>
        <button type="button" class="btn-secondary demo-fill" data-email="superadmin@demo.local">
          4. Administrateur Plateforme (Accès client soumis à justification tracée)
        </button>
      </div>
    </div>
  </div>

  <!-- VUE APPLICATION AUTHENTIFIÉE -->
  <div id="app-view" class="layout hidden">
    <aside class="sidebar" aria-label="Navigation principale">
      <div>
        <h1 class="brand-title">${escapedAppName}</h1>
        <div class="brand-sub">International Multi-Tenant &amp; Multi-Jurisdiction Foundation</div>
      </div>

      <div>
        <label id="i18n-lang-label" for="lang-selector" style="color:#94a3b8;">${dict.languageSelectorLabel}</label>
        <select id="lang-selector" style="background:#1e293b; color:#fff; border-color:#334155;">
          <option value="fr" ${localeDesc.languageCode === "fr" ? "selected" : ""}>Français (LTR)</option>
          <option value="en" ${localeDesc.languageCode === "en" ? "selected" : ""}>English (LTR)</option>
          <option value="ar" ${localeDesc.languageCode === "ar" ? "selected" : ""}>العربية (RTL)</option>
        </select>
      </div>

      <div>
        <label id="i18n-org-label" for="org-selector" style="color:#94a3b8;">${dict.activeOrganizationLabel}</label>
        <select id="org-selector" style="background:#1e293b; color:#fff; border-color:#334155;"></select>
      </div>

      <nav style="display:flex; flex-direction:column; gap:0.35rem; flex:1;">
        <button id="i18n-nav-dashboard" type="button" class="nav-btn active" data-tab="tab-dashboard">${dict.navDashboard}</button>
        <button id="i18n-nav-dossiers" type="button" class="nav-btn" data-tab="tab-dossiers">${dict.navDossiers}</button>
        <button id="i18n-nav-orgs" type="button" class="nav-btn" data-tab="tab-organizations">${dict.navOrganizations}</button>
        <button id="i18n-nav-users" type="button" class="nav-btn" data-tab="tab-users">${dict.navUsers}</button>
        <button id="i18n-nav-countries" type="button" class="nav-btn" data-tab="tab-countries">${dict.navCountries}</button>
        <button id="i18n-nav-settings" type="button" class="nav-btn" data-tab="tab-settings">${dict.navSettingsAudit}</button>
      </nav>

      <div style="border-top:1px solid #334155; padding-top:0.85rem; font-size:0.8rem;">
        <div id="current-user-name" style="font-weight:600;"></div>
        <div id="current-user-role" style="color:#94a3b8; margin-bottom:0.6rem;"></div>
        <button type="button" id="logout-btn" class="btn-secondary" style="width:100%;">${dict.logoutButton}</button>
      </div>
    </aside>

    <main class="main-area">
      <div class="topbar">
        <div>
          <h2 id="active-org-heading" style="margin:0; font-size:1.35rem;">...</h2>
          <span id="active-org-meta" style="font-size:0.85rem; color:var(--text-muted);"></span>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <span id="i18n-rbac-badge" class="badge badge-valid">${dict.rbacActiveBadge}</span>
          <span id="i18n-ai-badge" class="badge badge-ai" title="${escapedAiWarning}">${dict.aiNonAutoValidatingBadge}</span>
        </div>
      </div>

      <div id="global-feedback" class="alert-box alert-info hidden" role="status"></div>

      <!-- ONGLET 1 : TABLEAU DE BORD INITIAL -->
      <section id="tab-dashboard" class="tab-panel">
        <div class="kpi-grid" id="dashboard-kpis"></div>
        <div class="card">
          <h3>Architecture Internationale à 3 Niveaux : Cœur Générique / Configuration par Juridiction / Plugins</h3>
          <p style="font-size:0.9rem; color:var(--text-muted);">
            Prise en charge native des devises à 0 décimale (XOF, JPY), 2 décimales (EUR, USD, MAD, AED, SAR) et 3 décimales (TND, BHD, OMR, KWD), de la conversion multi-devises avec taux historique audité, du support RTL (Arabe) et du versionnement des règles par date d'effet.
          </p>
          <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:0.75rem;">
            <span class="badge badge-valid">VALIDATED_BY_HUMAN : Donnée comptable validée</span>
            <span class="badge badge-ai">PROPOSED_BY_AI / NEEDS_HUMAN_REVIEW : Suggestion IA</span>
            <span class="badge badge-draft">COMPUTED_INDICATIVE : Simulation déterministe</span>
          </div>
        </div>
      </section>

      <!-- ONGLET 2 : DOSSIERS CLIENTS -->
      <section id="tab-dossiers" class="tab-panel hidden">
        <div class="card">
          <h3 id="i18n-create-dossier-heading">${dict.createDossierHeading}</h3>
          <form id="create-dossier-form">
            <div class="form-grid">
              <div>
                <label for="dossier-name">Raison sociale / Legal Entity Name</label>
                <input id="dossier-name" required placeholder="Ex: Atlas Tech SARL / شركة أطلس" />
              </div>
              <div>
                <label for="dossier-code">Code dossier</label>
                <input id="dossier-code" required placeholder="Ex: DOS-ATLAS-01" />
              </div>
              <div>
                <label for="dossier-siret">Immatriculation (SIREN / ICE / TRN)</label>
                <input id="dossier-siret" placeholder="Ex: 89123456700012" />
              </div>
              <div>
                <label for="dossier-country">Pays d'établissement</label>
                <select id="dossier-country"></select>
              </div>
              <div>
                <label for="dossier-jurisdiction">Juridiction fiscale applicable</label>
                <select id="dossier-jurisdiction"></select>
              </div>
              <div>
                <label for="dossier-regime">Régime fiscal</label>
                <select id="dossier-regime"></select>
              </div>
            </div>
            <button type="submit" class="btn-primary">Créer le dossier client</button>
          </form>
        </div>

        <div class="card">
          <h3>Dossiers clients autorisés dans l'organisation active</h3>
          <div style="margin-bottom:0.75rem;">
            <input id="filter-dossiers" placeholder="Filtrer par nom, code, juridiction ou régime..." />
          </div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Raison sociale</th>
                <th>Établissement / Juridiction Fiscale</th>
                <th>Version Règles</th>
                <th>Devise (Exposant)</th>
                <th>Régime Fiscal</th>
              </tr>
            </thead>
            <tbody id="dossiers-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- ONGLET 3 : ORGANISATIONS -->
      <section id="tab-organizations" class="tab-panel hidden">
        <div class="card">
          <h3 id="i18n-create-org-heading">${dict.createOrgHeading}</h3>
          <form id="create-org-form">
            <div class="form-grid">
              <div>
                <label for="org-name">Nom de l'organisation</label>
                <input id="org-name" required placeholder="Ex: Fiduciaire Méditerranée" />
              </div>
              <div>
                <label for="org-slug">Identifiant unique (slug)</label>
                <input id="org-slug" required placeholder="Ex: fiduciaire-mediterranee" />
              </div>
              <div>
                <label for="org-type">Type d'organisation</label>
                <select id="org-type">
                  <option value="ACCOUNTING_FIRM">Cabinet d'expertise comptable</option>
                  <option value="COMPANY">Entreprise (PME / Société)</option>
                  <option value="SOLE_PROPRIETOR">Indépendant / Micro-entrepreneur</option>
                </select>
              </div>
              <div>
                <label for="org-country">Juridiction principale</label>
                <select id="org-country"></select>
              </div>
            </div>
            <button type="submit" class="btn-primary">Créer l'organisation</button>
          </form>
        </div>

        <div class="card">
          <h3>Organisations auxquelles vous avez accès</h3>
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Slug</th>
                <th>Type</th>
                <th>Juridiction / Devise / Fuseau</th>
                <th>Quotas</th>
              </tr>
            </thead>
            <tbody id="orgs-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- ONGLET 4 : UTILISATEURS & RÔLES -->
      <section id="tab-users" class="tab-panel hidden">
        <div class="card">
          <h3>Ajouter un utilisateur à l'organisation active</h3>
          <form id="add-user-form">
            <div class="form-grid">
              <div>
                <label for="new-user-name">Nom complet</label>
                <input id="new-user-name" required placeholder="Ex: Nadia Mansouri" />
              </div>
              <div>
                <label for="new-user-email">Email professionnel</label>
                <input id="new-user-email" type="email" required placeholder="nadia@cabinet.local" />
              </div>
              <div>
                <label for="new-user-password">Mot de passe initial</label>
                <input id="new-user-password" type="password" required value="Collaborateur2026!" />
              </div>
              <div>
                <label for="new-user-role">Rôle RBAC dans l'organisation</label>
                <select id="new-user-role">
                  <option value="ACCOUNTANT_COLLABORATOR">Collaborateur comptable (ACCOUNTANT_COLLABORATOR)</option>
                  <option value="CLIENT_DIRECTOR">Dirigeant ou client (CLIENT_DIRECTOR)</option>
                  <option value="FIRM_ADMIN">Administrateur de cabinet (FIRM_ADMIN)</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn-primary">Ajouter le membre</button>
          </form>
        </div>

        <div class="card">
          <h3>Membres de l'organisation active</h3>
          <table>
            <thead>
              <tr>
                <th>Nom complet</th>
                <th>Email</th>
                <th>Rôle attribué</th>
                <th>Date d'adhésion</th>
              </tr>
            </thead>
            <tbody id="members-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- ONGLET 5 : CONFIGURATIONS PAYS & JURIDICTIONS -->
      <section id="tab-countries" class="tab-panel hidden">
        <div class="card">
          <h3 id="i18n-countries-heading">${dict.countriesHeading}</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);">
            Chaque juridiction dispose de versions datées (<code>effectiveFrom</code> / <code>effectiveTo</code>). Les juridictions exploratoires (Europe, Maghreb, Moyen-Orient/CCG) sont clairement marquées comme brouillons non activés en production tant qu'elles n'ont pas reçu de validation réglementaire.
          </p>
          <table>
            <thead>
              <tr>
                <th>Ordre</th>
                <th>Juridiction &amp; Région</th>
                <th>Version &amp; Validité</th>
                <th>Référentiel &amp; Système Taxe</th>
                <th>Devise / Fuseau / RTL</th>
                <th>Statut de Validation</th>
                <th>Taux Vérifiés</th>
              </tr>
            </thead>
            <tbody id="countries-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- ONGLET 6 : PARAMÈTRES & PISTE D'AUDIT SHA-256 -->
      <section id="tab-settings" class="tab-panel hidden">
        <div class="card">
          <h3>Paramètres de la plateforme &amp; Intégrité de la Piste d'Audit</h3>
          <div id="settings-summary" style="font-size:0.9rem; margin-bottom:1rem;"></div>
          <h4>Journal d'audit inaltérable (Chaînage cryptographique SHA-256)</h4>
          <table>
            <thead>
              <tr>
                <th>Horodatage</th>
                <th>Rôle Acteur</th>
                <th>Action</th>
                <th>Cible</th>
                <th>Empreinte SHA-256 (tronquée)</th>
              </tr>
            </thead>
            <tbody id="audit-tbody"></tbody>
          </table>
        </div>
      </section>
    </main>
  </div>

  <script>
    const DICTIONARIES = ${serializedDictionaries};
    const LOCALES_CATALOG = ${serializedLocales};
    let activeLang = localStorage.getItem("ui_lang") || "${localeDesc.languageCode}";
    let authToken = localStorage.getItem("session_token") || null;
    let currentSession = null;
    let accessibleOrgs = [];
    let activeOrgId = null;
    let cachedDossiers = [];
    let cachedCountries = [];

    function applyLanguage(langCode) {
      const desc = LOCALES_CATALOG[langCode] || LOCALES_CATALOG.fr;
      const d = DICTIONARIES[desc.languageCode] || DICTIONARIES.fr;
      activeLang = desc.languageCode;
      localStorage.setItem("ui_lang", activeLang);
      document.documentElement.lang = desc.languageCode;
      document.documentElement.dir = desc.direction;

      document.getElementById("i18n-reg-prefix").textContent = d.regulatoryBannerPrefix;
      document.getElementById("i18n-human-badge").textContent = d.humanValidationBadge;
      document.getElementById("i18n-rbac-badge").textContent = d.rbacActiveBadge;
      document.getElementById("i18n-ai-badge").textContent = d.aiNonAutoValidatingBadge;
      document.getElementById("i18n-org-label").textContent = d.activeOrganizationLabel;
      document.getElementById("i18n-lang-label").textContent = d.languageSelectorLabel;
      document.getElementById("i18n-nav-dashboard").textContent = d.navDashboard;
      document.getElementById("i18n-nav-dossiers").textContent = d.navDossiers;
      document.getElementById("i18n-nav-orgs").textContent = d.navOrganizations;
      document.getElementById("i18n-nav-users").textContent = d.navUsers;
      document.getElementById("i18n-nav-countries").textContent = d.navCountries;
      document.getElementById("i18n-nav-settings").textContent = d.navSettingsAudit;
      document.getElementById("logout-btn").textContent = d.logoutButton;
      document.getElementById("i18n-login-submit").textContent = d.loginSubmitButton;
      document.getElementById("i18n-create-dossier-heading").textContent = d.createDossierHeading;
      document.getElementById("i18n-create-org-heading").textContent = d.createOrgHeading;
      document.getElementById("i18n-countries-heading").textContent = d.countriesHeading;
    }

    document.getElementById("lang-selector").addEventListener("change", (e) => {
      applyLanguage(e.target.value);
      if (activeOrgId) {
        refreshActiveOrganizationViews();
      }
    });

    function showFeedback(msg, isError = false) {
      const box = document.getElementById("global-feedback");
      box.textContent = msg;
      box.className = "alert-box " + (isError ? "alert-error" : "alert-info");
      box.classList.remove("hidden");
      setTimeout(() => box.classList.add("hidden"), 5000);
    }

    async function apiFetch(path, options = {}) {
      const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
      if (authToken) {
        headers["Authorization"] = "Bearer " + authToken;
      }
      if (activeOrgId) {
        headers["X-Organization-Id"] = activeOrgId;
      }
      const res = await fetch(path, Object.assign({}, options, { headers }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || ("Erreur HTTP " + res.status));
      }
      return data;
    }

    document.querySelectorAll(".demo-fill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("login-email").value = btn.getAttribute("data-email");
        document.getElementById("login-password").value = "DemoAdmin2026!";
      });
    });

    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("login-error");
      errBox.classList.add("hidden");
      try {
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        authToken = res.token;
        localStorage.setItem("session_token", authToken);
        await bootstrapAuthenticatedApp();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove("hidden");
      }
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" });
      } catch {}
      authToken = null;
      localStorage.removeItem("session_token");
      document.getElementById("app-view").classList.add("hidden");
      document.getElementById("login-view").classList.remove("hidden");
    });

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.getAttribute("data-tab");
        document.querySelectorAll(".tab-panel").forEach((p) => {
          p.classList.toggle("hidden", p.id !== target);
        });
      });
    });

    document.getElementById("org-selector").addEventListener("change", async (e) => {
      activeOrgId = e.target.value;
      await refreshActiveOrganizationViews();
    });

    async function bootstrapAuthenticatedApp() {
      if (!authToken) return;
      try {
        applyLanguage(activeLang);
        const me = await apiFetch("/api/auth/me");
        currentSession = me.session;
        accessibleOrgs = me.organizations || [];
        activeOrgId = currentSession.activeOrganizationId || (accessibleOrgs[0] && accessibleOrgs[0].id) || null;

        document.getElementById("login-view").classList.add("hidden");
        document.getElementById("app-view").classList.remove("hidden");

        document.getElementById("current-user-name").textContent = currentSession.user.fullName;
        document.getElementById("current-user-role").textContent = currentSession.user.email;

        await loadCountriesTable();
        renderOrgSelector();
        await refreshActiveOrganizationViews();
      } catch {
        authToken = null;
        localStorage.removeItem("session_token");
      }
    }

    function renderOrgSelector() {
      const sel = document.getElementById("org-selector");
      sel.innerHTML = "";
      accessibleOrgs.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.id;
        opt.textContent = o.name + " (" + o.countryCode + " / " + o.defaultCurrency + ")";
        if (o.id === activeOrgId) opt.selected = true;
        sel.appendChild(opt);
      });

      const tbody = document.getElementById("orgs-tbody");
      tbody.innerHTML = "";
      accessibleOrgs.forEach((o) => {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td><strong>" + o.name + "</strong></td>" +
          "<td><code>" + o.slug + "</code></td>" +
          "<td>" + o.organizationType + "</td>" +
          "<td>" + o.countryCode + " / " + o.defaultCurrency + " / " + (o.defaultTimezone || "UTC") + "</td>" +
          "<td>" + o.quotaMaxDossiers + " dossiers / " + o.quotaMaxUsers + " utilisateurs</td>";
        tbody.appendChild(tr);
      });
    }

    async function refreshActiveOrganizationViews() {
      if (!activeOrgId) return;
      const d = DICTIONARIES[activeLang] || DICTIONARIES.fr;
      const justificationHeader = currentSession && currentSession.user.isPlatformAdmin
        ? { "X-Platform-Admin-Justification": "Supervision technique Phase 0 initiée par l'administrateur" }
        : {};

      const dash = await apiFetch("/api/organizations/" + activeOrgId + "/dashboard", {
        headers: justificationHeader
      });

      document.getElementById("active-org-heading").textContent = dash.organization.name;
      document.getElementById("active-org-meta").textContent =
        "Slug: " + dash.organization.slug + " | Type: " + dash.organization.organizationType +
        " | Établissement: " + dash.organization.countryCode +
        " | Juridiction fiscale: " + (dash.organization.primaryTaxJurisdictionCode || dash.organization.countryCode) +
        " | Devise: " + dash.organization.defaultCurrency;

      const kpiContainer = document.getElementById("dashboard-kpis");
      const kpis = [
        { label: d.kpiActiveDossiers, value: dash.activeDossiersCount },
        { label: d.kpiAuthorizedUsers, value: dash.membersCount },
        { label: d.kpiDocsPendingReview, value: dash.documentsPendingReviewCount },
        { label: d.kpiDocsValidated, value: dash.documentsValidatedCount },
        { label: d.kpiEntriesDraftOrAi, value: dash.draftOrSuggestedEntriesCount },
        { label: d.kpiAuditEvents, value: dash.auditEventsCount }
      ];
      kpiContainer.innerHTML = kpis.map((k) =>
        '<div class="kpi-box"><div class="kpi-label">' + k.label + '</div><div class="kpi-value">' + k.value + '</div></div>'
      ).join("");

      const dossiersRes = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers", {
        headers: justificationHeader
      });
      cachedDossiers = dossiersRes.dossiers || [];
      renderDossiersTable(cachedDossiers);

      const membersRes = await apiFetch("/api/organizations/" + activeOrgId + "/members", {
        headers: justificationHeader
      });
      const membersTbody = document.getElementById("members-tbody");
      membersTbody.innerHTML = (membersRes.members || []).map((m) =>
        "<tr><td>" + m.fullName + "</td><td>" + m.email + "</td><td><span class='badge badge-draft'>" + m.role + "</span></td><td>" + m.joinedAt.slice(0, 10) + "</td></tr>"
      ).join("");

      const auditRes = await apiFetch("/api/organizations/" + activeOrgId + "/audit-logs", {
        headers: justificationHeader
      });
      document.getElementById("settings-summary").innerHTML =
        "<p><strong>Vérification d'intégrité de la chaîne d'audit :</strong> " +
        (auditRes.chainIntegrity.valid
          ? "<span class='badge badge-valid'>INTÈGRE (" + auditRes.chainIntegrity.checkedCount + " blocs SHA-256 vérifiés)</span>"
          : "<span class='badge badge-danger'>RUPTURE DÉTECTÉE</span>") +
        "</p>";

      document.getElementById("audit-tbody").innerHTML = (auditRes.logs || []).map((l) =>
        "<tr><td>" + l.createdAt.replace("T", " ").slice(0, 19) + "</td><td>" + l.actorRole + "</td><td><code>" + l.action + "</code></td><td>" + l.targetEntityType + "</td><td><code>" + l.integrityHash.slice(0, 16) + "...</code></td></tr>"
      ).join("");
    }

    function renderDossiersTable(list) {
      const tbody = document.getElementById("dossiers-tbody");
      tbody.innerHTML = list.map((d) =>
        "<tr><td><code>" + d.code + "</code></td><td><strong>" + d.name + "</strong></td><td>" +
        d.countryCode + " / " + (d.taxJurisdictionCode || d.countryCode) +
        "</td><td><code>" + d.countryConfigVersionId + "</code></td><td>" + d.currency + "</td><td>" + d.taxRegimeCode + "</td></tr>"
      ).join("");
    }

    document.getElementById("filter-dossiers").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      renderDossiersTable(
        cachedDossiers.filter((d) =>
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.countryCode.toLowerCase().includes(q) ||
          d.taxRegimeCode.toLowerCase().includes(q)
        )
      );
    });

    document.getElementById("create-dossier-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("dossier-name").value,
            code: document.getElementById("dossier-code").value,
            legalRegistrationNumber: document.getElementById("dossier-siret").value,
            countryCode: document.getElementById("dossier-country").value,
            taxJurisdictionCode: document.getElementById("dossier-jurisdiction").value,
            taxRegimeCode: document.getElementById("dossier-regime").value
          })
        });
        document.getElementById("create-dossier-form").reset();
        showFeedback("Dossier client créé avec succès.");
        await refreshActiveOrganizationViews();
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    document.getElementById("create-org-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const res = await apiFetch("/api/organizations", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("org-name").value,
            slug: document.getElementById("org-slug").value,
            organizationType: document.getElementById("org-type").value,
            countryCode: document.getElementById("org-country").value
          })
        });
        document.getElementById("create-org-form").reset();
        accessibleOrgs.push(res.organization);
        activeOrgId = res.organization.id;
        renderOrgSelector();
        await refreshActiveOrganizationViews();
        showFeedback("Nouvelle organisation créée et sélectionnée.");
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    document.getElementById("add-user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/members", {
          method: "POST",
          body: JSON.stringify({
            fullName: document.getElementById("new-user-name").value,
            email: document.getElementById("new-user-email").value,
            password: document.getElementById("new-user-password").value,
            role: document.getElementById("new-user-role").value
          })
        });
        document.getElementById("add-user-form").reset();
        showFeedback("Membre ajouté à l'organisation.");
        await refreshActiveOrganizationViews();
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    function populateRegimesForJurisdiction(jurisdictionCode) {
      const regimeSelect = document.getElementById("dossier-regime");
      regimeSelect.innerHTML = "";
      const cfg = cachedCountries.find((c) => c.countryCode === jurisdictionCode);
      const regimes = (cfg && cfg.taxRegimes && cfg.taxRegimes.length > 0)
        ? cfg.taxRegimes
        : [{ code: jurisdictionCode + "_STANDARD_DRAFT", label: jurisdictionCode + " — Régime Standard (Brouillon non validé)" }];
      regimes.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.code;
        opt.textContent = r.label;
        regimeSelect.appendChild(opt);
      });
    }

    document.getElementById("dossier-jurisdiction").addEventListener("change", (e) => {
      populateRegimesForJurisdiction(e.target.value);
    });

    async function loadCountriesTable() {
      const res = await apiFetch("/api/countries?includeHistorical=true");
      const allVersions = res.countries || [];

      const latestRes = await apiFetch("/api/countries");
      cachedCountries = latestRes.countries || [];

      const countrySelects = [
        document.getElementById("dossier-country"),
        document.getElementById("dossier-jurisdiction"),
        document.getElementById("org-country")
      ];
      countrySelects.forEach((sel) => {
        sel.innerHTML = "";
        cachedCountries.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.countryCode;
          opt.textContent = c.countryName + " (" + c.countryCode + " — " + c.defaultCurrency + ")";
          sel.appendChild(opt);
        });
      });
      if (cachedCountries[0]) {
        populateRegimesForJurisdiction(cachedCountries[0].countryCode);
      }

      const tbody = document.getElementById("countries-tbody");
      tbody.innerHTML = allVersions.map((c) => {
        const badgeClass = (c.validationStatus === "VALIDATED_FOR_PRODUCTION" || c.validationStatus === "ACTIVE")
          ? "badge-valid"
          : (c.validationStatus === "PENDING_LEGAL_VALIDATION" || c.validationStatus === "IN_REVIEW" ? "badge-ai" : "badge-draft");
        const verifiedRates = (c.vatRates || []).filter((r) => r.isVerified).map((r) => (r.rateBasisPoints / 100) + "%").join(", ") || "Aucun (Brouillon)";
        return "<tr>" +
          "<td>#" + c.deploymentPriorityOrder + "</td>" +
          "<td><strong>" + c.countryName + " (" + c.countryCode + ")</strong><br/><small>" + (c.regionGroup || "INTERNATIONAL") + "</small></td>" +
          "<td><code>" + c.versionId + "</code><br/><small>" + c.effectiveFrom + " → " + (c.effectiveTo || "∞") + "</small></td>" +
          "<td>" + c.accountingStandardName + " (" + (c.indirectTaxSystem || "VAT") + ")</td>" +
          "<td>" + c.defaultCurrency + " | " + (c.defaultTimezone || "UTC") + " | " + (c.supportsRtl ? "RTL" : "LTR") + "</td>" +
          "<td><span class='badge " + badgeClass + "'>" + c.validationStatus + "</span></td>" +
          "<td>" + verifiedRates + "</td>" +
          "</tr>";
      }).join("");
    }

    bootstrapAuthenticatedApp();
  </script>
</body>
</html>`;
}
