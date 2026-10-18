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

      <!-- ONGLET 1 : TABLEAU DE BORD -->
      <section id="tab-dashboard" class="tab-panel">
        <div class="kpi-grid" id="dashboard-kpis"></div>
        <div class="card">
          <h3>Architecture Internationale &amp; Charte Graphique Unifiée (Phase 1 Section 5)</h3>
          <p style="font-size:0.9rem; color:var(--cn-text-secondary);">
            Prise en charge native des devises à 0 décimale (XOF, JPY), 2 décimales (EUR, USD, MAD, AED, SAR) et 3 décimales (TND, BHD, OMR, KWD), de l'auto-initialisation idempotente du Plan Comptable Général (PCG) et des journaux standards (<code>ACH</code>, <code>VEN</code>, <code>BQ</code>, <code>OD</code>, <code>AN</code>).
          </p>
          <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:0.75rem;">
            <span class="badge badge-valid">VALIDATED_BY_HUMAN : Donnée comptable validée</span>
            <span class="badge badge-ai">PROPOSED_BY_AI / NEEDS_HUMAN_REVIEW : Suggestion IA</span>
            <span class="badge badge-draft">COMPUTED_INDICATIVE : Simulation déterministe provisoire</span>
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
        <div class="card">
          <h3>Module 3 — Collecte documentaire &amp; OCR assisté (Planifié au Lot 1.2)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Ce module est rattaché au dossier actif sélectionné dans la barre de contexte supérieure. Le cycle de vie documentaire à 6 statuts, la détection de doublons et l'extraction assistée par IA non auto-validante seront activés dans le Lot 1.2.
          </p>
        </div>
      </section>

      <!-- ONGLET 4 : FACTURATION & DEVIS (Lot 1.3) -->
      <section id="tab-invoicing" class="tab-panel hidden">
        <div class="card">
          <h3>Module 4 — Facturation, Devis &amp; Mentions Légales FR (Planifié au Lot 1.3)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Création de devis, transformation en facture en un clic, numérotation séquentielle sans trou et aperçu imprimable — livrés au Lot 1.3.
          </p>
        </div>
      </section>

      <!-- ONGLET 5 : JOURNAL COMPTABLE & PCG (Lot 1.4) -->
      <section id="tab-journal" class="tab-panel hidden">
        <div class="card">
          <h3>Module 5 — Journal comptable &amp; Plan Comptable Français (Planifié au Lot 1.4)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Le Plan Comptable Général (PCG) et les journaux standards (<code>ACH</code>, <code>VEN</code>, <code>BQ</code>, <code>OD</code>, <code>AN</code>) sont d'ores et déjà initialisés de manière idempotente sur chaque dossier (Lot 1.1). La saisie multi-lignes interactive et la validation irréversible seront livrées au Lot 1.4.
          </p>
        </div>
      </section>

      <!-- ONGLET 6 : BANQUE & RAPPROCHEMENT (Lot 1.5) -->
      <section id="tab-banking" class="tab-panel hidden">
        <div class="card">
          <h3>Module 6 — Import CSV &amp; Rapprochement bancaire assisté (Planifié au Lot 1.5)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Import de relevés bancaires CSV avec déduplication et suggestions de rapprochement justifiées — livré au Lot 1.5.
          </p>
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

      <!-- ONGLET 8 : SIMULATEUR MICRO-ENTREPRENEUR (Lot 1.6) -->
      <section id="tab-simulator" class="tab-panel hidden">
        <div class="card">
          <h3>Module 8 — Simulateur micro-entrepreneur FR Versionné (Planifié au Lot 1.6)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Simulation déterministe versionnée avec sauvegarde de l'historique par dossier et avertissement réglementaire — livrée au Lot 1.6.
          </p>
        </div>
      </section>

      <!-- ONGLET 9 : ANOMALIES & CONTRÔLES (Lot 1.5) -->
      <section id="tab-anomalies" class="tab-panel hidden">
        <div class="card">
          <h3>Module 9 — Contrôles de cohérence &amp; Détection d'anomalies (Planifié au Lot 1.5)</h3>
          <p style="color:var(--cn-text-secondary); font-size:0.9rem;">
            Moteur de détection déterministe (doublons, écarts HT/TVA/TTC, pièces manquantes, séquences interrompues) — livré au Lot 1.5.
          </p>
        </div>
      </section>

      <!-- ONGLET 10 : EXPORTS & PARAMÈTRES / PISTE D'AUDIT SHA-256 -->
      <section id="tab-settings" class="tab-panel hidden">
        <div class="card">
          <h3>Paramètres de la plateforme, Réserves Réglementaires &amp; Piste d'Audit SHA-256</h3>
          <div class="cn-state-box cn-state-confirm" style="margin-bottom:1rem;">
            <strong>Réserve réglementaire (Section 4) :</strong> Les calculs de TVA, les barèmes sociaux, les mentions de facturation et l'export FEC demeurent explicitement provisoires jusqu'à qualification formelle par un expert-comptable et tests représentatifs documentés.
          </div>
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
      if (!document.getElementById("dossier-detail-panel").classList.contains("hidden")) {
        await loadDossierDetails(activeDossierId);
      }
    });

    document.getElementById("open-active-dossier-detail-btn").addEventListener("click", async () => {
      switchTab("tab-dossiers");
      if (activeDossierId) {
        await loadDossierDetails(activeDossierId);
      }
    });

    // Support clavier : touche Escape pour refermer la modale de confirmation d'archivage
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.getElementById("archive-confirm-modal");
        if (modal && !modal.classList.contains("hidden")) {
          modal.classList.add("hidden");
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

        const dossiersRes = await apiFetch("/api/organizations/" + activeOrgId + "/dossiers");
        cachedDossiers = dossiersRes.dossiers || [];

        if (!activeDossierId || !cachedDossiers.some((x) => x.id === activeDossierId)) {
          activeDossierId = (cachedDossiers[0] && cachedDossiers[0].id) || null;
        }
        renderActiveDossierSelector();
        applyDossiersFilters();

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

    bootstrapAuthenticatedApp();
  </script>
</body>
</html>`;
}
