# COMPTANOVA — PHASE 1 : AUDIT INITIAL DE RÉFÉRENCE & PLAN DE LIVRAISON INCRÉMENTAL (`PHASE1_DELIVERY_PLAN.md`)

- **Date d'établissement** : 2026-10-18T17:02:00+01:00
- **Commit de référence audité** : `fb52d44` (`main` / `origin/main` — *Lot 0.6: Final counter-audit remediations*)
- **Statut du document** : **Plan soumis à validation avant exécution incrémentale Lot par Lot** (conformément à la **Section B** de la *Directive de Pilotage — Phase 1*)

---

## PARTIE 1 — AUDIT INITIAL DU DÉPÔT EXISTANT (SECTIONS A, C, G DE LA DIRECTIVE & SECTIONS 25, 31 DU PROMPT PHASE 1)

### 1.1 État technique vérifié au commit `fb52d44`
- **Branche et arbre Git** : Branche `main` synchronisée avec `origin/main` (`fb52d44`), aucun fichier modifié ou non suivi (`git status -s` vide).
- **Compilation & Tests de référence** :
  - `npm run typecheck` : **`0 erreur`** (TypeScript 5.8 strict).
  - `npm test` : **`22 / 22 tests passants`** (`0 fail`, `0 skipped`) répartis sur 3 suites (`phase0.test.ts` [9], `international-scope.test.ts` [8], `phase1-readiness-and-postgres.test.ts` [5]), incluant le test réel sur **PostgreSQL 16.15** (`psql -U postgres -h /tmp`).
- **Base de données locale (`./data/app.db`)** :
  - **4 migrations appliquées** (`001_phase0_foundations`, `002_international_scope_extension`, `003_phase1_readiness_schema`, `004_audit_logs_immutability_triggers`).
  - **20 tables métier** déjà créées et contraintes par clés étrangères et `CHECK` :
    - *Tables Phase 0 (12)* : `country_config_versions`, `organizations`, `users`, `organization_memberships`, `auth_sessions`, `client_dossiers`, `dossier_assignments`, `documents`, `invoices`, `accounting_entries`, `simulations_history`, `audit_logs`.
    - *Tables préparatoires Phase 1 (8)* : `third_parties`, `chart_of_accounts`, `accounting_journals`, `accounting_entry_lines`, `import_batches`, `bank_transactions`, `reconciliation_links`, `anomalies`.
  - **Triggers d'inaltérabilité** : `trg_audit_logs_immutable_update` et `trg_audit_logs_immutable_delete` actifs sur `./data/app.db` et `trg_pg_audit_logs_immutable` actif sur PostgreSQL 16.
- **Procédure de sauvegarde et restauration avant toute migration Phase 1 (Section A)** :
  - Avant chaque lot comportant une migration SQL (`005+`) sur `./data/app.db`, une copie horodatée `cp ./data/app.db ./data/backups/app-pre-lot1.X-<timestamp>.db` (avec vérification d'intégrité `PRAGMA integrity_check;`) sera exécutée afin de garantir une restauration immédiate en cas d'incident.

---

### 1.2 Cartographie stricte des fonctionnalités existantes (Nomenclature obligatoire — Section C)

| Module / Composant | Fichiers existants | Statut réel au commit `fb52d44` | Ce qui fonctionne réellement vs Ce qui reste à développer en Phase 1 |
| :--- | :--- | :---: | :--- |
| **Socle Auth, Sessions, Rate-Limit, Audit SHA-256 & Isolation Multi-Tenant** | [`src/auth/auth-service.ts`](../src/auth/auth-service.ts)<br>[`src/audit/audit-service.ts`](../src/audit/audit-service.ts)<br>[`src/server.ts`](../src/server.ts) | **`TERMINÉ ET TESTÉ`** | Hachage `scrypt`, sessions `HMAC-SHA256`, révocation/expiration, rate-limit `429` sur login, RBAC par organisation et par dossier, chaîne d'audit `SHA-256` et triggers SQL. |
| **Moteur monétaire exact (`0`, `2`, `3`, `4` décimales & FX) et Registre Juridictions** | [`src/domain/money.ts`](../src/domain/money.ts)<br>[`src/countries/country-registry.ts`](../src/countries/country-registry.ts) | **`TERMINÉ ET TESTÉ`** | 20 devises en unités mineures `BigInt`, 4 modes d'arrondi, conversions FX auditées, 8 versions de juridictions (dont `FR-2025.1-HISTORICAL` et `FR-2026.1-REV0`). |
| **Design System, Charte Graphique, Logo & Navigation Générale (Partie II)** | [`src/config/app-config.ts`](../src/config/app-config.ts)<br>[`src/ui/app-view.ts`](../src/ui/app-view.ts) | **`PARTIELLEMENT IMPLÉMENTÉ`** | 6 onglets initiaux fonctionnels, mais il manque : l'alignement exact sur les 8 tokens de la Section 5 (`#F7F8FA`, `#17212B`, `#64748B`, `#E2E8F0`), le logo SVG professionnel, la navigation à 10 entrées de la Section 9, le sélecteur global de **Dossier actif + Période**, la navigation mobile dédiée, les modales/panneaux latéraux et les composants partagés (upload, revue IA côte-à-côte, pagination/tri, états vides/chargement). |
| **Module 1 : Gestion des dossiers (§13)** | [`src/services/tenant-service.ts`](../src/services/tenant-service.ts)<br>[`src/server.ts`](../src/server.ts) | **`PARTIELLEMENT IMPLÉMENTÉ`** | Création et liste filtrée opérationnelles. **Manquent** : modification d'un dossier existant (`PUT / PATCH`), gestion UI/API des affectations granulaires d'utilisateurs (`assignUserToDossier` existe en service mais n'est pas exposé en route HTTP ni dans l'UI), archivage/désactivation contrôlée et historique des actions par dossier. |
| **Module 2 : Documents et IA (§14)** | [`src/services/tenant-service.ts`](../src/services/tenant-service.ts)<br>[`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts) | **`PARTIELLEMENT IMPLÉMENTÉ` & `SIMULÉ`** | `ingestDocumentIntoDossier()` calcule le `SHA-256`, détecte les doublons et appelle `DeterministicMockAiAdapter` (`SIMULÉ` explicite), mais : (1) le binaire n'est pas encore écrit sur disque dans `./storage/private-documents`, (2) `DeterministicMockAiAdapter` renvoie des valeurs fixes au lieu d'analyser le texte du document téléversé, (3) aucune route HTTP ni écran de téléversement, de prévisualisation côte-à-côte, de correction manuelle ni de validation humaine n'est encore câblé. |
| **Module 3 : Import des listings de factures CSV/Excel (§15)** | Table `import_batches` & `invoices` | **`NON IMPLÉMENTÉ`** | Les tables SQL `import_batches` et `invoices` existent, mais le modèle téléchargeable, l'analyseur CSV/TSV, le mapping de colonnes, la prévisualisation, la détection de doublons, le rapport d'erreurs par ligne et l'import transactionnel (factures émises, reçues et avoirs) restent à développer. |
| **Module 4 : Saisie comptable (§16)** | [`src/services/accounting-service.ts`](../src/services/accounting-service.ts)<br>[`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts) | **`TERMINÉ ET TESTÉ`** | Livré au Lot 1.5 : partie double stricte multi-lignes, PCG ANC, 5 journaux officiels (VE, AC, BQ, OD, AN), validation humaine explicite (VALIDATE_ACCOUNTING), inaltérabilité des écritures validées, extourne symétrique (REVERSED) et tests SQLite + PostgreSQL 16. |
| **Module 5 : Import et rapprochement bancaire (§17)** | Tables `bank_transactions` & `reconciliation_links` | **`NON IMPLÉMENTÉ`** | Les tables SQL existent et sont testées, mais le parseur CSV/OFX bancaire, la déduplication (`external_dedup_hash`), le moteur de suggestion de rapprochement, le traitement des paiements partiels, le marquage des opérations sans justificatif et l'interface de rapprochement restent à développer. |
| **Module 6 : Contrôles comptables et anomalies (§18)** | [`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts) & table `anomalies` | **`PARTIELLEMENT IMPLÉMENTÉ`** | Les contrôles $\text{HT}+\text{TVA}=\text{TTC}$, validité du taux de TVA et équilibre Débit/Crédit existent en fonctions pures. **Manquent** : les 7 autres règles déterministes (ruptures de séquence, doublons de factures, factures impayées échues, incohérences facture/paiement, dépenses sans justificatif, opérations bancaires non rapprochées, écarts listing/document/écriture), la persistance dans la table `anomalies` et l'écran de suivi/résolution. |
| **Module 7 : Simulations indicatives (§19)** | [`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts)<br>[`src/server.ts`](../src/server.ts) | **`PARTIELLEMENT IMPLÉMENTÉ`** | La route `POST /api/organizations/:orgId/simulate` existe pour `VAT_SUMMARY` et `SOCIAL_CONTRIBUTIONS`, mais les résultats ne sont pas persistés dans `simulations_history`, les simulations d'impôt et d'**impact indicatif d'une dépense** (`EXPENSE_IMPACT`) ne sont pas implémentées, et l'écran UI de simulation n'existe pas encore. |
| **Module 8 : Tableaux de bord Entreprise & Cabinet (§20)** | [`src/services/tenant-service.ts`](../src/services/tenant-service.ts)<br>[`src/ui/app-view.ts`](../src/ui/app-view.ts) | **`PARTIELLEMENT IMPLÉMENTÉ`** | 6 compteurs globaux affichés. **Manquent** : la distinction entre **Vue Entreprise** (factures, paiements, dépenses, échéances, rapprochements en attente, anomalies du dossier) et **Vue Cabinet** (état d'avancement multi-dossiers, pièces en attente, anomalies prioritaires), les états vides pédagogiques et le badge d'identification des données de démonstration. |
| **Module 9 : Exports sécurisés & FEC (§21)** | Aucun | **`NON IMPLÉMENTÉ`** | Aucune route ni interface d'export CSV (factures, banque, écritures, anomalies, validations) ni d'export **FEC** (18 colonnes réglementaires art. L47 A-I LPF) avec protection contre l'injection de formules tableur (`=`, `+`, `-`, `@`). |
| **Validation professionnelle des barèmes fiscaux/sociaux France (§29-30)** | [`src/countries/country-registry.ts`](../src/countries/country-registry.ts) | **`BLOQUÉ PAR UNE VALIDATION EXTERNE`** | La version `FR-2026.1-REV0` reste explicitement en `PENDING_LEGAL_VALIDATION` (`isProductionEnabled: false`) tant qu'un expert-comptable n'a pas validé les seuils et barèmes sociaux/fiscaux. |

---

### 1.3 Résolution explicite de la divergence de palette graphique (Section G de la Directive & Sections 4–5 du Prompt Phase 1)

Lors de la Phase 0, trois variantes proches ont été mentionnées :
1. **Traçabilité Phase 0 (`REQ-002`)** : `#153D35`, `#237D68`, `#D9A441`, fond `#F6F8F7`, texte `#111827`.
2. **Rapport Lot 0.6** : `#153D35`, `#237D68`, `#D9A441`, fond `#F7F6F2`, texte `#1C2421`.
3. **Cahier des charges Phase 1 (Section 4 & Section 5 — Référence officielle retenue)** :
   - **Signature produit** : `ComptaNova — La comptabilité, plus claire.`
   - **Vert profond de marque (`--brand-primary`)** : `#153D35`
   - **Vert d'action (`--brand-action`)** : `#237D68`
   - **Fond général (`--bg-app`)** : `#F7F8FA`
   - **Surface principale (`--bg-surface`)** : `#FFFFFF`
   - **Texte principal (`--text-primary`)** : `#17212B`
   - **Texte secondaire (`--text-secondary`)** : `#64748B`
   - **Bordures (`--border-default`)** : `#E2E8F0`
   - **Accent discret (`--brand-accent`)** : `#D9A441`
   - **Couleurs sémantiques centralisées** :
     - Succès : texte `#166534` / fond `#DCFCE7` / bordure `#22C55E`
     - Avertissement & Suggestion IA : texte `#92400E` / fond `#FEF3C7` / bordure `#D9A441`
     - Erreur / Destructif : texte `#991B1B` / fond `#FEE2E2` / bordure `#EF4444`
     - Information : texte `#1E40AF` / fond `#DBEAFE` / bordure `#3B82F6`
     - Neutre / Brouillon : texte `#475569` / fond `#F1F5F9` / bordure `#CBD5E1`

**Décision d'alignement (Lot 1.1)** : La palette officielle de la **Section 5 du Prompt Phase 1** ci-dessus devient l'unique source de vérité dans [`src/config/app-config.ts`](../src/config/app-config.ts) et dans le Design System CSS, et les tests automatisés seront mis à jour en conséquence.

---

## PARTIE 2 — PLAN DE LIVRAISON INCRÉMENTAL EN 6 LOTS INDÉPENDANTS (SECTION B DE LA DIRECTIVE)

Chaque lot ci-dessous est conçu comme une tranche verticale complète (Base de données $\rightarrow$ Services métier & Sécurité $\rightarrow$ Routes API $\rightarrow$ Interface UX/UI $\rightarrow$ Tests automatisés & Vérification visuelle $\rightarrow$ Documentation & Commit).

---

### LOT 1.1 — Design System, Charte Graphique Unifiée, Navigation Générale (10 entrées) & Module 1 (Gestion complète des Dossiers Clients)

1. **Objectif** : Mettre en place le Design System réutilisable (Partie II, §§4–10), unifier la palette de la Section 5, créer le logo SVG provisoire, structurer l'application autour des 10 entrées de navigation (desktop + mobile) avec sélecteur de **Dossier actif** et de **Période comptable**, et achever de bout en bout le **Module 1 (Gestion des dossiers clients)**.
2. **Périmètre** :
   - Alignement de `appConfig.appTagline` (`"La comptabilité, plus claire."`) et de `appConfig.brandColors` sur la Section 5 (`#153D35`, `#237D68`, `#F7F8FA`, `#FFFFFF`, `#17212B`, `#64748B`, `#E2E8F0`, `#D9A441`).
   - Création d'un module de Design System [`src/ui/design-system.ts`](../src/ui/design-system.ts) fournissant : tokens CSS, logo SVG vectoriel sobre, icônes SVG homogènes (sans emojis), boutons (primaire, secondaire, tertiaire, destructif), badges sémantiques avec icône + libellé, cartes KPI, tableaux triables/filtrables/paginés avec alignement monétaire tabulaire (`font-variant-numeric: tabular-nums`), modales de confirmation, tiroirs latéraux (*drawers*), états vides, états de chargement et bannières d'erreur.
   - Barre latérale desktop + barre de navigation mobile responsive comprenant les 10 sections de la Section 9 (`Tableau de bord`, `Dossiers clients`, `Documents`, `Factures et dépenses`, `Saisie comptable`, `Banque et rapprochements`, `Contrôles et anomalies`, `Simulations`, `Exports et rapports`, `Utilisateurs et paramètres`), où les modules des lots suivants affichent un état explicite « *En cours de déploiement (Lot 1.X)* » sans aucun faux bouton inactif.
   - **Module 1 complet (§13)** :
     - Création, consultation détaillée et **modification** d'un dossier client (raison sociale, SIREN/SIRET, adresse/métadonnées, juridiction, régime fiscal, mois de clôture, statut actif/archivé).
     - Gestion complète des **affectations d'utilisateurs au dossier** (`VIEW`, `UPLOAD`, `EDIT_EXTRACTION`, `VALIDATE_ACCOUNTING`, `EXPORT`) depuis l'interface et l'API.
     - Initialisation automatique du plan comptable (`chart_of_accounts`) et des journaux (`accounting_journals` : `AC`, `VT`, `BQ`, `OD`, `AN`) du dossier à partir de la configuration versionnée du pays (`countryCfg.chartOfAccountsSample` & `standardJournals`).
     - Recherche, filtres (statut actif/archivé, juridiction, régime) et consultation de l'historique d'audit du dossier.
3. **Dépendances** : Fondations Phase 0 (commit `fb52d44`).
4. **Migrations** :
   - Aucune modification destructive : les tables `client_dossiers`, `dossier_assignments`, `chart_of_accounts`, `accounting_journals` et `audit_logs` existent déjà. Si des métadonnées complémentaires de dossier (adresse, email de contact, note d'archivage) sont requises, ajout d'une migration `005_dossier_extended_metadata` purement additive (`ALTER TABLE client_dossiers ADD COLUMN ...`).
5. **API et interfaces concernées** :
   - `GET /api/organizations/:orgId/dossiers` (avec filtre `?status=active|archived|all&q=...`)
   - `POST /api/organizations/:orgId/dossiers` (avec initialisation transactionnelle du PCG et des journaux du dossier)
   - `PUT /api/organizations/:orgId/dossiers/:dossierId` (modification et archivage/réactivation)
   - `GET /api/organizations/:orgId/dossiers/:dossierId/assignments` & `PUT /api/organizations/:orgId/dossiers/:dossierId/assignments` (permissions par utilisateur)
   - `GET /api/organizations/:orgId/dossiers/:dossierId/history` (journal d'audit scopé au dossier)
6. **Règles métier** :
   - Un dossier contenant des écritures validées ou des pièces soumises à conservation légale (10 ans) ne peut jamais être supprimé physiquement : il peut uniquement être **archivé** (`is_active = 0`) avec justification tracée.
   - Les taux et régimes proviennent exclusivement de la version de configuration pays reliée au dossier (`country_config_version_id`).
7. **Contrôles de sécurité** :
   - Vérification `assertOrganizationAccess` (`FIRM_ADMIN` ou `CLIENT_DIRECTOR` pour modifier/archiver un dossier ; `FIRM_ADMIN` pour modifier les affectations) et `assertDossierAccess` (`VIEW` pour consulter).
   - Isolation stricte inter-organisations (`403`) et audit systématique des modifications/archivages de dossiers (`CLIENT_DOSSIER_UPDATED`, `CLIENT_DOSSIER_ARCHIVED`).
8. **Tests automatisés** :
   - Suite `src/tests/phase1-lot1-dossiers-ui.test.ts` : création de dossier + vérification de l'initialisation automatique des comptes PCG et journaux, modification, affectation granulaire d'un collaborateur, archivage avec audit, rejet `403` inter-tenant et collaborateur non autorisé.
9. **Tests UX/UI** :
   - Vérification de l'injection des 8 tokens de la Section 5 (`#153D35`, `#237D68`, `#F7F8FA`, `#FFFFFF`, `#17212B`, `#64748B`, `#E2E8F0`, `#D9A441`), du logo SVG, du sélecteur de dossier actif en en-tête, de la modale de confirmation d'archivage et de la responsivité mobile/tablette/desktop.
10. **Critères d'acceptation** :
    - Tous les composants du Design System sont opérationnels ; le Module 1 passe à **`TERMINÉ ET TESTÉ`** ; aucune régression sur les 22 tests existants.
11. **Risques et limitations** :
    - Les modules 2 à 9 dans la barre latérale affichent un état explicite « *Bientôt disponible (Lots 1.2 à 1.6)* » jusqu'à leur livraison respective.
12. **Conditions de passage au Lot 1.2** :
    - `npm run typecheck && npm test` à 100 %, migration `005` réversible documentée, et validation du Lot 1.1.

---

### LOT 1.2 — Module 2 : Documents Privés, Extraction IA (`mock-deterministic` & Abstraction), Revue Côte-à-Côte, Correction Manuelle & Validation Humaine

1. **Objectif** : Livrer de bout en bout le **Module 2 (§14)** : téléversement réel de pièces (PDF, PNG, JPEG), stockage privé sur disque, extraction structurée avec score de confiance par champ et détection de doublons, interface de **revue documentaire côte-à-côte** (aperçu du document à gauche / formulaire des champs extraits à droite), correction manuelle en brouillon et validation humaine créant ou mettant à jour la facture associée.
2. **Périmètre** :
   - Écriture physique sécurisée des fichiers téléversés dans `./storage/private-documents/<orgId>/<dossierId>/<docId>-<safeName>` et téléchargement privé via jeton signé `HMAC-SHA256` (`GET /api/documents/download?token=...`).
   - Enrichissement de `DeterministicMockAiAdapter` ([`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts)) pour extraire dynamiquement les montants HT/TVA/TTC, dates, numéro de facture, émetteur/destinataire, devise et lignes présents dans le contenu du document tout en conservant `isSimulatedTestAdapter: true` et la défense anti-prompt injection.
   - Gestion du cas d'indisponibilité ou d'échec d'un fournisseur IA : le document est stocké en statut `STORED` avec un avertissement explicite permettant la saisie manuelle sans bloquer l'utilisateur.
   - Interface de revue côte-à-côte (split-view sur ordinateur, empilée sur mobile) distinguant visuellement :
     - `PROPOSED_BY_AI` (badge ambre IA + score indicatif),
     - `NEEDS_HUMAN_REVIEW` (champ incertain mis en évidence pour vérification),
     - `CORRECTED` (corrigé manuellement par l'utilisateur),
     - `VALIDATED` (`VALIDATED_BY_HUMAN` avec création transactionnelle de la ligne dans `invoices` et contrôle déterministe $\text{HT}+\text{TVA}=\text{TTC}$).
3. **Dépendances** : Lot 1.1 (Design System & Dossier actif).
4. **Migrations** :
   - Utilisation des tables existantes `documents`, `invoices`, `third_parties` et `anomalies` (ajout optionnel d'une colonne `extraction_history_json` sur `documents` via migration `006` pour tracer chaque correction champ par champ avant validation).
5. **API et interfaces concernées** :
   - `GET /api/organizations/:orgId/dossiers/:dossierId/documents` (liste filtrable par catégorie et statut de workflow)
   - `POST /api/organizations/:orgId/dossiers/:dossierId/documents` (upload JSON/base64 ou multipart, validation MIME & taille $\le 15\text{ Mo}$, calcul `SHA-256`, détection de doublon, extraction IA)
   - `GET /api/organizations/:orgId/dossiers/:dossierId/documents/:docId` (métadonnées, extraction, historique et URL signée temporaire de prévisualisation)
   - `GET /api/documents/download?token=...` (lecture binaire privée protégée par `verifySignedDocumentDownloadToken`)
   - `PATCH /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/extraction` (sauvegarde brouillon des corrections manuelles — permission `EDIT_EXTRACTION`)
   - `POST /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/validate` (validation humaine finale — permission `VALIDATE_ACCOUNTING` — créant la facture dans `invoices` et exécutant `checkInvoiceAmountsDeterministically`)
6. **Règles métier** :
   - Aucune donnée extraite par l'IA n'est jamais marquée `VALIDATED` sans action explicite d'un utilisateur disposant de la permission `VALIDATE_ACCOUNTING`.
   - Si un doublon `SHA-256` ou un doublon de couple `(third_party_name, invoice_number)` est détecté dans le dossier, une alerte explicite est affichée et la double soumission accidentelle est bloquée sauf confirmation justifiée.
7. **Contrôles de sécurité** :
   - Contrôle strict des permissions par dossier : `UPLOAD` pour déposer, `VIEW` pour consulter/télécharger, `EDIT_EXTRACTION` pour corriger, `VALIDATE_ACCOUNTING` pour valider.
   - Protection contre la traversée de chemin (*path traversal*), vérification MIME et taille, et test d'accès croisé au lien de téléchargement signé d'une autre organisation (`403`).
8. **Tests automatisés** :
   - Suite `src/tests/phase1-lot2-documents-ai.test.ts` : upload valide (PDF/PNG), rejet MIME/taille invalide, détection de doublon `SHA-256`, comportement en cas d'échec du fournisseur IA, correction manuelle d'un champ incertain, refus de validation par un collaborateur sans droit `VALIDATE_ACCOUNTING` (`403`), validation par un utilisateur autorisé et persistance de la facture créée.
9. **Tests UX/UI** :
   - Vérification de la vue côte-à-côte (aperçu document + formulaire d'extraction), des badges d'incertitude IA vs corrigé manuellement vs validé humainement, et de l'empilement vertical sur mobile.
10. **Critères d'acceptation** :
    - Le Module 2 et le stockage documentaire privé passent au statut **`TERMINÉ ET TESTÉ`** (l'adaptateur local `mock-deterministic` restant explicitement identifié comme **`SIMULÉ`**).
11. **Risques et limitations** :
    - En l'absence de clé API externe OpenAI/Anthropic en environnement local, l'extraction utilise `mock-deterministic` (clairement signalé dans l'interface par une bannière dédiée).
12. **Conditions de passage au Lot 1.3** :
    - `npm run typecheck && npm test` à 100 %, persistance disque + base vérifiée après rechargement.

---

### LOT 1.3 — Module 4 : Facturation, Devis, Transformation contrôlée et Aperçu imprimable (Mentions LPF, Calculs monétaires & Spécifications Factur-X / PDP distinctes)

1. **Objectif** : Implémenter intégralement le **Module 4 (Facturation et Devis, §12)** : création et édition de devis et factures, transformation contrôlée d'un devis en facture (sans duplication ni perte de traçabilité), gestion des tiers, lignes, quantités, prix unitaires, remises et taxes, numérotation chronologique continue et infalsifiable, gestion des règlements, mentions légales obligatoires selon profil client (LPF), aperçu imprimable, et cadrage rigoureux en 3 niveaux de la facturation électronique (Facture classique, Factur-X XML hybride, et connectivité PDP en périmètre distinct).
2. **Périmètre fonctionnel** :
   - **Devis (`quotes`)** : Création, modification, lignes d'articles/prestations (quantité, prix unitaire HT en centimes, remise, taux de TVA, montant HT, TVA, TTC calculés exactement sans flottants), suivi des statuts (`DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED`).
   - **Factures de vente (`invoices` émis - direction `ISSUED`) & Avoirs (`CREDIT_NOTE`)** :
     - Création directe ou par conversion de devis.
     - Suivi des statuts : `DRAFT`, `FINALIZED` (émise / verrouillée), `PAID` (soldée), `PARTIALLY_PAID`, `CANCELLED` (annulée par avoir).
   - **Transformation contrôlée Devis $\rightarrow$ Facture** :
     - Conversion atomique : création d'une nouvelle facture liée (`origin_quote_id`), bascule du devis à l'état `CONVERTED` (`converted_to_invoice_id`, `converted_at`).
     - Interdiction stricte de re-transformer un devis déjà converti sans action ou alerte explicite.
   - **Numérotation continue et traçable** :
     - Numérotation propre au dossier et chronologique (ex: `FAC-2026-0001`, `DEV-2026-0001`, `AV-2026-0001`).
     - Aucun trou de numérotation toléré sur les factures émises (`FINALIZED`).
     - Interdiction de suppression physique ou de modification d'une facture finalisée : toute correction s'effectue obligatoirement par émission d'un **Avoir (`CREDIT_NOTE`)** traçable.
   - **Gestion des règlements** :
     - Enregistrement des paiements (date, mode de règlement, référence, montant payé partiel ou total, solde restant dû).
   - **Mentions légales obligatoires françaises (Livre des Procédures Fiscales & Code de Commerce)** :
     - Mentions de l'émetteur : Raison sociale, forme juridique, SIREN/SIRET, RCS/RM, TVA intracommunautaire, adresse du siège.
     - Mentions du client : Nom/raison sociale, adresse de facturation, SIREN/TVA intracommunautaire si B2B.
     - Mentions fiscales : Taux de TVA ventilés, mention d'exonération ou de franchise si applicable (« *TVA non applicable, art. 293 B du CGI* » pour micro-entreprises).
     - Conditions de règlement : Date d'échéance, pénalités de retard (taux légal BCE + 10 points ou 3 fois le taux d'intérêt légal), et indemnité forfaitaire pour frais de recouvrement de 40 € (B2B, art. D441-5 C. com.).
   - **Aperçu imprimable** :
     - Rendu HTML propre pour impression (format A4 avec styles CSS d'impression `@media print`), récapitulatif complet de TVA par taux, et mentions légales obligatoires.
    - **Architecture Facturation Électronique (Factur-X / PDP) en 3 niveaux stricts** :
      - **Niveau 1** : Facture classique générée par ComptaNova (visualisation HTML imprimable `@media print` A4 avec mentions LPF obligatoires).
      - **Niveau 2** : Fichier Factur-X hybride — **Génération XML préliminaire** (génération du flux XML syntaxique selon la structure EN 16931 sous profil `MINIMUM`, `BASIC` ou `EN16931`). Jusqu'à la validation par des tiers certificateurs et l'incorporation dans un conteneur PDF/A-3 certifié, cette fonctionnalité est rigoureusement qualifiée de « *génération XML préliminaire* » et non de « *Factur-X certifié conforme* ».
      - **Niveau 3** : Transmission et réception via Plateforme de Dématérialisation Partenaire (PDP) ou Portail Public de Facturation (PPF) : ComptaNova n'étant PAS une PDP agréée, cette connectivité fait l'objet d'un périmètre distinct d'intégration future (voir section dédiée ci-après).

---

### PÉRIMÈTRE DISTINCT — RÉFORME FRANÇAISE DE LA FACTURATION ÉLECTRONIQUE (PDP / PPF, STATUTS DU CYCLE DE VIE ET E-REPORTING)

1. **Qualification juridique et technique** : ComptaNova est un logiciel d'assistance comptable et de facturation, et **n'est pas une Plateforme de Dématérialisation Partenaire (PDP) agréée** au sens de l'article 290 B du Code général des impôts.
2. **Périmètres exclus du cœur applicatif immédiat et réservés aux modules d'interconnexion futurs** :
   - **Réception des factures électroniques** : La réception légale obligatoire des flux Factur-X, UBL ou CII via raccordement direct au PPF ou via une PDP partenaire.
   - **Suivi des statuts du cycle de vie de la facture électronique** : Gestion des 4 statuts obligatoires (`DÉPÔT`, `ACHEMINEMENT`, `APPROBATION` / `REFUS`, `PAIEMENT`) et des statuts intermédiaires recommandés par la DGFIP.
   - **Exigences d'e-Reporting** : Transmission automatisée des données de transaction (ventes B2C et transactions internationales B2B) et des données de paiement (prestations de services) à l'administration fiscale.
   - **Conteneur PDF/A-3 certifié** : Fusion binaire conforme à la norme ISO 19005-3 intégrant la pièce jointe `factur-x.xml` validée par l'outil de conformité de l'AFEOR / FNFE-MPE.
3. **Conséquence opérationnelle** : La génération de devis, factures et fichiers XML par ComptaNova ne dispense pas l'entreprise utilisatrice de se conformer aux obligations légales de la réforme par le choix d'une plateforme agréée (PDP) ou du portail public (PPF) pour l'échange de ses factures inter-entreprises.

---

### LOT 1.4 — Module 2 : Tableaux de Bord et Indicateurs de Pilotage (Vue Entreprise & Vue Cabinet, Données 100% Persistées, Filtres Période & Liens d'Action)

1. **Objectif** : Implémenter intégralement le tableau de bord décisionnel de pilotage : calcul en temps réel d'indicateurs financiers, documentaires et comptables issus **exclusivement de données réelles persistées** (sans aucune donnée simulée ou fictive en production), filtres cohérents par dossier et période d'activité, distinction nette Vue Entreprise (dossier) / Vue Cabinet (multi-dossiers), alertes prioritaires cliquables redirigeant directement vers les pièces sources (documents à traiter, factures impayées, anomalies ouvertes), et gestion des 5 états d'interface obligatoires.
2. **Périmètre fonctionnel** :
   - **Indicateurs financiers réels et traçables** :
     - Chiffre d'affaires facturé HT, TVA collectée, Total TTC (somme des factures de vente finalisées et payées de la période, déduction faite des avoirs émis).
     - Encaissements réels constatés (règlements enregistrés de la période).
     - Créances clients / Solde restant dû (factures non soldées, mise en évidence des factures en retard avec calcul des jours d'arriéré).
     - Devis de vente en cours (nombre, statut `DRAFT`/`SENT`/`ACCEPTED`/`CONVERTED`, montant cumulé et taux de transformation en facture).
     - Dépenses fournisseurs validées de la période (montants HT et TVA extraits et validés).
   - **Indicateurs documentaires et comptables réels** :
     - Pièces en attente de revue (`RECEIVED`, `EXTRACTED`, `PENDING_REVIEW`, `CORRECTED`) et pièces rejetées (`REJECTED`).
     - Statut des écritures comptables du dossier (brouillons vs validées, vérification d'équilibre Débit = Crédit).
     - Anomalies ouvertes prioritaires (distinctes entre erreurs bloquantes `is_certain_error = 1` et alertes à vérifier).
   - **Filtres par période et contexte** :
     - Exercice fiscal en cours, mois sélectionné, trimestre, ou plage personnalisée (`startDate`, `endDate`).
     - Filtrage strict selon les permissions de l'utilisateur connecté sur le dossier.
   - **Liens d'action prioritaires (*Actionable Alerts*)** :
     - Liens directs vers l'onglet Documents avec filtre pré-appliqué sur les pièces à réviser.
     - Liens directs vers l'onglet Factures pour relance des factures impayées/échues.
     - Liens directs vers les anomalies ouvertes nécessitant une action corrective.
   - **Vue Cabinet (synthèse du portefeuille pour les experts/collaborateurs)** :
     - Vue consolidée des dossiers actifs : nombre de pièces en souffrance, anomalies critiques, échéances de déclaration.
   - **Transparence et avertissements** :
     - Mention explicite : *« Indicateurs calculés sur données persistées à titre de pilotage de gestion — ne constituent pas des états financiers certifiés ni un bilan comptable audité. »*
3. **Dépendances** : Lots 1.1, 1.2, 1.3 (tables `client_dossiers`, `invoices`, `quotes`, `invoice_payments`, `documents`, `accounting_entries`, `anomalies`).
4. **Migrations** : Aucune nouvelle table requise (agrégations optimisées sur les tables existantes avec index appropriés).
5. **API REST exposées** :
   - `GET /api/organizations/:orgId/dashboard` : Métriques consolidées du cabinet (dossiers, pièces en attente, alertes).
   - `GET /api/organizations/:orgId/dossiers/:dossierId/dashboard` : Métriques détaillées du dossier avec paramètres de période `?periodType=...&year=...&month=...&quarter=...&startDate=...&endDate=...`.
6. **Règles métier & sécurité** :
   - Aucune estimation non confirmée présentée comme un résultat comptable certifié.
   - Contrôle d'accès RBAC (`assertDossierAccess`) : vérification des droits de consultation sur le dossier.
   - Isolation multi-tenant stricte : un utilisateur de l'organisation A ne peut pas recevoir d'indicateurs de l'organisation B.
7. **Critères d'acceptation** :
   - 100% des indicateurs proviennent d'enregistrements SQL réels persistés.
   - Les totaux financiers concordent au centime près avec la somme des lignes de factures et règlements.
   - Les 5 états UI (chargement, données disponibles, état vide pédagogique, erreur, accès interdit) sont gérés.
   - Tests automatisés couvrant les calculs, les filtres, l'isolation et les permissions (11 sous-tests dans `src/tests/phase1-lot1-4.test.ts`).
   - Le Module 2 passe au statut **`TERMINÉ ET TESTÉ`** (Commit `f65fae8`).

---

### LOT 1.5 — Module 5 : Saisie Comptable et Journaux (Partie Double, PCG Français, 5 Journaux VE/AC/BQ/OD/AN, Validation Humaine Inaltérable et Extourne Contrôlée)

1. **Objectif** : Implémenter intégralement la saisie comptable en partie double (§16), le respect strict du Plan Comptable Général (PCG), les 5 journaux officiels français (`VE`, `AC`, `BQ`, `OD`, `AN`), le workflow de brouillons/suggestions IA, la validation formelle avec contrôle RBAC `VALIDATE_ACCOUNTING`, l'inaltérabilité des écritures validées et la procédure d'extourne symétrique avec liaison bidirectionnelle.
2. **Périmètre fonctionnel** :
   - **Partie double stricte en centimes** : Invariant absolu $\sum \text{Débit} = \sum \text{Crédit} > 0$ en unités mineures entières (aucun flottant).
   - **PCG et 5 journaux officiels** : Validation de l'existence des comptes dans le plan du dossier client (`chart_of_accounts`) ; prise en charge complète des 5 journaux `VE` (Ventes), `AC` (Achats), `BQ` (Banque), `OD` (Opérations Diverses), `AN` (À-Nouveau / Réouverture).
   - **Statuts d'écriture et cycle de vie** : `DRAFT`, `AI_SUGGESTION`, `VALIDATED`, `REVERSED`.
   - **Validation humaine formelle** : Contrôle RBAC strict côté serveur (`VALIDATE_ACCOUNTING` / `can_validate_accounting`), enregistrement du valideur (`validated_by_user_id`) et de l'horodatage (`validated_at`).
   - **Inaltérabilité & Extourne contrôlée** : Blocage absolu des modifications et suppressions sur écritures validées ; annulation exclusive par extourne comptable symétrique créant une contre-écriture liée (`reversal_of_entry_id`) avec statut `REVERSED` sur l'écriture d'origine.
   - **Interface utilisateur** : Livre-journal avec filtres multi-critères, synthèse financière et contrôle de balance, formulaire de saisie au kilomètre dynamique avec équilibre en temps réel, zéro couleur hexadécimale codée en dur.
3. **Statut** : **`TERMINÉ ET TESTÉ`** (Commit `0b67ae4` — Suite `src/tests/phase1-lot1-5.test.ts` à 11 sous-tests, 100% de réussite sur SQLite et PostgreSQL 16).

---

### LOT 1.6 — Modules 5 & 6 : Import Bancaire (CSV & OFX), Rapprochement Bancaire Assisté/Manuel et Moteur de Contrôles Comptables & Anomalies (10 Règles)

1. **Objectif** : Implémenter de bout en bout le **Module 5 (Import et rapprochement bancaire, §17)** et le **Module 6 (Contrôles comptables et anomalies, §18)**.
2. **Périmètre** :
   - **Module 5 — Import et rapprochement bancaire (§17)** :
     - Import de relevés bancaires aux formats **CSV** (colonnes paramétrables : date d'opération, date de valeur, libellé, montant unique signé ou colonnes Débit/Crédit séparées, référence, IBAN) et **OFX** (balises SGML/XML `<STMTTRN>`, `<DTPOSTED>`, `<TRNAMT>`, `<FITID>`, `<NAME>`, `<MEMO>`).
     - Détection stricte des opérations en double via `external_dedup_hash` (`SHA-256` normalisé sur date + montant + libellé/FITID) et idempotence du fichier via `import_batches`.
     - Moteur déterministe de **suggestions de rapprochement** (`SUGGESTED_BY_AI` / `PROPOSED_BY_AI`) comparant les transactions bancaires non rapprochées avec les factures du dossier (montant exact ou partiel, référence de pièce dans le libellé, nom du tiers, proximité de date) avec score de confiance explicite.
     - Actions utilisateur dans l'interface `Banque et rapprochements` :
       1. **Confirmer** un rapprochement proposé (`VALIDATED_BY_HUMAN`),
       2. **Rejeter** une proposition (`REJECTED`),
       3. **Rapprocher manuellement** une transaction avec une ou plusieurs factures,
       4. **Traiter un paiement partiel** (`allocated_amount_minor < gross_amount_minor` $\rightarrow$ facture en `PARTIALLY_PAID` et transaction en `PARTIALLY_RECONCILED`, passage de la facture à `PAID` uniquement lorsque $\sum \text{alloué} = \text{TTC}$),
       5. **Marquer une opération comme frais bancaires ou nécessitant un justificatif** (`BANK_FEE_OR_NO_RECEIPT_FLAGGED`).
   - **Module 6 — Moteur de contrôles comptables déterministe & Anomalies (§18)** :
     - Implémentation des **10 règles déterministes** exigées par la Section 18 dans [`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts) :
       1. Incohérence arithmétique de TVA ($\text{HT}+\text{TVA}\neq\text{TTC}$ ou taux invalide) — *Erreur certaine*,
       2. Écriture comptable déséquilibrée — *Erreur certaine*,
       3. Doublons potentiels de documents ou de factures (même tiers + même numéro ou même montant/date) — *Suspicion à vérifier*,
       4. Rupture de séquence dans la numérotation des factures émises (`FAC-2026-001`, `FAC-2026-003` sans `002`) — *Suspicion à vérifier*,
       5. Factures potentiellement manquantes (opération bancaire débitrice/créditrice sans facture ni justificatif associé) — *Suspicion à vérifier*,
       6. Dépenses sans justificatif documentaire (`invoices` reçues sans `document_id` rattaché) — *Suspicion à vérifier*,
       7. Écarts de montant entre une facture et le document extrait associé — *Erreur certaine / Suspicion*,
       8. Incohérences entre factures et paiements rapprochés (montant alloué supérieur au TTC ou devise discordante) — *Erreur certaine*,
       9. Factures impayées dont la date d'échéance (`due_date`) est dépassée — *Alerte à vérifier*,
       10. Opérations bancaires anciennes non rapprochées et écarts entre listing de factures et écritures comptables — *Alerte à vérifier*.
     - Persistance des anomalies détectées dans la table `anomalies` (sans créer de doublons d'anomalies ouvertes pour la même cible et la même règle) et workflow de traitement dans l'onglet `Contrôles et anomalies` : filtre par gravité/statut/catégorie, lien direct vers la pièce/facture/transaction, résolution par correction (`RESOLVED_BY_CORRECTION`) ou classement avec justification obligatoire (`DISMISSED_WITH_JUSTIFICATION`), et historique complet dans `history_json`.
3. **Dépendances** : Lots 1.1 à 1.4.
4. **Migrations** :
   - Les tables `bank_transactions`, `reconciliation_links` et `anomalies` existent déjà dans la migration `003`.
5. **API et interfaces concernées** :
   - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/import` (CSV ou OFX)
   - `GET /api/organizations/:orgId/dossiers/:dossierId/bank/transactions` (avec candidats de rapprochement et historique)
   - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/reconcile` (confirmation de proposition, rapprochement manuel ou paiement partiel)
   - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/transactions/:txId/reject-suggestion`
   - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/transactions/:txId/flag-no-receipt`
   - `POST /api/organizations/:orgId/dossiers/:dossierId/anomalies/scan` (exécution déterministe des 10 règles sur les données du dossier)
   - `GET /api/organizations/:orgId/dossiers/:dossierId/anomalies`
   - `POST /api/organizations/:orgId/dossiers/:dossierId/anomalies/:anomalyId/resolve`
6. **Règles métier** :
   - Une facture n'est jamais marquée `PAID` sur une simple suggestion automatique : seule une confirmation humaine (`VALIDATED_BY_HUMAN`) met à jour `paid_amount_minor` et `payment_status` (`PARTIALLY_PAID` ou `PAID`).
   - Distinction stricte entre erreur certaine (`is_certain_error = 1`) et alerte nécessitant vérification (`is_certain_error = 0`), sans jamais qualifier une anomalie de « fraude ».
7. **Contrôles de sécurité** :
   - Vérification des permissions par dossier (`UPLOAD` pour importer la banque, `VALIDATE_ACCOUNTING` pour confirmer un rapprochement ou clore une anomalie), transactions SQL atomiques et audit complet.
8. **Tests automatisés** :
   - Suite `src/tests/phase1-lot5-bank-and-anomalies.test.ts` : import bancaire CSV et OFX, détection des opérations bancaires dupliquées, suggestion automatique de rapprochement, paiement partiel (2 virements de 600 € pour une facture de 1 200 € $\rightarrow$ `PARTIALLY_PAID` puis `PAID`), rejet de proposition, marquage sans justificatif, exécution du scan des 10 règles d'anomalies et résolution motivée d'une anomalie.
9. **Tests UX/UI** :
   - Interfaces `Banque et rapprochements` et `Contrôles et anomalies` vérifiées sur ordinateur et mobile.
10. **Critères d'acceptation** :
    - Les Modules 5 et 6 passent au statut **`TERMINÉ ET TESTÉ`**.
11. **Risques et limitations** :
    - L'agrégation bancaire temps réel DSP2 (Bridge / Powens) n'est pas incluse dans le MVP Phase 1 (import par fichiers CSV/OFX).
12. **Conditions de passage au Lot 1.6** :
    - `npm run typecheck && npm test` à 100 %.

---

### LOT 1.6 — Modules 7, 8 & 9 : Simulations Indicatives Versionnées, Tableaux de Bord Entreprise/Cabinet, Exports Sécurisés (CSV & FEC) et Parcours E2E 17 Étapes

1. **Objectif** : Finaliser le MVP Phase 1 en livrant le **Module 7 (Simulations indicatives persistées, §19)**, le **Module 8 (Tableaux de bord Entreprise & Cabinet sur données réelles, §20)**, le **Module 9 (Exports sécurisés CSV anti-injection & FEC testé, §21)** et le **test d'intégration de bout en bout couvrant les 17 étapes de la Section 36**.
2. **Périmètre** :
   - **Module 7 — Simulations indicatives (§19)** :
     - Prise en charge des 4 types de simulations dans [`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts) :
       1. `VAT_SUMMARY` (TVA collectée, déductible, solde net à partir des données saisies ou des factures du dossier),
       2. `SOCIAL_CONTRIBUTIONS` (cotisations sociales des indépendants : bloqué explicitement avec liste des paramètres manquants lorsque le barème du régime est `PENDING_LEGAL_VALIDATION` / `isVerified: false`, ou calculé à titre indicatif si la version de test/historique fournit un taux vérifié),
       3. `INCOME_OR_CORPORATE_TAX` (impôt selon le régime pris en charge, soumis au même verrou de validation réglementaire),
       4. `EXPENSE_IMPACT` (impact indicatif d'une nouvelle dépense HT + TVA sur la trésorerie, la TVA nette et le résultat avant impôt).
     - Persistance de chaque simulation dans la table `simulations_history` (conservant les paramètres saisis, les hypothèses, les limites, le `rule_version_id` et la mention légale obligatoire : « *Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable. Seul votre expert-comptable est habilité à valider vos choix fiscaux.* »).
     - Recalcul avec de nouvelles hypothèses en créant une nouvelle entrée historique sans jamais écraser les simulations précédentes.
   - **Module 8 — Tableaux de bord Entreprise & Cabinet (§20)** :
     - **Vue Entreprise / Dossier (`COMPANY` / `SOLE_PROPRIETOR` ou dossier sélectionné)** : chiffre d'affaires facturé, dépenses, encaissements/décaissements rapprochés, factures en attente de paiement et échéances connues, documents à réviser, rapprochements en attente, anomalies ouvertes par gravité, dernière simulation indicative.
     - **Vue Cabinet (`ACCOUNTING_FIRM`)** : vue consolidée multi-dossiers affichant pour chaque dossier client du cabinet le nombre de pièces en attente, les anomalies critiques/à vérifier, les rapprochements non résolus, les écritures en attente de validation et le statut de traitement global.
     - États vides pédagogiques (« *Aucun document importé dans ce dossier — Commencez par déposer une facture ou importer un listing CSV* ») et badge explicite `DONNÉES DE DÉMONSTRATION` lorsque le dossier provient du seed de démo.
   - **Module 9 — Exports sécurisés CSV & FEC (§21)** :
     - Exports CSV encodés en UTF-8 (avec BOM optionnel) pour : (1) listing des factures, (2) transactions bancaires et rapprochements, (3) écritures comptables, (4) rapport d'anomalies, (5) historique des validations et piste d'audit.
     - **Protection anti-injection de formules tableur (CSV Injection / DDE)** : toute cellule texte commençant par `=`, `+`, `-`, `@`, `\t` ou `\r` est systématiquement neutralisée par préfixage (`'`) lors de la génération CSV.
     - **Export FEC (Fichier des Écritures Comptables — art. L47 A-I LPF)** : génération des 18 colonnes normalisées (`JournalCode`, `JournalLib`, `EcritureNum`, `EcritureDate`, `CompteNum`, `CompteLib`, `CompAuxNum`, `CompAuxLib`, `PieceRef`, `PieceDate`, `EcritureLib`, `Debit`, `Credit`, `EcritureLet`, `DateLet`, `ValidDate`, `Montantdevise`, `Idevise`) uniquement pour les écritures au statut `VALIDATED` d'un dossier français (`FR`), avec contrôles préalables bloquants (aucune écriture déséquilibrée, dates `YYYYMMDD` valides, présence de `ValidDate`) et avertissement explicite que la conformité fiscale définitive du FEC dépend de la clôture et de la validation par l'expert-comptable.
3. **Dépendances** : Lots 1.1 à 1.5.
4. **Migrations** :
   - La table `simulations_history` existe déjà (migration `001`).
5. **API et interfaces concernées** :
   - `POST /api/organizations/:orgId/dossiers/:dossierId/simulations` & `GET /api/organizations/:orgId/dossiers/:dossierId/simulations`
   - `GET /api/organizations/:orgId/dashboard` (enrichi avec vue Cabinet multi-dossiers) & `GET /api/organizations/:orgId/dossiers/:dossierId/dashboard` (vue Entreprise détaillée + période de référence)
   - `GET /api/organizations/:orgId/dossiers/:dossierId/exports/:exportType` (`invoices-csv`, `bank-csv`, `entries-csv`, `anomalies-csv`, `validations-csv`, `fec-txt`) — protégé par la permission `EXPORT`.
6. **Règles métier** :
   - Tout export trace un événement `DATA_EXPORTED` dans `audit_logs`.
   - Un collaborateur ayant `can_export = 0` sur le dossier reçoit `403 Forbidden` sur toutes les routes d'export.
7. **Contrôles de sécurité** :
   - Vérification de `assertDossierAccess(..., permission: "EXPORT")`, test d'accès croisé inter-tenant (`403`) sur tous les exports et test unitaire de neutralisation des formules CSV dangereuses (`=CMD|...`, `+SUM(...)`, `@IMPORT(...)`).
8. **Tests automatisés** :
   - Suite `src/tests/phase1-lot6-simulations-exports-e2e.test.ts` :
     - Tests unitaires et d'intégration des simulations (`VAT_SUMMARY`, `SOCIAL_CONTRIBUTIONS` bloqué sur règles non validées, `EXPENSE_IMPACT`, persistance historique), des tableaux de bord Entreprise/Cabinet, de la neutralisation CSV Injection, du refus d'export sans permission `EXPORT` (`403`) et de la structure des 18 colonnes de l'export FEC.
     - **Test E2E complet des 17 étapes de la Section 36** avec persistance vérifiée et rechargement serveur.
9. **Tests UX/UI** :
   - Vérification visuelle complète des 10 écrans de l'application sur les 5 résolutions de la Section 11 (petit mobile `360px`, grand mobile `414px`, tablette `768px`, portable `1280px`, grand écran `1920px`).
10. **Critères d'acceptation & Clôture Phase 1** :
    - Les Modules 7, 8 et 9 passent au statut **`TERMINÉ ET TESTÉ`** ; rédaction du **Rapport Final Obligatoire de Phase 1 (Section 38)** dans `docs/PHASE1_FINAL_REPORT.md`.

---

## PARTIE 3 — RÉCAPITULATIF DE L'ORDRE D'EXÉCUTION ET SUIVI D'AVANCEMENT

| Lot | Périmètre et Modules couverts | Tests automatisés associés | Statut d'avancement |
| :--- | :--- | :--- | :---: |
| **Lot 1.1** | Design System officiel §5, Layout 10 entrées §8 & **Module 1 (Gestion complète des dossiers clients §9)** | `phase1-lot1-1.test.ts` (4 sous-tests) | **TERMINÉ ET VÉRIFIÉ** (`4bd790c`) |
| **Lot 1.2** | **Module 3 (Collecte documentaire, validation fichiers, stockage privé, OCR & 6 statuts §14)** | `phase1-lot1-2.test.ts` (8 sous-tests) | **TERMINÉ ET VÉRIFIÉ** (`ef6625d` / `bf9e397`) |
| **Lot 1.3** | **Module 4 (Facturation des ventes, Devis, Transformation, Règlements, Factur-X préliminaire §12)** | `phase1-lot1-3.test.ts` (12 sous-tests) | **TERMINÉ ET VÉRIFIÉ** (`cc4dcb3`) |
| **Lot 1.4** | **Module 2 (Tableaux de bord et indicateurs de pilotage, Données 100% persistées, Filtres période & Liens §20)** | `phase1-lot1-4.test.ts` (8 sous-tests) | **EN COURS D'EXÉCUTION** |
| **Lot 1.5** | **Module 5 (Saisie comptable multi-lignes en partie double, PCG/Journaux, Modèles, Validation & Extourne §16)** | `phase1-lot1-5.test.ts` | Planifié après Lot 1.4 |
| **Lot 1.6** | **Module 6 (Import CSV/OFX & Rapprochement bancaire §17)** + **Module 7 (10 Règles de Contrôles & Anomalies §18)** | `phase1-lot1-6.test.ts` | Planifié après Lot 1.5 |
| **Lot 1.7** | **Module 8 (Simulations indicatives §19)** + **Module 9 (Exports CSV/FEC §21)** + **Parcours E2E 17 étapes (§36)** | `phase1-lot1-7.test.ts` | Clôture Phase 1 |
