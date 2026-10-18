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
      if (targetTabId === "tab-documents") {
        if (activeDossierId) {
          loadDocumentsList(activeDossierId);
        } else {
          showDocumentsNoDossierState();
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
            (selectedDocument.overrideDuplicateReason ? " Dérogation accordée : \"" + selectedDocument.overrideDuplicateReason + "\"" : "");
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

    bootstrapAuthenticatedApp();
  </script>
</body>
</html>`;
}
