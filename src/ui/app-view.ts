import { appConfig } from "../config/app-config.js";
import {
  resolveLocaleDescriptor,
  getDictionary,
  I18N_DICTIONARIES,
  SUPPORTED_LOCALES_CATALOG,
} from "../i18n/translations.js";
import {
  buildDesignSystemStylesheet,
  PHASE1_NAVIGATION_MODULES,
} from "./design-system.js";

/**
 * Interface principale ComptaNova — Phase 1 Lot 1.1 (Charte graphique Section 5, Navigation 10 entrées Section 8 & Module 1 Dossiers Clients Section 9).
 * - Utilise exclusivement les tokens centralisés de `src/ui/design-system.ts` et `appConfig` (zéro couleur hexadécimale codée en dur hors `:root`).
 * - Implémente les 5 états d'interface obligatoires : chargement (`cn-state-loading`), liste vide (`cn-state-empty`), erreur (`cn-state-error`), confirmation (`cn-state-confirm`) et permission insuffisante (`cn-state-forbidden`).
 * - Supporte la navigation au clavier (`skip-link`, `:focus-visible`, touche `Escape`, `aria-current="page"`), le responsive Desktop/Tablette/Mobile et le support multilingue/RTL (`fr`, `en`, `ar`).
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
  const serializedNavModules = JSON.stringify(PHASE1_NAVIGATION_MODULES);
  const designSystemCss = buildDesignSystemStylesheet(appConfig);

  return `<!DOCTYPE html>
<html lang="${localeDesc.languageCode}" dir="${localeDesc.direction}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedAppName} — ${escapedTagline}</title>
  <style>${designSystemCss}</style>
</head>
<body>
  <a href="#main-content" class="skip-link">Aller au contenu principal / Skip to main content</a>

  <div class="regulatory-banner" role="region" aria-label="Positionnement réglementaire et réserves">
    <span>
      <strong id="i18n-reg-prefix">${dict.regulatoryBannerPrefix}</strong>
      ${escapedDisclaimer}
      <strong>[PROVISOIRE — BLOQUÉ PAR UNE VALIDATION EXTERNE : TVA, barèmes sociaux, mentions de facturation et FEC non qualifiés pour un usage fiscal de production]</strong>
    </span>
    <span id="i18n-human-badge" class="badge badge-ai">${dict.humanValidationBadge}</span>
  </div>

  <!-- VUE CONNEXION -->
  <div id="login-view" style="max-width: 540px; margin: 3.5rem auto; padding: 0 1rem;">
    <div class="card">
      <div class="brand-header" style="margin-bottom: 0.75rem;">
        <span class="brand-monogram" aria-hidden="true">CN</span>
        <div>
          <h1 style="margin:0; font-size:1.45rem;">${escapedAppName}</h1>
          <p style="margin:0; color:var(--cn-text-secondary); font-size:0.9rem;">${escapedTagline}</p>
        </div>
      </div>

      <div id="login-error" class="cn-state-box cn-state-error hidden" role="alert"></div>

      <form id="login-form">
        <div style="margin-bottom:0.85rem;">
          <label for="login-email">Email professionnel</label>
          <input id="login-email" type="email" required autocomplete="username" value="expert@cabinet-hexagone-demo.local" />
        </div>
        <div style="margin-bottom:1rem;">
          <label for="login-password">Mot de passe / Password</label>
          <input id="login-password" type="password" required autocomplete="current-password" value="DemoAdmin2026!" />
        </div>
        <button id="i18n-login-submit" type="submit" class="btn-primary" style="width:100%;">${dict.loginSubmitButton}</button>
      </form>

      <hr style="margin: 1.25rem 0; border: none; border-top: 1px solid var(--cn-border);" />
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
    <aside class="sidebar" aria-label="Navigation principale ComptaNova (10 modules)">
      <div class="brand-header">
        <span class="brand-monogram" aria-hidden="true">CN</span>
        <div>
          <h1 class="brand-title">${escapedAppName}</h1>
          <div class="brand-sub">${escapedTagline}</div>
        </div>
      </div>

      <div>
        <label id="i18n-lang-label" for="lang-selector" style="color:var(--cn-bg-surface);">${dict.languageSelectorLabel}</label>
        <select id="lang-selector" style="background:var(--cn-action); color:var(--cn-bg-surface); border-color:var(--cn-accent-amber);">
          <option value="fr" ${localeDesc.languageCode === "fr" ? "selected" : ""}>Français (LTR)</option>
          <option value="en" ${localeDesc.languageCode === "en" ? "selected" : ""}>English (LTR)</option>
          <option value="ar" ${localeDesc.languageCode === "ar" ? "selected" : ""}>العربية (RTL)</option>
        </select>
      </div>

      <div>
        <label id="i18n-org-label" for="org-selector" style="color:var(--cn-bg-surface);">${dict.activeOrganizationLabel}</label>
        <select id="org-selector" style="background:var(--cn-action); color:var(--cn-bg-surface); border-color:var(--cn-accent-amber);"></select>
      </div>

      <nav class="sidebar-nav-list" aria-label="Modules métier Phase 1">
        <button id="i18n-nav-dashboard" type="button" class="nav-btn active" aria-current="page" data-tab="tab-dashboard">1. ${dict.navDashboard}</button>
        <button id="i18n-nav-dossiers" type="button" class="nav-btn" data-tab="tab-dossiers">2. ${dict.navDossiers}</button>
        <button id="i18n-nav-documents" type="button" class="nav-btn" data-tab="tab-documents">3. ${dict.navDocuments}</button>
        <button id="i18n-nav-invoicing" type="button" class="nav-btn" data-tab="tab-invoicing">4. ${dict.navInvoicing}</button>
        <button id="i18n-nav-journal" type="button" class="nav-btn" data-tab="tab-journal">5. ${dict.navJournal}</button>
        <button id="i18n-nav-banking" type="button" class="nav-btn" data-tab="tab-banking">6. ${dict.navBanking}</button>
        <button id="i18n-nav-vat" type="button" class="nav-btn" data-tab="tab-vat">7. ${dict.navVat}</button>
        <button id="i18n-nav-simulator" type="button" class="nav-btn" data-tab="tab-simulator">8. ${dict.navSimulator}</button>
        <button id="i18n-nav-anomalies" type="button" class="nav-btn" data-tab="tab-anomalies">9. ${dict.navAnomalies}</button>
        <button id="i18n-nav-settings" type="button" class="nav-btn" data-tab="tab-settings">10. ${dict.navSettingsAudit}</button>
      </nav>

      <div style="border-top:1px solid var(--cn-action); padding-top:0.65rem; display:flex; flex-direction:column; gap:0.3rem;">
        <div style="font-size:0.75rem; opacity:0.85;">Administration &amp; Référentiels :</div>
        <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
          <button id="i18n-nav-orgs" type="button" class="btn-secondary nav-sub-btn" style="font-size:0.76rem; padding:0.3rem 0.55rem;" data-tab="tab-organizations">${dict.navOrganizations}</button>
          <button id="i18n-nav-users" type="button" class="btn-secondary nav-sub-btn" style="font-size:0.76rem; padding:0.3rem 0.55rem;" data-tab="tab-users">${dict.navUsers}</button>
          <button id="i18n-nav-countries" type="button" class="btn-secondary nav-sub-btn" style="font-size:0.76rem; padding:0.3rem 0.55rem;" data-tab="tab-countries">${dict.navCountries}</button>
        </div>
      </div>

      <div style="border-top:1px solid var(--cn-action); padding-top:0.85rem; font-size:0.8rem;">
        <div id="current-user-name" style="font-weight:600;"></div>
        <div id="current-user-role" style="opacity:0.9; margin-bottom:0.6rem;"></div>
        <button type="button" id="logout-btn" class="btn-secondary" style="width:100%;">${dict.logoutButton}</button>
      </div>
    </aside>

    <main id="main-content" class="main-area" tabindex="-1">
      <div class="topbar">
        <div>
          <h2 id="active-org-heading" style="margin:0; font-size:1.35rem;">...</h2>
          <span id="active-org-meta" style="font-size:0.85rem; color:var(--cn-text-secondary);"></span>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
          <span id="i18n-rbac-badge" class="badge badge-valid">${dict.rbacActiveBadge}</span>
          <span id="i18n-ai-badge" class="badge badge-ai" title="${escapedAiWarning}">${dict.aiNonAutoValidatingBadge}</span>
          <span class="badge badge-info">Lot 1.1 — Dossiers &amp; Design System</span>
        </div>
      </div>

      <!-- BARRE DE CONTEXTE GLOBALE : SÉLECTEUR DE DOSSIER ACTIF & PÉRIODE COMPTABLE (Section 8) -->
      <div class="context-selectors-bar" role="region" aria-label="Sélecteur de dossier client actif et de période comptable">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:2; min-width:260px;">
          <div style="flex:1;">
            <label id="i18n-active-dossier-label" for="active-dossier-selector">${dict.activeDossierLabel}</label>
            <select id="active-dossier-selector" aria-label="Sélectionner le dossier client actif"></select>
          </div>
          <div style="padding-top:1.15rem;">
            <span id="active-dossier-status-badge" class="badge badge-valid">ACTIVE</span>
          </div>
        </div>

        <div style="flex:1; min-width:200px;">
          <label id="i18n-active-period-label" for="active-period-selector">${dict.activePeriodLabel}</label>
          <select id="active-period-selector" aria-label="Sélectionner la période comptable">
            <option value="2026-FULL" selected>Exercice 2026 (01/01/2026 — 31/12/2026)</option>
            <option value="2026-Q1">2026 — T1 (Janv. - Mars)</option>
            <option value="2026-Q2">2026 — T2 (Avr. - Juin)</option>
            <option value="2026-Q3">2026 — T3 (Juil. - Sept.)</option>
            <option value="2026-Q4">2026 — T4 (Oct. - Déc.)</option>
            <option value="2025-HISTORICAL">Exercice 2025 (Historique FR-2025.1)</option>
          </select>
        </div>

        <div style="padding-top:1.15rem;">
          <button type="button" id="open-active-dossier-detail-btn" class="btn-secondary">
            Fiche &amp; Affectations du dossier actif
          </button>
        </div>
      </div>

      <!-- ÉTATS GLOBAUX : FEEDBACK, CHARGEMENT, ERREUR -->
      <div id="global-feedback" class="alert-box alert-info hidden" role="status" aria-live="polite"></div>
      <div id="global-loading-state" class="cn-state-box cn-state-loading hidden" role="status" aria-busy="true">
        Chargement sécurisé des données comptables en cours...
      </div>
      <div id="global-error-state" class="cn-state-box cn-state-error hidden" role="alert"></div>

      <!-- ONGLET 1 : MODULE 2 — TABLEAU DE BORD ET INDICATEURS DE PILOTAGE (§20) -->
      <section id="tab-dashboard" class="tab-panel">
        <!-- Barre d'outils et sélecteur de vue (Dossier vs Cabinet) et de période -->
        <div class="card" style="margin-bottom:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
              <h3 style="margin:0;">Module 2 — Tableau de Bord et Pilotage de Gestion</h3>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0.25rem 0 0 0;">
                Indicateurs décisionnels issus exclusivement des données réelles persistées (ventes, dépenses, pièces, écritures et anomalies).
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
              <div style="display:inline-flex; border:1px solid var(--cn-border); border-radius:4px; overflow:hidden;">
                <button type="button" id="btn-dash-view-dossier" class="btn-secondary" style="border:none; border-radius:0; padding:6px 12px; font-size:0.85rem; font-weight:600; background:var(--cn-brand-primary); color:var(--cn-surface);">Vue Dossier</button>
                <button type="button" id="btn-dash-view-firm" class="btn-secondary" style="border:none; border-radius:0; padding:6px 12px; font-size:0.85rem; font-weight:600; background:var(--cn-surface-alt); color:var(--cn-text);">Vue Cabinet</button>
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <label for="dash-period-select" style="font-size:0.85rem; font-weight:600; margin:0;">Période :</label>
                <select id="dash-period-select" style="padding:5px 8px; font-size:0.85rem; width:auto;">
                  <option value="ALL">Toute la période</option>
                  <option value="FISCAL_YEAR" selected>Exercice en cours</option>
                  <option value="QUARTER">Ce trimestre</option>
                  <option value="MONTH">Ce mois</option>
                </select>
                <button type="button" id="btn-dash-refresh" class="btn-secondary" style="padding:5px 10px; font-size:0.85rem;">Actualiser</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 5 États UI : Chargement, Erreur, État vide, Accès interdit, et Contenu -->
        <div id="dash-loading-state" class="cn-state-box cn-state-loading hidden">
          Chargement des indicateurs de pilotage en temps réel...
        </div>
        <div id="dash-error-state" class="cn-state-box cn-state-error hidden" role="alert"></div>
        <div id="dash-forbidden-state" class="cn-state-box cn-state-forbidden hidden" role="note">
          <strong>Accès restreint :</strong> Vous ne disposez pas des permissions nécessaires pour consulter les métriques de ce dossier.
        </div>
        <div id="dash-empty-state" class="cn-state-box cn-state-empty hidden">
          <strong>Dossier en attente d'activité comptable :</strong> Aucune facture, pièce justificative ou écriture n'est enregistrée pour cette période. Commencez par déposer une pièce dans l'onglet <em>Documents</em> ou émettre un devis dans l'onglet <em>Factures</em>.
        </div>

        <!-- Conteneur principal du tableau de bord -->
        <div id="dash-content-container">
          <!-- VUE 1 : DOSSIER ACTIF (PILOTAGE ENTREPRISE) -->
          <div id="dash-dossier-view">
            <!-- Grille de 6 KPI Décisionnels -->
            <div class="kpi-grid" id="dashboard-kpis">
              <div class="kpi-box" id="kpi-box-turnover">
                <div class="kpi-label">Chiffre d'Affaires HT Facturé</div>
                <div class="kpi-value font-mono-tabular" id="kpi-val-turnover">0,00 €</div>
                <div style="font-size:0.75rem; color:var(--cn-text-secondary); margin-top:4px;" id="kpi-sub-turnover">TVA collectée : 0,00 €</div>
              </div>
              <div class="kpi-box" id="kpi-box-collections">
                <div class="kpi-label">Règlements Encaissés</div>
                <div class="kpi-value font-mono-tabular" id="kpi-val-collections">0,00 €</div>
                <div style="font-size:0.75rem; color:var(--cn-text-secondary); margin-top:4px;" id="kpi-sub-collections">Sur factures de la période</div>
              </div>
              <div class="kpi-box" id="kpi-box-remaining">
                <div class="kpi-label">Créances Clients en Attente</div>
                <div class="kpi-value font-mono-tabular" id="kpi-val-remaining">0,00 €</div>
                <div style="font-size:0.75rem; color:var(--cn-status-error); margin-top:4px;" id="kpi-sub-remaining">Dont 0 échue(s)</div>
              </div>
              <div class="kpi-box" id="kpi-box-expenses">
                <div class="kpi-label">Dépenses Fournisseurs HT</div>
                <div class="kpi-value font-mono-tabular" id="kpi-val-expenses">0,00 €</div>
                <div style="font-size:0.75rem; color:var(--cn-text-secondary); margin-top:4px;" id="kpi-sub-expenses">Pièces validées</div>
              </div>
              <div class="kpi-box" id="kpi-box-quotes">
                <div class="kpi-label">Devis &amp; Transformation</div>
                <div class="kpi-value font-mono-tabular" id="kpi-val-quotes">0 devis</div>
                <div style="font-size:0.75rem; color:var(--cn-brand-primary); margin-top:4px;" id="kpi-sub-quotes">Taux de conversion : 0 %</div>
              </div>
              <div class="kpi-box" id="kpi-box-anomalies">
                <div class="kpi-label">Contrôles &amp; Anomalies</div>
                <div class="kpi-value font-mono-tabular" id="kpi-val-anomalies">0 alerte</div>
                <div style="font-size:0.75rem; color:var(--cn-status-error); margin-top:4px;" id="kpi-sub-anomalies">0 critique(s) bloquante(s)</div>
              </div>
            </div>

            <!-- Actions et Alertes Prioritaires (Actionable Alerts) -->
            <div class="card" id="dash-action-alerts-card" style="margin-top:1.25rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
                <h4 style="margin:0;">Actions &amp; Alertes Prioritaires</h4>
                <span class="badge badge-ai" id="dash-alerts-count-badge">0 action requise</span>
              </div>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin-bottom:1rem;">
                Points d'attention nécessitant une intervention : relances de factures échues, justificatifs en attente de révision ou anomalies comptables.
              </p>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th style="width:110px;">Priorité</th>
                      <th>Élément concerné</th>
                      <th>Détails &amp; Contexte</th>
                      <th style="width:130px; text-align:right;">Montant</th>
                      <th style="width:110px;">Échéance</th>
                      <th style="width:130px; text-align:center;">Action directe</th>
                    </tr>
                  </thead>
                  <tbody id="dash-alerts-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- VUE 2 : CABINET (PORTEFEUILLE MULTI-DOSSIERS) -->
          <div id="dash-firm-view" class="hidden">
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
                <h4 style="margin:0;">Portefeuille des Dossiers Clients</h4>
                <span class="badge badge-valid" id="firm-active-dossiers-badge">0 dossiers actifs</span>
              </div>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin-bottom:1rem;">
                Vue consolidée pour les experts et collaborateurs : suivi des pièces en attente de traitement, des créances clients et des anomalies ouvertes par dossier.
              </p>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th style="width:120px;">Code Dossier</th>
                      <th>Raison Sociale</th>
                      <th style="width:80px;">Devise</th>
                      <th style="width:130px; text-align:center;">Pièces à traiter</th>
                      <th style="width:130px; text-align:center;">Factures impayées</th>
                      <th style="width:140px; text-align:right;">Créances en attente</th>
                      <th style="width:110px; text-align:center;">Anomalies</th>
                      <th style="width:100px;">Statut</th>
                    </tr>
                  </thead>
                  <tbody id="dash-firm-dossiers-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Avertissement de Non-Certification -->
          <div class="card" style="margin-top:1.25rem; font-size:0.82rem; color:var(--cn-text-secondary); background:var(--cn-surface-alt); border-left:3px solid var(--cn-brand-primary);">
            <strong>Notice de pilotage de gestion :</strong> Les indicateurs ci-dessus sont calculés en temps réel à partir des données réelles enregistrées dans le dossier. Ils ont une finalité exclusive de pilotage et d'assistance de gestion, et ne constituent en aucun cas des états financiers certifiés, un bilan comptable audité ou une liasse fiscale validée.
          </div>
        </div>
      </section>

      <!-- ONGLET 2 : MODULE 1 — GESTION DES DOSSIERS CLIENTS (Section 9) -->
      <section id="tab-dossiers" class="tab-panel hidden">
        <!-- État Permission Insuffisante (affiché aux rôles non-admin qui ne peuvent ni créer ni archiver de dossier) -->
        <div id="dossier-rbac-forbidden-state" class="cn-state-box cn-state-forbidden hidden" role="note">
          <strong>Permission restreinte selon votre rôle RBAC :</strong> La création d'un nouveau dossier client, l'archivage logique et la gestion des affectations utilisateurs sont réservés à l'administrateur du cabinet (<code>FIRM_ADMIN</code>) ou au support plateforme justifié (<code>PLATFORM_ADMIN</code>).
        </div>

        <!-- Formulaire de création d'un dossier client complet (Section 9) -->
        <div id="create-dossier-card" class="card">
          <h3 id="i18n-create-dossier-heading">${dict.createDossierHeading}</h3>
          <form id="create-dossier-form">
            <div class="form-grid">
              <div>
                <label for="dossier-name">Raison sociale / Nom commercial *</label>
                <input id="dossier-name" required minlength="2" placeholder="Ex: Studio Nova Architecture SAS" />
              </div>
              <div>
                <label for="dossier-code">Code dossier *</label>
                <input id="dossier-code" required minlength="2" placeholder="Ex: DOS-NOVA-01" />
              </div>
              <div>
                <label for="dossier-legal-form">Forme juridique</label>
                <select id="dossier-legal-form">
                  <option value="SAS">SAS — Société par actions simplifiée</option>
                  <option value="SASU">SASU — SAS unipersonnelle</option>
                  <option value="SARL">SARL — Société à responsabilité limitée</option>
                  <option value="EURL">EURL — Entreprise unipersonnelle</option>
                  <option value="EI_MICRO">EI / Micro-entrepreneur</option>
                  <option value="EI">EI — Entreprise individuelle classique</option>
                  <option value="LIBERAL">Profession libérale (BNC)</option>
                  <option value="SCI">SCI — Société civile immobilière</option>
                </select>
              </div>
              <div>
                <label for="dossier-siret">SIREN / SIRET / Immatriculation</label>
                <input id="dossier-siret" placeholder="Ex: 89123456700012" class="font-mono-tabular" />
              </div>
              <div>
                <label for="dossier-vat-number">N° TVA intracommunautaire</label>
                <input id="dossier-vat-number" placeholder="Ex: FR42891234567" class="font-mono-tabular" />
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
              <div>
                <label for="dossier-vat-regime">Régime de TVA</label>
                <select id="dossier-vat-regime">
                  <option value="FR_TVA_REEL_NORMAL">Réel normal (mensuel/trimestriel)</option>
                  <option value="FR_TVA_REEL_SIMPLIFIE">Réel simplifié (acomptes)</option>
                  <option value="FR_TVA_FRANCHISE_BASE">Franchise en base de TVA (art. 293 B CGI)</option>
                  <option value="FR_TVA_EXONERE">Activité exonérée de TVA</option>
                </select>
              </div>
              <div>
                <label for="dossier-address">Adresse postale</label>
                <input id="dossier-address" placeholder="Ex: 18 Rue de la République" />
              </div>
              <div>
                <label for="dossier-postal-code">Code postal</label>
                <input id="dossier-postal-code" placeholder="Ex: 69002" />
              </div>
              <div>
                <label for="dossier-city">Ville</label>
                <input id="dossier-city" placeholder="Ex: Lyon" />
              </div>
              <div>
                <label for="dossier-fy-start">Ouverture de l'exercice</label>
                <input id="dossier-fy-start" type="date" value="2026-01-01" />
              </div>
              <div>
                <label for="dossier-fy-end">Clôture de l'exercice</label>
                <input id="dossier-fy-end" type="date" value="2026-12-31" />
              </div>
              <div>
                <label for="dossier-sector">Secteur d'activité</label>
                <input id="dossier-sector" placeholder="Ex: Conseil &amp; Ingénierie" />
              </div>
              <div>
                <label for="dossier-contact-name">Contact principal</label>
                <input id="dossier-contact-name" placeholder="Ex: Marc Vasseur" />
              </div>
              <div>
                <label for="dossier-contact-email">Email du contact</label>
                <input id="dossier-contact-email" type="email" placeholder="contact@client.fr" />
              </div>
              <div>
                <label for="dossier-status">Statut initial</label>
                <select id="dossier-status">
                  <option value="ACTIVE">Actif (ACTIVE)</option>
                  <option value="TO_COMPLETE">À compléter (TO_COMPLETE)</option>
                  <option value="SUSPENDED">Suspendu (SUSPENDED)</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom:0.85rem;">
              <label for="dossier-notes">Notes internes du cabinet</label>
              <textarea id="dossier-notes" rows="2" placeholder="Particularités comptables, options fiscales provisoires..."></textarea>
            </div>
            <button type="submit" class="btn-primary">Créer le dossier &amp; initialiser le PCG + journaux</button>
          </form>
        </div>

        <!-- Liste et filtres multi-critères des dossiers clients -->
        <div class="card">
          <h3>Dossiers clients autorisés dans l'organisation active</h3>
          <div class="form-grid" style="margin-bottom:0.75rem;">
            <div>
              <label for="filter-dossiers">Recherche rapide (nom, code, SIRET, ville)</label>
              <input id="filter-dossiers" placeholder="Filtrer par nom, code, SIRET ou ville..." />
            </div>
            <div>
              <label for="filter-dossier-status">Statut du dossier</label>
              <select id="filter-dossier-status">
                <option value="ALL">Tous les statuts (actifs + archivés)</option>
                <option value="ACTIVE">Actif uniquement (ACTIVE)</option>
                <option value="TO_COMPLETE">À compléter (TO_COMPLETE)</option>
                <option value="SUSPENDED">Suspendu (SUSPENDED)</option>
                <option value="ARCHIVED">Archivé logiquement (ARCHIVED)</option>
              </select>
            </div>
            <div>
              <label for="filter-dossier-regime">Régime fiscal</label>
              <select id="filter-dossier-regime">
                <option value="ALL">Tous les régimes fiscaux</option>
                <option value="FR_REEL_NORMAL_IS">Réel Normal IS</option>
                <option value="FR_REEL_SIMPLIFIE">Réel Simplifié</option>
                <option value="FR_MICRO_ENTREPRISE">Micro-Entreprise</option>
              </select>
            </div>
          </div>

          <!-- État liste vide (Section 8) -->
          <div id="dossiers-empty-state" class="cn-state-box cn-state-empty hidden" role="status">
            <strong>Aucun dossier client ne correspond aux filtres sélectionnés.</strong>
            <p style="margin:0.35rem 0 0;">Modifiez vos critères de recherche ou créez un nouveau dossier client ci-dessus.</p>
          </div>

          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Raison sociale &amp; Forme</th>
                  <th>SIRET / TVA</th>
                  <th>Juridiction &amp; Version</th>
                  <th>Régime Fiscal / TVA</th>
                  <th>Exercice &amp; Devise</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="dossiers-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- Fiche détaillée d'édition, d'archivage logique, d'affectations et de référentiel PCG/Journaux -->
        <div id="dossier-detail-panel" class="card hidden" aria-live="polite">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem;">
            <div>
              <h3 id="detail-dossier-title" style="margin:0;">Fiche du dossier client</h3>
              <span id="detail-dossier-subtitle" style="font-size:0.85rem; color:var(--cn-text-secondary);"></span>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button type="button" id="init-referential-btn" class="btn-secondary">
                Vérifier / Compléter PCG &amp; Journaux (Idempotent)
              </button>
              <button type="button" id="toggle-archive-confirm-btn" class="btn-danger">
                Archiver / Restaurer logiquement
              </button>
            </div>
          </div>

          <!-- État de confirmation d'archivage logique (cn-state-confirm) -->
          <div id="archive-confirm-modal" class="cn-state-box cn-state-confirm hidden" role="dialog" aria-modal="true" aria-labelledby="archive-confirm-heading">
            <h4 id="archive-confirm-heading" style="margin-top:0;">Confirmation d'archivage logique / restauration du dossier</h4>
            <p style="font-size:0.86rem; margin-bottom:0.65rem;">
              L'archivage est strictement logique : les écritures, factures, documents et la chaîne d'audit SHA-256 restent intégralement conservés et inaltérables.
            </p>
            <div style="margin-bottom:0.75rem;">
              <label for="archive-reason-input">Motif obligatoire (min. 5 caractères) *</label>
              <input id="archive-reason-input" placeholder="Ex: Clôture de mission fin d'exercice 2025 / Réactivation dossier" />
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button type="button" id="confirm-archive-btn" class="btn-danger">Confirmer l'archivage logique</button>
              <button type="button" id="confirm-restore-btn" class="btn-primary">Restaurer le dossier à l'état ACTIF</button>
              <button type="button" id="cancel-archive-btn" class="btn-secondary">Annuler (Échap)</button>
            </div>
          </div>

          <!-- Compteurs du référentiel comptable du dossier -->
          <div class="kpi-grid" id="detail-dossier-kpis" style="margin-bottom:1rem;"></div>

          <!-- Formulaire d'édition du dossier client -->
          <form id="edit-dossier-form" style="margin-bottom:1.25rem;">
            <h4>Modifier les paramètres du dossier</h4>
            <div class="form-grid">
              <div>
                <label for="edit-dossier-name">Raison sociale *</label>
                <input id="edit-dossier-name" required minlength="2" />
              </div>
              <div>
                <label for="edit-dossier-legal-form">Forme juridique</label>
                <select id="edit-dossier-legal-form">
                  <option value="SAS">SAS</option>
                  <option value="SASU">SASU</option>
                  <option value="SARL">SARL</option>
                  <option value="EURL">EURL</option>
                  <option value="EI_MICRO">EI / Micro-entrepreneur</option>
                  <option value="EI">EI</option>
                  <option value="LIBERAL">Profession libérale</option>
                  <option value="SCI">SCI</option>
                </select>
              </div>
              <div>
                <label for="edit-dossier-siret">SIREN / SIRET</label>
                <input id="edit-dossier-siret" class="font-mono-tabular" />
              </div>
              <div>
                <label for="edit-dossier-vat">N° TVA intracommunautaire</label>
                <input id="edit-dossier-vat" class="font-mono-tabular" />
              </div>
              <div>
                <label for="edit-dossier-regime">Régime fiscal</label>
                <input id="edit-dossier-regime" />
              </div>
              <div>
                <label for="edit-dossier-vat-regime">Régime de TVA</label>
                <select id="edit-dossier-vat-regime">
                  <option value="FR_TVA_REEL_NORMAL">Réel normal</option>
                  <option value="FR_TVA_REEL_SIMPLIFIE">Réel simplifié</option>
                  <option value="FR_TVA_FRANCHISE_BASE">Franchise en base de TVA</option>
                  <option value="FR_TVA_EXONERE">Exonéré de TVA</option>
                </select>
              </div>
              <div>
                <label for="edit-dossier-address">Adresse</label>
                <input id="edit-dossier-address" />
              </div>
              <div>
                <label for="edit-dossier-postal">Code postal</label>
                <input id="edit-dossier-postal" />
              </div>
              <div>
                <label for="edit-dossier-city">Ville</label>
                <input id="edit-dossier-city" />
              </div>
              <div>
                <label for="edit-dossier-status">Statut opérationnel</label>
                <select id="edit-dossier-status">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TO_COMPLETE">TO_COMPLETE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>
              <div>
                <label for="edit-dossier-contact-name">Contact principal</label>
                <input id="edit-dossier-contact-name" />
              </div>
              <div>
                <label for="edit-dossier-contact-email">Email contact</label>
                <input id="edit-dossier-contact-email" type="email" />
              </div>
            </div>
            <div style="margin-bottom:0.75rem;">
              <label for="edit-dossier-notes">Notes internes</label>
              <textarea id="edit-dossier-notes" rows="2"></textarea>
            </div>
            <button type="submit" class="btn-primary">Enregistrer les modifications du dossier</button>
          </form>

          <!-- Journaux standards initialisés pour le dossier -->
          <div style="margin-bottom:1.25rem;">
            <h4>Journaux comptables initialisés sur ce dossier</h4>
            <div id="detail-dossier-journals" style="display:flex; gap:0.5rem; flex-wrap:wrap;"></div>
          </div>

          <!-- Gestion des affectations et permissions granulaires par dossier -->
          <div id="dossier-assignments-section">
            <h4>Affectations d'utilisateurs et permissions granulaires sur ce dossier</h4>
            <div class="table-responsive" style="margin-bottom:1rem;">
              <table>
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle Organisation</th>
                    <th>Lecture (VIEW)</th>
                    <th>Dépôt (UPLOAD)</th>
                    <th>Édition OCR (EDIT)</th>
                    <th>Validation Compta (VALIDATE)</th>
                    <th>Export (EXPORT)</th>
                  </tr>
                </thead>
                <tbody id="dossier-assignments-tbody"></tbody>
              </table>
            </div>

            <form id="assign-user-form">
              <div class="form-grid">
                <div>
                  <label for="assign-target-user">Membre de l'organisation à affecter</label>
                  <select id="assign-target-user"></select>
                </div>
                <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; padding-top:1.2rem;">
                  <label style="display:inline-flex; align-items:center; gap:0.3rem;"><input type="checkbox" id="perm-view" checked style="width:auto;" /> Voir</label>
                  <label style="display:inline-flex; align-items:center; gap:0.3rem;"><input type="checkbox" id="perm-upload" checked style="width:auto;" /> Déposer</label>
                  <label style="display:inline-flex; align-items:center; gap:0.3rem;"><input type="checkbox" id="perm-edit" checked style="width:auto;" /> Éditer OCR</label>
                  <label style="display:inline-flex; align-items:center; gap:0.3rem;"><input type="checkbox" id="perm-validate" style="width:auto;" /> Valider Compta</label>
                  <label style="display:inline-flex; align-items:center; gap:0.3rem;"><input type="checkbox" id="perm-export" style="width:auto;" /> Exporter</label>
                </div>
              </div>
              <button type="submit" class="btn-secondary">Enregistrer l'affectation sur le dossier</button>
            </form>
          </div>
        </div>
      </section>

      <!-- ONGLET 3 : DOCUMENTS & OCR (Lot 1.2) -->
      <section id="tab-documents" class="tab-panel hidden">
        <!-- État Dossier Inactif ou Non Sélectionné -->
        <div id="docs-no-dossier-state" class="cn-state-box cn-state-empty hidden">
          <strong>Aucun dossier actif sélectionné.</strong> Veuillez sélectionner un dossier client dans le bandeau supérieur pour accéder à sa collecte documentaire.
        </div>

        <div id="docs-content-container">
          <!-- Zone d'import et de dépôt de justificatifs -->
          <div class="card" id="doc-upload-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
              <h3 style="margin:0;">Module 3 — Collecte documentaire &amp; OCR assisté</h3>
              <span class="badge badge-ai">OCR non auto-validante : révision humaine requise</span>
            </div>
            <p style="font-size:0.88rem; color:var(--cn-text-secondary); margin-bottom:1rem;">
              Déposez vos factures, notes de frais ou relevés bancaires (formats acceptés : <strong>PDF, PNG, JPG, JPEG, CSV</strong> — taille max. <strong>15 Mo</strong>). Contrôle d'intégrité SHA-256, validation stricte des octets magiques et analyse de sécurité antimalware systématique.
            </p>

            <form id="doc-upload-form" style="display:flex; flex-direction:column; gap:0.85rem;">
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem;">
                <div>
                  <label for="doc-upload-category">Catégorie du document *</label>
                  <select id="doc-upload-category" required>
                    <option value="SUPPLIER_INVOICE">Facture fournisseur (Achat)</option>
                    <option value="CUSTOMER_INVOICE">Facture client (Vente)</option>
                    <option value="RECEIPT_EXPENSE">Note de frais / Ticket de caisse</option>
                    <option value="BANK_STATEMENT">Relevé de compte bancaire</option>
                    <option value="PAYMENT_PROOF">Preuve de paiement / Virement</option>
                    <option value="CREDIT_NOTE">Avoir / Note de crédit</option>
                    <option value="OTHER">Autre justificatif</option>
                  </select>
                </div>
                <div>
                  <label for="doc-file-input">Fichier source * (PDF, PNG, JPG, CSV &le; 15 Mo)</label>
                  <input id="doc-file-input" type="file" required accept=".pdf,.png,.jpg,.jpeg,.csv,application/pdf,image/png,image/jpeg,text/csv" />
                </div>
              </div>

              <!-- Zone de glisser-déposer interactive -->
              <div id="doc-dropzone" style="border:2px dashed var(--cn-border); border-radius:var(--cn-radius-md); padding:1.25rem; text-align:center; background:var(--cn-bg-app); cursor:pointer; transition:border-color 0.15s ease-in-out;">
                <div style="font-weight:600; color:var(--cn-text-primary);" id="doc-dropzone-label">
                  Glissez-déposez un fichier ici ou cliquez pour parcourir
                </div>
                <div style="font-size:0.8rem; color:var(--cn-text-secondary); margin-top:0.25rem;">
                  Contrôle d'intégrité SHA-256 et détection automatique de doublons
                </div>
              </div>

              <!-- Option de dérogation de doublon (affichée si doublon détecté) -->
              <div id="doc-duplicate-override-box" class="cn-state-box cn-state-error hidden" style="margin-top:0.5rem;">
                <div style="font-weight:600; margin-bottom:0.35rem;" id="doc-duplicate-warning-text">
                  Attention : Suspicion de doublon détectée !
                </div>
                <label for="doc-override-reason" style="font-size:0.85rem;">Motif obligatoire de dérogation au doublon :</label>
                <input id="doc-override-reason" placeholder="Ex: Réémission après annulation ou pièce complémentaire distincte" style="margin-bottom:0.5rem;" />
                <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer;">
                  <input id="doc-allow-override-check" type="checkbox" />
                  Je confirme que cette pièce doit être importée malgré le doublon détecté.
                </label>
              </div>

              <div style="display:flex; justify-content:flex-end;">
                <button id="doc-upload-submit-btn" type="submit" class="btn-primary">
                  Importer et analyser le document
                </button>
              </div>
            </form>
          </div>

          <!-- Filtres et statistiques du cycle de vie documentaire à 6 statuts -->
          <div class="card" style="margin-top:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
              <h3 style="margin:0;">Pièces justificatives du dossier</h3>
              <div style="display:flex; gap:0.4rem; flex-wrap:wrap;" id="doc-status-pills">
                <button type="button" class="btn-secondary doc-filter-pill active" data-status="ALL">Tous (<span id="cnt-all">0</span>)</button>
                <button type="button" class="btn-secondary doc-filter-pill" data-status="PENDING_REVIEW">À réviser (<span id="cnt-pending">0</span>)</button>
                <button type="button" class="btn-secondary doc-filter-pill" data-status="CORRECTED">Corrigés (<span id="cnt-corrected">0</span>)</button>
                <button type="button" class="btn-secondary doc-filter-pill" data-status="VALIDATED">Validés (<span id="cnt-validated">0</span>)</button>
                <button type="button" class="btn-secondary doc-filter-pill" data-status="REJECTED">Rejetés (<span id="cnt-rejected">0</span>)</button>
              </div>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem; margin-bottom:1rem;">
              <div>
                <label for="doc-filter-category">Catégorie</label>
                <select id="doc-filter-category">
                  <option value="ALL">Toutes catégories</option>
                  <option value="SUPPLIER_INVOICE">Factures fournisseurs</option>
                  <option value="CUSTOMER_INVOICE">Factures clients</option>
                  <option value="RECEIPT_EXPENSE">Notes de frais</option>
                  <option value="BANK_STATEMENT">Relevés bancaires</option>
                  <option value="PAYMENT_PROOF">Preuves de paiement</option>
                  <option value="OTHER">Autres</option>
                </select>
              </div>
              <div>
                <label for="doc-filter-search">Recherche par nom ou mot-clé</label>
                <input id="doc-filter-search" placeholder="Ex: EDF, Orange, FAC-2026..." />
              </div>
            </div>

            <!-- Tableau des documents -->
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.86rem;">
                <thead>
                  <tr style="border-bottom:2px solid var(--cn-border); text-align:start;">
                    <th style="padding:0.6rem 0.5rem;">Date</th>
                    <th style="padding:0.6rem 0.5rem;">Nom du fichier</th>
                    <th style="padding:0.6rem 0.5rem;">Catégorie</th>
                    <th style="padding:0.6rem 0.5rem;">Tiers &amp; Pièce</th>
                    <th style="padding:0.6rem 0.5rem;">Montant TTC</th>
                    <th style="padding:0.6rem 0.5rem;">Confiance OCR</th>
                    <th style="padding:0.6rem 0.5rem;">Statut</th>
                    <th style="padding:0.6rem 0.5rem;">Actions</th>
                  </tr>
                </thead>
                <tbody id="documents-tbody">
                  <!-- Rempli dynamiquement -->
                </tbody>
              </table>
            </div>

            <div id="documents-empty-state" class="cn-state-box cn-state-empty hidden" style="margin-top:1rem;">
              Aucun document ne correspond aux critères sélectionnés.
            </div>
          </div>

          <!-- Panneau d'examen interactif et de correction / validation -->
          <div id="document-detail-panel" class="card hidden" style="margin-top:1rem; border:2px solid var(--cn-accent-amber);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem; border-bottom:1px solid var(--cn-border); padding-bottom:0.75rem;">
              <div>
                <h3 id="doc-detail-filename" style="margin:0 0 0.25rem 0;">Examen du document</h3>
                <div style="font-size:0.8rem; color:var(--cn-text-secondary);" id="doc-detail-meta">
                  Empreinte SHA-256 | Taille | Rétention
                </div>
              </div>
              <div style="display:flex; gap:0.5rem; align-items:center;">
                <a id="doc-detail-download-btn" href="#" target="_blank" class="btn-secondary" style="font-size:0.82rem; text-decoration:none;">
                  Télécharger l'original sécurisé
                </a>
                <button type="button" id="doc-detail-close-btn" class="btn-secondary" style="font-size:0.82rem;">Fermer</button>
              </div>
            </div>

            <!-- Alerte Doublon Heuristique si présente -->
            <div id="doc-detail-duplicate-alert" class="cn-state-box cn-state-error hidden" style="margin-bottom:1rem;">
              <strong id="doc-detail-duplicate-title">Suspicion de doublon :</strong>
              <div id="doc-detail-duplicate-desc" style="font-size:0.85rem; margin-top:0.25rem;"></div>
            </div>

            <!-- Motif de rejet si rejeté -->
            <div id="doc-detail-rejection-box" class="cn-state-box cn-state-error hidden" style="margin-bottom:1rem;">
              <strong>Document Rejeté :</strong>
              <div id="doc-detail-rejection-reason" style="font-size:0.85rem; margin-top:0.25rem;"></div>
            </div>

            <!-- Formulaire de révision et correction des champs extraits -->
            <form id="doc-correction-form">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <h4 style="margin:0; font-size:0.95rem;">Champs extraits &amp; Saisie assistée</h4>
                <div id="doc-extraction-provenance" class="badge badge-ai">Source : IA Assistée (Simulé)</div>
              </div>

              <div class="form-grid">
                <div>
                  <label for="field-issuer-name">Fournisseur / Émetteur</label>
                  <input id="field-issuer-name" />
                  <small id="conf-issuer-name" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-invoice-number">Numéro de pièce / facture</label>
                  <input id="field-invoice-number" />
                  <small id="conf-invoice-number" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-invoice-date">Date de facture</label>
                  <input id="field-invoice-date" type="date" />
                  <small id="conf-invoice-date" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-due-date">Date d'échéance</label>
                  <input id="field-due-date" type="date" />
                  <small id="conf-due-date" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-net-amount">Montant HT (€)</label>
                  <input id="field-net-amount" type="number" step="0.01" />
                  <small id="conf-net-amount" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-vat-amount">Montant TVA (€)</label>
                  <input id="field-vat-amount" type="number" step="0.01" />
                  <small id="conf-vat-amount" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-gross-amount">Montant TTC (€)</label>
                  <input id="field-gross-amount" type="number" step="0.01" />
                  <small id="conf-gross-amount" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
                <div>
                  <label for="field-account-code">Compte comptable suggéré</label>
                  <input id="field-account-code" placeholder="Ex: 606000 ou 706000" />
                  <small id="conf-account-code" style="font-size:0.75rem; color:var(--cn-text-secondary);"></small>
                </div>
              </div>

              <!-- Boutons d'actions du cycle de vie -->
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-top:1.25rem; border-top:1px solid var(--cn-border); padding-top:1rem;">
                <div style="display:flex; gap:0.5rem;">
                  <button type="button" id="doc-delete-btn" class="btn-secondary" style="color:var(--cn-state-error-text); border-color:var(--cn-state-error-border);">
                    Supprimer
                  </button>
                  <button type="button" id="doc-reject-btn" class="btn-secondary" style="color:var(--cn-state-error-text); border-color:var(--cn-state-error-border);">
                    Rejeter avec motif
                  </button>
                </div>
                <div style="display:flex; gap:0.5rem;">
                  <button type="submit" id="doc-save-corrections-btn" class="btn-secondary">
                    Enregistrer les corrections
                  </button>
                  <button type="button" id="doc-validate-btn" class="btn-primary">
                    Valider le document
                  </button>
                  <button type="button" id="doc-generate-draft-entry-btn" class="btn-primary hidden" style="background:var(--cn-accent-amber); border-color:var(--cn-accent-amber); color:var(--cn-text-primary);">
                    Générer l'écriture brouillon
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      <!-- ONGLET 4 : FACTURATION & DEVIS (Module 4 — Lot 1.3) -->
      <section id="tab-invoicing" class="tab-panel hidden">
        <!-- Bannière explicite Réforme Facturation Électronique & Niveaux Factur-X / PDP -->
        <div class="card" style="border-left: 4px solid var(--cn-primary); margin-bottom: 1rem; background: var(--cn-surface);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <h3 style="margin:0 0 0.35rem; color:var(--cn-primary);">Module 4 — Facturation des Ventes, Devis &amp; Factur-X</h3>
              <p style="margin:0; font-size:0.85rem; color:var(--cn-text-secondary); line-height:1.4;">
                Numérotation continue et traçable, mentions légales LPF/Code de commerce, calculs monétaires stricts en centimes, transformation contrôlée de devis, génération Factur-X XML (Niveau 2) et gestion des règlements.
              </p>
            </div>
            <div style="font-size:0.75rem; background:var(--cn-surface-alt); border:1px solid var(--cn-border); border-radius:4px; padding:6px 10px; max-width:280px;">
              <strong>Note de conformité PDP (Niveau 3) :</strong> ComptaNova n'est pas une Plateforme de Dématérialisation Partenaire (PDP) agréée. La connectivité PDP/PPF et l'e-reporting font l'objet d'un périmètre distinct d'intégration.
            </div>
          </div>
        </div>

        <!-- Sous-onglets internes : Devis / Factures / Nouveau document -->
        <div style="display:flex; gap:0.5rem; margin-bottom:1rem; border-bottom:1px solid var(--cn-border); padding-bottom:0.5rem;">
          <button type="button" id="subtab-btn-invoices" class="btn-primary" style="padding:6px 14px; font-size:0.85rem;">Factures &amp; Avoirs</button>
          <button type="button" id="subtab-btn-quotes" class="btn-secondary" style="padding:6px 14px; font-size:0.85rem;">Devis clients</button>
          <button type="button" id="subtab-btn-create" class="btn-secondary" style="padding:6px 14px; font-size:0.85rem;">+ Nouveau devis ou facture</button>
        </div>

        <!-- VUE FACTURES & AVOIRS -->
        <div id="subtab-view-invoices" class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.85rem; flex-wrap:wrap; gap:0.5rem;">
            <h4 style="margin:0;">Factures de vente &amp; Avoirs émis</h4>
            <div style="display:flex; gap:0.5rem;">
              <select id="filter-sales-status" style="font-size:0.85rem; padding:4px 8px;">
                <option value="ALL">Tous les statuts</option>
                <option value="DRAFT">Brouillons (DRAFT)</option>
                <option value="FINALIZED">Finalisées (FINALIZED)</option>
                <option value="PAID">Soldées (PAID)</option>
                <option value="PARTIALLY_PAID">Partiellement payées</option>
                <option value="CANCELLED">Annulées par avoir (CANCELLED)</option>
              </select>
            </div>
          </div>

          <div id="sales-invoices-empty" class="cn-state-box cn-state-empty hidden">
            Aucune facture de vente pour ce dossier avec les filtres sélectionnés.
          </div>

          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Client / Tiers</th>
                  <th>Émission</th>
                  <th>Échéance</th>
                  <th style="text-align:right;">Total HT</th>
                  <th style="text-align:right;">Total TTC</th>
                  <th style="text-align:right;">Réglé</th>
                  <th style="text-align:right;">Reste dû</th>
                  <th>Statut</th>
                  <th>Règlement</th>
                  <th style="text-align:center;">Actions</th>
                </tr>
              </thead>
              <tbody id="sales-invoices-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- VUE DEVIS -->
        <div id="subtab-view-quotes" class="card hidden">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.85rem; flex-wrap:wrap; gap:0.5rem;">
            <h4 style="margin:0;">Devis clients émis</h4>
            <div>
              <select id="filter-quotes-status" style="font-size:0.85rem; padding:4px 8px;">
                <option value="ALL">Tous les statuts</option>
                <option value="DRAFT">Brouillon (DRAFT)</option>
                <option value="SENT">Envoyé (SENT)</option>
                <option value="ACCEPTED">Accepté (ACCEPTED)</option>
                <option value="CONVERTED">Transformé en facture (CONVERTED)</option>
                <option value="REJECTED">Refusé (REJECTED)</option>
                <option value="EXPIRED">Expiré (EXPIRED)</option>
              </select>
            </div>
          </div>

          <div id="quotes-empty" class="cn-state-box cn-state-empty hidden">
            Aucun devis enregistré pour ce dossier.
          </div>

          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Client / Tiers</th>
                  <th>Date d'émission</th>
                  <th>Validité</th>
                  <th style="text-align:right;">Total HT</th>
                  <th style="text-align:right;">Total TTC</th>
                  <th>Statut</th>
                  <th style="text-align:center;">Actions</th>
                </tr>
              </thead>
              <tbody id="quotes-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- VUE CRÉATION (DEVIS OU FACTURE) -->
        <div id="subtab-view-create" class="card hidden">
          <h4 id="invoicing-create-title" style="margin:0 0 1rem;">Créer un nouveau document de vente</h4>
          <form id="invoicing-create-form">
            <div class="form-grid" style="margin-bottom:1rem;">
              <div>
                <label for="doc-type-select">Type de document</label>
                <select id="doc-type-select">
                  <option value="INVOICE">Facture de vente directe</option>
                  <option value="QUOTE">Devis client</option>
                </select>
              </div>
              <div>
                <label for="inv-client-name">Nom ou Raison sociale du client *</label>
                <input id="inv-client-name" required placeholder="Ex: Acme Solutions SARL" />
              </div>
              <div>
                <label for="inv-client-siret">N° SIRET ou TVA intracommunautaire (B2B)</label>
                <input id="inv-client-siret" placeholder="Ex: 80012345600012 ou FR12800123456" />
              </div>
              <div>
                <label for="inv-client-address">Adresse de facturation</label>
                <input id="inv-client-address" placeholder="12 boulevard Haussmann, 75009 Paris" />
              </div>
              <div>
                <label for="inv-issue-date">Date d'émission *</label>
                <input id="inv-issue-date" type="date" required />
              </div>
              <div>
                <label for="inv-due-date">Date d'échéance / Validité *</label>
                <input id="inv-due-date" type="date" required />
              </div>
            </div>

            <!-- Grille des articles/lignes -->
            <div style="margin-bottom:1rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="font-size:0.9rem;">Lignes d'articles / prestations</strong>
                <button type="button" id="inv-add-line-btn" class="btn-secondary" style="font-size:0.8rem; padding:4px 8px;">+ Ajouter une ligne</button>
              </div>
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;" id="inv-lines-table">
                <thead>
                  <tr style="background:var(--cn-surface-alt); border-bottom:1px solid var(--cn-border);">
                    <th style="padding:6px; text-align:left;">Description *</th>
                    <th style="padding:6px; width:80px; text-align:right;">Qté</th>
                    <th style="padding:6px; width:110px; text-align:right;">Prix unit. HT (€)</th>
                    <th style="padding:6px; width:80px; text-align:right;">Remise %</th>
                    <th style="padding:6px; width:90px; text-align:right;">TVA</th>
                    <th style="padding:6px; width:110px; text-align:right;">Total HT (€)</th>
                    <th style="padding:6px; width:40px;"></th>
                  </tr>
                </thead>
                <tbody id="inv-lines-tbody">
                  <!-- Ligne 1 par défaut -->
                  <tr class="inv-line-row">
                    <td style="padding:6px;"><input class="inv-line-desc" required placeholder="Prestation de conseil..." style="width:96%;" /></td>
                    <td style="padding:6px;"><input class="inv-line-qty" type="number" step="0.01" min="0.01" value="1.00" style="width:90%; text-align:right;" /></td>
                    <td style="padding:6px;"><input class="inv-line-pu" type="number" step="0.01" min="0" value="500.00" required style="width:90%; text-align:right;" /></td>
                    <td style="padding:6px;"><input class="inv-line-disc" type="number" step="0.1" min="0" max="100" value="0" style="width:85%; text-align:right;" /></td>
                    <td style="padding:6px;">
                      <select class="inv-line-vat" style="width:95%;">
                        <option value="2000">20.0 %</option>
                        <option value="1000">10.0 %</option>
                        <option value="550">5.5 %</option>
                        <option value="210">2.1 %</option>
                        <option value="0">0.0 % (Exonéré/Franchise)</option>
                      </select>
                    </td>
                    <td style="padding:6px; text-align:right; font-weight:600;" class="inv-line-total">500.00 €</td>
                    <td style="padding:6px; text-align:center;"><button type="button" class="btn-remove-line" style="background:none; border:none; cursor:pointer; color:var(--cn-state-error-text);">✕</button></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Récapitulatif dynamique des totaux -->
            <div style="display:flex; justify-content:flex-end; margin-bottom:1.25rem;">
              <div style="width:320px; font-size:0.9rem; line-height:1.6;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--cn-border); padding:4px 0;">
                  <span style="color:var(--cn-text-secondary);">Total HT :</span>
                  <span id="inv-summary-ht" style="font-weight:600;">500.00 €</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--cn-border); padding:4px 0;">
                  <span style="color:var(--cn-text-secondary);">Total TVA :</span>
                  <span id="inv-summary-tva" style="font-weight:600;">100.00 €</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:1.05rem; font-weight:700; color:var(--cn-primary);">
                  <span>Total TTC :</span>
                  <span id="inv-summary-ttc">600.00 €</span>
                </div>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
              <button type="button" id="inv-cancel-create-btn" class="btn-secondary">Annuler</button>
              <button type="submit" id="inv-submit-create-btn" class="btn-primary">Enregistrer le document (Brouillon)</button>
            </div>
          </form>
        </div>
      </section>

      <!-- ONGLET 5 : JOURNAL COMPTABLE & PCG (Module 5 — Lot 1.5) -->
      <section id="tab-journal" class="tab-panel hidden">
        <!-- Bannière explicite Saisie comptable & Invariants réglementaires -->
        <div class="card" style="border-left: 4px solid var(--cn-primary); margin-bottom: 1rem; background: var(--cn-surface);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <h3 style="margin:0 0 0.35rem; color:var(--cn-primary);">Module 5 — Saisie comptable au kilomètre &amp; Journaux</h3>
              <p style="margin:0; font-size:0.85rem; color:var(--cn-text-secondary); line-height:1.4;">
                Partie double stricte multi-lignes, contrôle d'équilibre Débit/Crédit en centimes, Plan Comptable Général (PCG ANC), 5 journaux officiels (<code>VE</code>, <code>AC</code>, <code>BQ</code>, <code>OD</code>, <code>AN</code>), validation humaine inaltérable et extourne contrôlée.
              </p>
            </div>
            <div style="font-size:0.75rem; background:var(--cn-surface-alt); border:1px solid var(--cn-border); border-radius:4px; padding:6px 10px; max-width:320px;">
              <strong>Invariants LPF &amp; FEC :</strong>
              <div style="color:var(--cn-text-secondary); margin-top:2px;">
                Toute écriture validée est verrouillée en modification directe. L'annulation s'opère par extourne comptable symétrique.
              </div>
            </div>
          </div>

          <!-- Barre de synthèse financière du journal -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--cn-border);">
            <div style="background:var(--cn-surface-alt); padding:0.5rem 0.75rem; border-radius:4px; border:1px solid var(--cn-border);">
              <div style="font-size:0.75rem; color:var(--cn-text-secondary);">Écritures affichées</div>
              <div id="journal-stat-count" class="font-mono-tabular" style="font-size:1.1rem; font-weight:700; color:var(--cn-text-primary);">0</div>
            </div>
            <div style="background:var(--cn-surface-alt); padding:0.5rem 0.75rem; border-radius:4px; border:1px solid var(--cn-border);">
              <div style="font-size:0.75rem; color:var(--cn-text-secondary);">Total Débit</div>
              <div id="journal-stat-debit" class="font-mono-tabular" style="font-size:1.1rem; font-weight:700; color:var(--cn-text-primary);">0,00 €</div>
            </div>
            <div style="background:var(--cn-surface-alt); padding:0.5rem 0.75rem; border-radius:4px; border:1px solid var(--cn-border);">
              <div style="font-size:0.75rem; color:var(--cn-text-secondary);">Total Crédit</div>
              <div id="journal-stat-credit" class="font-mono-tabular" style="font-size:1.1rem; font-weight:700; color:var(--cn-text-primary);">0,00 €</div>
            </div>
            <div style="background:var(--cn-surface-alt); padding:0.5rem 0.75rem; border-radius:4px; border:1px solid var(--cn-border);">
              <div style="font-size:0.75rem; color:var(--cn-text-secondary);">Équilibre général</div>
              <div id="journal-stat-balance" style="font-size:0.85rem; font-weight:700; color:var(--cn-success); margin-top:0.2rem;">✓ Équilibré</div>
            </div>
          </div>
        </div>

        <!-- Sous-onglets internes : Consultation vs Nouvelle saisie -->
        <div style="display:flex; gap:0.5rem; margin-bottom:1rem; border-bottom:1px solid var(--cn-border); padding-bottom:0.5rem;">
          <button type="button" id="subtab-btn-journal-list" class="btn-primary" style="padding:6px 14px; font-size:0.85rem;">Consultation des écritures &amp; Journaux</button>
          <button type="button" id="subtab-btn-journal-create" class="btn-secondary" style="padding:6px 14px; font-size:0.85rem;">+ Nouvelle saisie au kilomètre</button>
        </div>

        <!-- VUE 1 : CONSULTATION DU JOURNAL -->
        <div id="subtab-view-journal-list" class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.85rem; flex-wrap:wrap; gap:0.5rem;">
            <h4 style="margin:0;">Livre-Journal des écritures comptables</h4>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
              <select id="filter-journal-code" style="font-size:0.85rem; padding:4px 8px;">
                <option value="ALL">Tous les journaux</option>
                <option value="VE">VE — Journal des Ventes</option>
                <option value="AC">AC — Journal des Achats</option>
                <option value="BQ">BQ — Journal de Banque</option>
                <option value="OD">OD — Opérations Diverses</option>
                <option value="AN">AN — À-Nouveaux</option>
              </select>
              <select id="filter-journal-status" style="font-size:0.85rem; padding:4px 8px;">
                <option value="ALL">Tous les statuts</option>
                <option value="DRAFT">Brouillons (DRAFT)</option>
                <option value="AI_SUGGESTION">Suggestions IA</option>
                <option value="VALIDATED">Validées (VALIDATED)</option>
                <option value="REVERSED">Extournées (REVERSED)</option>
              </select>
              <input type="text" id="filter-journal-search" placeholder="Rechercher (pièce, libellé)..." style="font-size:0.85rem; padding:4px 8px; width:180px;" />
              <button type="button" id="btn-refresh-journal-entries" class="btn-secondary" style="font-size:0.85rem; padding:4px 10px;">Actualiser</button>
            </div>
          </div>

          <div id="journal-no-dossier" class="cn-state-box cn-state-empty">
            Veuillez sélectionner un dossier client actif dans la barre supérieure pour consulter son journal comptable.
          </div>

          <div id="journal-entries-loading" class="cn-state-box cn-state-loading hidden">
            Chargement des écritures comptables du dossier...
          </div>

          <div id="journal-entries-empty" class="cn-state-box cn-state-empty hidden">
            Aucune écriture comptable enregistrée pour ce dossier avec les filtres sélectionnés.
          </div>

          <div id="journal-entries-error" class="cn-state-box cn-state-error hidden">
            <span id="journal-entries-error-msg">Erreur lors de la récupération des écritures comptables.</span>
          </div>

          <div id="journal-entries-table-wrapper" class="table-responsive hidden">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>N° Pièce</th>
                  <th>Journal</th>
                  <th>Libellé de l'écriture</th>
                  <th style="text-align:right;">Débit (€)</th>
                  <th style="text-align:right;">Crédit (€)</th>
                  <th style="text-align:center;">Équilibre</th>
                  <th>Statut</th>
                  <th>Validé par</th>
                  <th style="text-align:center;">Actions</th>
                </tr>
              </thead>
              <tbody id="journal-entries-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- VUE 2 : NOUVELLE SAISIE AU KILOMÈTRE -->
        <div id="subtab-view-journal-create" class="card hidden">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h4 style="margin:0;">Saisie d'écriture comptable au kilomètre (Partie double)</h4>
            <span style="font-size:0.8rem; color:var(--cn-text-secondary);">Contrôle d'équilibre strict en temps réel</span>
          </div>

          <form id="accounting-entry-form">
            <!-- Entête d'écriture -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem; margin-bottom:1rem; background:var(--cn-surface-alt); padding:0.75rem; border-radius:4px; border:1px solid var(--cn-border);">
              <div>
                <label for="entry-journal-select" style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.25rem;">Journal comptable *</label>
                <select id="entry-journal-select" required style="width:100%; font-size:0.85rem; padding:6px 8px;">
                  <option value="VE">VE — Journal des Ventes (VE)</option>
                  <option value="AC">AC — Journal des Achats (AC)</option>
                  <option value="BQ">BQ — Journal de Banque (BQ)</option>
                  <option value="OD">OD — Opérations Diverses (OD)</option>
                  <option value="AN">AN — À-Nouveaux (AN)</option>
                </select>
              </div>
              <div>
                <label for="entry-date-input" style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.25rem;">Date de pièce *</label>
                <input type="date" id="entry-date-input" required style="width:100%; font-size:0.85rem; padding:6px 8px;" />
              </div>
              <div>
                <label for="entry-piece-number-input" style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.25rem;">Numéro de pièce / justificatif *</label>
                <input type="text" id="entry-piece-number-input" placeholder="Ex: FAC-2026-0042, VIR-001..." required style="width:100%; font-size:0.85rem; padding:6px 8px;" />
              </div>
              <div style="grid-column: 1 / -1;">
                <label for="entry-label-input" style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:0.25rem;">Libellé de l'écriture comptable *</label>
                <input type="text" id="entry-label-input" placeholder="Ex: Facture prestation conseil client SARL Dupont..." required style="width:100%; font-size:0.85rem; padding:6px 8px;" />
              </div>
            </div>

            <!-- Grille multi-lignes -->
            <div style="margin-bottom:1rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <label style="font-size:0.85rem; font-weight:600;">Lignes d'écriture (min. 2 lignes, Débit = Crédit) *</label>
                <button type="button" id="btn-add-entry-line" class="btn-secondary" style="font-size:0.8rem; padding:4px 10px;">+ Ajouter une ligne</button>
              </div>

              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th style="width:40px;">#</th>
                      <th style="min-width:240px;">Compte PCG *</th>
                      <th style="min-width:220px;">Libellé de la ligne *</th>
                      <th style="width:140px; text-align:right;">Débit (€)</th>
                      <th style="width:140px; text-align:right;">Crédit (€)</th>
                      <th style="width:50px; text-align:center;">Action</th>
                    </tr>
                  </thead>
                  <tbody id="entry-lines-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Barre d'équilibre temps réel -->
            <div id="entry-balance-box" style="display:flex; justify-content:space-between; align-items:center; background:var(--cn-surface-alt); border:2px solid var(--cn-border); border-radius:6px; padding:0.75rem 1rem; margin-bottom:1.25rem; flex-wrap:wrap; gap:0.75rem;">
              <div style="display:flex; gap:1.5rem; align-items:center; flex-wrap:wrap;">
                <div>
                  <span style="font-size:0.75rem; color:var(--cn-text-secondary); display:block;">Total Débit :</span>
                  <span id="entry-live-total-debit" class="font-mono-tabular" style="font-size:1.15rem; font-weight:700; color:var(--cn-text-primary);">0,00 €</span>
                </div>
                <div>
                  <span style="font-size:0.75rem; color:var(--cn-text-secondary); display:block;">Total Crédit :</span>
                  <span id="entry-live-total-credit" class="font-mono-tabular" style="font-size:1.15rem; font-weight:700; color:var(--cn-text-primary);">0,00 €</span>
                </div>
                <div>
                  <span style="font-size:0.75rem; color:var(--cn-text-secondary); display:block;">Écart / Différence :</span>
                  <span id="entry-live-diff" class="font-mono-tabular" style="font-size:1.15rem; font-weight:700; color:var(--cn-danger);">0,00 €</span>
                </div>
              </div>
              <div id="entry-live-balance-badge" style="font-size:0.85rem; font-weight:700; padding:4px 10px; border-radius:4px; background:var(--cn-warning-bg); color:var(--cn-warning); border:1px solid var(--cn-warning);">
                ⚠ Écriture déséquilibrée
              </div>
            </div>

            <!-- Actions de soumission -->
            <div style="display:flex; gap:0.75rem; justify-content:flex-end; flex-wrap:wrap;">
              <button type="button" id="btn-cancel-entry-form" class="btn-secondary" style="font-size:0.85rem; padding:8px 16px;">Annuler</button>
              <button type="button" id="btn-save-entry-draft" class="btn-secondary" style="font-size:0.85rem; padding:8px 16px;">Enregistrer en brouillon (DRAFT)</button>
              <button type="submit" id="btn-validate-entry-submit" class="btn-primary" style="font-size:0.85rem; padding:8px 18px;" disabled title="L'écriture doit être parfaitement équilibrée (Débit = Crédit > 0) pour être validée.">✓ Valider formellement l'écriture</button>
            </div>
          </form>
        </div>

        <!-- MODALE DE DÉTAIL D'ÉCRITURE COMPTABLE -->
        <div id="entry-detail-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="entry-modal-title">
          <div class="modal-card" style="max-width:800px; width:95%;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; border-bottom:1px solid var(--cn-border); padding-bottom:0.75rem;">
              <div>
                <h3 id="entry-modal-title" style="margin:0 0 0.25rem;">Détail de la pièce comptable</h3>
                <div id="entry-modal-subtitle" style="font-size:0.85rem; color:var(--cn-text-secondary);"></div>
              </div>
              <button type="button" id="entry-modal-close-btn" class="btn-secondary" style="font-size:0.85rem; padding:4px 8px;">✕ Fermer</button>
            </div>

            <div id="entry-modal-meta" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.5rem; margin-bottom:1rem; background:var(--cn-surface-alt); padding:0.75rem; border-radius:4px; font-size:0.85rem;"></div>

            <div class="table-responsive" style="margin-bottom:1rem;">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Compte PCG</th>
                    <th>Intitulé du compte</th>
                    <th>Libellé de la ligne</th>
                    <th style="text-align:right;">Débit (€)</th>
                    <th style="text-align:right;">Crédit (€)</th>
                  </tr>
                </thead>
                <tbody id="entry-modal-lines-tbody"></tbody>
                <tfoot>
                  <tr style="font-weight:700; background:var(--cn-surface-alt);">
                    <td colspan="4" style="text-align:right;">Totaux :</td>
                    <td id="entry-modal-total-debit" class="font-mono-tabular" style="text-align:right;">0,00 €</td>
                    <td id="entry-modal-total-credit" class="font-mono-tabular" style="text-align:right;">0,00 €</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div id="entry-modal-actions" style="display:flex; justify-content:flex-end; gap:0.5rem; border-top:1px solid var(--cn-border); padding-top:0.75rem;"></div>
          </div>
        </div>
      </section>

      <!-- ONGLET 6 : BANQUE & RAPPROCHEMENT (Lot 1.6) -->
      <section id="tab-banking" class="tab-panel hidden">
        <div class="cn-state-box cn-state-confirm" style="margin-bottom:1rem;">
          <strong>Banque &amp; Rapprochements (§17) :</strong> Import des relevés bancaires (CSV &amp; OFX) avec détection d'idempotence SHA-256. Chaque proposition de rapprochement requiert une validation humaine explicite avant lettrage comptable définitif.
        </div>

        <!-- Synthèse financière bancaire -->
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem;">
            <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
              <div style="font-size:0.8rem; color:var(--cn-text-secondary);">Opérations importées</div>
              <div id="bank-stat-total" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-brand-primary);">-</div>
            </div>
            <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
              <div style="font-size:0.8rem; color:var(--cn-text-secondary);">En attente de rapprochement</div>
              <div id="bank-stat-unreconciled" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-status-warning);">-</div>
            </div>
            <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
              <div style="font-size:0.8rem; color:var(--cn-text-secondary);">Rapprochées</div>
              <div id="bank-stat-reconciled" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-status-success);">-</div>
            </div>
            <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
              <div style="font-size:0.8rem; color:var(--cn-text-secondary);">Frais / Sans justificatif</div>
              <div id="bank-stat-flagged" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-text-secondary);">-</div>
            </div>
          </div>
        </div>

        <!-- Formulaire d'import de relevé -->
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <h3 style="margin:0;">+ Importer un relevé bancaire (CSV ou OFX)</h3>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; align-items:end;">
            <div>
              <label for="bank-file-input">Fichier relevé (.csv, .ofx, .txt) :</label>
              <input type="file" id="bank-file-input" accept=".csv,.ofx,.txt" style="width:100%; font-size:0.85rem;" />
            </div>
            <div>
              <label for="bank-import-type-select">Format du fichier :</label>
              <select id="bank-import-type-select" style="width:100%;">
                <option value="BANK_STATEMENT_CSV">CSV standard (séparateurs ;, ,, tab)</option>
                <option value="BANK_STATEMENT_OFX">OFX / Open Financial Exchange (SGML/XML)</option>
              </select>
            </div>
            <div>
              <button type="button" id="btn-import-bank" class="btn-primary" style="width:100%;">
                📥 Importer le relevé
              </button>
            </div>
          </div>
          <div id="bank-import-feedback" style="margin-top:0.5rem; font-size:0.85rem;"></div>
        </div>

        <!-- Liste des opérations bancaires -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <h3 style="margin:0;">Livre de Banque &amp; Rapprochement des opérations</h3>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <select id="bank-filter-status" style="font-size:0.85rem;">
                <option value="ALL">Tous les statuts</option>
                <option value="UNRECONCILED">En attente (Non rapproché)</option>
                <option value="PARTIALLY_RECONCILED">Partiellement rapproché</option>
                <option value="RECONCILED">Rapproché (Soldé)</option>
                <option value="BANK_FEE_OR_NO_RECEIPT_FLAGGED">Frais / Sans justificatif</option>
              </select>
              <input type="text" id="bank-search-input" placeholder="Rechercher libellé ou réf..." style="font-size:0.85rem; padding:0.35rem 0.5rem;" />
              <button type="button" id="btn-refresh-bank" class="btn-secondary" style="font-size:0.85rem;">Actualiser</button>
            </div>
          </div>

          <div id="bank-state-container">
            <div class="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Date d'opération</th>
                    <th>Libellé &amp; Référence</th>
                    <th style="text-align:right;">Montant</th>
                    <th>Statut</th>
                    <th>Suggestion / Correspondance</th>
                    <th style="text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="bank-tx-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Modale de rapprochement manuel -->
        <div id="bank-reconcile-modal" class="modal-overlay hidden">
          <div class="modal-box card" style="max-width:700px; max-height:85vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--cn-border); padding-bottom:0.75rem; margin-bottom:1rem;">
              <h3 style="margin:0;">Rapprochement de l'opération bancaire</h3>
              <button type="button" id="bank-reconcile-modal-close" class="btn-secondary" style="padding:0.25rem 0.5rem;">✕</button>
            </div>
            <div id="bank-reconcile-tx-summary" style="background:var(--cn-bg-app); padding:0.75rem; border-radius:6px; margin-bottom:1rem; font-size:0.9rem;"></div>
            
            <h4 style="margin-top:0;">Sélectionner la facture à rapprocher :</h4>
            <div id="bank-reconcile-invoices-list" style="max-height:220px; overflow-y:auto; border:1px solid var(--cn-border); border-radius:6px; margin-bottom:1rem;"></div>

            <div style="margin-bottom:1rem;">
              <label for="bank-reconcile-allocated-amount">Montant alloué (€) :</label>
              <input type="number" id="bank-reconcile-allocated-amount" step="0.01" style="width:100%; font-family:monospace;" />
              <div style="font-size:0.8rem; color:var(--cn-text-secondary); margin-top:0.25rem;">
                Pour un paiement partiel, vous pouvez ajuster le montant alloué au centime près.
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; border-top:1px solid var(--cn-border); padding-top:0.75rem;">
              <button type="button" id="bank-reconcile-cancel-btn" class="btn-secondary">Annuler</button>
              <button type="button" id="bank-reconcile-confirm-btn" class="btn-primary">Valider le rapprochement</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ONGLET 7 : TVA (Lot 1.6) -->
      <section id="tab-vat" class="tab-panel hidden">
        <div class="card">
          <h3>Module 7 — Préparation de TVA française Provisoire (Planifié au Lot 1.6)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Synthèse préparatoire par taux (20 %, 10 %, 5,5 %, 2,1 %, 0 %) avec mention explicite de non-substitution à la déclaration fiscale officielle — livrée au Lot 1.6.
          </p>
        </div>
      </section>

      <!-- ONGLET 8 : SIMULATIONS INDICATIVES VERSIONNÉES (Lot 1.7) -->
      <section id="tab-simulator" class="tab-panel hidden">
        <div class="cn-state-box cn-state-confirm" style="margin-bottom:1rem;">
          <strong>Simulations Indicatives Versionnées (§19) :</strong> Estimations calculées à partir de règles déterministes versionnées par juridiction et de paramètres du dossier. Avertissement obligatoire : ces estimations sont purement informatives et ne constituent pas un conseil fiscal ou comptable officiel.
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
          <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h4 style="margin:0 0 0.5rem 0; color:var(--cn-primary);">1. Solde de TVA</h4>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0 0 1rem 0;">Calcul de la TVA collectée, déductible et du solde net à payer ou crédit de TVA.</p>
            </div>
            <button type="button" class="btn-primary btn-select-sim-type" data-type="VAT_SUMMARY">Configurer TVA</button>
          </div>

          <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h4 style="margin:0 0 0.5rem 0; color:var(--cn-primary);">2. Cotisations Sociales</h4>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0 0 1rem 0;">Estimation des cotisations indépendant selon le régime fiscal et barème vérifié.</p>
            </div>
            <button type="button" class="btn-primary btn-select-sim-type" data-type="SOCIAL_CONTRIBUTIONS">Configurer Cotisations</button>
          </div>

          <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h4 style="margin:0 0 0.5rem 0; color:var(--cn-primary);">3. Impôt sur les Sociétés (IS)</h4>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0 0 1rem 0;">Estimation selon barème PME (15 % jusqu'à 42 500 €, 25 % au-delà) ou taux normal.</p>
            </div>
            <button type="button" class="btn-primary btn-select-sim-type" data-type="INCOME_OR_CORPORATE_TAX">Configurer IS</button>
          </div>

          <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h4 style="margin:0 0 0.5rem 0; color:var(--cn-primary);">4. Impact d'une Dépense</h4>
              <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0 0 1rem 0;">Impact indicatif d'une dépense HT sur la TVA nette, l'impôt et la trésorerie réelle.</p>
            </div>
            <button type="button" class="btn-primary btn-select-sim-type" data-type="EXPENSE_IMPACT">Configurer Dépense</button>
          </div>
        </div>

        <!-- Formulaire dynamique de simulation -->
        <div id="sim-form-container" class="card" style="margin-bottom:1.5rem;">
          <h3 id="sim-form-title" style="margin-top:0;">Paramètres de la simulation TVA</h3>
          <form id="sim-run-form">
            <input type="hidden" id="sim-type-input" value="VAT_SUMMARY" />
            <div id="sim-fields-container" class="form-grid" style="margin-bottom:1rem;"></div>
            <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
              <button type="button" id="sim-reset-btn" class="btn-secondary">Réinitialiser</button>
              <button type="submit" id="sim-submit-btn" class="btn-primary">Lancer la simulation</button>
            </div>
          </form>
        </div>

        <!-- Encart d'affichage du résultat -->
        <div id="sim-result-container" class="card hidden" style="margin-bottom:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h3 style="margin:0;">Résultat indicatif de la simulation</h3>
            <span id="sim-result-status-badge" class="badge"></span>
          </div>
          <div id="sim-result-disclaimer" class="cn-state-box cn-state-warning" style="margin-bottom:1rem; font-size:0.85rem;"></div>
          <div id="sim-result-details" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1rem;"></div>
          <div id="sim-result-assumptions" style="font-size:0.85rem; color:var(--cn-text-secondary); background:var(--cn-bg-app); padding:0.75rem; border-radius:6px;"></div>
        </div>

        <!-- Historique des simulations du dossier -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h3 style="margin:0;">Historique des simulations du dossier actif</h3>
            <button type="button" id="btn-refresh-simulations" class="btn-secondary">Actualiser l'historique</button>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Version Règles</th>
                  <th>Résultat clé</th>
                </tr>
              </thead>
              <tbody id="simulations-history-tbody">
                <tr><td colspan="5" style="text-align:center; color:var(--cn-text-secondary); padding:1rem;">Aucune simulation enregistrée pour ce dossier.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ONGLET 9 : ANOMALIES & CONTRÔLES (Lot 1.6) -->
      <section id="tab-anomalies" class="tab-panel hidden">
        <div class="cn-state-box cn-state-confirm" style="margin-bottom:1rem;">
          <strong>Contrôles déterministes &amp; Détection d'anomalies (§18) :</strong> 10 règles strictes de vérification comptable et fiscale. ComptaNova distingue formellement les erreurs certaines (bloquantes) des alertes nécessitant un examen humain, et offre une traçabilité intégrale pour le traitement des faux positifs.
        </div>

        <!-- Cartes synthétiques des anomalies -->
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; flex:1;">
              <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
                <div style="font-size:0.8rem; color:var(--cn-text-secondary);">Erreurs certaines (Bloquantes)</div>
                <div id="anomalies-stat-critical" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-status-danger);">-</div>
              </div>
              <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
                <div style="font-size:0.8rem; color:var(--cn-text-secondary);">Suspicions &amp; Alertes à vérifier</div>
                <div id="anomalies-stat-suspicion" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-status-warning);">-</div>
              </div>
              <div style="padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);">
                <div style="font-size:0.8rem; color:var(--cn-text-secondary);">Anomalies résolues / Classées</div>
                <div id="anomalies-stat-resolved" class="font-mono-tabular" style="font-size:1.4rem; font-weight:700; color:var(--cn-status-success);">-</div>
              </div>
            </div>
            <div>
              <button type="button" id="btn-scan-anomalies" class="btn-primary" style="padding:0.6rem 1.2rem; font-weight:600;">
                🔍 Lancer le scan des 10 règles (§18)
              </button>
            </div>
          </div>
          <div id="anomalies-scan-feedback" style="font-size:0.85rem;"></div>
        </div>

        <!-- Tableau des anomalies -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <h3 style="margin:0;">Registre des Anomalies et Suspicion de Déviance</h3>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <select id="anomalies-filter-severity" style="font-size:0.85rem;">
                <option value="ALL">Toutes gravités</option>
                <option value="CRITICAL_CERTAIN">Erreurs certaines</option>
                <option value="SUSPICION_TO_VERIFY">Suspicions à vérifier</option>
                <option value="WARNING">Alertes</option>
              </select>
              <select id="anomalies-filter-status" style="font-size:0.85rem;">
                <option value="ALL">Tous statuts</option>
                <option value="OPEN">Ouvertes</option>
                <option value="RESOLVED_BY_CORRECTION">Corrigées</option>
                <option value="DISMISSED_WITH_JUSTIFICATION">Classées (Faux positif)</option>
              </select>
              <button type="button" id="btn-refresh-anomalies" class="btn-secondary" style="font-size:0.85rem;">Actualiser</button>
            </div>
          </div>

          <div id="anomalies-state-container">
            <div class="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Gravité</th>
                    <th>Règle &amp; Code</th>
                    <th>Description de l'anomalie</th>
                    <th>Cible</th>
                    <th>Détecté le</th>
                    <th>Statut</th>
                    <th style="text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="anomalies-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Modale de classement / résolution d'anomalie -->
        <div id="anomaly-resolve-modal" class="modal-overlay hidden">
          <div class="modal-box card" style="max-width:550px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--cn-border); padding-bottom:0.75rem; margin-bottom:1rem;">
              <h3 id="anomaly-modal-title" style="margin:0;">Traitement de l'anomalie</h3>
              <button type="button" id="anomaly-modal-close" class="btn-secondary" style="padding:0.25rem 0.5rem;">✕</button>
            </div>

            <div id="anomaly-modal-details" style="font-size:0.9rem; margin-bottom:1rem;"></div>

            <div style="margin-bottom:1rem;">
              <label for="anomaly-resolve-status-select">Action à appliquer :</label>
              <select id="anomaly-resolve-status-select" style="width:100%; margin-bottom:0.75rem;">
                <option value="RESOLVED_BY_CORRECTION">Résolue par correction de la pièce / écriture</option>
                <option value="DISMISSED_WITH_JUSTIFICATION">Classer comme exception / faux positif justifié</option>
              </select>

              <label for="anomaly-resolve-justification">Justification motivée obligatoire (min. 10 caractères) :</label>
              <textarea id="anomaly-resolve-justification" rows="3" style="width:100%; font-size:0.9rem;" placeholder="Expliquez la correction apportée ou le motif du classement..."></textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; border-top:1px solid var(--cn-border); padding-top:0.75rem;">
              <button type="button" id="anomaly-modal-cancel-btn" class="btn-secondary">Annuler</button>
              <button type="button" id="anomaly-modal-confirm-btn" class="btn-primary">Confirmer le traitement</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ONGLET 10 : EXPORTS SÉCURISÉS & PARAMÈTRES / PISTE D'AUDIT SHA-256 -->
      <section id="tab-settings" class="tab-panel hidden">
        <div class="card" style="margin-bottom:1.5rem;">
          <h3 style="margin-top:0;">Centre d'Exports Sécurisés &amp; FEC Préliminaire (Module 9, §21)</h3>
          <div class="cn-state-box cn-state-confirm" style="margin-bottom:1rem;">
            <strong>Sécurité des exports :</strong> Tous les exports CSV intègrent une neutralisation stricte des formules tableur (CSV Injection / DDE). L'export FEC (Fichier des Écritures Comptables) respecte scrupuleusement la structure officielle en 18 colonnes de l'article A.47 A-1 du Livre des Procédures Fiscales (LPF).
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1.25rem;">
            <!-- Carte Exports CSV -->
            <div style="border:1px solid var(--cn-border); border-radius:8px; padding:1.25rem; background:var(--cn-bg-surface); display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <h4 style="margin:0 0 0.5rem 0; color:var(--cn-primary);">Exports CSV Sécurisés (Anti-Injection)</h4>
                <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0 0 1rem 0;">Fichiers encodés en UTF-8 avec BOM pour une ouverture directe sous Excel et LibreOffice.</p>

                <div style="margin-bottom:1rem;">
                  <label for="export-csv-delimiter" style="font-size:0.85rem; display:block; margin-bottom:0.35rem; font-weight:600;">Séparateur de colonnes :</label>
                  <select id="export-csv-delimiter" style="width:100%; padding:0.4rem; border:1px solid var(--cn-border); border-radius:4px;">
                    <option value="," selected>Virgule (,) — Standard RFC 4180</option>
                    <option value=";">Point-virgule (;) — Standard Excel français</option>
                  </select>
                </div>
              </div>

              <div style="display:flex; flex-direction:column; gap:0.5rem;">
                <button type="button" class="btn-secondary btn-export-csv" data-type="invoices">Exporter les Factures (.csv)</button>
                <button type="button" class="btn-secondary btn-export-csv" data-type="bank">Exporter les Opérations Bancaires (.csv)</button>
                <button type="button" class="btn-secondary btn-export-csv" data-type="entries">Exporter le Journal Comptable (.csv)</button>
                <button type="button" class="btn-secondary btn-export-csv" data-type="anomalies">Exporter le Rapport d'Anomalies (.csv)</button>
                <button type="button" class="btn-secondary btn-export-csv" data-type="audit">Exporter la Piste d'Audit (.csv)</button>
              </div>
            </div>

            <!-- Carte Export FEC -->
            <div style="border:1px solid var(--cn-border); border-radius:8px; padding:1.25rem; background:var(--cn-bg-surface); display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <h4 style="margin:0 0 0.5rem 0; color:var(--cn-primary);">Export FEC Préliminaire (art. A.47 A-1 LPF)</h4>
                <p style="font-size:0.85rem; color:var(--cn-text-secondary); margin:0 0 1rem 0;">Fichier officiel des écritures comptables (18 colonnes délimitées par tabulation, format DGFiP).</p>

                <div class="cn-state-box cn-state-warning" style="margin-bottom:1rem; font-size:0.8rem;">
                  <strong>Avertissement légal obligatoire :</strong> Export technique préliminaire. La conformité fiscale définitive relève de la responsabilité de l'expert-comptable lors de la clôture des comptes.
                </div>

                <div style="margin-bottom:0.75rem;">
                  <label for="fec-decimal-sep" style="font-size:0.85rem; display:block; margin-bottom:0.35rem; font-weight:600;">Séparateur décimal des montants :</label>
                  <select id="fec-decimal-sep" style="width:100%; padding:0.4rem; border:1px solid var(--cn-border); border-radius:4px;">
                    <option value="," selected>Virgule (,) — Conforme DGFiP</option>
                    <option value=".">Point (.)</option>
                  </select>
                </div>

                <div style="margin-bottom:1rem;">
                  <label for="fec-closing-date" style="font-size:0.85rem; display:block; margin-bottom:0.35rem; font-weight:600;">Date de clôture / Fin d'exercice :</label>
                  <input type="date" id="fec-closing-date" value="2026-12-31" style="width:100%; padding:0.4rem; border:1px solid var(--cn-border); border-radius:4px;" />
                </div>
              </div>

              <button type="button" id="btn-download-fec" class="btn-primary" style="width:100%;">Générer &amp; Télécharger le FEC (.txt)</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Paramètres de la plateforme &amp; Piste d'Audit SHA-256</h3>
          <div id="settings-summary" style="font-size:0.9rem; margin-bottom:1rem;"></div>
          <h4>Journal d'audit inaltérable (Chaînage cryptographique SHA-256)</h4>
          <div class="table-responsive">
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
        </div>
      </section>

      <!-- SOUS-ONGLET : ORGANISATIONS -->
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
          <div class="table-responsive">
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
        </div>
      </section>

      <!-- SOUS-ONGLET : UTILISATEURS & RÔLES -->
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
          <div class="table-responsive">
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
        </div>
      </section>

      <!-- SOUS-ONGLET : CONFIGURATIONS PAYS & JURIDICTIONS -->
      <section id="tab-countries" class="tab-panel hidden">
        <div class="card">
          <h3 id="i18n-countries-heading">${dict.countriesHeading}</h3>
          <p style="font-size:0.88rem; color:var(--cn-text-secondary);">
            Chaque juridiction dispose de versions datées (<code>effectiveFrom</code> / <code>effectiveTo</code>). Les juridictions exploratoires (Europe, Maghreb, Moyen-Orient/CCG) sont clairement marquées comme brouillons non activés en production tant qu'elles n'ont pas reçu de validation réglementaire.
          </p>
          <div class="table-responsive">
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
        </div>
      </section>
    </main>
  </div>

  <script>
    const DICTIONARIES = ${serializedDictionaries};
    const LOCALES_CATALOG = ${serializedLocales};
    const NAV_MODULES = ${serializedNavModules};
    let activeLang = localStorage.getItem("ui_lang") || "${localeDesc.languageCode}";
    let authToken = localStorage.getItem("session_token") || null;
    let currentSession = null;
    let accessibleOrgs = [];
    let activeOrgId = null;
    let cachedDossiers = [];
    let activeDossierId = localStorage.getItem("active_dossier_id") || null;
    let cachedMembers = [];
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
      document.getElementById("i18n-active-dossier-label").textContent = d.activeDossierLabel;
      document.getElementById("i18n-active-period-label").textContent = d.activePeriodLabel;
      document.getElementById("i18n-lang-label").textContent = d.languageSelectorLabel;

      NAV_MODULES.forEach((m) => {
        const el = document.getElementById(m.navButtonId);
        if (el && d[m.i18nKey]) {
          el.textContent = m.order + ". " + d[m.i18nKey];
        }
      });

      document.getElementById("i18n-nav-orgs").textContent = d.navOrganizations;
      document.getElementById("i18n-nav-users").textContent = d.navUsers;
      document.getElementById("i18n-nav-countries").textContent = d.navCountries;
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

    function getJustificationHeaders() {
      return currentSession && currentSession.user && currentSession.user.isPlatformAdmin
        ? { "X-Platform-Admin-Justification": "Supervision technique Phase 1 initiée par l'administrateur" }
        : {};
    }

    async function apiFetch(path, options = {}) {
      const headers = Object.assign(
        { "Content-Type": "application/json" },
        getJustificationHeaders(),
        options.headers || {}
      );
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

    function switchTab(targetTabId) {
      document.querySelectorAll(".nav-btn").forEach((b) => {
        const isActive = b.getAttribute("data-tab") === targetTabId;
        b.classList.toggle("active", isActive);
        if (isActive) {
          b.setAttribute("aria-current", "page");
        } else {
          b.removeAttribute("aria-current");
        }
      });
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.classList.toggle("hidden", p.id !== targetTabId);
      });
      if (targetTabId === "tab-dashboard") {
        loadDashboardData();
      }
      if (targetTabId === "tab-documents") {
        if (activeDossierId) {
          loadDocumentsList(activeDossierId);
        } else {
          showDocumentsNoDossierState();
        }
      }
      if (targetTabId === "tab-invoicing") {
        if (activeDossierId) {
          setInvoicingSubtab("invoices");
          loadSalesInvoices(activeDossierId);
        }
      }
      if (targetTabId === "tab-journal") {
        if (activeDossierId) {
          loadAccountingJournals(activeDossierId);
          loadAccountingAccounts(activeDossierId);
          loadAccountingEntriesList(activeDossierId);
        } else {
          showJournalNoDossierState();
        }
      }
      if (targetTabId === "tab-banking") {
        if (activeDossierId) {
          loadBankTransactions(activeDossierId);
        } else {
          showBankNoDossierState();
        }
      }
      if (targetTabId === "tab-anomalies") {
        if (activeDossierId) {
          loadAnomaliesList(activeDossierId);
        } else {
          showAnomaliesNoDossierState();
        }
      }
      if (targetTabId === "tab-simulator") {
        if (activeDossierId) {
          loadSimulationsHistory(activeDossierId);
        }
      }
    }

    document.querySelectorAll(".nav-btn, .nav-sub-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.getAttribute("data-tab"));
      });
    });

    document.getElementById("org-selector").addEventListener("change", async (e) => {
      activeOrgId = e.target.value;
      activeDossierId = null;
      await refreshActiveOrganizationViews();
    });

    document.getElementById("active-dossier-selector").addEventListener("change", async (e) => {
      activeDossierId = e.target.value;
      localStorage.setItem("active_dossier_id", activeDossierId);
      updateActiveDossierStatusBadge();
      if (!document.getElementById("tab-dashboard").classList.contains("hidden")) {
        await loadDashboardData();
      }
      if (!document.getElementById("dossier-detail-panel").classList.contains("hidden")) {
        await loadDossierDetails(activeDossierId);
      }
      if (!document.getElementById("tab-documents").classList.contains("hidden")) {
        if (activeDossierId) {
          await loadDocumentsList(activeDossierId);
        } else {
          showDocumentsNoDossierState();
        }
      }
      if (!document.getElementById("tab-invoicing").classList.contains("hidden")) {
        if (activeDossierId) {
          await loadSalesInvoices(activeDossierId);
        }
      }
      if (!document.getElementById("tab-journal").classList.contains("hidden")) {
        if (activeDossierId) {
          await loadAccountingJournals(activeDossierId);
          await loadAccountingAccounts(activeDossierId);
          await loadAccountingEntriesList(activeDossierId);
        } else {
          showJournalNoDossierState();
        }
      }
      if (!document.getElementById("tab-banking").classList.contains("hidden")) {
        if (activeDossierId) {
          await loadBankTransactions(activeDossierId);
        } else {
          showBankNoDossierState();
        }
      }
      if (!document.getElementById("tab-anomalies").classList.contains("hidden")) {
        if (activeDossierId) {
          await loadAnomaliesList(activeDossierId);
        } else {
          showAnomaliesNoDossierState();
        }
      }
      if (!document.getElementById("tab-simulator").classList.contains("hidden")) {
        if (activeDossierId) {
          await loadSimulationsHistory(activeDossierId);
        }
      }
    });

    document.getElementById("open-active-dossier-detail-btn").addEventListener("click", async () => {
      switchTab("tab-dossiers");
      if (activeDossierId) {
        await loadDossierDetails(activeDossierId);
      }
    });

    // Support clavier : touche Escape pour refermer les modales
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.getElementById("archive-confirm-modal");
        if (modal && !modal.classList.contains("hidden")) {
          modal.classList.add("hidden");
        }
        const entryModal = document.getElementById("entry-detail-modal");
        if (entryModal && !entryModal.classList.contains("hidden")) {
          entryModal.classList.add("hidden");
        }
      }
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
          "<td><code class='font-mono-tabular'>" + o.slug + "</code></td>" +
          "<td>" + o.organizationType + "</td>" +
          "<td>" + o.countryCode + " / " + o.defaultCurrency + " / " + (o.defaultTimezone || "UTC") + "</td>" +
          "<td class='font-mono-tabular'>" + o.quotaMaxDossiers + " dossiers / " + o.quotaMaxUsers + " utilisateurs</td>";
        tbody.appendChild(tr);
      });
    }

    function getCurrentOrgRole() {
      if (!currentSession) return "ACCOUNTANT_COLLABORATOR";
      if (currentSession.user && currentSession.user.isPlatformAdmin) return "PLATFORM_ADMIN";
      const m = (currentSession.memberships || []).find((x) => x.organizationId === activeOrgId);
      return m ? m.role : "ACCOUNTANT_COLLABORATOR";
    }

    function updateRbacUiVisibility() {
      const role = getCurrentOrgRole();
      const isAdmin = role === "FIRM_ADMIN" || role === "PLATFORM_ADMIN";
      document.getElementById("dossier-rbac-forbidden-state").classList.toggle("hidden", isAdmin);
      document.getElementById("create-dossier-card").classList.toggle("hidden", !isAdmin);
      document.getElementById("toggle-archive-confirm-btn").classList.toggle("hidden", !isAdmin);
      document.getElementById("assign-user-form").classList.toggle("hidden", !isAdmin);
    }

    function renderStatusBadgeHtml(status) {
      const st = status || "ACTIVE";
      if (st === "ACTIVE") return "<span class='badge badge-valid'>ACTIVE</span>";
      if (st === "TO_COMPLETE") return "<span class='badge badge-ai'>TO_COMPLETE</span>";
      if (st === "SUSPENDED") return "<span class='badge badge-danger'>SUSPENDED</span>";
      return "<span class='badge badge-draft'>ARCHIVED</span>";
    }

    function updateActiveDossierStatusBadge() {
      const badge = document.getElementById("active-dossier-status-badge");
      const current = cachedDossiers.find((d) => d.id === activeDossierId);
      if (!current) {
        badge.className = "badge badge-draft";
        badge.textContent = "AUCUN DOSSIER";
        return;
      }
      const st = current.dossierStatus || (current.isActive ? "ACTIVE" : "ARCHIVED");
      badge.textContent = st;
      badge.className = "badge " + (st === "ACTIVE" ? "badge-valid" : (st === "ARCHIVED" ? "badge-draft" : "badge-ai"));
    }

    async function refreshActiveOrganizationViews() {
      if (!activeOrgId) return;
      const loadingEl = document.getElementById("global-loading-state");
      loadingEl.classList.remove("hidden");
      try {
        updateRbacUiVisibility();
        const d = DICTIONARIES[activeLang] || DICTIONARIES.fr;

        const dash = await apiFetch("/api/organizations/" + activeOrgId + "/dashboard");
        document.getElementById("active-org-heading").textContent = dash.organization.name;
        document.getElementById("active-org-meta").textContent =
          "Slug: " + dash.organization.slug + " | Type: " + dash.organization.organizationType +
          " | Établissement: " + dash.organization.countryCode +
          " | Juridiction fiscale: " + (dash.organization.primaryTaxJurisdictionCode || dash.organization.countryCode) +
          " | Devise: " + dash.organization.defaultCurrency;

        const dossiersRes = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers");
        cachedDossiers = dossiersRes.dossiers || [];

        if (!activeDossierId || !cachedDossiers.some((x) => x.id === activeDossierId)) {
          activeDossierId = (cachedDossiers[0] && cachedDossiers[0].id) || null;
        }
        renderActiveDossierSelector();
        applyDossiersFilters();
        await loadDashboardData();

        const membersRes = await apiFetch("/api/organizations/" + activeOrgId + "/members");
        cachedMembers = membersRes.members || [];
        const membersTbody = document.getElementById("members-tbody");
        membersTbody.innerHTML = cachedMembers.map((m) =>
          "<tr><td>" + m.fullName + "</td><td>" + m.email + "</td><td><span class='badge badge-draft'>" + m.role + "</span></td><td class='font-mono-tabular'>" + m.joinedAt.slice(0, 10) + "</td></tr>"
        ).join("");

        const assignSelect = document.getElementById("assign-target-user");
        assignSelect.innerHTML = cachedMembers.map((m) =>
          "<option value='" + m.userId + "'>" + m.fullName + " (" + m.email + " — " + m.role + ")</option>"
        ).join("");

        try {
          const auditRes = await apiFetch("/api/organizations/" + activeOrgId + "/audit-logs");
          document.getElementById("settings-summary").innerHTML =
            "<p><strong>Vérification d'intégrité de la chaîne d'audit :</strong> " +
            (auditRes.chainIntegrity.valid
              ? "<span class='badge badge-valid'>INTÈGRE (" + auditRes.chainIntegrity.checkedCount + " blocs SHA-256 vérifiés)</span>"
              : "<span class='badge badge-danger'>RUPTURE DÉTECTÉE</span>") +
            "</p>";

          document.getElementById("audit-tbody").innerHTML = (auditRes.logs || []).map((l) =>
            "<tr><td class='font-mono-tabular'>" + l.createdAt.replace("T", " ").slice(0, 19) + "</td><td>" + l.actorRole + "</td><td><code>" + l.action + "</code></td><td>" + l.targetEntityType + "</td><td><code class='font-mono-tabular'>" + l.integrityHash.slice(0, 16) + "...</code></td></tr>"
          ).join("");
        } catch (err) {
          document.getElementById("settings-summary").innerHTML =
            "<p><span class='badge badge-ai'>Accès restreint RBAC [SEC-OPEN-02]</span> La consultation du journal d'audit complet de l'organisation est réservée aux rôles d'administration (<code>FIRM_ADMIN</code>, <code>CLIENT_DIRECTOR</code> ou <code>PLATFORM_ADMIN</code> justifié).</p>";
          document.getElementById("audit-tbody").innerHTML =
            "<tr><td colspan='5' style='color:var(--cn-text-secondary);'>Journal d'audit non accessible pour le rôle courant (" + (err && err.message ? err.message : "403") + ").</td></tr>";
        }
      } finally {
        loadingEl.classList.add("hidden");
      }
    }

    let activeDashView = "DOSSIER";

    function setDashView(view) {
      activeDashView = view;
      const isDossier = view === "DOSSIER";
      const btnDossier = document.getElementById("btn-dash-view-dossier");
      const btnFirm = document.getElementById("btn-dash-view-firm");
      if (btnDossier && btnFirm) {
        btnDossier.style.background = isDossier ? "var(--cn-brand-primary)" : "var(--cn-surface-alt)";
        btnDossier.style.color = isDossier ? "var(--cn-surface)" : "var(--cn-text)";
        btnFirm.style.background = !isDossier ? "var(--cn-brand-primary)" : "var(--cn-surface-alt)";
        btnFirm.style.color = !isDossier ? "var(--cn-surface)" : "var(--cn-text)";
      }
      document.getElementById("dash-dossier-view").classList.toggle("hidden", !isDossier);
      document.getElementById("dash-firm-view").classList.toggle("hidden", isDossier);
      loadDashboardData();
    }

    async function loadDashboardData() {
      if (!activeOrgId) return;

      const loadingEl = document.getElementById("dash-loading-state");
      const errorEl = document.getElementById("dash-error-state");
      const forbiddenEl = document.getElementById("dash-forbidden-state");
      const emptyEl = document.getElementById("dash-empty-state");
      const contentEl = document.getElementById("dash-content-container");

      loadingEl.classList.remove("hidden");
      errorEl.classList.add("hidden");
      forbiddenEl.classList.add("hidden");
      emptyEl.classList.add("hidden");

      try {
        if (activeDashView === "FIRM") {
          contentEl.classList.remove("hidden");
          const dash = await apiFetch("/api/organizations/" + activeOrgId + "/dashboard");
          const activeCountBadge = document.getElementById("firm-active-dossiers-badge");
          if (activeCountBadge) {
            activeCountBadge.textContent =
              dash.activeDossiersCount + " dossier(s) actif(s) sur " + (dash.dossiersSummary || []).length;
          }

          const tbody = document.getElementById("dash-firm-dossiers-tbody");
          const summaries = dash.dossiersSummary || [];
          if (summaries.length === 0) {
            tbody.innerHTML = "<tr><td colspan='8' style='text-align:center; padding:1rem; color:var(--cn-text-secondary);'>Aucun dossier dans le portefeuille.</td></tr>";
          } else {
            tbody.innerHTML = summaries.map((d) => {
              const pendingBadge = d.pendingDocumentsCount > 0
                ? "<span class='badge badge-ai'>" + d.pendingDocumentsCount + "</span>"
                : "<span class='badge badge-valid'>0</span>";
              const unpaidBadge = d.unpaidInvoicesCount > 0
                ? "<span class='badge badge-ai'>" + d.unpaidInvoicesCount + "</span>"
                : "<span class='badge badge-valid'>0</span>";
              const anomBadge = d.openAnomaliesCount > 0
                ? "<span class='badge badge-danger'>" + d.openAnomaliesCount + "</span>"
                : "<span class='badge badge-valid'>0</span>";
              const dueStr = (d.remainingDueMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + d.currency;
              return "<tr>" +
                "<td><code class='font-mono-tabular'>" + d.code + "</code></td>" +
                "<td><strong>" + d.name + "</strong></td>" +
                "<td class='font-mono-tabular'>" + d.currency + "</td>" +
                "<td style='text-align:center;'>" + pendingBadge + "</td>" +
                "<td style='text-align:center;'>" + unpaidBadge + "</td>" +
                "<td class='font-mono-tabular' style='text-align:right; font-weight:600;'>" + dueStr + "</td>" +
                "<td style='text-align:center;'>" + anomBadge + "</td>" +
                "<td>" + renderStatusBadgeHtml(d.status) + "</td>" +
                "</tr>";
            }).join("");
          }
        } else {
          // Vue DOSSIER
          if (!activeDossierId) {
            emptyEl.textContent = "Aucun dossier client sélectionné. Veuillez sélectionner ou créer un dossier.";
            emptyEl.classList.remove("hidden");
            contentEl.classList.add("hidden");
            return;
          }
          contentEl.classList.remove("hidden");

          const period = (document.getElementById("dash-period-select") && document.getElementById("dash-period-select").value) || "FISCAL_YEAR";
          const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/dashboard?period=" + encodeURIComponent(period));

          // 6 KPI Décisionnels
          const s = res.sales || {};
          const p = res.purchases || {};
          const q = res.quotes || {};
          const a = res.anomalies || {};

          const turnoverStr = ((s.turnoverNetMinor || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
          const vatStr = ((s.vatCollectedMinor || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
          const collStr = ((s.collectionsTotalMinor || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
          const remStr = ((s.remainingDueMinor || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
          const expStr = ((p.expensesNetMinor || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

          document.getElementById("kpi-val-turnover").textContent = turnoverStr;
          document.getElementById("kpi-sub-turnover").textContent = "TVA collectée : " + vatStr;

          document.getElementById("kpi-val-collections").textContent = collStr;
          document.getElementById("kpi-sub-collections").textContent = (s.invoicesCount || 0) + " facture(s) émise(s)";

          document.getElementById("kpi-val-remaining").textContent = remStr;
          document.getElementById("kpi-sub-remaining").textContent = (s.overdueInvoicesCount || 0) + " facture(s) échue(s) (" + (((s.overdueAmountMinor || 0) / 100).toFixed(2)) + " €)";

          document.getElementById("kpi-val-expenses").textContent = expStr;
          document.getElementById("kpi-sub-expenses").textContent = (p.documentsCount || 0) + " pièce(s) validée(s)";

          document.getElementById("kpi-val-quotes").textContent = (q.quotesCount || 0) + " devis";
          document.getElementById("kpi-sub-quotes").textContent = "Taux de conversion : " + (((q.conversionRateBps || 0) / 100).toFixed(0)) + " %";

          document.getElementById("kpi-val-anomalies").textContent = (a.openCount || 0) + " alerte(s)";
          document.getElementById("kpi-sub-anomalies").textContent = (a.criticalCount || 0) + " critique(s) bloquante(s)";

          // Alertes prioritaires actionnables
          const alerts = res.actionableAlerts || [];
          const alertsBadge = document.getElementById("dash-alerts-count-badge");
          alertsBadge.textContent = alerts.length + " action(s) requise(s)";
          alertsBadge.className = "badge " + (alerts.length > 0 ? "badge-ai" : "badge-valid");

          const alertsTbody = document.getElementById("dash-alerts-tbody");
          if (alerts.length === 0) {
            alertsTbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:1.25rem; color:var(--cn-text-secondary);'>Aucune alerte prioritaire pour cette période. Situation comptable et documentaire sous contrôle.</td></tr>";
          } else {
            alertsTbody.innerHTML = alerts.map((al) => {
              let prioBadge = "<span class='badge badge-info'>INFO</span>";
              if (al.priority === "CRITICAL") {
                prioBadge = "<span class='badge' style='background:var(--cn-state-error-bg); color:var(--cn-state-error-text); border:1px solid var(--cn-state-error-border);'>CRITIQUE</span>";
              } else if (al.priority === "WARNING") {
                prioBadge = "<span class='badge badge-ai'>ATTENTION</span>";
              }
              const amtStr = al.amountMinor !== undefined && al.amountMinor !== null
                ? (al.amountMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
                : "—";
              const due = al.dueDate ? al.dueDate.slice(0, 10) : "—";
              return "<tr>" +
                "<td>" + prioBadge + "</td>" +
                "<td><strong>" + al.title + "</strong></td>" +
                "<td style='font-size:0.85rem; color:var(--cn-text-secondary);'>" + al.description + "</td>" +
                "<td class='font-mono-tabular' style='text-align:right; font-weight:600;'>" + amtStr + "</td>" +
                "<td class='font-mono-tabular'>" + due + "</td>" +
                "<td style='text-align:center;'><button type='button' class='btn-secondary dash-action-btn' data-tab='" + al.targetTab + "' data-entity-id='" + (al.entityId || "") + "' style='font-size:0.78rem; padding:4px 8px;'>" + al.actionLabel + "</button></td>" +
                "</tr>";
            }).join("");

            alertsTbody.querySelectorAll(".dash-action-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const targetTab = btn.getAttribute("data-tab");
                const entityId = btn.getAttribute("data-entity-id");
                switchTab(targetTab);
                if (targetTab === "tab-documents" && entityId) {
                  openDocumentDetail(entityId);
                }
              });
            });
          }

          // Détection état vide d'activité
          const isEmpty = (s.invoicesCount || 0) === 0 && (p.documentsCount || 0) === 0 && (q.quotesCount || 0) === 0 && ((res.accounting && res.accounting.totalEntriesCount) || 0) === 0;
          if (isEmpty) {
            emptyEl.textContent = "Dossier en attente d'activité comptable : aucune facture, pièce justificative ou écriture n'est enregistrée pour cette période.";
            emptyEl.classList.remove("hidden");
          }
        }
      } catch (err) {
        if (err && err.message && (err.message.includes("403") || err.message.toLowerCase().includes("non autorisé") || err.message.toLowerCase().includes("permission"))) {
          forbiddenEl.classList.remove("hidden");
          contentEl.classList.add("hidden");
        } else {
          errorEl.textContent = "Erreur de chargement du tableau de bord : " + (err && err.message ? err.message : String(err));
          errorEl.classList.remove("hidden");
        }
      } finally {
        loadingEl.classList.add("hidden");
      }
    }

    document.getElementById("btn-dash-view-dossier").addEventListener("click", () => setDashView("DOSSIER"));
    document.getElementById("btn-dash-view-firm").addEventListener("click", () => setDashView("FIRM"));
    document.getElementById("dash-period-select").addEventListener("change", () => loadDashboardData());
    document.getElementById("btn-dash-refresh").addEventListener("click", () => loadDashboardData());

    function renderActiveDossierSelector() {
      const sel = document.getElementById("active-dossier-selector");
      sel.innerHTML = "";
      cachedDossiers.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.code + " — " + d.name + " (" + d.countryCode + " / " + d.currency + ")";
        if (d.id === activeDossierId) opt.selected = true;
        sel.appendChild(opt);
      });
      updateActiveDossierStatusBadge();
    }

    function renderDossiersTable(list) {
      const tbody = document.getElementById("dossiers-tbody");
      const emptyBox = document.getElementById("dossiers-empty-state");
      emptyBox.classList.toggle("hidden", list.length > 0);

      tbody.innerHTML = list.map((d) => {
        const st = d.dossierStatus || (d.isActive ? "ACTIVE" : "ARCHIVED");
        return "<tr>" +
          "<td><code class='font-mono-tabular'>" + d.code + "</code></td>" +
          "<td><strong>" + d.name + "</strong><br/><small style='color:var(--cn-text-secondary);'>" + (d.legalForm || "SAS") + (d.city ? " — " + d.city : "") + "</small></td>" +
          "<td class='font-mono-tabular'>" + (d.legalRegistrationNumber || "—") + "<br/><small style='color:var(--cn-text-secondary);'>" + (d.vatIntracommunityNumber || "") + "</small></td>" +
          "<td>" + d.countryCode + " / " + (d.taxJurisdictionCode || d.countryCode) + "<br/><code class='font-mono-tabular'>" + d.countryConfigVersionId + "</code></td>" +
          "<td>" + d.taxRegimeCode + "<br/><small style='color:var(--cn-text-secondary);'>" + (d.vatRegimeCode || "FR_TVA_REEL_NORMAL") + "</small></td>" +
          "<td class='font-mono-tabular'>" + (d.fiscalYearStartDate || "2026-01-01") + " → " + (d.fiscalYearEndDate || "2026-12-31") + " (" + d.currency + ")</td>" +
          "<td>" + renderStatusBadgeHtml(st) + "</td>" +
          "<td><button type='button' class='btn-secondary open-dossier-btn' data-dossier-id='" + d.id + "'>Gérer / Fiche</button></td>" +
          "</tr>";
      }).join("");

      tbody.querySelectorAll(".open-dossier-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const dossierId = btn.getAttribute("data-dossier-id");
          activeDossierId = dossierId;
          localStorage.setItem("active_dossier_id", activeDossierId);
          renderActiveDossierSelector();
          await loadDossierDetails(dossierId);
        });
      });
    }

    function applyDossiersFilters() {
      const q = (document.getElementById("filter-dossiers").value || "").toLowerCase();
      const statusFilter = document.getElementById("filter-dossier-status").value;
      const regimeFilter = document.getElementById("filter-dossier-regime").value;

      const filtered = cachedDossiers.filter((d) => {
        const st = d.dossierStatus || (d.isActive ? "ACTIVE" : "ARCHIVED");
        if (statusFilter !== "ALL" && st !== statusFilter) return false;
        if (regimeFilter !== "ALL" && d.taxRegimeCode !== regimeFilter) return false;
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          (d.legalRegistrationNumber || "").toLowerCase().includes(q) ||
          (d.city || "").toLowerCase().includes(q) ||
          d.countryCode.toLowerCase().includes(q) ||
          d.taxRegimeCode.toLowerCase().includes(q)
        );
      });
      renderDossiersTable(filtered);
    }

    document.getElementById("filter-dossiers").addEventListener("input", applyDossiersFilters);
    document.getElementById("filter-dossier-status").addEventListener("change", applyDossiersFilters);
    document.getElementById("filter-dossier-regime").addEventListener("change", applyDossiersFilters);

    async function loadDossierDetails(dossierId) {
      if (!activeOrgId || !dossierId) return;
      try {
        const details = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + dossierId);
        const panel = document.getElementById("dossier-detail-panel");
        panel.classList.remove("hidden");

        const d = details.dossier;
        document.getElementById("detail-dossier-title").textContent =
          d.code + " — " + d.name + " (" + (d.legalForm || "SAS") + ")";
        document.getElementById("detail-dossier-subtitle").textContent =
          "Version réglementaire : " + d.countryConfigVersionId +
          " | Statut : " + (d.dossierStatus || "ACTIVE") +
          (d.archivedAt ? " (Archivé le " + d.archivedAt.slice(0, 10) + " — Motif : " + (d.archiveReason || "") + ")" : "");

        const kpis = [
          { label: "Comptes PCG initialisés", value: details.chartOfAccountsCount },
          { label: "Journaux standards", value: (details.journals || []).length },
          { label: "Utilisateurs affectés", value: (details.assignments || []).length },
          { label: "Documents / Écritures", value: details.metrics.documentsCount + " / " + details.metrics.entriesCount }
        ];
        document.getElementById("detail-dossier-kpis").innerHTML = kpis.map((k) =>
          '<div class="kpi-box"><div class="kpi-label">' + k.label + '</div><div class="kpi-value">' + k.value + '</div></div>'
        ).join("");

        document.getElementById("edit-dossier-name").value = d.name || "";
        document.getElementById("edit-dossier-legal-form").value = d.legalForm || "SAS";
        document.getElementById("edit-dossier-siret").value = d.legalRegistrationNumber || "";
        document.getElementById("edit-dossier-vat").value = d.vatIntracommunityNumber || "";
        document.getElementById("edit-dossier-regime").value = d.taxRegimeCode || "";
        document.getElementById("edit-dossier-vat-regime").value = d.vatRegimeCode || "FR_TVA_REEL_NORMAL";
        document.getElementById("edit-dossier-address").value = d.addressLine || "";
        document.getElementById("edit-dossier-postal").value = d.postalCode || "";
        document.getElementById("edit-dossier-city").value = d.city || "";
        document.getElementById("edit-dossier-status").value =
          d.dossierStatus && d.dossierStatus !== "ARCHIVED" ? d.dossierStatus : "ACTIVE";
        document.getElementById("edit-dossier-contact-name").value = d.contactName || "";
        document.getElementById("edit-dossier-contact-email").value = d.contactEmail || "";
        document.getElementById("edit-dossier-notes").value = d.internalNotes || "";

        document.getElementById("detail-dossier-journals").innerHTML = (details.journals || []).map((j) =>
          "<span class='badge badge-info'><strong class='font-mono-tabular'>" + j.code + "</strong>&nbsp;— " + j.label + "</span>"
        ).join("");

        const assignTbody = document.getElementById("dossier-assignments-tbody");
        assignTbody.innerHTML = (details.assignments || []).map((a) =>
          "<tr>" +
          "<td><strong>" + a.fullName + "</strong><br/><small>" + a.email + "</small></td>" +
          "<td><span class='badge badge-draft'>" + a.orgRole + "</span></td>" +
          "<td>" + (a.canView ? "Oui" : "Non") + "</td>" +
          "<td>" + (a.canUpload ? "Oui" : "Non") + "</td>" +
          "<td>" + (a.canEditExtraction ? "Oui" : "Non") + "</td>" +
          "<td>" + (a.canValidateAccounting ? "Oui" : "Non") + "</td>" +
          "<td>" + (a.canExport ? "Oui" : "Non") + "</td>" +
          "</tr>"
        ).join("");
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    document.getElementById("create-dossier-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("dossier-name").value,
            code: document.getElementById("dossier-code").value,
            legalForm: document.getElementById("dossier-legal-form").value,
            legalRegistrationNumber: document.getElementById("dossier-siret").value,
            vatIntracommunityNumber: document.getElementById("dossier-vat-number").value,
            addressLine: document.getElementById("dossier-address").value,
            postalCode: document.getElementById("dossier-postal-code").value,
            city: document.getElementById("dossier-city").value,
            countryCode: document.getElementById("dossier-country").value,
            taxJurisdictionCode: document.getElementById("dossier-jurisdiction").value,
            taxRegimeCode: document.getElementById("dossier-regime").value,
            vatRegimeCode: document.getElementById("dossier-vat-regime").value,
            fiscalYearStartDate: document.getElementById("dossier-fy-start").value,
            fiscalYearEndDate: document.getElementById("dossier-fy-end").value,
            activitySector: document.getElementById("dossier-sector").value,
            contactName: document.getElementById("dossier-contact-name").value,
            contactEmail: document.getElementById("dossier-contact-email").value,
            dossierStatus: document.getElementById("dossier-status").value,
            internalNotes: document.getElementById("dossier-notes").value
          })
        });
        document.getElementById("create-dossier-form").reset();
        activeDossierId = res.dossier.id;
        showFeedback("Dossier client créé et référentiel PCG + journaux initialisé avec succès.");
        await refreshActiveOrganizationViews();
        await loadDossierDetails(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    document.getElementById("edit-dossier-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeDossierId) return;
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId, {
          method: "PATCH",
          body: JSON.stringify({
            name: document.getElementById("edit-dossier-name").value,
            legalForm: document.getElementById("edit-dossier-legal-form").value,
            legalRegistrationNumber: document.getElementById("edit-dossier-siret").value,
            vatIntracommunityNumber: document.getElementById("edit-dossier-vat").value,
            taxRegimeCode: document.getElementById("edit-dossier-regime").value,
            vatRegimeCode: document.getElementById("edit-dossier-vat-regime").value,
            addressLine: document.getElementById("edit-dossier-address").value,
            postalCode: document.getElementById("edit-dossier-postal").value,
            city: document.getElementById("edit-dossier-city").value,
            dossierStatus: document.getElementById("edit-dossier-status").value,
            contactName: document.getElementById("edit-dossier-contact-name").value,
            contactEmail: document.getElementById("edit-dossier-contact-email").value,
            internalNotes: document.getElementById("edit-dossier-notes").value
          })
        });
        showFeedback("Paramètres du dossier client mis à jour.");
        await refreshActiveOrganizationViews();
        await loadDossierDetails(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    document.getElementById("toggle-archive-confirm-btn").addEventListener("click", () => {
      const modal = document.getElementById("archive-confirm-modal");
      modal.classList.toggle("hidden");
    });

    document.getElementById("cancel-archive-btn").addEventListener("click", () => {
      document.getElementById("archive-confirm-modal").classList.add("hidden");
    });

    async function triggerArchiveOrRestore(archiveFlag) {
      if (!activeDossierId) return;
      try {
        const reason = document.getElementById("archive-reason-input").value;
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/archive", {
          method: "POST",
          body: JSON.stringify({ archive: archiveFlag, reason })
        });
        document.getElementById("archive-confirm-modal").classList.add("hidden");
        document.getElementById("archive-reason-input").value = "";
        showFeedback(archiveFlag ? "Dossier archivé logiquement (historique et audit préservés)." : "Dossier restauré à l'état ACTIF.");
        await refreshActiveOrganizationViews();
        await loadDossierDetails(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    document.getElementById("confirm-archive-btn").addEventListener("click", () => triggerArchiveOrRestore(true));
    document.getElementById("confirm-restore-btn").addEventListener("click", () => triggerArchiveOrRestore(false));

    document.getElementById("init-referential-btn").addEventListener("click", async () => {
      if (!activeDossierId) return;
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/init-referential", {
          method: "POST",
          body: JSON.stringify({})
        });
        showFeedback(
          "Référentiel vérifié (idempotent) : " +
          res.insertedAccountsCount + " nouveaux comptes / " + res.totalAccountsCount + " comptes PCG au total, " +
          res.insertedJournalsCount + " nouveaux journaux / " + res.totalJournalsCount + " journaux au total."
        );
        await loadDossierDetails(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    document.getElementById("assign-user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeDossierId) return;
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/assignments", {
          method: "POST",
          body: JSON.stringify({
            targetUserId: document.getElementById("assign-target-user").value,
            canView: document.getElementById("perm-view").checked,
            canUpload: document.getElementById("perm-upload").checked,
            canEditExtraction: document.getElementById("perm-edit").checked,
            canValidateAccounting: document.getElementById("perm-validate").checked,
            canExport: document.getElementById("perm-export").checked
          })
        });
        showFeedback("Permissions de l'utilisateur sur le dossier mises à jour.");
        await loadDossierDetails(activeDossierId);
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
          "<td class='font-mono-tabular'>#" + c.deploymentPriorityOrder + "</td>" +
          "<td><strong>" + c.countryName + " (" + c.countryCode + ")</strong><br/><small>" + (c.regionGroup || "INTERNATIONAL") + "</small></td>" +
          "<td><code class='font-mono-tabular'>" + c.versionId + "</code><br/><small>" + c.effectiveFrom + " → " + (c.effectiveTo || "∞") + "</small></td>" +
          "<td>" + c.accountingStandardName + " (" + (c.indirectTaxSystem || "VAT") + ")</td>" +
          "<td>" + c.defaultCurrency + " | " + (c.defaultTimezone || "UTC") + " | " + (c.supportsRtl ? "RTL" : "LTR") + "</td>" +
          "<td><span class='badge " + badgeClass + "'>" + c.validationStatus + "</span></td>" +
          "<td class='font-mono-tabular'>" + verifiedRates + "</td>" +
          "</tr>";
      }).join("");
    }

    // --- MODULE 3 : COLLECTE DOCUMENTAIRE & OCR (Lot 1.2) ---
    let cachedDocuments = [];
    let selectedDocument = null;
    let currentDocStatusFilter = "ALL";
    let currentDocCategoryFilter = "ALL";
    let currentDocSearch = "";

    function showDocumentsNoDossierState() {
      document.getElementById("docs-no-dossier-state").classList.remove("hidden");
      document.getElementById("docs-content-container").classList.add("hidden");
    }

    async function loadDocumentsList(dossierId) {
      if (!dossierId) {
        showDocumentsNoDossierState();
        return;
      }
      document.getElementById("docs-no-dossier-state").classList.add("hidden");
      document.getElementById("docs-content-container").classList.remove("hidden");

      try {
        let url = "/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/documents?limit=100";
        if (currentDocStatusFilter !== "ALL") {
          url += "&status=" + encodeURIComponent(currentDocStatusFilter);
        }
        if (currentDocCategoryFilter !== "ALL") {
          url += "&category=" + encodeURIComponent(currentDocCategoryFilter);
        }
        if (currentDocSearch) {
          url += "&q=" + encodeURIComponent(currentDocSearch);
        }

        const res = await apiFetch(url);
        cachedDocuments = res.documents || [];

        // Mise à jour des compteurs
        const counts = res.countsByStatus || {};
        document.getElementById("cnt-all").textContent = counts.ALL || 0;
        document.getElementById("cnt-pending").textContent = counts.PENDING_REVIEW || 0;
        document.getElementById("cnt-corrected").textContent = counts.CORRECTED || 0;
        document.getElementById("cnt-validated").textContent = counts.VALIDATED || 0;
        document.getElementById("cnt-rejected").textContent = counts.REJECTED || 0;

        renderDocumentsTable(cachedDocuments);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    function renderDocumentsTable(docs) {
      const tbody = document.getElementById("documents-tbody");
      const emptyState = document.getElementById("documents-empty-state");

      if (!docs || docs.length === 0) {
        tbody.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
      }
      emptyState.classList.add("hidden");

      const statusMap = {
        RECEIVED: { label: "Reçu", badgeClass: "badge-draft" },
        EXTRACTED: { label: "Extrait", badgeClass: "badge-ai" },
        PENDING_REVIEW: { label: "À réviser", badgeClass: "badge-ai" },
        CORRECTED: { label: "Corrigé", badgeClass: "badge-draft" },
        VALIDATED: { label: "Validé", badgeClass: "badge-valid" },
        REJECTED: { label: "Rejeté", badgeClass: "badge-draft", style: "background:var(--cn-state-error-bg); color:var(--cn-state-error-text); border:1px solid var(--cn-state-error-border);" },
        EXPORTED: { label: "Exporté", badgeClass: "badge-valid" }
      };

      const categoryMap = {
        SUPPLIER_INVOICE: "Facture fournisseur",
        CUSTOMER_INVOICE: "Facture client",
        RECEIPT_EXPENSE: "Note de frais",
        BANK_STATEMENT: "Relevé bancaire",
        PAYMENT_PROOF: "Preuve de paiement",
        CREDIT_NOTE: "Avoir",
        OTHER: "Autre"
      };

      tbody.innerHTML = docs.map((d) => {
        let ext = {};
        try {
          ext = JSON.parse(d.extractedDataJson).extraction || {};
        } catch {}

        const thirdParty = (ext.issuerName && ext.issuerName.value) || (ext.recipientName && ext.recipientName.value) || "—";
        const pieceNum = (ext.invoiceNumber && ext.invoiceNumber.value) || "—";
        const grossMinor = ext.grossAmountMinor && ext.grossAmountMinor.value;
        const grossStr = grossMinor !== undefined ? (grossMinor / 100).toFixed(2) + " €" : "—";

        let avgConf = 0.9;
        if (ext.grossAmountMinor && ext.grossAmountMinor.confidenceScore !== undefined) {
          avgConf = ext.grossAmountMinor.confidenceScore;
        }
        let confBadge = "<span class='badge badge-valid'>" + (avgConf * 100).toFixed(0) + "% (Haute)</span>";
        if (avgConf < 0.5) {
          confBadge = "<span class='badge' style='background:var(--cn-state-error-bg); color:var(--cn-state-error-text); border:1px solid var(--cn-state-error-border);'>" + (avgConf * 100).toFixed(0) + "% (Faible)</span>";
        } else if (avgConf < 0.85) {
          confBadge = "<span class='badge badge-ai'>" + (avgConf * 100).toFixed(0) + "% (Moyenne)</span>";
        }

        const st = statusMap[d.workflowStatus] || { label: d.workflowStatus, badgeClass: "badge-draft" };
        const stBadge = "<span class='badge " + st.badgeClass + "'" + (st.style ? " style='" + st.style + "'" : "") + ">" + st.label + "</span>";
        const dateStr = d.createdAt ? d.createdAt.slice(0, 10) : "—";
        const isSelected = selectedDocument && selectedDocument.id === d.id;

        return "<tr style='border-bottom:1px solid var(--cn-border);" + (isSelected ? " background:rgba(35, 125, 104, 0.08); font-weight:600;" : "") + "'>" +
          "<td class='font-mono-tabular' style='padding:0.6rem 0.5rem;'>" + dateStr + "</td>" +
          "<td style='padding:0.6rem 0.5rem;'>" +
            "<strong>" + d.originalFilename + "</strong><br/>" +
            "<small style='color:var(--cn-text-secondary); font-size:0.75rem;'>" + (d.sizeBytes / 1024).toFixed(1) + " Ko | SHA: " + d.sha256Checksum.slice(0, 8) + "...</small>" +
          "</td>" +
          "<td style='padding:0.6rem 0.5rem;'>" + (categoryMap[d.category] || d.category) + "</td>" +
          "<td style='padding:0.6rem 0.5rem;'>" + thirdParty + "<br/><small class='font-mono-tabular' style='color:var(--cn-text-secondary);'>" + pieceNum + "</small></td>" +
          "<td class='font-mono-tabular' style='padding:0.6rem 0.5rem;'>" + grossStr + "</td>" +
          "<td style='padding:0.6rem 0.5rem;'>" + confBadge + "</td>" +
          "<td style='padding:0.6rem 0.5rem;'>" + stBadge + "</td>" +
          "<td style='padding:0.6rem 0.5rem;'>" +
            "<button type='button' class='btn-secondary doc-inspect-btn' data-doc-id='" + d.id + "' style='font-size:0.78rem; padding:0.25rem 0.55rem;'>" +
              "Examiner" +
            "</button>" +
          "</td>" +
        "</tr>";
      }).join("");

      tbody.querySelectorAll(".doc-inspect-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          openDocumentDetail(btn.getAttribute("data-doc-id"));
        });
      });
    }

    async function openDocumentDetail(docId) {
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents/" + docId);
        selectedDocument = res.document;

        const panel = document.getElementById("document-detail-panel");
        panel.classList.remove("hidden");

        document.getElementById("doc-detail-filename").textContent = selectedDocument.originalFilename;
        document.getElementById("doc-detail-meta").textContent =
          "Empreinte SHA-256 : " + selectedDocument.sha256Checksum + " | Taille : " + (selectedDocument.sizeBytes / 1024).toFixed(1) + " Ko | Conservation légale : jusqu'au " + selectedDocument.retentionUntilDate;

        const dlBtn = document.getElementById("doc-detail-download-btn");
        dlBtn.href = res.downloadUrl;

        // Doublon
        const dupAlert = document.getElementById("doc-detail-duplicate-alert");
        if (selectedDocument.heuristicDuplicateOfId) {
          dupAlert.classList.remove("hidden");
          document.getElementById("doc-detail-duplicate-desc").textContent =
            "Ce document présente une forte concordance avec une pièce déjà importée (ID: " + selectedDocument.heuristicDuplicateOfId + ")." +
            (selectedDocument.overrideDuplicateReason ? ' Dérogation accordée : "' + selectedDocument.overrideDuplicateReason + '"' : "");
        } else {
          dupAlert.classList.add("hidden");
        }

        // Rejet
        const rejBox = document.getElementById("doc-detail-rejection-box");
        if (selectedDocument.workflowStatus === "REJECTED") {
          rejBox.classList.remove("hidden");
          document.getElementById("doc-detail-rejection-reason").textContent =
            selectedDocument.rejectionReason || "Aucun motif spécifié.";
        } else {
          rejBox.classList.add("hidden");
        }

        // Parsing des champs extraits
        let ext = {};
        try {
          const parsed = JSON.parse(selectedDocument.extractedDataJson);
          ext = parsed.extraction || {};
        } catch {}

        const setField = (id, confId, fieldObj, isMinor) => {
          const inp = document.getElementById(id);
          const conf = document.getElementById(confId);
          if (fieldObj && fieldObj.value !== undefined) {
            inp.value = isMinor ? (fieldObj.value / 100).toFixed(2) : fieldObj.value;
            const score = fieldObj.confidenceScore !== undefined ? fieldObj.confidenceScore : 0.9;
            const src = fieldObj.source === "HUMAN_ENTRY" ? "Saisie humaine" : "IA Assistée";
            conf.textContent = "Confiance : " + (score * 100).toFixed(0) + "% (" + src + ")";
          } else {
            inp.value = "";
            conf.textContent = "";
          }
        };

        setField("field-issuer-name", "conf-issuer-name", ext.issuerName, false);
        setField("field-invoice-number", "conf-invoice-number", ext.invoiceNumber, false);
        setField("field-invoice-date", "conf-invoice-date", ext.invoiceDate, false);
        setField("field-due-date", "conf-due-date", ext.dueDate, false);
        setField("field-net-amount", "conf-net-amount", ext.netAmountMinor, true);
        setField("field-vat-amount", "conf-vat-amount", ext.vatAmountMinor, true);
        setField("field-gross-amount", "conf-gross-amount", ext.grossAmountMinor, true);
        setField("field-account-code", "conf-account-code", ext.suggestedAccountCode, false);

        // Visibilité des boutons selon statut
        const validateBtn = document.getElementById("doc-validate-btn");
        const generateEntryBtn = document.getElementById("doc-generate-draft-entry-btn");
        const saveCorrectionsBtn = document.getElementById("doc-save-corrections-btn");

        if (selectedDocument.workflowStatus === "VALIDATED") {
          validateBtn.classList.add("hidden");
          generateEntryBtn.classList.remove("hidden");
          saveCorrectionsBtn.setAttribute("disabled", "true");
        } else if (selectedDocument.workflowStatus === "REJECTED") {
          validateBtn.classList.add("hidden");
          generateEntryBtn.classList.add("hidden");
          saveCorrectionsBtn.removeAttribute("disabled");
        } else {
          validateBtn.classList.remove("hidden");
          generateEntryBtn.classList.add("hidden");
          saveCorrectionsBtn.removeAttribute("disabled");
        }

        renderDocumentsTable(cachedDocuments);
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    function closeDocumentDetail() {
      selectedDocument = null;
      document.getElementById("document-detail-panel").classList.add("hidden");
      renderDocumentsTable(cachedDocuments);
    }

    // Gestion Drag & Drop
    const dropzone = document.getElementById("doc-dropzone");
    const fileInput = document.getElementById("doc-file-input");

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "var(--cn-action)";
      dropzone.style.background = "rgba(35, 125, 104, 0.05)";
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.style.borderColor = "var(--cn-border)";
      dropzone.style.background = "var(--cn-bg-app)";
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "var(--cn-border)";
      dropzone.style.background = "var(--cn-bg-app)";
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        document.getElementById("doc-dropzone-label").textContent =
          "Fichier sélectionné : " + fileInput.files[0].name + " (" + (fileInput.files[0].size / 1024).toFixed(1) + " Ko)";
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files[0]) {
        document.getElementById("doc-dropzone-label").textContent =
          "Fichier sélectionné : " + fileInput.files[0].name + " (" + (fileInput.files[0].size / 1024).toFixed(1) + " Ko)";
      }
    });

    // Formulaire d'upload de document
    document.getElementById("doc-upload-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        showFeedback("Veuillez sélectionner un fichier à importer.", true);
        return;
      }

      const category = document.getElementById("doc-upload-category").value;
      const allowOverride = document.getElementById("doc-allow-override-check").checked;
      const overrideReason = document.getElementById("doc-override-reason").value;

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result;
          const base64Content = String(dataUrl).split(",")[1];

          const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents", {
            method: "POST",
            body: JSON.stringify({
              filename: file.name,
              mimeType: file.type || "application/pdf",
              contentBase64: base64Content,
              category,
              allowDuplicateOverride: allowOverride,
              overrideReason: overrideReason || undefined
            })
          });

          if (res.duplicateDetected && !allowOverride) {
            const overrideBox = document.getElementById("doc-duplicate-override-box");
            overrideBox.classList.remove("hidden");
            document.getElementById("doc-duplicate-warning-text").textContent =
              res.heuristicWarning || "Doublon exact détecté (empreinte SHA-256 identique). Cochez ci-dessous pour confirmer l'exception.";
            showFeedback("Doublon détecté. Saisissez un motif de dérogation si nécessaire.", true);
            return;
          }

          document.getElementById("doc-upload-form").reset();
          document.getElementById("doc-duplicate-override-box").classList.add("hidden");
          document.getElementById("doc-dropzone-label").textContent =
            "Glissez-déposez un fichier ici ou cliquez pour parcourir";
          showFeedback("Document importé et analysé avec succès.");
          await loadDocumentsList(activeDossierId);
          if (res.document && res.document.id) {
            await openDocumentDetail(res.document.id);
          }
        } catch (err) {
          showFeedback(err.message, true);
        }
      };
      reader.readAsDataURL(file);
    });

    // Filtrage par statut (pills)
    document.querySelectorAll(".doc-filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".doc-filter-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        currentDocStatusFilter = pill.getAttribute("data-status");
        loadDocumentsList(activeDossierId);
      });
    });

    // Filtrage par catégorie et recherche
    document.getElementById("doc-filter-category").addEventListener("change", (e) => {
      currentDocCategoryFilter = e.target.value;
      loadDocumentsList(activeDossierId);
    });

    let searchTimer = null;
    document.getElementById("doc-filter-search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentDocSearch = e.target.value;
        loadDocumentsList(activeDossierId);
      }, 250);
    });

    // Enregistrement des corrections manuelles
    document.getElementById("doc-correction-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedDocument) return;

      const getNumMinor = (id) => {
        const v = document.getElementById(id).value;
        return v ? Math.round(Number(v) * 100) : undefined;
      };

      const fields = {
        issuerName: document.getElementById("field-issuer-name").value || undefined,
        invoiceNumber: document.getElementById("field-invoice-number").value || undefined,
        invoiceDate: document.getElementById("field-invoice-date").value || undefined,
        dueDate: document.getElementById("field-due-date").value || undefined,
        netAmountMinor: getNumMinor("field-net-amount"),
        vatAmountMinor: getNumMinor("field-vat-amount"),
        grossAmountMinor: getNumMinor("field-gross-amount"),
        suggestedAccountCode: document.getElementById("field-account-code").value || undefined
      };

      try {
        const res = await apiFetch(
          "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents/" + selectedDocument.id + "/extraction",
          {
            method: "PATCH",
            body: JSON.stringify({ fields })
          }
        );
        showFeedback("Corrections d'extraction enregistrées (statut: CORRIGÉ).");
        await openDocumentDetail(selectedDocument.id);
        await loadDocumentsList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Validation du document
    document.getElementById("doc-validate-btn").addEventListener("click", async () => {
      if (!selectedDocument) return;
      try {
        await apiFetch(
          "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents/" + selectedDocument.id + "/validate",
          { method: "POST" }
        );
        showFeedback("Document validé avec succès par l'utilisateur.");
        await openDocumentDetail(selectedDocument.id);
        await loadDocumentsList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Rejet du document
    document.getElementById("doc-reject-btn").addEventListener("click", async () => {
      if (!selectedDocument) return;
      const reason = window.prompt("Motif obligatoire de rejet du document (min. 3 caractères) :");
      if (!reason || reason.trim().length < 3) {
        showFeedback("Le motif de rejet est obligatoire.", true);
        return;
      }
      try {
        await apiFetch(
          "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents/" + selectedDocument.id + "/reject",
          {
            method: "POST",
            body: JSON.stringify({ reason: reason.trim() })
          }
        );
        showFeedback("Document rejeté avec motif enregistré au journal d'audit.");
        await openDocumentDetail(selectedDocument.id);
        await loadDocumentsList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Génération d'écriture comptable brouillon
    document.getElementById("doc-generate-draft-entry-btn").addEventListener("click", async () => {
      if (!selectedDocument) return;
      try {
        const res = await apiFetch(
          "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents/" + selectedDocument.id + "/create-draft-entry",
          { method: "POST" }
        );
        showFeedback("Écriture brouillon créée avec succès (Pièce: " + res.entry.pieceNumber + ", Journal: " + res.entry.journalCode + ", Total: " + (res.entry.totalDebitMinor / 100).toFixed(2) + " €).");
        await loadDocumentsList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Suppression du document
    document.getElementById("doc-delete-btn").addEventListener("click", async () => {
      if (!selectedDocument) return;
      if (!window.confirm("Confirmez-vous la suppression définitive du document " + selectedDocument.originalFilename + " ?")) {
        return;
      }
      try {
        await apiFetch(
          "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/documents/" + selectedDocument.id,
          { method: "DELETE" }
        );
        showFeedback("Document supprimé avec succès.");
        closeDocumentDetail();
        await loadDocumentsList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    document.getElementById("doc-detail-close-btn").addEventListener("click", closeDocumentDetail);

    // =========================================================================
    // MODULE 4 — FACTURATION DES VENTES, DEVIS & FACTUR-X (Phase 1, Lot 1.4)
    // =========================================================================
    let currentSalesStatusFilter = "ALL";
    let currentQuotesStatusFilter = "ALL";

    function setInvoicingSubtab(tab) {
      const btnInvoices = document.getElementById("subtab-btn-invoices");
      const btnQuotes = document.getElementById("subtab-btn-quotes");
      const btnCreate = document.getElementById("subtab-btn-create");
      const viewInvoices = document.getElementById("subtab-view-invoices");
      const viewQuotes = document.getElementById("subtab-view-quotes");
      const viewCreate = document.getElementById("subtab-view-create");

      if (tab === "invoices") {
        if (btnInvoices) btnInvoices.className = "btn-primary";
        if (btnQuotes) btnQuotes.className = "btn-secondary";
        if (btnCreate) btnCreate.className = "btn-secondary";
        if (viewInvoices) viewInvoices.classList.remove("hidden");
        if (viewQuotes) viewQuotes.classList.add("hidden");
        if (viewCreate) viewCreate.classList.add("hidden");
        if (activeDossierId) loadSalesInvoices(activeDossierId);
      } else if (tab === "quotes") {
        if (btnInvoices) btnInvoices.className = "btn-secondary";
        if (btnQuotes) btnQuotes.className = "btn-primary";
        if (btnCreate) btnCreate.className = "btn-secondary";
        if (viewInvoices) viewInvoices.classList.add("hidden");
        if (viewQuotes) viewQuotes.classList.remove("hidden");
        if (viewCreate) viewCreate.classList.add("hidden");
        if (activeDossierId) loadQuotes(activeDossierId);
      } else if (tab === "create") {
        if (btnInvoices) btnInvoices.className = "btn-secondary";
        if (btnQuotes) btnQuotes.className = "btn-secondary";
        if (btnCreate) btnCreate.className = "btn-primary";
        if (viewInvoices) viewInvoices.classList.add("hidden");
        if (viewQuotes) viewQuotes.classList.add("hidden");
        if (viewCreate) viewCreate.classList.remove("hidden");

        const today = new Date().toISOString().slice(0, 10);
        const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const issueInp = document.getElementById("inv-issue-date");
        const dueInp = document.getElementById("inv-due-date");
        if (issueInp && !issueInp.value) issueInp.value = today;
        if (dueInp && !dueInp.value) dueInp.value = in30Days;
        recalculateInvoicingTotals();
      }
    }

    document.getElementById("subtab-btn-invoices")?.addEventListener("click", () => setInvoicingSubtab("invoices"));
    document.getElementById("subtab-btn-quotes")?.addEventListener("click", () => setInvoicingSubtab("quotes"));
    document.getElementById("subtab-btn-create")?.addEventListener("click", () => setInvoicingSubtab("create"));
    document.getElementById("inv-cancel-create-btn")?.addEventListener("click", () => setInvoicingSubtab("invoices"));

    const docTypeSelect = document.getElementById("doc-type-select");
    if (docTypeSelect) {
      docTypeSelect.addEventListener("change", (e) => {
        const isInvoice = e.target.value === "INVOICE";
        const title = document.getElementById("invoicing-create-title");
        const submitBtn = document.getElementById("inv-submit-create-btn");
        if (title) title.textContent = isInvoice ? "Créer une nouvelle facture de vente" : "Créer un nouveau devis client";
        if (submitBtn) submitBtn.textContent = isInvoice ? "Enregistrer la facture (Brouillon)" : "Enregistrer le devis";
      });
    }

    function recalculateInvoicingTotals() {
      const rows = document.querySelectorAll("#inv-lines-tbody .inv-line-row");
      let totalHtMinor = 0;
      let totalVatMinor = 0;

      rows.forEach((row) => {
        const qty = parseFloat(row.querySelector(".inv-line-qty")?.value || "0") || 0;
        const pu = parseFloat(row.querySelector(".inv-line-pu")?.value || "0") || 0;
        const disc = parseFloat(row.querySelector(".inv-line-disc")?.value || "0") || 0;
        const vatBps = parseInt(row.querySelector(".inv-line-vat")?.value || "2000", 10) || 0;

        const puMinor = Math.round(pu * 100);
        const qtyMinor = Math.round(qty * 100);
        const discountRateBps = Math.round(disc * 100);

        const rawMinor = (puMinor * qtyMinor) / 100;
        const discountMinor = Math.round((rawMinor * discountRateBps) / 10000);
        const lineNetMinor = Math.round(rawMinor - discountMinor);
        const lineVatMinor = Math.round((lineNetMinor * vatBps) / 10000);

        totalHtMinor += lineNetMinor;
        totalVatMinor += lineVatMinor;

        const totalCell = row.querySelector(".inv-line-total");
        if (totalCell) {
          totalCell.textContent = (lineNetMinor / 100).toFixed(2) + " €";
        }
      });

      const totalTtcMinor = totalHtMinor + totalVatMinor;
      const sumHt = document.getElementById("inv-summary-ht");
      const sumVat = document.getElementById("inv-summary-tva");
      const sumTtc = document.getElementById("inv-summary-ttc");
      if (sumHt) sumHt.textContent = (totalHtMinor / 100).toFixed(2) + " €";
      if (sumVat) sumVat.textContent = (totalVatMinor / 100).toFixed(2) + " €";
      if (sumTtc) sumTtc.textContent = (totalTtcMinor / 100).toFixed(2) + " €";
    }

    function attachLineRowEvents(row) {
      row.querySelectorAll("input, select").forEach((inp) => {
        inp.addEventListener("input", recalculateInvoicingTotals);
        inp.addEventListener("change", recalculateInvoicingTotals);
      });
      const removeBtn = row.querySelector(".btn-remove-line");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          const rows = document.querySelectorAll("#inv-lines-tbody .inv-line-row");
          if (rows.length > 1) {
            row.remove();
            recalculateInvoicingTotals();
          } else {
            showFeedback("Une facture ou un devis doit comporter au moins une ligne.", true);
          }
        });
      }
    }

    document.querySelectorAll("#inv-lines-tbody .inv-line-row").forEach(attachLineRowEvents);

    const addLineBtn = document.getElementById("inv-add-line-btn");
    if (addLineBtn) {
      addLineBtn.addEventListener("click", () => {
        const tbody = document.getElementById("inv-lines-tbody");
        if (!tbody) return;
        const tr = document.createElement("tr");
        tr.className = "inv-line-row";
        tr.innerHTML = '<td style="padding:6px;"><input class="inv-line-desc" required placeholder="Prestation ou article..." style="width:96%;" /></td>' +
          '<td style="padding:6px;"><input class="inv-line-qty" type="number" step="0.01" min="0.01" value="1.00" style="width:90%; text-align:right;" /></td>' +
          '<td style="padding:6px;"><input class="inv-line-pu" type="number" step="0.01" min="0" value="0.00" required style="width:90%; text-align:right;" /></td>' +
          '<td style="padding:6px;"><input class="inv-line-disc" type="number" step="0.1" min="0" max="100" value="0" style="width:85%; text-align:right;" /></td>' +
          '<td style="padding:6px;">' +
            '<select class="inv-line-vat" style="width:95%;">' +
              '<option value="2000">20.0 %</option>' +
              '<option value="1000">10.0 %</option>' +
              '<option value="550">5.5 %</option>' +
              '<option value="210">2.1 %</option>' +
              '<option value="0">0.0 % (Exonéré/Franchise)</option>' +
            '</select>' +
          '</td>' +
          '<td style="padding:6px; text-align:right; font-weight:600;" class="inv-line-total">0.00 €</td>' +
          '<td style="padding:6px; text-align:center;"><button type="button" class="btn-remove-line" style="background:none; border:none; cursor:pointer; color:var(--cn-state-error-text);">✕</button></td>';
        tbody.appendChild(tr);
        attachLineRowEvents(tr);
        recalculateInvoicingTotals();
      });
    }

    const invoicingForm = document.getElementById("invoicing-create-form");
    if (invoicingForm) {
      invoicingForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!activeOrgId || !activeDossierId) {
          showFeedback("Veuillez sélectionner une organisation et un dossier client actif.", true);
          return;
        }

        const docType = document.getElementById("doc-type-select").value;
        const clientName = document.getElementById("inv-client-name").value.trim();
        const clientSiret = document.getElementById("inv-client-siret").value.trim();
        const clientAddress = document.getElementById("inv-client-address").value.trim();
        const issueDate = document.getElementById("inv-issue-date").value;
        const dueDate = document.getElementById("inv-due-date").value;

        const rows = document.querySelectorAll("#inv-lines-tbody .inv-line-row");
        const lines = [];
        rows.forEach((row) => {
          const desc = row.querySelector(".inv-line-desc")?.value.trim() || "";
          const qty = parseFloat(row.querySelector(".inv-line-qty")?.value || "1") || 1;
          const pu = parseFloat(row.querySelector(".inv-line-pu")?.value || "0") || 0;
          const disc = parseFloat(row.querySelector(".inv-line-disc")?.value || "0") || 0;
          const vatBps = parseInt(row.querySelector(".inv-line-vat")?.value || "2000", 10) || 0;

          lines.push({
            description: desc,
            quantityMinor: Math.round(qty * 100),
            unitPriceNetMinor: Math.round(pu * 100),
            discountRateBps: Math.round(disc * 100),
            vatRateBps: vatBps
          });
        });

        if (lines.length === 0) {
          showFeedback("Veuillez renseigner au moins une ligne.", true);
          return;
        }

        try {
          if (docType === "INVOICE") {
            const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/sales-invoices", {
              method: "POST",
              body: JSON.stringify({
                thirdPartyName: clientName,
                thirdPartyTaxNumber: clientSiret || undefined,
                thirdPartyAddress: clientAddress || undefined,
                issueDate: issueDate,
                dueDate: dueDate || undefined,
                lines: lines
              })
            });
            showFeedback("Facture créée avec succès (" + (res.invoice ? res.invoice.invoiceNumber : "") + ").");
            setInvoicingSubtab("invoices");
            await loadSalesInvoices(activeDossierId);
          } else {
            const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/quotes", {
              method: "POST",
              body: JSON.stringify({
                thirdPartyName: clientName,
                thirdPartyTaxNumber: clientSiret || undefined,
                thirdPartyAddress: clientAddress || undefined,
                issueDate: issueDate,
                validityDate: dueDate,
                lines: lines
              })
            });
            showFeedback("Devis créé avec succès (" + (res.quote ? res.quote.quoteNumber : "") + ").");
            setInvoicingSubtab("quotes");
            await loadQuotes(activeDossierId);
          }
        } catch (err) {
          showFeedback("Erreur lors de la création : " + err.message, true);
        }
      });
    }

    const filterSalesStatusEl = document.getElementById("filter-sales-status");
    if (filterSalesStatusEl) {
      filterSalesStatusEl.addEventListener("change", (e) => {
        currentSalesStatusFilter = e.target.value;
        if (activeDossierId) loadSalesInvoices(activeDossierId);
      });
    }

    const filterQuotesStatusEl = document.getElementById("filter-quotes-status");
    if (filterQuotesStatusEl) {
      filterQuotesStatusEl.addEventListener("change", (e) => {
        currentQuotesStatusFilter = e.target.value;
        if (activeDossierId) loadQuotes(activeDossierId);
      });
    }

    async function loadSalesInvoices(dossierId) {
      if (!activeOrgId || !dossierId) return;
      try {
        let query = "/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/sales-invoices";
        if (currentSalesStatusFilter && currentSalesStatusFilter !== "ALL") {
          query += "?status=" + encodeURIComponent(currentSalesStatusFilter);
        }
        const res = await apiFetch(query);
        const invoices = res.invoices || [];
        const emptyBox = document.getElementById("sales-invoices-empty");
        const tbody = document.getElementById("sales-invoices-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (invoices.length === 0) {
          if (emptyBox) emptyBox.classList.remove("hidden");
          return;
        }
        if (emptyBox) emptyBox.classList.add("hidden");

        invoices.forEach((inv) => {
          const tr = document.createElement("tr");

          let statusBadge = "";
          if (inv.status === "FINALIZED") {
            statusBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success); border:1px solid var(--cn-success);">Finalisée</span>';
          } else if (inv.status === "PAID") {
            statusBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success); border:1px solid var(--cn-success);">Soldée</span>';
          } else if (inv.status === "PARTIALLY_PAID") {
            statusBadge = '<span class="badge" style="background:var(--cn-warning-bg); color:var(--cn-warning); border:1px solid var(--cn-warning);">Partielle</span>';
          } else if (inv.status === "CANCELLED") {
            statusBadge = '<span class="badge" style="background:var(--cn-danger-bg); color:var(--cn-danger); border:1px solid var(--cn-danger);">Avoir</span>';
          } else {
            statusBadge = '<span class="badge" style="background:var(--cn-surface-alt); color:var(--cn-text-secondary); border:1px solid var(--cn-border);">Brouillon</span>';
          }

          let paymentBadge = "";
          if (inv.paymentStatus === "PAID") {
            paymentBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success);">Réglée</span>';
          } else if (inv.paymentStatus === "PARTIAL") {
            paymentBadge = '<span class="badge" style="background:var(--cn-warning-bg); color:var(--cn-warning);">Partiel</span>';
          } else {
            paymentBadge = '<span class="badge" style="background:var(--cn-surface-alt); color:var(--cn-text-secondary);">Non réglée</span>';
          }

          let actionsHtml = "";
          if (inv.status === "DRAFT") {
            actionsHtml += '<button type="button" class="btn-primary btn-inv-finalize" data-id="' + inv.id + '" data-num="' + inv.invoiceNumber + '" style="font-size:0.75rem; padding:3px 7px; margin-right:4px;">Finaliser</button>';
          }
          if (inv.status === "FINALIZED" || inv.status === "PARTIALLY_PAID") {
            actionsHtml += '<button type="button" class="btn-primary btn-inv-pay" data-id="' + inv.id + '" data-rem="' + inv.remainingAmountMinor + '" style="font-size:0.75rem; padding:3px 7px; margin-right:4px;">Régler</button>';
            actionsHtml += '<button type="button" class="btn-secondary btn-inv-credit-note" data-id="' + inv.id + '" data-num="' + inv.invoiceNumber + '" style="font-size:0.75rem; padding:3px 7px; margin-right:4px; color:var(--cn-warning);">Avoir</button>';
          }
          actionsHtml += '<button type="button" class="btn-secondary btn-inv-print" data-id="' + inv.id + '" style="font-size:0.75rem; padding:3px 7px; margin-right:4px;">Imprimer</button>';
          actionsHtml += '<button type="button" class="btn-secondary btn-inv-facturx" data-id="' + inv.id + '" data-num="' + inv.invoiceNumber + '" style="font-size:0.75rem; padding:3px 7px;">Factur-X</button>';

          const netFormatted = (inv.totalNetMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const grossFormatted = (inv.totalGrossMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const paidFormatted = (inv.paidAmountMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const remFormatted = (inv.remainingAmountMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          tr.innerHTML =
            '<td><strong class="font-mono-tabular" style="font-size:0.85rem;">' + inv.invoiceNumber + '</strong></td>' +
            '<td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + inv.thirdPartyName + '">' + inv.thirdPartyName + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.85rem;">' + inv.issueDate + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.85rem;">' + (inv.dueDate || "-") + '</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + netFormatted + ' €</td>' +
            '<td class="font-mono-tabular" style="text-align:right; font-weight:600;">' + grossFormatted + ' €</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + paidFormatted + ' €</td>' +
            '<td class="font-mono-tabular" style="text-align:right; font-weight:600;">' + remFormatted + ' €</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + paymentBadge + '</td>' +
            '<td style="text-align:center; white-space:nowrap;">' + actionsHtml + '</td>';

          tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-inv-finalize").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            const num = btn.getAttribute("data-num");
            if (!window.confirm("Confirmez-vous la finalisation de la facture " + num + " ? Cette action génère un numéro officiel définitif et une écriture comptable au journal des ventes (VE).")) return;
            try {
              const r = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/sales-invoices/" + id + "/finalize", { method: "POST" });
              showFeedback("Facture finalisée avec succès (" + (r.invoice ? r.invoice.invoiceNumber : num) + ").");
              await loadSalesInvoices(activeDossierId);
            } catch (err) {
              showFeedback(err.message, true);
            }
          });
        });

        tbody.querySelectorAll(".btn-inv-pay").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            const remMinor = parseInt(btn.getAttribute("data-rem") || "0", 10);
            const defaultAmt = (remMinor / 100).toFixed(2);
            const amtStr = window.prompt("Montant du règlement en euros :", defaultAmt);
            if (!amtStr) return;
            const amt = parseFloat(amtStr);
            if (isNaN(amt) || amt <= 0) {
              showFeedback("Montant de règlement invalide.", true);
              return;
            }
            try {
              await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/sales-invoices/" + id + "/payments", {
                method: "POST",
                body: JSON.stringify({
                  amountMinor: Math.round(amt * 100),
                  paymentMethod: "VIREMENT",
                  paymentDate: new Date().toISOString().slice(0, 10)
                })
              });
              showFeedback("Règlement de " + amt.toFixed(2) + " € enregistré avec succès.");
              await loadSalesInvoices(activeDossierId);
            } catch (err) {
              showFeedback(err.message, true);
            }
          });
        });

        tbody.querySelectorAll(".btn-inv-credit-note").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            const num = btn.getAttribute("data-num");
            const reason = window.prompt("Motif de l’avoir / annulation pour la facture " + num + " :");
            if (!reason || !reason.trim()) return;
            try {
              const r = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/sales-invoices/" + id + "/credit-note", {
                method: "POST",
                body: JSON.stringify({ reason: reason.trim() })
              });
              showFeedback("Avoir créé avec succès (" + (r.creditNote ? r.creditNote.invoiceNumber : "") + ").");
              await loadSalesInvoices(activeDossierId);
            } catch (err) {
              showFeedback(err.message, true);
            }
          });
        });

        tbody.querySelectorAll(".btn-inv-print").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            const url = "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/sales-invoices/" + id + "/printable";
            try {
              const resp = await fetch(url, { headers: { "Authorization": "Bearer " + authToken } });
              if (!resp.ok) throw new Error("Erreur HTTP " + resp.status);
              const html = await resp.text();
              const blob = new Blob([html], { type: "text/html" });
              const blobUrl = URL.createObjectURL(blob);
              window.open(blobUrl, "_blank");
            } catch (err) {
              showFeedback("Impossible d’ouvrir l’aperçu : " + err.message, true);
            }
          });
        });

        tbody.querySelectorAll(".btn-inv-facturx").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            const num = btn.getAttribute("data-num") || "facture";
            const url = "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/sales-invoices/" + id + "/facturx-xml";
            triggerSecureDownload(url, "facturx_" + num + ".xml");
          });
        });

      } catch (err) {
        showFeedback("Erreur de chargement des factures : " + err.message, true);
      }
    }

    async function loadQuotes(dossierId) {
      if (!activeOrgId || !dossierId) return;
      try {
        let query = "/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/quotes";
        if (currentQuotesStatusFilter && currentQuotesStatusFilter !== "ALL") {
          query += "?status=" + encodeURIComponent(currentQuotesStatusFilter);
        }
        const res = await apiFetch(query);
        const quotes = res.quotes || [];
        const emptyBox = document.getElementById("quotes-empty");
        const tbody = document.getElementById("quotes-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (quotes.length === 0) {
          if (emptyBox) emptyBox.classList.remove("hidden");
          return;
        }
        if (emptyBox) emptyBox.classList.add("hidden");

        quotes.forEach((q) => {
          const tr = document.createElement("tr");

          let statusBadge = "";
          if (q.status === "ACCEPTED") {
            statusBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success); border:1px solid var(--cn-success);">Accepté</span>';
          } else if (q.status === "CONVERTED") {
            statusBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success); border:1px solid var(--cn-success);">Facturé</span>';
          } else if (q.status === "SENT") {
            statusBadge = '<span class="badge" style="background:var(--cn-info-bg); color:var(--cn-info); border:1px solid var(--cn-info);">Envoyé</span>';
          } else if (q.status === "REJECTED") {
            statusBadge = '<span class="badge" style="background:var(--cn-danger-bg); color:var(--cn-danger); border:1px solid var(--cn-danger);">Refusé</span>';
          } else if (q.status === "EXPIRED") {
            statusBadge = '<span class="badge" style="background:var(--cn-surface-alt); color:var(--cn-text-secondary); border:1px solid var(--cn-border);">Expiré</span>';
          } else {
            statusBadge = '<span class="badge" style="background:var(--cn-surface-alt); color:var(--cn-text-secondary); border:1px solid var(--cn-border);">Brouillon</span>';
          }

          let actionsHtml = "";
          if (q.status !== "CONVERTED") {
            actionsHtml = '<button type="button" class="btn-primary btn-quote-convert" data-id="' + q.id + '" data-num="' + q.quoteNumber + '" style="font-size:0.75rem; padding:3px 7px;">Transformer en Facture</button>';
          } else {
            actionsHtml = '<span style="font-size:0.8rem; color:var(--cn-text-secondary);">Facture émise</span>';
          }

          const netFormatted = (q.totalNetMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const grossFormatted = (q.totalGrossMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          tr.innerHTML =
            '<td><strong class="font-mono-tabular" style="font-size:0.85rem;">' + q.quoteNumber + '</strong></td>' +
            '<td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + q.thirdPartyName + '">' + q.thirdPartyName + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.85rem;">' + q.issueDate + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.85rem;">' + q.validityDate + '</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + netFormatted + ' €</td>' +
            '<td class="font-mono-tabular" style="text-align:right; font-weight:600;">' + grossFormatted + ' €</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td style="text-align:center; white-space:nowrap;">' + actionsHtml + '</td>';

          tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-quote-convert").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-id");
            const num = btn.getAttribute("data-num");
            if (!window.confirm("Confirmez-vous la transformation du devis " + num + " en facture de vente ?")) return;
            try {
              const r = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/quotes/" + id + "/convert-to-invoice", {
                method: "POST",
                body: JSON.stringify({ isB2B: true })
              });
              showFeedback("Devis transformé avec succès en facture (" + (r.invoice ? r.invoice.invoiceNumber : "") + ") !");
              setInvoicingSubtab("invoices");
              await loadSalesInvoices(activeDossierId);
            } catch (err) {
              showFeedback(err.message, true);
            }
          });
        });

      } catch (err) {
        showFeedback("Erreur de chargement des devis : " + err.message, true);
      }
    }

    // =========================================================================
    // MODULE 5 — JOURNAL COMPTABLE & SAISIE AU KILOMÈTRE (Phase 1, Lot 1.5)
    // =========================================================================
    let dossierAccountsCache = [];
    let dossierJournalsCache = [];
    let currentJournalCodeFilter = "ALL";
    let currentJournalStatusFilter = "ALL";
    let currentJournalSearch = "";
    let entryLinesData = [
      { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 },
      { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 }
    ];

    // Sous-onglets internes du Journal
    const subtabBtnJournalList = document.getElementById("subtab-btn-journal-list");
    const subtabBtnJournalCreate = document.getElementById("subtab-btn-journal-create");
    const subtabViewJournalList = document.getElementById("subtab-view-journal-list");
    const subtabViewJournalCreate = document.getElementById("subtab-view-journal-create");

    if (subtabBtnJournalList && subtabBtnJournalCreate) {
      subtabBtnJournalList.addEventListener("click", () => {
        subtabBtnJournalList.className = "btn-primary";
        subtabBtnJournalCreate.className = "btn-secondary";
        subtabViewJournalList.classList.remove("hidden");
        subtabViewJournalCreate.classList.add("hidden");
        if (activeDossierId) {
          loadAccountingEntriesList(activeDossierId);
        }
      });

      subtabBtnJournalCreate.addEventListener("click", () => {
        subtabBtnJournalCreate.className = "btn-primary";
        subtabBtnJournalList.className = "btn-secondary";
        subtabViewJournalCreate.classList.remove("hidden");
        subtabViewJournalList.classList.add("hidden");
        if (activeDossierId && dossierAccountsCache.length === 0) {
          loadAccountingAccounts(activeDossierId);
        }
        renderEntryLinesForm();
      });
    }

    function showJournalNoDossierState() {
      document.getElementById("journal-no-dossier").classList.remove("hidden");
      document.getElementById("journal-entries-loading").classList.add("hidden");
      document.getElementById("journal-entries-empty").classList.add("hidden");
      document.getElementById("journal-entries-error").classList.add("hidden");
      document.getElementById("journal-entries-table-wrapper").classList.add("hidden");
      document.getElementById("journal-stat-count").textContent = "0";
      document.getElementById("journal-stat-debit").textContent = "0,00 €";
      document.getElementById("journal-stat-credit").textContent = "0,00 €";
      document.getElementById("journal-stat-balance").textContent = "En attente de dossier";
      document.getElementById("journal-stat-balance").style.color = "var(--cn-text-secondary)";
    }

    async function loadAccountingJournals(dossierId) {
      if (!activeOrgId || !dossierId) return;
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/accounting/journals");
        dossierJournalsCache = res.journals || [];

        // Mise à jour du filtre de journaux
        const filterSelect = document.getElementById("filter-journal-code");
        if (filterSelect && dossierJournalsCache.length > 0) {
          const currentVal = filterSelect.value;
          filterSelect.innerHTML = '<option value="ALL">Tous les journaux</option>';
          dossierJournalsCache.forEach((j) => {
            const opt = document.createElement("option");
            opt.value = j.code;
            opt.textContent = j.code + " — " + j.label;
            filterSelect.appendChild(opt);
          });
          filterSelect.value = currentVal;
        }

        // Mise à jour du sélecteur de journal dans le formulaire de saisie
        const formSelect = document.getElementById("entry-journal-select");
        if (formSelect && dossierJournalsCache.length > 0) {
          const currentVal = formSelect.value;
          formSelect.innerHTML = "";
          dossierJournalsCache.forEach((j) => {
            const opt = document.createElement("option");
            opt.value = j.code;
            opt.textContent = j.code + " — " + j.label;
            formSelect.appendChild(opt);
          });
          if (currentVal) formSelect.value = currentVal;
        }
      } catch (err) {
        console.warn("Échec du chargement des journaux :", err.message);
      }
    }

    async function loadAccountingAccounts(dossierId) {
      if (!activeOrgId || !dossierId) return;
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/accounting/accounts");
        dossierAccountsCache = res.accounts || [];
        renderEntryLinesForm();
      } catch (err) {
        console.warn("Échec du chargement du plan de comptes :", err.message);
      }
    }

    async function loadAccountingEntriesList(dossierId) {
      if (!activeOrgId || !dossierId) {
        showJournalNoDossierState();
        return;
      }

      document.getElementById("journal-no-dossier").classList.add("hidden");
      document.getElementById("journal-entries-loading").classList.remove("hidden");
      document.getElementById("journal-entries-empty").classList.add("hidden");
      document.getElementById("journal-entries-error").classList.add("hidden");
      document.getElementById("journal-entries-table-wrapper").classList.add("hidden");

      let query = "/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/accounting/entries?limit=100";
      if (currentJournalCodeFilter && currentJournalCodeFilter !== "ALL") {
        query += "&journalCode=" + encodeURIComponent(currentJournalCodeFilter);
      }
      if (currentJournalStatusFilter && currentJournalStatusFilter !== "ALL") {
        query += "&status=" + encodeURIComponent(currentJournalStatusFilter);
      }
      if (currentJournalSearch) {
        query += "&search=" + encodeURIComponent(currentJournalSearch);
      }

      try {
        const res = await apiFetch(query);
        document.getElementById("journal-entries-loading").classList.add("hidden");

        const entries = res.entries || [];
        const totalCount = res.totalCount || 0;
        const totalDebit = (res.totalDebitSumMinor || 0) / 100;
        const totalCredit = (res.totalCreditSumMinor || 0) / 100;

        document.getElementById("journal-stat-count").textContent = String(totalCount);
        document.getElementById("journal-stat-debit").textContent = totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
        document.getElementById("journal-stat-credit").textContent = totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

        const balEl = document.getElementById("journal-stat-balance");
        if (res.isOverallBalanced) {
          balEl.textContent = "✓ Équilibré";
          balEl.style.color = "var(--cn-success)";
        } else {
          balEl.textContent = "⚠ Déséquilibre (" + Math.abs(totalDebit - totalCredit).toFixed(2) + " €)";
          balEl.style.color = "var(--cn-danger)";
        }

        if (entries.length === 0) {
          document.getElementById("journal-entries-empty").classList.remove("hidden");
          return;
        }

        const tbody = document.getElementById("journal-entries-tbody");
        tbody.innerHTML = "";

        entries.forEach((e) => {
          const tr = document.createElement("tr");

          // Statut badge
          let statusBadge = "";
          if (e.status === "VALIDATED") {
            statusBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success); border:1px solid var(--cn-success);">Validée</span>';
          } else if (e.status === "DRAFT") {
            statusBadge = '<span class="badge" style="background:var(--cn-surface-alt); color:var(--cn-text-secondary); border:1px solid var(--cn-border);">Brouillon</span>';
          } else if (e.status === "AI_SUGGESTION") {
            statusBadge = '<span class="badge" style="background:var(--cn-warning-bg); color:var(--cn-warning); border:1px solid var(--cn-warning);">Suggestion IA</span>';
          } else if (e.status === "REVERSED") {
            statusBadge = '<span class="badge" style="background:var(--cn-danger-bg); color:var(--cn-danger); border:1px solid var(--cn-danger);">Extournée</span>';
          } else {
            statusBadge = '<span class="badge">' + e.status + '</span>';
          }

          // Équilibre badge
          const balanceBadge = e.isBalanced
            ? '<span style="color:var(--cn-success); font-weight:600; font-size:0.8rem;">✓ OK</span>'
            : '<span style="color:var(--cn-danger); font-weight:600; font-size:0.8rem;">⚠ Déséquilibré</span>';

          const debitFormatted = (e.totalDebitMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const creditFormatted = (e.totalCreditMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          // Boutons d'action
          let actionsHtml = '<button type="button" class="btn-secondary btn-entry-view" data-entry-id="' + e.id + '" style="font-size:0.75rem; padding:3px 7px;">Détail</button>';

          if (e.status === "DRAFT" || e.status === "AI_SUGGESTION") {
            if (e.isBalanced) {
              actionsHtml += ' <button type="button" class="btn-primary btn-entry-validate" data-entry-id="' + e.id + '" style="font-size:0.75rem; padding:3px 7px;">Valider</button>';
            }
            actionsHtml += ' <button type="button" class="btn-secondary btn-entry-delete" data-entry-id="' + e.id + '" style="font-size:0.75rem; padding:3px 7px; color:var(--cn-danger);">Supprimer</button>';
          } else if (e.status === "VALIDATED") {
            actionsHtml += ' <button type="button" class="btn-secondary btn-entry-reverse" data-entry-id="' + e.id + '" data-piece="' + e.pieceNumber + '" style="font-size:0.75rem; padding:3px 7px; color:var(--cn-warning);">Extourner</button>';
          }

          tr.innerHTML =
            '<td class="font-mono-tabular" style="font-size:0.85rem;">' + e.entryDate + '</td>' +
            '<td><strong class="font-mono-tabular" style="font-size:0.85rem;">' + e.pieceNumber + '</strong></td>' +
            '<td><span class="badge font-mono-tabular">' + e.journalCode + '</span></td>' +
            '<td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + e.label + '">' + e.label + '</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + debitFormatted + ' €</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + creditFormatted + ' €</td>' +
            '<td style="text-align:center;">' + balanceBadge + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td style="font-size:0.8rem; color:var(--cn-text-secondary);">' + (e.validatedByName || "-") + '</td>' +
            '<td style="text-align:center; white-space:nowrap;">' + actionsHtml + '</td>';

          tbody.appendChild(tr);
        });

        // Attachement des écouteurs d'actions
        document.querySelectorAll(".btn-entry-view").forEach((btn) => {
          btn.addEventListener("click", () => openAccountingEntryDetail(btn.getAttribute("data-entry-id")));
        });

        document.querySelectorAll(".btn-entry-validate").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const entryId = btn.getAttribute("data-entry-id");
            await validateAccountingEntryAction(entryId);
          });
        });

        document.querySelectorAll(".btn-entry-reverse").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const entryId = btn.getAttribute("data-entry-id");
            const piece = btn.getAttribute("data-piece");
            await reverseAccountingEntryAction(entryId, piece);
          });
        });

        document.querySelectorAll(".btn-entry-delete").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const entryId = btn.getAttribute("data-entry-id");
            await deleteAccountingEntryAction(entryId);
          });
        });

        document.getElementById("journal-entries-table-wrapper").classList.remove("hidden");
      } catch (err) {
        document.getElementById("journal-entries-loading").classList.add("hidden");
        document.getElementById("journal-entries-error-msg").textContent = err.message || "Erreur de chargement du journal comptable.";
        document.getElementById("journal-entries-error").classList.remove("hidden");
      }
    }

    // Filtres du journal
    document.getElementById("filter-journal-code").addEventListener("change", (e) => {
      currentJournalCodeFilter = e.target.value;
      if (activeDossierId) loadAccountingEntriesList(activeDossierId);
    });

    document.getElementById("filter-journal-status").addEventListener("change", (e) => {
      currentJournalStatusFilter = e.target.value;
      if (activeDossierId) loadAccountingEntriesList(activeDossierId);
    });

    let journalSearchDebounce = null;
    document.getElementById("filter-journal-search").addEventListener("input", (e) => {
      clearTimeout(journalSearchDebounce);
      journalSearchDebounce = setTimeout(() => {
        currentJournalSearch = e.target.value.trim();
        if (activeDossierId) loadAccountingEntriesList(activeDossierId);
      }, 300);
    });

    document.getElementById("btn-refresh-journal-entries").addEventListener("click", () => {
      if (activeDossierId) loadAccountingEntriesList(activeDossierId);
    });

    // Formulaire de saisie au kilomètre : Gestion des lignes dynamiques
    function renderEntryLinesForm() {
      const tbody = document.getElementById("entry-lines-tbody");
      if (!tbody) return;
      tbody.innerHTML = "";

      if (entryLinesData.length < 2) {
        entryLinesData.push({ generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 });
      }

      entryLinesData.forEach((line, idx) => {
        const tr = document.createElement("tr");

        // Options de comptes
        let accountOptions = '<option value="">-- Sélectionner un compte PCG --</option>';
        dossierAccountsCache.forEach((acc) => {
          const selected = line.generalAccountCode === acc.accountNumber ? " selected" : "";
          accountOptions += '<option value="' + acc.accountNumber + '"' + selected + '>' + acc.accountNumber + ' — ' + acc.label + '</option>';
        });

        const debitVal = line.debitMinor > 0 ? (line.debitMinor / 100).toFixed(2) : "";
        const creditVal = line.creditMinor > 0 ? (line.creditMinor / 100).toFixed(2) : "";

        tr.innerHTML =
          '<td class="font-mono-tabular" style="font-size:0.85rem; text-align:center;">' + (idx + 1) + '</td>' +
          '<td><select class="entry-line-account" data-idx="' + idx + '" required style="width:100%; font-size:0.85rem; padding:4px 6px;">' + accountOptions + '</select></td>' +
          '<td><input type="text" class="entry-line-label" data-idx="' + idx + '" value="' + (line.label || "") + '" placeholder="Libellé de la ligne..." required style="width:100%; font-size:0.85rem; padding:4px 6px;" /></td>' +
          '<td><input type="number" step="0.01" min="0" class="entry-line-debit font-mono-tabular" data-idx="' + idx + '" value="' + debitVal + '" placeholder="0,00" style="width:100%; font-size:0.85rem; text-align:right; padding:4px 6px;" /></td>' +
          '<td><input type="number" step="0.01" min="0" class="entry-line-credit font-mono-tabular" data-idx="' + idx + '" value="' + creditVal + '" placeholder="0,00" style="width:100%; font-size:0.85rem; text-align:right; padding:4px 6px;" /></td>' +
          '<td style="text-align:center;">' +
            (entryLinesData.length > 2
              ? '<button type="button" class="btn-secondary btn-remove-line" data-idx="' + idx + '" style="font-size:0.75rem; padding:2px 6px; color:var(--cn-danger);">✕</button>'
              : '<span style="color:var(--cn-text-secondary); font-size:0.75rem;">—</span>') +
          '</td>';

        tbody.appendChild(tr);
      });

      // Écouteurs sur les champs de lignes
      document.querySelectorAll(".entry-line-account").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          const idx = Number(e.target.getAttribute("data-idx"));
          entryLinesData[idx].generalAccountCode = e.target.value;
          // Auto-remplissage du libellé si vide
          if (!entryLinesData[idx].label && e.target.value) {
            const acc = dossierAccountsCache.find((a) => a.accountNumber === e.target.value);
            if (acc) {
              const labelInput = document.querySelector('.entry-line-label[data-idx="' + idx + '"]');
              if (labelInput && !labelInput.value) {
                labelInput.value = acc.label;
                entryLinesData[idx].label = acc.label;
              }
            }
          }
          recalculateEntryBalance();
        });
      });

      document.querySelectorAll(".entry-line-label").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const idx = Number(e.target.getAttribute("data-idx"));
          entryLinesData[idx].label = e.target.value;
        });
      });

      document.querySelectorAll(".entry-line-debit").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const idx = Number(e.target.getAttribute("data-idx"));
          const val = parseFloat(e.target.value);
          entryLinesData[idx].debitMinor = !isNaN(val) && val >= 0 ? Math.round(val * 100) : 0;
          // Si on saisit un débit, on réinitialise le crédit de la même ligne
          if (entryLinesData[idx].debitMinor > 0) {
            entryLinesData[idx].creditMinor = 0;
            const creditInput = document.querySelector('.entry-line-credit[data-idx="' + idx + '"]');
            if (creditInput) creditInput.value = "";
          }
          recalculateEntryBalance();
        });
      });

      document.querySelectorAll(".entry-line-credit").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const idx = Number(e.target.getAttribute("data-idx"));
          const val = parseFloat(e.target.value);
          entryLinesData[idx].creditMinor = !isNaN(val) && val >= 0 ? Math.round(val * 100) : 0;
          // Si on saisit un crédit, on réinitialise le débit de la même ligne
          if (entryLinesData[idx].creditMinor > 0) {
            entryLinesData[idx].debitMinor = 0;
            const debitInput = document.querySelector('.entry-line-debit[data-idx="' + idx + '"]');
            if (debitInput) debitInput.value = "";
          }
          recalculateEntryBalance();
        });
      });

      document.querySelectorAll(".btn-remove-line").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-idx"));
          entryLinesData.splice(idx, 1);
          renderEntryLinesForm();
        });
      });

      recalculateEntryBalance();
    }

    // Calcul en temps réel de l'équilibre Débit/Crédit
    function recalculateEntryBalance() {
      let sumDebit = 0;
      let sumCredit = 0;
      entryLinesData.forEach((l) => {
        sumDebit += Number(l.debitMinor || 0);
        sumCredit += Number(l.creditMinor || 0);
      });

      const debitEur = (sumDebit / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
      const creditEur = (sumCredit / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
      const diffEur = (Math.abs(sumDebit - sumCredit) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

      document.getElementById("entry-live-total-debit").textContent = debitEur;
      document.getElementById("entry-live-total-credit").textContent = creditEur;
      document.getElementById("entry-live-diff").textContent = diffEur;

      const badge = document.getElementById("entry-live-balance-badge");
      const submitBtn = document.getElementById("btn-validate-entry-submit");

      if (sumDebit === sumCredit && sumDebit > 0) {
        badge.textContent = "✓ Écriture équilibrée (0,00 € d'écart)";
        badge.style.background = "var(--cn-success-bg)";
        badge.style.color = "var(--cn-success)";
        badge.style.borderColor = "var(--cn-success)";
        submitBtn.disabled = false;
        submitBtn.title = "L'écriture est équilibrée. Cliquez pour valider.";
      } else {
        badge.textContent = "⚠ Écriture déséquilibrée (" + diffEur + " d'écart)";
        badge.style.background = "var(--cn-warning-bg)";
        badge.style.color = "var(--cn-warning)";
        badge.style.borderColor = "var(--cn-warning)";
        submitBtn.disabled = true;
        submitBtn.title = "L'écriture doit être parfaitement équilibrée (Débit = Crédit > 0) pour être validée.";
      }
    }

    // Ajout d'une ligne
    document.getElementById("btn-add-entry-line").addEventListener("click", () => {
      entryLinesData.push({ generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 });
      renderEntryLinesForm();
    });

    // Réinitialisation / Annulation du formulaire
    document.getElementById("btn-cancel-entry-form").addEventListener("click", () => {
      document.getElementById("accounting-entry-form").reset();
      entryLinesData = [
        { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 },
        { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 }
      ];
      renderEntryLinesForm();
      if (subtabBtnJournalList) subtabBtnJournalList.click();
    });

    // Enregistrement en BROUILLON (DRAFT)
    document.getElementById("btn-save-entry-draft").addEventListener("click", async () => {
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }

      const journalCode = document.getElementById("entry-journal-select").value;
      const entryDate = document.getElementById("entry-date-input").value;
      const pieceNumber = document.getElementById("entry-piece-number-input").value.trim();
      const label = document.getElementById("entry-label-input").value.trim();

      if (!entryDate || !pieceNumber || !label) {
        showFeedback("Veuillez renseigner la date, le numéro de pièce et le libellé de l'écriture.", true);
        return;
      }

      const validLines = entryLinesData.filter((l) => l.generalAccountCode && (l.debitMinor > 0 || l.creditMinor > 0));
      if (validLines.length < 2) {
        showFeedback("Une écriture comptable doit comporter au moins 2 lignes renseignées.", true);
        return;
      }

      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries", {
          method: "POST",
          body: JSON.stringify({
            journalCode,
            entryDate,
            pieceNumber,
            label,
            status: "DRAFT",
            lines: validLines.map((l, i) => ({
              lineNumber: i + 1,
              generalAccountCode: l.generalAccountCode,
              label: l.label || label,
              debitMinor: l.debitMinor,
              creditMinor: l.creditMinor
            }))
          })
        });

        showFeedback("Écriture brouillon enregistrée avec succès (Pièce: " + res.entry.pieceNumber + ").");
        document.getElementById("accounting-entry-form").reset();
        entryLinesData = [
          { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 },
          { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 }
        ];
        if (subtabBtnJournalList) subtabBtnJournalList.click();
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Validation formelle soumise par formulaire
    document.getElementById("accounting-entry-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }

      const journalCode = document.getElementById("entry-journal-select").value;
      const entryDate = document.getElementById("entry-date-input").value;
      const pieceNumber = document.getElementById("entry-piece-number-input").value.trim();
      const label = document.getElementById("entry-label-input").value.trim();

      const validLines = entryLinesData.filter((l) => l.generalAccountCode && (l.debitMinor > 0 || l.creditMinor > 0));
      if (validLines.length < 2) {
        showFeedback("Une écriture comptable doit comporter au moins 2 lignes renseignées.", true);
        return;
      }

      let totDeb = 0;
      let totCred = 0;
      validLines.forEach((l) => {
        totDeb += l.debitMinor;
        totCred += l.creditMinor;
      });

      if (totDeb !== totCred || totDeb <= 0) {
        showFeedback("Impossible de valider : l'écriture n'est pas équilibrée (Total Débit ≠ Total Crédit).", true);
        return;
      }

      try {
        // 1. Créer l'écriture en brouillon
        const createRes = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries", {
          method: "POST",
          body: JSON.stringify({
            journalCode,
            entryDate,
            pieceNumber,
            label,
            status: "DRAFT",
            lines: validLines.map((l, i) => ({
              lineNumber: i + 1,
              generalAccountCode: l.generalAccountCode,
              label: l.label || label,
              debitMinor: l.debitMinor,
              creditMinor: l.creditMinor
            }))
          })
        });

        // 2. Valider formellement l'écriture
        const entryId = createRes.entry.id;
        const valRes = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries/" + entryId + "/validate", {
          method: "POST"
        });

        showFeedback("Écriture comptable validée et verrouillée avec succès (Pièce: " + valRes.entry.pieceNumber + ").");
        document.getElementById("accounting-entry-form").reset();
        entryLinesData = [
          { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 },
          { generalAccountCode: "", label: "", debitMinor: 0, creditMinor: 0 }
        ];
        if (subtabBtnJournalList) subtabBtnJournalList.click();
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Validation d'une écriture existante depuis la liste
    async function validateAccountingEntryAction(entryId) {
      if (!window.confirm("Confirmez-vous la validation formelle de cette écriture ? Une fois validée, elle ne pourra plus être modifiée en place.")) {
        return;
      }
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries/" + entryId + "/validate", {
          method: "POST"
        });
        showFeedback("Écriture validée avec succès (Pièce: " + res.entry.pieceNumber + ").");
        await loadAccountingEntriesList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    // Extourne comptable d'une écriture validée
    async function reverseAccountingEntryAction(entryId, pieceNumber) {
      const reason = window.prompt("Motif de l'extourne comptable pour la pièce " + pieceNumber + " :");
      if (reason === null) return;

      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries/" + entryId + "/reverse", {
          method: "POST",
          body: JSON.stringify({ reversalReason: reason || undefined })
        });
        showFeedback("Extourne effectuée avec succès (Nouvelle pièce miroir : " + res.entry.pieceNumber + ").");
        await loadAccountingEntriesList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    // Suppression d'un brouillon
    async function deleteAccountingEntryAction(entryId) {
      if (!window.confirm("Confirmez-vous la suppression de cette écriture brouillon ?")) {
        return;
      }
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries/" + entryId, {
          method: "DELETE"
        });
        showFeedback("Écriture brouillon supprimée.");
        await loadAccountingEntriesList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    // Détail complet dans la modale
    async function openAccountingEntryDetail(entryId) {
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/accounting/entries/" + entryId);
        const e = res.entry;

        document.getElementById("entry-modal-title").textContent = "Pièce n° " + e.pieceNumber + " — " + e.label;
        document.getElementById("entry-modal-subtitle").textContent = "Journal : " + e.journalCode + " (" + (e.journalLabel || "") + ") — Date : " + e.entryDate;

        const metaEl = document.getElementById("entry-modal-meta");
        let statusBadge = "";
        if (e.status === "VALIDATED") {
          statusBadge = '<span class="badge" style="background:var(--cn-success-bg); color:var(--cn-success); border:1px solid var(--cn-success);">Validée (VALIDATED)</span>';
        } else if (e.status === "DRAFT") {
          statusBadge = '<span class="badge" style="background:var(--cn-surface-alt); color:var(--cn-text-secondary); border:1px solid var(--cn-border);">Brouillon (DRAFT)</span>';
        } else if (e.status === "AI_SUGGESTION") {
          statusBadge = '<span class="badge" style="background:var(--cn-warning-bg); color:var(--cn-warning); border:1px solid var(--cn-warning);">Suggestion IA</span>';
        } else if (e.status === "REVERSED") {
          statusBadge = '<span class="badge" style="background:var(--cn-danger-bg); color:var(--cn-danger); border:1px solid var(--cn-danger);">Extournée (REVERSED)</span>';
        }

        metaEl.innerHTML =
          '<div><strong>Statut :</strong> ' + statusBadge + '</div>' +
          '<div><strong>Créée par :</strong> ' + (e.createdByName || "Système") + '</div>' +
          '<div><strong>Validée par :</strong> ' + (e.validatedByName || "Non validée") + '</div>' +
          '<div><strong>Horodatage validation :</strong> ' + (e.validatedAt ? new Date(e.validatedAt).toLocaleString("fr-FR") : "-") + '</div>' +
          (e.reversalOfEntryId ? '<div style="grid-column:1/-1; color:var(--cn-warning);"><strong>Contre-passation :</strong> Cette écriture est l’extourne de la pièce ' + e.reversalOfEntryId + '</div>' : '');

        const linesTbody = document.getElementById("entry-modal-lines-tbody");
        linesTbody.innerHTML = "";

        const lines = e.lines || [];
        lines.forEach((l) => {
          const tr = document.createElement("tr");
          const deb = l.debitMinor > 0 ? (l.debitMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "-";
          const cred = l.creditMinor > 0 ? (l.creditMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "-";

          tr.innerHTML =
            '<td class="font-mono-tabular">' + l.lineNumber + '</td>' +
            '<td class="font-mono-tabular"><strong>' + l.generalAccountCode + '</strong></td>' +
            '<td>' + (l.generalAccountLabel || "-") + '</td>' +
            '<td>' + l.label + '</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + deb + '</td>' +
            '<td class="font-mono-tabular" style="text-align:right;">' + cred + '</td>';

          linesTbody.appendChild(tr);
        });

        document.getElementById("entry-modal-total-debit").textContent = (e.totalDebitMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
        document.getElementById("entry-modal-total-credit").textContent = (e.totalCreditMinor / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

        // Boutons dans la modale
        const actionsEl = document.getElementById("entry-modal-actions");
        actionsEl.innerHTML = "";
        if ((e.status === "DRAFT" || e.status === "AI_SUGGESTION") && e.isBalanced) {
          const valBtn = document.createElement("button");
          valBtn.type = "button";
          valBtn.className = "btn-primary";
          valBtn.textContent = "Valider formellement l'écriture";
          valBtn.addEventListener("click", async () => {
            document.getElementById("entry-detail-modal").classList.add("hidden");
            await validateAccountingEntryAction(e.id);
          });
          actionsEl.appendChild(valBtn);
        } else if (e.status === "VALIDATED") {
          const revBtn = document.createElement("button");
          revBtn.type = "button";
          revBtn.className = "btn-secondary";
          revBtn.style.color = "var(--cn-warning)";
          revBtn.textContent = "Extourner cette écriture";
          revBtn.addEventListener("click", async () => {
            document.getElementById("entry-detail-modal").classList.add("hidden");
            await reverseAccountingEntryAction(e.id, e.pieceNumber);
          });
          actionsEl.appendChild(revBtn);
        }

        document.getElementById("entry-detail-modal").classList.remove("hidden");
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    document.getElementById("entry-modal-close-btn").addEventListener("click", () => {
      document.getElementById("entry-detail-modal").classList.add("hidden");
    });

    // =========================================================================
    // JAVASCRIPT MODULE 5 : IMPORT BANCAIRE & RAPPROCHEMENT (§17)
    // =========================================================================
    let currentBankReconcileTx = null;

    function showBankNoDossierState() {
      document.getElementById("bank-stat-total").textContent = "-";
      document.getElementById("bank-stat-unreconciled").textContent = "-";
      document.getElementById("bank-stat-reconciled").textContent = "-";
      document.getElementById("bank-stat-flagged").textContent = "-";
      const tbody = document.getElementById("bank-tx-tbody");
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--cn-text-secondary);">' +
        '<div class="cn-state-box cn-state-empty">Veuillez sélectionner un dossier client actif dans la barre supérieure pour consulter ou importer ses opérations bancaires.</div></td></tr>';
    }

    async function loadBankTransactions(dossierId) {
      if (!dossierId) {
        showBankNoDossierState();
        return;
      }
      const tbody = document.getElementById("bank-tx-tbody");
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--cn-text-secondary);"><div class="cn-state-box cn-state-loading">Chargement des opérations bancaires...</div></td></tr>';

      try {
        const filterStatus = document.getElementById("bank-filter-status").value;
        const search = document.getElementById("bank-search-input").value.trim();

        let url = "/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/bank/transactions?limit=100";
        if (filterStatus && filterStatus !== "ALL") url += "&status=" + encodeURIComponent(filterStatus);
        if (search) url += "&search=" + encodeURIComponent(search);

        const data = await apiFetch(url);
        const txs = data.transactions || [];

        // Compteurs statistiques
        let unreconciledCount = 0;
        let reconciledCount = 0;
        let flaggedCount = 0;
        txs.forEach((t) => {
          if (t.reconciliationStatus === "UNRECONCILED" || t.reconciliationStatus === "SUGGESTED_BY_AI") unreconciledCount++;
          else if (t.reconciliationStatus === "RECONCILED" || t.reconciliationStatus === "PARTIALLY_RECONCILED") reconciledCount++;
          else if (t.reconciliationStatus === "BANK_FEE_OR_NO_RECEIPT_FLAGGED") flaggedCount++;
        });

        document.getElementById("bank-stat-total").textContent = txs.length;
        document.getElementById("bank-stat-unreconciled").textContent = unreconciledCount;
        document.getElementById("bank-stat-reconciled").textContent = reconciledCount;
        document.getElementById("bank-stat-flagged").textContent = flaggedCount;

        if (txs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--cn-text-secondary);">' +
            '<div class="cn-state-box cn-state-empty">Aucune opération bancaire trouvée pour ce dossier. Utilisez le formulaire ci-dessus pour importer un fichier CSV ou OFX.</div></td></tr>';
          return;
        }

        tbody.innerHTML = "";
        txs.forEach((t) => {
          const tr = document.createElement("tr");

          const isDebit = t.amountMinor < 0;
          const absAmount = Math.abs(t.amountMinor) / 100;
          const formattedAmount = (isDebit ? "- " : "+ ") + absAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
          const amountColor = isDebit ? "var(--cn-status-danger)" : "var(--cn-status-success)";

          let statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-border); color:var(--cn-text-secondary);">En attente</span>';
          if (t.reconciliationStatus === "PARTIALLY_RECONCILED") {
            statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-warning); color:var(--cn-status-warning);">Partiel (' + (t.reconciledAmountMinor / 100).toFixed(2) + ' €)</span>';
          } else if (t.reconciliationStatus === "RECONCILED") {
            statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-success); color:var(--cn-status-success);">✓ Rapproché</span>';
          } else if (t.reconciliationStatus === "BANK_FEE_OR_NO_RECEIPT_FLAGGED") {
            statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-border); color:var(--cn-text-secondary);">Frais bancaire</span>';
          } else if (t.suggestedMatch) {
            statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-brand-action); color:var(--cn-brand-action);">Suggestion IA (' + Math.round(t.suggestedMatch.confidenceScore * 100) + ' %)</span>';
          }

          let matchCol = '<span style="color:var(--cn-text-secondary); font-size:0.85rem;">-</span>';
          if (t.suggestedMatch) {
            matchCol = '<div style="font-size:0.85rem;">' +
              '<strong>' + t.suggestedMatch.invoiceNumber + '</strong> (' + t.suggestedMatch.thirdPartyName + ')<br/>' +
              '<span style="color:var(--cn-text-secondary);">' + t.suggestedMatch.matchReason + '</span>' +
              '</div>';
          }

          let actionCol = '<div style="display:flex; justify-content:flex-end; gap:0.35rem; flex-wrap:wrap;">';
          if (t.reconciliationStatus !== "RECONCILED") {
            if (t.suggestedMatch) {
              actionCol += '<button type="button" class="btn-primary btn-sm btn-confirm-match" data-txid="' + t.id + '" data-invid="' + t.suggestedMatch.invoiceId + '" style="font-size:0.75rem; padding:0.2rem 0.5rem;">✓ Valider</button>';
              actionCol += '<button type="button" class="btn-secondary btn-sm btn-reject-match" data-txid="' + t.id + '" style="font-size:0.75rem; padding:0.2rem 0.5rem;">Rejeter</button>';
            }
            actionCol += '<button type="button" class="btn-secondary btn-sm btn-manual-reconcile" data-tx="' + JSON.stringify(t).replace(/"/g, "&quot;") + '" style="font-size:0.75rem; padding:0.2rem 0.5rem;">Rapprocher...</button>';
            if (t.reconciliationStatus !== "BANK_FEE_OR_NO_RECEIPT_FLAGGED") {
              actionCol += '<button type="button" class="btn-secondary btn-sm btn-flag-no-receipt" data-txid="' + t.id + '" style="font-size:0.75rem; padding:0.2rem 0.5rem; color:var(--cn-text-secondary);">Frais</button>';
            }
          } else {
            actionCol += '<span style="color:var(--cn-status-success); font-size:0.8rem; font-weight:600;">Lettré</span>';
          }
          actionCol += '</div>';

          tr.innerHTML =
            '<td class="font-mono-tabular">' + t.operationDate + '</td>' +
            '<td><strong>' + t.label + '</strong>' + (t.paymentReference ? '<br/><span style="font-size:0.8rem; color:var(--cn-text-secondary); font-family:monospace;">Réf: ' + t.paymentReference + '</span>' : '') + '</td>' +
            '<td class="font-mono-tabular" style="text-align:right; font-weight:600; color:' + amountColor + ';">' + formattedAmount + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + matchCol + '</td>' +
            '<td>' + actionCol + '</td>';

          tbody.appendChild(tr);
        });

        // Câblage des boutons d'actions par ligne
        tbody.querySelectorAll(".btn-confirm-match").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const txId = btn.getAttribute("data-txid");
            const invId = btn.getAttribute("data-invid");
            await reconcileBankTransactionAction(txId, invId);
          });
        });

        tbody.querySelectorAll(".btn-reject-match").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const txId = btn.getAttribute("data-txid");
            await rejectSuggestionAction(txId);
          });
        });

        tbody.querySelectorAll(".btn-manual-reconcile").forEach((btn) => {
          btn.addEventListener("click", () => {
            const raw = btn.getAttribute("data-tx");
            const tx = JSON.parse(raw);
            openReconciliationModal(tx);
          });
        });

        tbody.querySelectorAll(".btn-flag-no-receipt").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const txId = btn.getAttribute("data-txid");
            await flagNoReceiptAction(txId);
          });
        });
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--cn-status-danger);"><div class="cn-state-box cn-state-error">Erreur de chargement bancaire : ' + err.message + '</div></td></tr>';
      }
    }

    async function importBankStatementAction() {
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client avant d'importer un relevé.", true);
        return;
      }
      const fileInput = document.getElementById("bank-file-input");
      if (!fileInput.files || fileInput.files.length === 0) {
        showFeedback("Veuillez choisir un fichier de relevé bancaire à importer.", true);
        return;
      }
      const file = fileInput.files[0];
      const importType = document.getElementById("bank-import-type-select").value;
      const feedbackEl = document.getElementById("bank-import-feedback");
      feedbackEl.innerHTML = '<span style="color:var(--cn-brand-action);">Importation et déduplication en cours...</span>';

      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const base64 = e.target.result.split(",")[1];
            const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/bank/import", {
              method: "POST",
              body: JSON.stringify({
                fileBase64: base64,
                filename: file.name,
                importType: importType,
              }),
            });
            const batch = res.batch;
            feedbackEl.innerHTML = '<span style="color:var(--cn-status-success); font-weight:600;">' +
              '✓ Import réussi : ' + batch.validRows + ' opérations importées (' + batch.duplicateRows + ' doublons ignorés, ' + batch.errorRows + ' erreurs).' +
              '</span>';
            fileInput.value = "";
            showFeedback("Relevé bancaire importé avec succès.");
            await loadBankTransactions(activeDossierId);
          } catch (err) {
            feedbackEl.innerHTML = '<span style="color:var(--cn-status-danger); font-weight:600;">Erreur lors de l’import : ' + err.message + '</span>';
            showFeedback(err.message, true);
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        feedbackEl.innerHTML = '<span style="color:var(--cn-status-danger);">Erreur : ' + err.message + '</span>';
        showFeedback(err.message, true);
      }
    }

    async function openReconciliationModal(tx) {
      currentBankReconcileTx = tx;
      const modal = document.getElementById("bank-reconcile-modal");
      const summaryEl = document.getElementById("bank-reconcile-tx-summary");
      const invoicesListEl = document.getElementById("bank-reconcile-invoices-list");
      const amountInput = document.getElementById("bank-reconcile-allocated-amount");

      const absAmount = (Math.abs(tx.amountMinor) - (tx.reconciledAmountMinor || 0)) / 100;
      summaryEl.innerHTML =
        '<strong>Opération :</strong> ' + tx.operationDate + ' — ' + tx.label + '<br/>' +
        '<strong>Solde à rapprocher :</strong> <span class="font-mono-tabular" style="font-weight:700;">' + absAmount.toFixed(2) + ' €</span>';

      invoicesListEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--cn-text-secondary);">Recherche des factures du dossier...</div>';
      modal.classList.remove("hidden");

      try {
        const data = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/invoices");
        const invoices = (data.invoices || []).filter((i) => i.paymentStatus !== "PAID");

        if (invoices.length === 0) {
          invoicesListEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--cn-text-secondary);">Aucune facture ouverte en attente de règlement dans ce dossier.</div>';
          amountInput.value = absAmount.toFixed(2);
          return;
        }

        invoicesListEl.innerHTML = "";
        invoices.forEach((inv, idx) => {
          const invRemaining = (inv.totalAmountTtcMinor - inv.paidAmountMinor) / 100;
          const row = document.createElement("div");
          row.style.padding = "0.5rem 0.75rem";
          row.style.borderBottom = "1px solid var(--cn-border)";
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = "0.5rem";
          row.style.cursor = "pointer";

          row.innerHTML =
            '<input type="radio" name="reconcile-invoice-radio" id="rec-inv-' + inv.id + '" value="' + inv.id + '" data-remaining="' + invRemaining.toFixed(2) + '" ' + (idx === 0 ? "checked" : "") + ' />' +
            '<label for="rec-inv-' + inv.id + '" style="flex:1; cursor:pointer; margin:0; font-size:0.88rem;">' +
            '<strong>' + inv.invoiceNumber + '</strong> — ' + inv.clientName + ' (' + inv.issueDate + ') — ' +
            'Reste dû : <span class="font-mono-tabular" style="font-weight:600;">' + invRemaining.toFixed(2) + ' €</span>' +
            '</label>';

          row.addEventListener("click", () => {
            const radio = row.querySelector("input[type=radio]");
            radio.checked = true;
            const rem = parseFloat(radio.getAttribute("data-remaining"));
            amountInput.value = Math.min(absAmount, rem).toFixed(2);
          });

          invoicesListEl.appendChild(row);
        });

        // Valeur initiale proposée
        const firstRadio = invoicesListEl.querySelector("input[type=radio]:checked");
        if (firstRadio) {
          const rem = parseFloat(firstRadio.getAttribute("data-remaining"));
          amountInput.value = Math.min(absAmount, rem).toFixed(2);
        } else {
          amountInput.value = absAmount.toFixed(2);
        }
      } catch (err) {
        invoicesListEl.innerHTML = '<div style="padding:1rem; color:var(--cn-status-danger);">Erreur : ' + err.message + '</div>';
      }
    }

    async function reconcileBankTransactionAction(txId, invoiceId, allocatedAmountMinor) {
      try {
        const body = { transactionId: txId, invoiceId: invoiceId };
        if (allocatedAmountMinor !== undefined) {
          body.allocatedAmountMinor = allocatedAmountMinor;
        }
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/bank/reconcile", {
          method: "POST",
          body: JSON.stringify(body),
        });
        showFeedback("Rapprochement bancaire enregistré avec succès.");
        document.getElementById("bank-reconcile-modal").classList.add("hidden");
        await loadBankTransactions(activeDossierId);
      } catch (err) {
        showFeedback("Échec du rapprochement : " + err.message, true);
      }
    }

    async function rejectSuggestionAction(txId) {
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/bank/transactions/" + txId + "/reject-suggestion", {
          method: "POST",
          body: JSON.stringify({ reason: "Rejet manuel de la suggestion" }),
        });
        showFeedback("Suggestion de rapprochement rejetée.");
        await loadBankTransactions(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    async function flagNoReceiptAction(txId) {
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/bank/transactions/" + txId + "/flag-no-receipt", {
          method: "POST",
        });
        showFeedback("Opération marquée comme frais bancaires / sans justificatif.");
        await loadBankTransactions(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    // Événements modale rapprochement
    document.getElementById("btn-import-bank").addEventListener("click", importBankStatementAction);
    document.getElementById("btn-refresh-bank").addEventListener("click", () => {
      if (activeDossierId) loadBankTransactions(activeDossierId);
    });
    document.getElementById("bank-filter-status").addEventListener("change", () => {
      if (activeDossierId) loadBankTransactions(activeDossierId);
    });
    document.getElementById("bank-search-input").addEventListener("keyup", (e) => {
      if (e.key === "Enter" && activeDossierId) loadBankTransactions(activeDossierId);
    });
    document.getElementById("bank-reconcile-modal-close").addEventListener("click", () => {
      document.getElementById("bank-reconcile-modal").classList.add("hidden");
    });
    document.getElementById("bank-reconcile-cancel-btn").addEventListener("click", () => {
      document.getElementById("bank-reconcile-modal").classList.add("hidden");
    });
    document.getElementById("bank-reconcile-confirm-btn").addEventListener("click", async () => {
      if (!currentBankReconcileTx) return;
      const selectedRadio = document.querySelector('input[name="reconcile-invoice-radio"]:checked');
      if (!selectedRadio) {
        showFeedback("Veuillez sélectionner une facture à rapprocher.", true);
        return;
      }
      const invId = selectedRadio.value;
      const amountVal = parseFloat(document.getElementById("bank-reconcile-allocated-amount").value);
      if (Number.isNaN(amountVal) || amountVal <= 0) {
        showFeedback("Veuillez indiquer un montant alloué valide.", true);
        return;
      }
      const allocatedMinor = Math.round(amountVal * 100);
      await reconcileBankTransactionAction(currentBankReconcileTx.id, invId, allocatedMinor);
    });

    // =========================================================================
    // JAVASCRIPT MODULE 6 : CONTRÔLES DÉTERMINISTES & ANOMALIES (§18)
    // =========================================================================
    let currentAnomalyToResolve = null;

    function showAnomaliesNoDossierState() {
      document.getElementById("anomalies-stat-critical").textContent = "-";
      document.getElementById("anomalies-stat-suspicion").textContent = "-";
      document.getElementById("anomalies-stat-resolved").textContent = "-";
      const tbody = document.getElementById("anomalies-tbody");
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--cn-text-secondary);">' +
        '<div class="cn-state-box cn-state-empty">Veuillez sélectionner un dossier client actif dans la barre supérieure pour exécuter les contrôles comptables.</div></td></tr>';
    }

    async function loadAnomaliesList(dossierId) {
      if (!dossierId) {
        showAnomaliesNoDossierState();
        return;
      }
      const tbody = document.getElementById("anomalies-tbody");
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--cn-text-secondary);"><div class="cn-state-box cn-state-loading">Chargement des anomalies...</div></td></tr>';

      try {
        const severity = document.getElementById("anomalies-filter-severity").value;
        const status = document.getElementById("anomalies-filter-status").value;

        let url = "/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/anomalies";
        const queryParts = [];
        if (severity && severity !== "ALL") queryParts.push("severity=" + encodeURIComponent(severity));
        if (status && status !== "ALL") queryParts.push("status=" + encodeURIComponent(status));
        if (queryParts.length > 0) url += "?" + queryParts.join("&");

        const data = await apiFetch(url);
        const anomalies = data.anomalies || [];

        // Compteurs
        let criticalCount = 0;
        let suspicionCount = 0;
        let resolvedCount = 0;
        anomalies.forEach((a) => {
          if (a.status === "OPEN" || a.status === "IN_REVIEW") {
            if (a.isCertainError) criticalCount++;
            else suspicionCount++;
          } else {
            resolvedCount++;
          }
        });

        document.getElementById("anomalies-stat-critical").textContent = criticalCount;
        document.getElementById("anomalies-stat-suspicion").textContent = suspicionCount;
        document.getElementById("anomalies-stat-resolved").textContent = resolvedCount;

        if (anomalies.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--cn-text-secondary);">' +
            '<div class="cn-state-box cn-state-empty">Aucune anomalie détectée sur ce dossier. Cliquez sur "Lancer le scan des 10 règles" pour exécuter une analyse complète.</div></td></tr>';
          return;
        }

        tbody.innerHTML = "";
        anomalies.forEach((a) => {
          const tr = document.createElement("tr");

          let sevBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-border); color:var(--cn-text-secondary);">' + a.severity + '</span>';
          if (a.isCertainError) {
            sevBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-danger); color:var(--cn-status-danger); font-weight:700;">⚠ Erreur certaine</span>';
          } else if (a.severity === "SUSPICION_TO_VERIFY") {
            sevBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-warning); color:var(--cn-status-warning);">? Suspicion</span>';
          } else if (a.severity === "WARNING") {
            sevBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-info); color:var(--cn-status-info);">Alerte</span>';
          }

          let statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-warning); color:var(--cn-status-warning);">Ouverte</span>';
          if (a.status === "RESOLVED_BY_CORRECTION") {
            statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-status-success); color:var(--cn-status-success);">✓ Corrigée</span>';
          } else if (a.status === "DISMISSED_WITH_JUSTIFICATION") {
            statusBadge = '<span class="status-badge" style="background:var(--cn-bg-app); border:1px solid var(--cn-border); color:var(--cn-text-secondary);">Classée (Faux positif)</span>';
          }

          let actionCol = '<div style="display:flex; justify-content:flex-end; gap:0.35rem;">';
          if (a.status === "OPEN" || a.status === "IN_REVIEW") {
            actionCol += '<button type="button" class="btn-primary btn-sm btn-resolve-anomaly" data-anomaly="' + JSON.stringify(a).replace(/"/g, "&quot;") + '" style="font-size:0.75rem; padding:0.2rem 0.5rem;">Traiter...</button>';
          } else {
            actionCol += '<span style="font-size:0.8rem; color:var(--cn-text-secondary);" title="' + (a.resolutionJustification || '') + '">Clôturée</span>';
          }
          actionCol += '</div>';

          tr.innerHTML =
            '<td>' + sevBadge + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.82rem;"><strong>' + a.ruleCode + '</strong></td>' +
            '<td style="max-width:320px;">' + a.message + (a.resolutionJustification ? '<br/><span style="font-size:0.8rem; color:var(--cn-status-success);">Justification : ' + a.resolutionJustification + '</span>' : '') + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.82rem;">' + a.targetEntityType + (a.targetEntityId ? ' (' + a.targetEntityId.slice(0, 8) + '...)' : '') + '</td>' +
            '<td class="font-mono-tabular" style="font-size:0.82rem;">' + a.detectedAt.slice(0, 10) + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + actionCol + '</td>';

          tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-resolve-anomaly").forEach((btn) => {
          btn.addEventListener("click", () => {
            const raw = btn.getAttribute("data-anomaly");
            const anomaly = JSON.parse(raw);
            openAnomalyResolveModal(anomaly);
          });
        });
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--cn-status-danger);"><div class="cn-state-box cn-state-error">Erreur de chargement des anomalies : ' + err.message + '</div></td></tr>';
      }
    }

    async function scanAnomaliesAction() {
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }
      const feedbackEl = document.getElementById("anomalies-scan-feedback");
      feedbackEl.innerHTML = '<span style="color:var(--cn-brand-action);">Scan des 10 règles déterministes en cours...</span>';

      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/anomalies/scan", {
          method: "POST",
        });
        feedbackEl.innerHTML = '<span style="color:var(--cn-status-success); font-weight:600;">' +
          '✓ Scan terminé : 10 règles analysées (' + res.newAnomaliesCount + ' nouvelles anomalies, ' + res.existingOpenAnomaliesCount + ' déjà enregistrées, ' + res.totalOpenAnomalies + ' au total).' +
          '</span>';
        showFeedback("Scan des anomalies terminé.");
        await loadAnomaliesList(activeDossierId);
      } catch (err) {
        feedbackEl.innerHTML = '<span style="color:var(--cn-status-danger);">Erreur lors du scan : ' + err.message + '</span>';
        showFeedback(err.message, true);
      }
    }

    function openAnomalyResolveModal(anomaly) {
      currentAnomalyToResolve = anomaly;
      const modal = document.getElementById("anomaly-resolve-modal");
      const detailsEl = document.getElementById("anomaly-modal-details");
      const justifInput = document.getElementById("anomaly-resolve-justification");
      const statusSelect = document.getElementById("anomaly-resolve-status-select");

      detailsEl.innerHTML =
        '<div style="background:var(--cn-bg-app); padding:0.75rem; border-radius:6px; margin-bottom:0.75rem;">' +
        '<strong>Règle :</strong> ' + anomaly.ruleCode + '<br/>' +
        '<strong>Description :</strong> ' + anomaly.message +
        '</div>';

      justifInput.value = "";
      statusSelect.value = "RESOLVED_BY_CORRECTION";
      modal.classList.remove("hidden");
    }

    async function resolveAnomalyAction(anomalyId, status, justification) {
      try {
        await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/anomalies/" + anomalyId + "/resolve", {
          method: "POST",
          body: JSON.stringify({
            resolutionStatus: status,
            resolutionJustification: justification,
          }),
        });
        showFeedback("Anomalie traitée avec succès.");
        document.getElementById("anomaly-resolve-modal").classList.add("hidden");
        await loadAnomaliesList(activeDossierId);
      } catch (err) {
        showFeedback(err.message, true);
      }
    }

    // Événements modale anomalies
    document.getElementById("btn-scan-anomalies").addEventListener("click", scanAnomaliesAction);
    document.getElementById("btn-refresh-anomalies").addEventListener("click", () => {
      if (activeDossierId) loadAnomaliesList(activeDossierId);
    });
    document.getElementById("anomalies-filter-severity").addEventListener("change", () => {
      if (activeDossierId) loadAnomaliesList(activeDossierId);
    });
    document.getElementById("anomalies-filter-status").addEventListener("change", () => {
      if (activeDossierId) loadAnomaliesList(activeDossierId);
    });
    document.getElementById("anomaly-modal-close").addEventListener("click", () => {
      document.getElementById("anomaly-resolve-modal").classList.add("hidden");
    });
    document.getElementById("anomaly-modal-cancel-btn").addEventListener("click", () => {
      document.getElementById("anomaly-resolve-modal").classList.add("hidden");
    });
    document.getElementById("anomaly-modal-confirm-btn").addEventListener("click", async () => {
      if (!currentAnomalyToResolve) return;
      const status = document.getElementById("anomaly-resolve-status-select").value;
      const justif = document.getElementById("anomaly-resolve-justification").value.trim();
      if (status === "DISMISSED_WITH_JUSTIFICATION" && justif.length < 10) {
        showFeedback("Une justification d'au moins 10 caractères est obligatoire pour classer un faux positif.", true);
        return;
      }
      await resolveAnomalyAction(currentAnomalyToResolve.id, status, justif);
    });

    // =========================================================================
    // JAVASCRIPT MODULE 7 : SIMULATIONS INDICATIVES VERSIONNÉES (§19)
    // =========================================================================
    function setupSimForm(simType) {
      const container = document.getElementById("sim-fields-container");
      const title = document.getElementById("sim-form-title");
      const typeInput = document.getElementById("sim-type-input");
      typeInput.value = simType;

      if (simType === "VAT_SUMMARY") {
        title.textContent = "Paramètres de la simulation TVA indicative";
        container.innerHTML = '<div>' +
          '<label for="sim-vat-collected">TVA collectée (€)</label>' +
          '<input type="number" id="sim-vat-collected" step="0.01" min="0" value="2000.00" required />' +
          '</div>' +
          '<div>' +
          '<label for="sim-vat-deductible">TVA déductible (€)</label>' +
          '<input type="number" id="sim-vat-deductible" step="0.01" min="0" value="800.00" required />' +
          '</div>';
      } else if (simType === "SOCIAL_CONTRIBUTIONS") {
        title.textContent = "Paramètres de la simulation Cotisations Sociales";
        container.innerHTML = '<div>' +
          '<label for="sim-soc-revenue">Revenu ou rémunération nette annuelle (€)</label>' +
          '<input type="number" id="sim-soc-revenue" step="0.01" min="0" value="45000.00" required />' +
          '</div>';
      } else if (simType === "INCOME_OR_CORPORATE_TAX") {
        title.textContent = "Paramètres de la simulation Impôt sur les Sociétés (IS)";
        container.innerHTML = '<div>' +
          '<label for="sim-tax-profit">Bénéfice fiscal imposable (€)</label>' +
          '<input type="number" id="sim-tax-profit" step="0.01" min="0" value="60000.00" required />' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:0.5rem; margin-top:1.5rem;">' +
          '<input type="checkbox" id="sim-tax-pme" checked />' +
          '<label for="sim-tax-pme" style="margin:0; font-size:0.9rem;">Éligible au taux réduit PME (15 % jusqu’à 42 500 €)</label>' +
          '</div>';
      } else if (simType === "EXPENSE_IMPACT") {
        title.textContent = "Paramètres de la simulation Impact d'une Dépense";
        container.innerHTML = '<div>' +
          '<label for="sim-exp-amount">Montant net HT de la dépense (€)</label>' +
          '<input type="number" id="sim-exp-amount" step="0.01" min="0" value="1000.00" required />' +
          '</div>' +
          '<div>' +
          '<label for="sim-exp-vat-rate">Taux de TVA déductible (%)</label>' +
          '<select id="sim-exp-vat-rate">' +
          '<option value="2000" selected>20,0 % (Taux normal)</option>' +
          '<option value="1000">10,0 % (Taux intermédiaire)</option>' +
          '<option value="550">5,5 % (Taux réduit)</option>' +
          '<option value="210">2,1 % (Taux super réduit)</option>' +
          '<option value="0">0,0 % (Exonéré / Non assujetti)</option>' +
          '</select>' +
          '</div>' +
          '<div>' +
          '<label for="sim-exp-tax-rate">Taux d’IS marginal applicable (%)</label>' +
          '<select id="sim-exp-tax-rate">' +
          '<option value="2500" selected>25,0 % (Taux normal IS)</option>' +
          '<option value="1500">15,0 % (Taux réduit PME)</option>' +
          '<option value="0">0,0 % (Non déductible ou exonéré)</option>' +
          '</select>' +
          '</div>';
      }
    }

    async function loadSimulationsHistory(dossierId) {
      if (!dossierId) return;
      const tbody = document.getElementById("simulations-history-tbody");
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--cn-text-secondary); padding:1rem;">Chargement des simulations...</td></tr>';
      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + dossierId + "/simulations");
        const list = res.simulations || [];
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--cn-text-secondary); padding:1rem;">Aucune simulation enregistrée pour ce dossier.</td></tr>';
          return;
        }
        tbody.innerHTML = list.map((sim) => {
          let keyVal = "—";
          const r = sim.results || {};
          if (sim.simulationType === "VAT_SUMMARY" && r.netVatDueMinor !== undefined) {
            keyVal = (r.netVatDueMinor >= 0 ? "TVA à payer : " : "Crédit TVA : ") + (Math.abs(r.netVatDueMinor) / 100).toFixed(2) + " €";
          } else if (sim.simulationType === "SOCIAL_CONTRIBUTIONS" && r.totalContributionsMinor !== undefined) {
            keyVal = "Cotisations : " + (r.totalContributionsMinor / 100).toFixed(2) + " €";
          } else if (sim.simulationType === "INCOME_OR_CORPORATE_TAX" && r.taxDueMinor !== undefined) {
            keyVal = "IS estimé : " + (r.taxDueMinor / 100).toFixed(2) + " €";
          } else if (sim.simulationType === "EXPENSE_IMPACT" && r.cashImpactMinor !== undefined) {
            keyVal = "Impact tréso : " + (r.cashImpactMinor / 100).toFixed(2) + " €";
          }
          const badgeClass = sim.status === "SIMULATED" ? "badge-valid" : "badge-danger";
          return "<tr>" +
            "<td class='font-mono-tabular'>" + sim.createdAt.slice(0, 19).replace("T", " ") + "</td>" +
            "<td><strong>" + sim.simulationType + "</strong></td>" +
            "<td><span class='badge " + badgeClass + "'>" + sim.status + "</span></td>" +
            "<td><code class='font-mono-tabular'>" + sim.countryConfigVersionId + "</code></td>" +
            "<td class='font-mono-tabular'><strong>" + keyVal + "</strong></td>" +
            "</tr>";
        }).join("");
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--cn-status-danger); padding:1rem;">Erreur de chargement : ' + err.message + '</td></tr>';
      }
    }

    document.querySelectorAll(".btn-select-sim-type").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.getAttribute("data-type");
        setupSimForm(type);
        document.getElementById("sim-form-container").scrollIntoView({ behavior: "smooth" });
      });
    });

    document.getElementById("sim-reset-btn").addEventListener("click", () => {
      const type = document.getElementById("sim-type-input").value;
      setupSimForm(type);
      document.getElementById("sim-result-container").classList.add("hidden");
    });

    document.getElementById("btn-refresh-simulations").addEventListener("click", () => {
      if (activeDossierId) loadSimulationsHistory(activeDossierId);
    });

    document.getElementById("sim-run-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }
      const simType = document.getElementById("sim-type-input").value;
      let parameters = {};

      if (simType === "VAT_SUMMARY") {
        const col = parseFloat(document.getElementById("sim-vat-collected").value || "0");
        const ded = parseFloat(document.getElementById("sim-vat-deductible").value || "0");
        parameters = {
          collectedVatMinor: Math.round(col * 100),
          deductibleVatMinor: Math.round(ded * 100)
        };
      } else if (simType === "SOCIAL_CONTRIBUTIONS") {
        const rev = parseFloat(document.getElementById("sim-soc-revenue").value || "0");
        parameters = {
          annualNetRevenueMinor: Math.round(rev * 100)
        };
      } else if (simType === "INCOME_OR_CORPORATE_TAX") {
        const prof = parseFloat(document.getElementById("sim-tax-profit").value || "0");
        const pme = document.getElementById("sim-tax-pme").checked;
        parameters = {
          taxableProfitMinor: Math.round(prof * 100),
          isEligiblePmeReducedRate: pme
        };
      } else if (simType === "EXPENSE_IMPACT") {
        const amt = parseFloat(document.getElementById("sim-exp-amount").value || "0");
        const vatRate = parseInt(document.getElementById("sim-exp-vat-rate").value, 10);
        const taxRate = parseInt(document.getElementById("sim-exp-tax-rate").value, 10);
        parameters = {
          expenseNetMinor: Math.round(amt * 100),
          vatRateBps: vatRate,
          corporateTaxRateBps: taxRate
        };
      }

      try {
        const res = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/simulations", {
          method: "POST",
          body: JSON.stringify({ simulationType: simType, parameters })
        });
        const sim = res.simulation;
        const resContainer = document.getElementById("sim-result-container");
        const badge = document.getElementById("sim-result-status-badge");
        const disclaimer = document.getElementById("sim-result-disclaimer");
        const details = document.getElementById("sim-result-details");
        const assumptions = document.getElementById("sim-result-assumptions");

        badge.textContent = sim.status;
        badge.className = "badge " + (sim.status === "SIMULATED" ? "badge-valid" : "badge-danger");
        disclaimer.textContent = sim.regulatoryDisclaimer;

        const r = sim.results || {};
        let detailsHtml = "";
        for (const [k, v] of Object.entries(r)) {
          let label = k;
          let val = v;
          if (typeof v === "number" && k.endsWith("Minor")) {
            val = (v / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
            label = k.replace("Minor", "");
          } else if (typeof v === "number" && k.endsWith("Bps")) {
            val = (v / 100).toFixed(2) + " %";
            label = k.replace("Bps", "");
          }
          detailsHtml += "<div style='padding:0.75rem; border:1px solid var(--cn-border); border-radius:6px; background:var(--cn-bg-surface);'>" +
            "<div style='font-size:0.8rem; color:var(--cn-text-secondary); text-transform:uppercase;'>" + label + "</div>" +
            "<div class='font-mono-tabular' style='font-size:1.2rem; font-weight:700; color:var(--cn-primary);'>" + val + "</div>" +
            "</div>";
        }
        details.innerHTML = detailsHtml;

        const asm = sim.assumptions || [];
        assumptions.innerHTML = "<strong>Hypothèses retenues :</strong><ul style='margin:0.5rem 0 0 1.2rem; padding:0;'>" +
          asm.map((a) => "<li>" + a + "</li>").join("") + "</ul>";

        resContainer.classList.remove("hidden");
        resContainer.scrollIntoView({ behavior: "smooth" });
        showFeedback("Simulation calculée et archivée.");
        await loadSimulationsHistory(activeDossierId);
      } catch (err) {
        showFeedback("Erreur simulation : " + err.message, true);
      }
    });

    setupSimForm("VAT_SUMMARY");

    // =========================================================================
    // JAVASCRIPT MODULE 9 : CENTRE D'EXPORTS SÉCURISÉS & FEC PRÉLIMINAIRE (§21)
    // =========================================================================
    async function triggerSecureDownload(url, defaultFilename) {
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }
      try {
        const headers = Object.assign({}, getJustificationHeaders());
        if (authToken) headers["Authorization"] = "Bearer " + authToken;
        if (activeOrgId) headers["X-Organization-Id"] = activeOrgId;

        const response = await fetch(url, { headers });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || ("Erreur " + response.status + " lors du téléchargement"));
        }

        const disp = response.headers.get("Content-Disposition");
        let filename = defaultFilename;
        if (disp && disp.includes("filename=")) {
          const match = disp.match(/filename="?([^";]+)"?/);
          if (match && match[1]) filename = match[1];
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
        showFeedback("Fichier téléchargé avec succès : " + filename);
      } catch (err) {
        showFeedback("Échec du téléchargement : " + err.message, true);
      }
    }

    document.querySelectorAll(".btn-export-csv").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!activeDossierId) {
          showFeedback("Veuillez sélectionner un dossier client actif.", true);
          return;
        }
        const exportType = btn.getAttribute("data-type");
        const delimiter = document.getElementById("export-csv-delimiter").value;
        const url = "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/exports/csv/" + exportType + "?delimiter=" + encodeURIComponent(delimiter);
        triggerSecureDownload(url, "export_" + exportType + ".csv");
      });
    });

    document.getElementById("btn-download-fec").addEventListener("click", () => {
      if (!activeDossierId) {
        showFeedback("Veuillez sélectionner un dossier client actif.", true);
        return;
      }
      const decimalSeparator = document.getElementById("fec-decimal-sep").value;
      const closingDate = document.getElementById("fec-closing-date").value;
      const url = "/api/organizations/" + activeOrgId + "/dossiers/" + activeDossierId + "/exports/fec?decimalSeparator=" + encodeURIComponent(decimalSeparator) + "&closingDate=" + encodeURIComponent(closingDate);
      triggerSecureDownload(url, "export_fec.txt");
    });

    bootstrapAuthenticatedApp();
  </script>
</body>
</html>`;
}
