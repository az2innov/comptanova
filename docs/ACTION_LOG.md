# JOURNAL CHRONOLOGIQUE DES ACTIONS DE DÉVELOPPEMENT (`ACTION_LOG`) — ComptaNova

> **Avertissement** : Ce document constitue la documentation d'ingénierie et de traçabilité des actions de développement et d'audit réalisées sur le dépôt. Il est distinct du journal d'audit applicatif (`audit_logs` en base de données, géré par [`src/audit/audit-service.ts`](../src/audit/audit-service.ts)). Aucun secret, mot de passe réel ou jeton d'accès n'y est enregistré.

---

### `ACT-0001` — Audit initial de l'environnement et initialisation du socle TypeScript / Node.js 22
- **Date et heure** : 2026-10-18 12:30 – 12:36 (+01:00)
- **Lot concerné** : `LOT-0.1-PHASE0-FOUNDATIONS`
- **Action effectuée** : Inspection du répertoire `/home/bse/Documents/ComptaNova`, vérification de `Node.js v22.22.0` (`node:sqlite`, `node:test`) et création de `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `src/config/app-config.ts`.
- **Commandes utilisées** : `node -v`, `npm install`, `npm run typecheck`.
- **Résultat observé** : Compilation TypeScript stricte sans erreur.

---

### `ACT-0002` — Implémentation du cœur métier, de l'authentification, du RBAC, de l'audit SHA-256 et de la migration `001`
- **Date et heure** : 2026-10-18 12:36 – 12:55 (+01:00)
- **Lot concerné** : `LOT-0.1-PHASE0-FOUNDATIONS`
- **Action effectuée** : Développement des modules de base (`money.ts`, `types.ts`, `country-registry.ts`, `deterministic-engine.ts`, `ai-gateway.ts`, `database.ts`, `audit-service.ts`, `auth-service.ts`, `tenant-service.ts`, `app-view.ts`, `server.ts`) et de la suite `src/tests/phase0.test.ts` (9 tests).
- **Commandes utilisées** : `npm run typecheck && npm test && npm run migrate && npm run seed`.
- **Résultat observé** : Correction de `SEC-FIX-01` dans `src/audit/audit-service.ts` (gestion des `organization_id` inexistants lors d'une tentative d'intrusion). **9/9 tests réussis**.

---

### `ACT-0003` — Extension de l'architecture au périmètre international (Migration `002`)
- **Date et heure** : 2026-10-18 12:58 – 13:20 (+01:00)
- **Lot concerné** : `LOT-0.2-INTERNATIONAL-EXTENSION`
- **Action effectuée** : Extension de `src/domain/money.ts` aux devises à 0, 2 et 3 décimales + conversions FX auditées ; extension de `src/countries/country-registry.ts` (8 versions couvrant `FR`, `BE`, `LU`, `CH`, `MA`, `TN`, `AE`) ; création de `src/i18n/translations.ts` (`fr`, `en`, `ar` RTL) et de `src/tests/international-scope.test.ts` (8 tests).
- **Commandes utilisées** : `npm run typecheck && npm test && npm run migrate`.
- **Résultat observé** : **17/17 tests réussis** (`9 + 8`).

---

### `ACT-0004` — Vérification de l'instance PostgreSQL 16.15 locale (`psql -U postgres -h /tmp`)
- **Date et heure** : 2026-10-18 13:25 – 13:27 (+01:00)
- **Lot concerné** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Action effectuée** : Test de connexion au serveur PostgreSQL installé via Snap sur le socket `/tmp`.
- **Commandes utilisées** : `psql -U postgres -h /tmp -c "SELECT version(), current_database(), current_user;"`
- **Résultat observé** : `PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu`.

---

### `ACT-0005` — Implémentation de la migration `003_phase1_readiness_schema`, du garde-fou IA de production et du support 4 décimales (`CLF`)
- **Date et heure** : 2026-10-18 13:28 – 13:52 (+01:00)
- **Lot concerné** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Action effectuée** : Création de `src/db/phase1-readiness-migration.ts` (8 nouvelles tables Phase 1, `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL` de 20 tables, `recordMultiLineAccountingEntry()`), ajout de `assertAiProviderAllowedForEnvironment()` dans `src/ai/ai-gateway.ts`, ajout de `CLF` (4 décimales) dans `src/domain/money.ts`, et création de `src/tests/phase1-readiness-and-postgres.test.ts` (4 tests).
- **Commandes utilisées** : `npm run typecheck && npm test && npm run migrate && npm run seed`.
- **Résultat observé** : **21/21 tests réussis** (`9 + 8 + 4`), incluant le test réel sur PostgreSQL 16.15.

---

### `ACT-0006` — Création initiale des registres documentaires sous `docs/` et synchronisation GitHub (`430bc22`)
- **Date et heure** : 2026-10-18 14:08 – 15:11 (+01:00)
- **Lot concerné** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Action effectuée** : Création des 12 fichiers Markdown de documentation sous `docs/`, mise à jour de `.gitignore` (exclusion de `data/`, `.~lock.*`, `*.dump`), renommage de la branche locale `mai` en `main`, et push du commit `430bc22` vers `https://github.com/az2innov/comptanova.git`.
- **Commandes utilisées** : `git branch -M main`, `git remote set-url origin https://github.com/az2innov/comptanova.git`, `git log -n 1 --oneline && git status`.
- **Résultat observé** : Commit `430bc22` poussé avec succès sur `origin/main`, arbre de travail propre.

---

### `ACT-0007` — Audit indépendant de clôture de la Phase 0 (Inspection code, sécurité, documentation & rejeu des tests)
- **Date et heure** : 2026-10-18 15:14 – 15:28 (+01:00)
- **Lot concerné** : `LOT-0.4-INDEPENDENT-CLOSURE-AUDIT`
- **Objectif** : Vérifier indépendamment chaque affirmation des rapports précédents par rapport au code réel (`src/`), aux configurations (`tsconfig.json`, `package.json`, `.env.example`, `.gitignore`) et aux résultats d'exécution réels.
- **Éléments examinés** :
  - `src/config/app-config.ts`, `src/server.ts`, `src/auth/auth-service.ts`, `src/audit/audit-service.ts`, `src/services/tenant-service.ts`, `src/countries/country-registry.ts`, `src/domain/money.ts`, `src/ui/app-view.ts`, `src/db/database.ts`, `src/db/phase1-readiness-migration.ts`.
  - Les 3 suites de tests (`src/tests/phase0.test.ts`, `src/tests/international-scope.test.ts`, `src/tests/phase1-readiness-and-postgres.test.ts`).
  - Les 12 documents sous `docs/`.
- **Commandes exécutées** :
  - `git status -s && git branch -vv && git remote -v && ls -la .env 2>&1 || true`
  - `npm run typecheck && npm test && npm run migrate && npm run seed`
- **Résultat observé** :
  1. Exécution technique : `npm run typecheck` (`0 erreur`), `npm test` (**21/21 tests passants** en `934.74 ms`, dont PostgreSQL 16.15 réel), `npm run migrate` (`totalMigrations: 3`), `npm run seed` (`organizationsCount: 2, usersCount: 4`).
  2. Écarts techniques de sécurité identifiés :
     - `SEC-OPEN-01` (`ÉCHEC CONFIRMÉ` en mode production) : `src/config/app-config.ts` utilise `defaultDevSecret` si `SESSION_SECRET` / `SIGNED_URL_SECRET` ne sont pas définis, même lorsque `NODE_ENV === "production"`.
     - `SEC-OPEN-02` (`PARTIELLEMENT VÉRIFIÉ`) : `GET /api/organizations/:orgId/audit-logs` dans `src/server.ts` ne restreint pas l'accès au rôle `FIRM_ADMIN`.
     - `SEC-OPEN-03` (`PARTIELLEMENT VÉRIFIÉ`) : Le limiteur de débit global (`180 req/min/IP`) est trop large pour `/api/auth/login` et non testé en `429` ; `revokeSession()` et `expires_at` n'ont pas de test unitaire dédié.
     - `SEC-OPEN-04` (`PARTIELLEMENT VÉRIFIÉ`) : Absence de `TRIGGER` SQL anti-suppression sur `audit_logs`.
     - `REQ-002` (`ÉCHEC CONFIRMÉ` mineur UI) : `src/ui/app-view.ts` utilise une palette CSS ardoise/bleu au lieu de la palette `#153D35` / `#237D68` / `#D9A441`.
  3. Incohérences documentaires identifiées et corrigées :
     - Clarification entre les **8 versions de configuration couvrant 7 pays** dans `src/countries/country-registry.ts` (dont `FR-2026.1-REV0` au statut `PENDING_LEGAL_VALIDATION`, `isProductionEnabled: false`) et les **20 devises** dans `src/domain/money.ts`.
     - Alignement des noms exacts des variables d'environnement (`APP_NAME`, `DATABASE_PATH`, `SESSION_SECRET`, `SIGNED_URL_SECRET`, `AI_DEFAULT_PROVIDER`), des 15 routes HTTP réellement exposées dans `src/server.ts` et du seuil de justification `PLATFORM_ADMIN` (`>= 10` caractères).
- **Fichiers créés ou mis à jour** :
  - Créé : [`docs/PHASE0_CLOSURE_AUDIT.md`](./PHASE0_CLOSURE_AUDIT.md)
  - Mis à jour : [`docs/TEST_REPORT.md`](./TEST_REPORT.md), [`docs/SECURITY_REVIEW.md`](./SECURITY_REVIEW.md), [`docs/RISK_REGISTER.md`](./RISK_REGISTER.md), [`docs/REQUIREMENTS_TRACEABILITY.md`](./REQUIREMENTS_TRACEABILITY.md), [`docs/PROJECT_STATUS.md`](./PROJECT_STATUS.md), [`docs/ACTION_LOG.md`](./ACTION_LOG.md), [`docs/CHANGELOG.md`](./CHANGELOG.md), [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), [`docs/OPERATIONS.md`](./OPERATIONS.md), [`docs/DECISIONS.md`](./DECISIONS.md).
- **Décision prise** : Aucun code métier n'a été modifié pendant l'audit (respect strict de la règle n° 2). Autorisation de démarrer la Phase 1 et les tests sur données fictives ; blocage de l'usage de données réelles et de la mise en production commerciale tant que les écarts P0/P1 et les validations professionnelles ne sont pas levés.

---

### `ACT-0008` — Remédiation immédiate des réserves de sécurité et d'interface post-audit (`SEC-OPEN-01` à `SEC-OPEN-05` & `REQ-002`)
- **Date et heure** : 2026-10-18 15:33 – 15:43 (+01:00)
- **Lot concerné** : `LOT-0.5-SECURITY-AND-UI-REMEDIATION`
- **Objectif** : Corriger immédiatement les réserves de sécurité (`SEC-OPEN-01` à `SEC-OPEN-05`) et l'écart cosmétique (`REQ-002`) identifiés lors de l'audit indépendant `ACT-0007`, et prouver chaque correction par un test automatisé dédié avant synchronisation GitHub.
- **Modifications réalisées** :
  1. `SEC-OPEN-01` ([`src/config/app-config.ts`](../src/config/app-config.ts)) : Levée d'une exception fatale `FATAL [SEC-OPEN-01]` au chargement de la configuration lorsque `NODE_ENV === "production"` et que `SESSION_SECRET` ou `SIGNED_URL_SECRET` est absent, $< 32$ caractères ou utilise une valeur d'exemple/démo.
  2. `SEC-OPEN-02` ([`src/server.ts`](../src/server.ts)) : Restriction de `GET /api/organizations/:orgId/audit-logs` au rôle `FIRM_ADMIN` (ou `PLATFORM_ADMIN` avec justification).
  3. `SEC-OPEN-03` ([`src/server.ts`](../src/server.ts), [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts)) : Ajout d'un quota anti-brute-force dédié sur `POST /api/auth/login` (`10 req/min/IP` par défaut), purge automatique des clés expirées de `rateLimitBuckets`, et tests automatisés de `revokeSession()`, d'expiration `expires_at` et du code HTTP `429`.
  4. `SEC-OPEN-04` ([`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)) : Ajout des triggers d'inaltérabilité `BEFORE UPDATE` et `BEFORE DELETE` sur `audit_logs` en SQLite (`trg_audit_logs_immutable_update`, `trg_audit_logs_immutable_delete`) et PostgreSQL 16 (`trg_pg_audit_logs_immutable`).
  5. `SEC-OPEN-05` & `REQ-002` ([`src/server.ts`](../src/server.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts)) : Ajout de l'en-tête `Content-Security-Policy`, filtrage des erreurs SQL internes dans les réponses HTTP `400`, et injection dynamique de `appConfig.brandColors` (`#153D35`, `#237D68`, `#D9A441`, `#F6F8F7`, `#111827`) dans `:root` CSS.
- **Commandes exécutées** :
  - `npm run typecheck` $\rightarrow$ `0 erreur`.
  - `npm test` $\rightarrow$ **22/22 tests réussis** en `1061.28 ms` (`TEST-CAMP-005`).
- **Fichiers modifiés** : `src/config/app-config.ts`, `src/ui/app-view.ts`, `src/db/database.ts`, `src/db/phase1-readiness-migration.ts`, `src/server.ts`, `src/tests/phase1-readiness-and-postgres.test.ts` et les registres sous `docs/`.

---

### `ACT-0009` — Contre-audit final indépendant du Lot 0.5 sur le commit `dce1dd7`
- **Date et heure** : 2026-10-18 15:49 – 16:00 (+01:00)
- **Lot concerné** : `LOT-0.5-FINAL-REAUDIT`
- **Objectif** : Vérifier indépendamment et sans modifier le code source (`src/`) les corrections annoncées dans le commit `dce1dd7` (`SEC-OPEN-01` à `SEC-OPEN-05` et `REQ-002`).
- **Commandes exécutées** :
  - `git status -s && git branch -vv && git show --stat dce1dd7`
  - `npm run typecheck && npm test` (**22/22 tests passants** en `1088.95 ms`)
  - Exécution d'un script Node.js non destructif inspectant `./data/app.db` (`sqlite_master` triggers) et testant les cas limites de `getAppConfig(env)` et `assertOrganizationAccess()`.
- **Constats vérifiés** :
  1. `SEC-OPEN-01` (`PARTIELLEMENT CORRIGÉ`) : Bloque les secrets absents, courts ($<32$) ou de démo, mais accepte `SESSION_SECRET === SIGNED_URL_SECRET` et `"a".repeat(32)`.
  2. `SEC-OPEN-02` (`PARTIELLEMENT CORRIGÉ`) : RBAC API conforme (`200` `FIRM_ADMIN` et `PLATFORM_ADMIN` justifié, `403` inter-tenant et collaborateur), mais régression côté client dans `src/ui/app-view.ts` L798 où `refreshActiveOrganizationViews()` appelle `/audit-logs` sans `try/catch`, provoquant la déconnexion Web UI des rôles `ACCOUNTANT_COLLABORATOR` et `CLIENT_DIRECTOR`.
  3. `SEC-OPEN-03` (`PARTIELLEMENT CORRIGÉ`) : Quota `429` sur `/api/auth/login` fonctionnel, mais indexé par IP seule (limite derrière reverse proxy sans `TRUST_PROXY`) et en mémoire locale.
  4. `SEC-OPEN-04` (`PARTIELLEMENT CORRIGÉ`) : Triggers actifs sur base neuve (`:memory:` et PG16), mais absents de la base locale existante `./data/app.db` (`diskTriggers = []`) car ajoutés dans la migration `003` déjà appliquée au lieu d'une migration `004`.
  5. `SEC-OPEN-05` & `REQ-002` (`PARTIELLEMENT CORRIGÉ`) : En-têtes `CSP` (`'unsafe-inline'`) et variables `:root` présents, mais quelques sélecteurs CSS de `app-view.ts` utilisent encore `#1e293b`/`#334155` en dur, et le serveur renvoie `400` uniformément sur les erreurs non-RBAC.
- **Livrables** : Création de [`docs/PHASE0_FINAL_REAUDIT.md`](./PHASE0_FINAL_REAUDIT.md) et mise à jour de `SECURITY_REVIEW.md`, `PROJECT_STATUS.md` et `ACTION_LOG.md`. Aucune modification de `src/`.

---

### `ACT-0010` — Application et vérification du correctif ciblé Lot 0.6 (Clôture complète des 6 points du contre-audit)
- **Date et heure** : 2026-10-18 16:02 – 16:20 (+01:00)
- **Lot concerné** : `LOT-0.6-FINAL-REMEDIATION`
- **Objectif** : Corriger tous les cas limites et régressions identifiés lors du contre-audit `ACT-0009` sur le commit `dce1dd7` afin d'amener `SEC-OPEN-01` à `SEC-OPEN-05` et `REQ-002` au statut `CORRIGÉ ET TESTÉ`.
- **Modifications réalisées** :
  1. `SEC-OPEN-01` ([`src/config/app-config.ts`](../src/config/app-config.ts)) : Validation individuelle de `SESSION_SECRET` et `SIGNED_URL_SECRET` en `NODE_ENV=production`, rejet des secrets à faible entropie (`new Set(trimmed).size < 10`) et rejet de `SESSION_SECRET === SIGNED_URL_SECRET`, sans divulguer la valeur du secret.
  2. `SEC-OPEN-02` ([`src/server.ts`](../src/server.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts)) : Autorisation de `["FIRM_ADMIN", "CLIENT_DIRECTOR"]` sur `GET /api/organizations/:orgId/audit-logs` et ajout d'un `try/catch` autour de `/audit-logs` dans `refreshActiveOrganizationViews()`.
  3. `SEC-OPEN-03` ([`src/server.ts`](../src/server.ts)) : Ajout de `resolveClientIp(req, trustProxy)` (ignore `X-Forwarded-For` par défaut sauf si `TRUST_PROXY=true`), purge systématique des compteurs expirés (`evictExpiredRateLimitBuckets`) et paramètre `rateLimitWindowMs` testable.
  4. `SEC-OPEN-04` ([`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)) : Création de la migration **`004_audit_logs_immutability_triggers`** qui retire les clauses `ON DELETE SET NULL` sur `audit_logs` et installe les triggers sur la base existante `./data/app.db` ; ajout du test PL/pgSQL d'immuabilité sur PostgreSQL 16.15.
  5. `SEC-OPEN-05` & `REQ-002` ([`src/server.ts`](../src/server.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts), [`src/config/app-config.ts`](../src/config/app-config.ts)) : Ajout de `Cache-Control: no-store` sur `GET /`, élargissement du filtre d'erreurs SQLite, distinction `404`/`400`, et remplacement intégral des couleurs ardoise/bleu héritées (`#1e293b`, `#334155`, `#60a5fa`, `#0f172a`) par les 5 couleurs officielles (`#153D35`, `#237D68`, `#D9A441`, `#F7F6F2`, `#1C2421`).
- **Commandes exécutées** :
  - `npm run typecheck` $\rightarrow$ `0 erreur`.
  - `npm test` $\rightarrow$ **22/22 tests réussis** en `1506.65 ms` (`TEST-CAMP-006`).
  - `npm run migrate` $\rightarrow$ `appliedVersions: ["004_audit_logs_immutability_triggers"], totalMigrations: 4`.
  - `npm run seed` $\rightarrow$ `status: "OK", organizationsCount: 2, usersCount: 4`.
  - Vérification sur `./data/app.db` $\rightarrow$ `triggers: ["trg_audit_logs_immutable_delete", "trg_audit_logs_immutable_update"]`, `updateBlocked: true`, `deleteBlocked: true`, `integrity.valid: true`.

---

### `ACT-0011` — Audit de référence pré-Phase 1 et établissement du Plan de Livraison Incrémental en 6 lots (`PHASE1_DELIVERY_PLAN.md`)
- **Date et heure** : 2026-10-18 16:54 – 17:04 (+01:00)
- **Lot concerné** : `PHASE-1-PLANNING`
- **Objectif** : Conformément aux Sections A, B, C et G de la *Directive de Pilotage — Phase 1* et aux Sections 1 à 39 du *Prompt Phase 1*, auditer l'état réel du dépôt au commit `fb52d44`, résoudre la divergence de palette graphique et produire le plan de livraison découpé en 6 lots indépendants avant d'entamer le développement.
- **Éléments examinés** :
  - État Git (`main` synchronisé avec `origin/main` sur `fb52d44`), `src/services/tenant-service.ts`, `src/rules/deterministic-engine.ts`, `src/ai/ai-gateway.ts`, `src/countries/country-registry.ts`, `src/db/database.ts`, `src/db/phase1-readiness-migration.ts`, `src/ui/app-view.ts`.
- **Livrable créé** : [`docs/PHASE1_DELIVERY_PLAN.md`](./PHASE1_DELIVERY_PLAN.md) définissant les **Lots 1.1 à 1.6** avec leurs 12 rubriques obligatoires. Aucune modification du code source (`src/`) n'a été effectuée dans l'attente de la validation du plan.

---

### `ACT-0012` — Livraison et vérification du Lot 1.1 (Design System §5, Layout 10 entrées §8 & Module 1 Gestion complète des dossiers clients §9)
- **Date et heure** : 2026-10-18 17:08 – 19:02 (+01:00)
- **Lot concerné** : `LOT-1.1-DESIGN-SYSTEM-LAYOUT-DOSSIERS`
- **Objectif** : Implémenter le Lot 1.1 conformément au plan validé et aux garde-fous de pilotage (sauvegarde préalable vérifiée de `./data/app.db`, centralisation des tokens graphiques §5 sans couleur codée en dur, 5 états d'interface obligatoires, accessibilité clavier/focus/contrastes WCAG AA/responsive, Module 1 complet avec édition, archivage logique préservant l'historique et l'audit, affectations RBAC par dossier et initialisation strictement idempotente du PCG français et des journaux).
- **Fichiers créés ou modifiés** :
  - [`src/config/app-config.ts`](../src/config/app-config.ts) : Alignement des tokens `brandColors` sur la Section 5 Phase 1 (`#153D35`, `#237D68`, `#D9A441`, `#F7F8FA`, `#FFFFFF`, `#17212B`, `#64748B`, `#E2E8F0`, couleurs sémantiques) et slogan `"ComptaNova — La comptabilité, plus claire."`.
  - [`src/ui/design-system.ts`](../src/ui/design-system.ts) *(nouveau)* : Source unique des tokens CSS (`:root`), calculateur de contraste WCAG 2.1 (`calculateWcagContrastRatio`), catalogue des 10 entrées de navigation (`PHASE1_NAVIGATION_MODULES`) et styles des 5 états obligatoires (`loading`, `empty`, `error`, `confirm`, `forbidden`).
  - [`src/i18n/translations.ts`](../src/i18n/translations.ts) : Ajout des 10 libellés de navigation et des sélecteurs de dossier actif et de période comptable en `fr`, `en` et `ar` (`RTL`).
  - [`src/domain/types.ts`](../src/domain/types.ts) : Ajout de `DossierStatus` (`ACTIVE | TO_COMPLETE | SUSPENDED | ARCHIVED`) et des métadonnées complètes de `ClientDossier`.
  - [`src/db/database.ts`](../src/db/database.ts) & [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts) : Ajout de la migration non destructive **`005_phase1_lot1_1_dossier_metadata`** (SQLite) et alignement du schéma PostgreSQL 16.
  - [`src/countries/country-registry.ts`](../src/countries/country-registry.ts) : Enrichissement du PCG français (`FR-2026.1-REV0`, 37 comptes des classes 1 à 7) et des journaux standards (`ACH`, `VEN`, `BQ`, `OD`, `AN`, `AC`, `VT`).
  - [`src/services/tenant-service.ts`](../src/services/tenant-service.ts) & [`src/db/seed.ts`](../src/db/seed.ts) : Implémentation de `initializeDossierAccountingReferential` (idempotent via `ON CONFLICT DO NOTHING`), `getClientDossierDetails`, `updateClientDossier`, `archiveOrRestoreClientDossier` (archivage logique avec motif obligatoire et préservation intégrale des références et de l'audit) et `listDossierAssignments`.
  - [`src/server.ts`](../src/server.ts) : Exposition sécurisée des endpoints `GET/PATCH /api/organizations/:orgId/dossiers/:dossierId`, `POST .../archive`, `GET/POST .../assignments` et `POST .../init-referential`.
  - [`src/ui/app-view.ts`](../src/ui/app-view.ts) : Refonte de l'interface avec les 10 entrées de navigation, la barre de contexte (sélecteur de dossier actif + période comptable), les 5 états UI et le panneau complet de gestion du dossier client.
  - [`src/tests/phase1-lot1-1.test.ts`](../src/tests/phase1-lot1-1.test.ts) *(nouveau)* & [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) : Ajout de la suite automatisée du Lot 1.1 (4 sous-suites couvrant tokens/contrastes WCAG AA, navigation/accessibilité/5 états, idempotence PCG/journaux, cycle complet API/RBAC/isolation inter-organisations/archivage logique).
- **Commandes exécutées et résultats observés** :
  - Sauvegarde préalable : `cp data/app.db data/backups/app.db.pre-lot-1.1.bak && sha256sum ...` $\rightarrow$ empreinte SHA-256 `047bf2a5758b8569b2b45b05cb0c783bf5a5c1cd804d0ed156e0c0503e607f80` identique avant et après essais.
  - Test de migration sur copie dédiée : `DATABASE_PATH=./data/backups/app.db.test-migration-005.sqlite node dist/db/migrate-cli.js` $\rightarrow$ `status: "OK", appliedVersions: ["005_phase1_lot1_1_dossier_metadata"], totalMigrations: 5` (copie temporaire nettoyée ensuite, `./data/app.db` intacte).
  - `npm test` $\rightarrow$ **26/26 tests passants** (4 suites, 0 échec, durée `1681.93 ms`), incluant le test PostgreSQL 16.15 local.

## ACT-0013 — 2026-10-18T20:53:00+01:00 — Implémentation du Lot 1.2 : Module 3 — Collecte documentaire, OCR assisté, détection de doublons et cycle de vie à 6 statuts
- **Objectif** : Implémenter intégralement le Module 3 (Collecte documentaire) de la Phase 1 sans régression sur les fondations existantes.
- **Périmètre & Fichiers modifiés** :
  - `src/services/file-security.ts` (NOUVEAU) : Validation stricte des fichiers (taille max 15 Mo, magic bytes PDF/PNG/JPEG/CSV, interdiction stricte des exécutables Windows MZ / Linux ELF / scripts `#!`), neutralisation sécurisée des noms de fichiers (`sanitizeFilename` anti-traversée de chemin), scanner antimalware avec détection signature EICAR, et gestionnaire de stockage privé sécurisé hors web root (`PrivateDocumentStorageManager`).
  - `src/db/database.ts` & `src/db/phase1-readiness-migration.ts` : Ajout de la migration `006_phase1_lot1_2_document_lifecycle` (statut `REJECTED`, motifs de rejet, trace d'audit du rejet, détection de doublon exact/heuristique, statut de quarantaine, index `idx_documents_status`).
  - `src/domain/types.ts` : Ajout de `REJECTED` dans `DocumentWorkflowStatus` et enrichissement de l'interface `StoredDocument`.
  - `src/services/tenant-service.ts` : Fonctions du cycle de vie documentaire : `ingestDocumentIntoDossier`, `listDossierDocuments`, `getDocumentDetails`, `updateDocumentExtraction`, `validateDocument`, `rejectDocument` (motif obligatoire $\ge$ 10 caractères et tracé en audit), `createDraftEntryFromDocument` (écriture strictement `DRAFT` en partie double équilibrée, sans auto-validation), `deleteDocument`.
  - `src/server.ts` : Endpoints REST complets `/api/organizations/:orgId/dossiers/:dossierId/documents*` avec validation RBAC, génération de liens signés HMAC SHA-256 avec expiration (15 minutes), et support de l'upload base64 (limite body portée à 25 Mo).
  - `src/ui/app-view.ts` : Interface utilisateur complète du Module 3 remplaçant le placeholder `#tab-documents` : zone de dépôt glisser-déposer, sélection de catégorie, filtres par statut avec compteurs visuels (6 statuts officiels), tableau des pièces, panneau latéral d'inspection/correction avec saisie des champs extraits, modal de rejet avec motif obligatoire, alerte de doublon avec dérogation explicite justifiée, et bouton de génération d'écriture brouillon. Palette stricte conforme aux tokens sans couleur codée en dur hors `:root`.
  - `src/tests/phase1-lot1-2.test.ts` (NOUVEAU) : Suite de tests automatisés couvrant 7 exigences clés (sécurité fichiers, anti-traversée, liens signés, doublons avec dérogation, cycle de vie à 6 statuts, écriture brouillon DRAFT, et intégration API REST).
  - `src/tests/phase1-readiness-and-postgres.test.ts` : Prise en compte de la migration `006` dans le test de conformité.
- **Sauvegarde & Intégrité** :
  - Sauvegarde de la base de référence avant travaux : `data/backups/app.db.pre-lot-1.2.bak` (empreinte SHA-256 vérifiée).
  - Base SQLite en mémoire et isolée pour les tests d'intégration.
- **Résultats des tests** :
  - Commande : `npm test` (`npm run build && node --test dist/tests/*.test.js`)
  - Résultat : **33/33 tests passants** (5 suites de test, 0 échec, durée `1761.09 ms`).
  - 100% de succès sur l'ensemble des modules (Scope international, Phase 0, Lot 1.1, Lot 1.2, et tests PostgreSQL 16 réels).
- **Réserves / Prochaines étapes** :
  - Le Lot 1.2 est finalisé et vérifié.
  - Contrôles de clôture du Lot 1.2 appliqués au commit `bf9e397` (scanner antimalware clarifié, tests d'inviolabilité des liens signés, matrice de transition des 6 statuts, nettoyage des fichiers orphelins sur échec SQL et blocage des doublons d'écritures).

---

## ACT-0014 — 2026-10-18T21:22:00+01:00 — Implémentation du Lot 1.3 : Module 4 — Facturation des Ventes, Devis, Transformation contrôlée, Règlements, Aperçu imprimable et Cadrage Factur-X / PDP
- **Objectif** : Implémenter intégralement le Module 4 (Facturation et Devis) de la Phase 1 conformément au cahier des charges et aux directives de pilotage, sans altérer les fondations existantes.
- **Périmètre & Fichiers modifiés** :
  - `src/db/database.ts` & `src/db/phase1-readiness-migration.ts` : Ajout de la migration non destructive `007_phase1_lot1_3_quotes_and_invoicing` créant les tables `dossier_numbering_sequences`, `quotes`, `quote_lines`, `invoice_lines`, `invoice_payments` et les colonnes d'enrichissement sur `invoices` (`origin_quote_id`, `credit_note_for_invoice_id`, `cancelled_by_credit_note_id`, `legal_mentions_json`, `third_party_id`, `is_b2b`, `invoice_status`, `finalized_at`, `finalized_by_user_id`).
  - `src/domain/types.ts` : Types du domaine `Quote`, `QuoteLine`, `QuoteStatus`, `SalesInvoice`, `InvoiceLine`, `InvoicePayment`, `InvoiceWorkflowStatus`, `LegalMentionsPayload`, `FacturXProfile`.
  - `src/services/invoicing-service.ts` *(NOUVEAU)* : Service métier complet comprenant :
    1. Séquenceur de numérotation chronologique continu et ininterrompu (`DEV-YYYY-XXXX`, `FAC-YYYY-XXXX`, `AV-YYYY-XXXX`) avec transactions SQL atomiques et verrouillage contre les trous de numérotation.
    2. Arithmétique monétaire stricte en unités mineures entières (centimes), ventilation de TVA par taux, validation `totalNet + totalVat === totalGross`.
    3. Mentions légales obligatoires conformes au Code de commerce et au Livre des Procédures Fiscales (art. 242 nonies A, art. 293 B CGI franchise de TVA, pénalités de retard, indemnité forfaitaire légale de 40 € B2B).
    4. Gestion du cycle de vie des Devis et transformation contrôlée en facture avec protection stricte anti-duplication (statut `CONVERTED`, blocage de reconversion).
    5. Finalisation irréversible des factures (attribution du numéro officiel définitif, horodatage, inaltérabilité des lignes et montants).
    6. Annulation par Avoir traçable (`CREDIT_NOTE`) avec motif obligatoire d'au moins 5 caractères et montants strictement négatifs.
    7. Gestion des règlements multiples et calcul exact du solde restant dû.
    8. Aperçu imprimable HTML (format A4 `@media print` avec respect de la charte graphique).
    9. Génération Factur-X XML (Niveau 2, profils `MINIMUM`, `BASIC`, `EN16931`) conforme à la norme franco-allemande / européenne EN 16931.
    10. Cadrage explicite Niveau 3 (ComptaNova n'est pas une PDP agréée ; connectivité PDP/PPF et e-reporting traités en périmètre distinct).
  - `src/server.ts` : Exposition des endpoints REST sécurisés :
    - `POST /api/organizations/:orgId/dossiers/:dossierId/quotes` (création devis)
    - `GET .../quotes` & `GET .../quotes/:quoteId` (liste et consultation)
    - `POST .../quotes/:quoteId/convert-to-invoice` (transformation contrôlée)
    - `POST .../sales-invoices` (création facture brouillon)
    - `GET .../sales-invoices` & `GET .../sales-invoices/:invId` (liste et consultation)
    - `POST .../sales-invoices/:invId/finalize` (finalisation officielle)
    - `POST .../sales-invoices/:invId/credit-note` (création d'avoir)
    - `POST .../sales-invoices/:invId/payments` (enregistrement de règlement)
    - `GET .../sales-invoices/:invId/printable` (rendu HTML imprimable A4)
    - `GET .../sales-invoices/:invId/facturx-xml` (génération flux XML Factur-X)
  - `src/ui/app-view.ts` : Interface utilisateur complète du Module 4 remplaçant le placeholder `#tab-invoicing` : filtres de factures, liste paginée avec badges de statut (`DRAFT`, `FINALIZED`, `PAID`, `PARTIALLY_PAID`, `CANCELLED`), table des devis, formulaire interactif de création avec calcul dynamique en centimes des remises et TVA, modal de règlement, boutons d'action (Aperçu HTML, XML Factur-X, Avoir, Finaliser) et encart de conformité PDP.
  - `src/tests/phase1-lot1-3.test.ts` *(NOUVEAU)* : Suite de tests automatisés exhaustive comprenant 12 sous-tests couvrant l'ensemble des règles métier, la sécurité multi-tenant et l'intégration API REST.
  - `src/tests/phase1-readiness-and-postgres.test.ts` : Actualisation des assertions de schéma : 7 migrations appliquées (001 à 007) et 25 tables vérifiées sur instance réelle PostgreSQL 16 local.
- **Sauvegarde & Intégrité** :
  - Sauvegarde de la base de référence avant travaux : `data/backups/app.db.pre-lot-1.3.bak` (SHA-256 : `047bf2a5758b8569b2b45b05cb0c783bf5a5c1cd804d0ed156e0c0503e607f80`).
- **Résultats des tests** :
  - Commande : `npm test` (`npm run build && node --test dist/tests/*.test.js`)
  - Résultat : **46/46 tests passants** (6 suites de tests, 0 échec, durée `1928.65 ms`).
  - Validation complète sur les 6 suites :
    1. Extension scope international (8/8 pass)
    2. Phase 0 fondations & sécurité (9/9 pass)
    3. Phase 1 Lot 1.1 layout/design/dossiers (4/4 pass)
    4. Phase 1 Lot 1.2 collecte documentaire (8/8 pass)
    5. Phase 1 Lot 1.3 Module 4 facturation/devis (12/12 pass)
    6. Audit complémentaire Phase 0 & PostgreSQL 16 réel (5/5 pass, 25 tables créées sans erreur)
- **Réserves / Prochaines étapes** :
  - Le Lot 1.3 est finalisé et vérifié.
  - Conformément à la directive d'incrémentalité stricte, arrêt après le Lot 1.3 en attente de la revue et de l'autorisation de l'utilisateur avant d'engager le Lot 1.4 (Module 2 — Tableaux de bord et indicateurs de pilotage).

---

## ACT-0015 — 2026-10-18T21:50:00+01:00 — Implémentation du Lot 1.4 : Module 2 — Tableaux de Bord et Indicateurs de Pilotage (Vue Entreprise & Vue Cabinet, Données 100% Persistées, Filtres Période & Alertes Actionnables)
- **Objectif** : Implémenter intégralement le Module 2 (Tableaux de Bord et Pilotage de Gestion) de la Phase 1 conformément au cahier des charges (§20), aux directives de pilotage, et aux retours complémentaires du Lot 1.3 (qualification Factur-X en "génération préliminaire", avoirs partiels sans annulation indue de facture, tests fonctionnels PostgreSQL 16 complets sur devis/factures/paiements/avoirs).
- **Périmètre & Fichiers modifiés** :
  1. `docs/PHASE1_DELIVERY_PLAN.md` :
     - Qualification formelle Factur-X du Lot 1.3 en « génération XML préliminaire (non qualifiée pour un usage fiscal de production) ».
     - Insertion d'une section dédiée : *« Périmètre Distinct — Réforme Française de la Facturation Électronique »* distinguant les 3 niveaux de maturité (Niveau 1 données comptables internes, Niveau 2 génération XML préliminaire Factur-X EN 16931, Niveau 3 connectivité PDP/PPF et e-reporting nécessitant un tiers opérateur agréé).
     - Précision du périmètre du Lot 1.4 (indicateurs 100% calculés à partir de la base SQL, sans aucune donnée fictive ou simulée en production, arithmétique exacte en centimes, filtres temporels stricts, alertes prioritaires cliquables, vue entreprise vs vue cabinet, 5 états d'interface).
  2. `src/services/invoicing-service.ts` :
     - Enrichissement de `createCreditNoteForInvoice` pour supporter les avoirs partiels via le paramètre optionnel `partialGrossAmountMinor` : si partiel, la facture d'origine reste active (`FINALIZED` ou `PARTIALLY_PAID`, NON marquée `CANCELLED`) avec traçabilité de l'avoir dans `legal_mentions_json.partialCreditNotes` ; si total, la facture d'origine est marquée `CANCELLED`.
     - Qualification explicite du XML Factur-X généré comme flux préliminaire non certifié.
  3. `src/services/dashboard-service.ts` *(NOUVEAU)* :
     - Résolution déterministe des filtres de période (`resolvePeriodDates`) : `ALL`, `FISCAL_YEAR`, `QUARTER`, `MONTH`, `CUSTOM`.
     - Indicateurs dossier actif (`getDossierDashboardMetrics`) :
       - Ventes : CA HT facturé (`turnoverNetMinor`), TVA collectée (`vatCollectedMinor`), total TTC (`turnoverGrossMinor`), factures émises, règlements encaissés (`paidAmountMinor`), créances restantes (`remainingDueMinor` avec déduction rigoureuse des avoirs partiels), factures échues (`overdueInvoicesCount`, `overdueAmountMinor`).
       - Dépenses : Dépenses fournisseurs validées HT/TVA/TTC issues des factures reçues et des justificatifs validés (`SUPPLIER_INVOICE`, `RECEIPT_EXPENSE`), décompte par statut (`PENDING_REVIEW`, `VALIDATED`, `REJECTED`).
       - Devis : Total devis, devis acceptés/convertis, taux de conversion exact en points de base (`conversionRateBps`).
       - Synthèse comptable : Écritures brouillon/validées, total Débit/Crédit, contrôle d'équilibre.
       - Anomalies : Décompte des erreurs bloquantes et suspicions ouvertes.
       - Alertes prioritaires actionnables (`actionableAlerts`) : triées par criticité (`CRITICAL` -> `WARNING` -> `INFO`), avec étiquettes claires, montants, échéances, et URLs d'action directe vers les pièces sources.
       - Mention de pilotage non certifié (`isCertifiedAudit: false`, disclaimer légal obligatoire).
     - Indicateurs cabinet / portefeuille multi-dossiers (`getFirmDashboardMetrics`) :
       - Consolidation de l'ensemble des dossiers autorisés : statut actif/archivé, pièces justificatives en attente de traitement, factures impayées, volume des créances en attente, anomalies non résolues.
       - Rétrocompatibilité totale avec les compteurs globaux existants.
  4. `src/server.ts` :
     - Exposition sécurisée de `GET /api/organizations/:orgId/dashboard` (Vue Cabinet).
     - Exposition sécurisée de `GET /api/organizations/:orgId/dossiers/:dossierId/dashboard` avec support des paramètres de requête `period`, `startDate`, `endDate`.
     - Support du paramètre `partialGrossAmountMinor` sur `POST .../sales-invoices/:invId/credit-note`.
  5. `src/ui/app-view.ts` :
     - Mise en place complète du Module 2 dans `#tab-dashboard` : barre d'outils avec sélecteur de vue (Dossier vs Cabinet), sélecteur de période comptable, bouton d'actualisation.
     - 6 cartes KPI décisionnelles avec montants monétaires formatés en centimes.
     - Table des alertes et actions prioritaires avec boutons d'action menant directement à l'onglet et au document cible.
     - Table du portefeuille multi-dossiers de la vue cabinet avec navigation directe par dossier.
     - Gestion des 5 états d'interface : chargement (`cn-state-loading`), erreur (`cn-state-error`), permission insuffisante (`cn-state-forbidden`), liste vide (`cn-state-empty`), et contenu (`#dash-content-container`).
     - Respect absolu de la charte graphique officielle et zéro couleur codée en dur hors `:root`.
  6. `src/tests/phase1-lot1-4.test.ts` *(NOUVEAU)* :
     - 11 sous-tests automatisés exhaustifs vérifiant la résolution des dates, les calculs de CA/TVA/règlements/reste dû, la prise en compte des avoirs totaux et partiels, l'isolation temporelle, les dépenses et flux OCR, la conversion des devis, les alertes prioritaires, l'état vide, la vue cabinet, l'étanchéité multi-tenant et l'intégration API REST HTTP.
  7. `src/tests/phase1-readiness-and-postgres.test.ts` :
     - Ajout de tests fonctionnels réels sur PostgreSQL 16 local couvrant la création de devis, lignes de devis, factures de vente, lignes de facture, règlements et avoir partiel.
- **Sauvegarde & Intégrité** :
  - Sauvegarde de la base de référence avant travaux : `data/backups/app.db.pre-lot-1.4.bak` (SHA-256 : `047bf2a5758b8569b2b45b05cb0c783bf5a5c1cd804d0ed156e0c0503e607f80`).
- **Résultats des tests** :
  - Commande : `npm test` (`npm run build && node --test dist/tests/*.test.js`)
  - Résultat : **57/57 tests passants** (7 suites de tests, 0 échec, durée `1962.30 ms`).
  - Validation complète sur les 7 suites :
    1. Extension scope international (8/8 pass)
    2. Phase 0 fondations & sécurité (9/9 pass)
    3. Phase 1 Lot 1.1 layout/design/dossiers (4/4 pass)
    4. Phase 1 Lot 1.2 collecte documentaire (8/8 pass)
    5. Phase 1 Lot 1.3 Module 4 facturation/devis (12/12 pass)
    6. Phase 1 Lot 1.4 Module 2 tableaux de bord & pilotage (11/11 pass)
    7. Audit complémentaire Phase 0 & PostgreSQL 16 réel (5/5 pass, tests fonctionnels complets)
- **Réserves / Prochaines étapes** :
  - Le Lot 1.4 est finalisé, persistant et vérifié à 100%.
  - Conformément à la directive d'incrémentalité stricte, arrêt après le Lot 1.4 en attente de la revue et de l'autorisation explicite de l'utilisateur avant d'engager le Lot 1.5.

---

## ACT-0016 — 2026-10-18T22:10:00+01:00 — Implémentation du Lot 1.5 : Module 5 — Saisie Comptable et Journaux (Commit `0b67ae4`)
- **Objectif** : Implémenter intégralement le Module 5 (Saisie comptable et journaux) de la Phase 1 conformément au cahier des charges (§16), aux directives de pilotage, et aux conditions d'autorisation de l'utilisateur (partie double stricte, équilibre Débit/Crédit en centimes, Plan Comptable Général ANC, 5 journaux officiels français VE, AC, BQ, OD, AN, validation humaine explicite avec contrôle RBAC VALIDATE_ACCOUNTING, inaltérabilité des écritures validées, extourne comptable symétrique avec liaison bidirectionnelle, tests automatisés SQLite et PostgreSQL 16).
- **Périmètre & Fichiers modifiés** :
  1. `src/countries/country-registry.ts` :
     - Ajout officiel du journal `VE` (Journal des Ventes) dans les profils `FR-2025` et `FR-2026`, complétant les 5 journaux standards : `VE`, `AC`, `BQ`, `OD`, `AN`.
  2. `src/db/database.ts` & `src/db/phase1-readiness-migration.ts` :
     - Ajout de la migration non destructive `008_phase1_lot1_5_accounting_entries` :
       - Ajout de la colonne `updated_at TEXT` sur `accounting_entries` (initialisée à `created_at` pour les écritures existantes).
       - Ajout de l'index multi-critères `idx_entries_org_dossier_journal_date` sur `(organization_id, dossier_id, journal_code, entry_date)`.
       - Ajout de l'index `idx_entries_reversal_of` sur `reversal_of_entry_id`.
       - Alignement complet du schéma PostgreSQL 16 dans `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL`.
  3. `src/services/accounting-service.ts` *(NOUVEAU)* : Service métier complet comprenant :
     - `getDossierAccounts` : Consultation filtrée des comptes du PCG du dossier client (par classe ou par recherche textuelle).
     - `getDossierJournals` : Consultation des journaux autorisés du dossier (`VE`, `AC`, `BQ`, `OD`, `AN`).
     - `createAccountingEntry` : Création transactionnelle d'une écriture multi-lignes en statut `DRAFT` ou `AI_SUGGESTION` avec contrôles stricts (au moins 2 lignes, montants en entiers stricts, pas de débit et crédit simultanés sur une même ligne, comptes existants dans le PCG du dossier).
     - `updateDraftAccountingEntry` : Modification en place d'un brouillon existant avec recalcul des totaux et remplacement atomique des lignes ; rejet immédiat si l'écriture est déjà `VALIDATED`, `EXPORTED` ou `REVERSED` (règle d'inaltérabilité).
     - `validateAccountingEntry` : Procédure formelle de validation humaine : vérification stricte de la permission RBAC `VALIDATE_ACCOUNTING` (`can_validate_accounting`), contrôle absolu de l'équilibre Débit/Crédit (`totalDebitMinor === totalCreditMinor > 0`), verrouillage au statut `VALIDATED` avec horodatage et identifiant du valideur.
     - `reverseAccountingEntry` : Extourne comptable contrôlée conforme aux normes françaises (génération d'une écriture miroir symétrique inversant rigoureusement Débit et Crédit, attribution du préfixe `EXT-`, marquage de l'écriture d'origine en `REVERSED`, liaison bidirectionnelle inaltérable `reversal_of_entry_id`, interdiction de ré-extourne).
     - `deleteDraftAccountingEntry` : Suppression sécurisée réservée aux écritures brouillons (interdite sur les écritures validées).
     - `getAccountingEntryDetails` : Consultation détaillée d'une pièce comptable avec ses lignes ordonnées, libellés PCG et traçabilité des utilisateurs.
     - `listAccountingEntries` : Livre-Journal multi-critères (filtres par journal, statut, dates, compte, recherche texte) avec pagination et calcul exact des totaux Débit/Crédit et du solde général.
  4. `src/server.ts` :
     - Exposition des 9 endpoints REST sécurisés :
       - `GET /api/organizations/:orgId/dossiers/:dossierId/accounting/accounts`
       - `GET /api/organizations/:orgId/dossiers/:dossierId/accounting/journals`
       - `GET /api/organizations/:orgId/dossiers/:dossierId/accounting/entries`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries`
       - `GET /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId`
       - `PATCH /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId/validate`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId/reverse`
       - `DELETE /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId`
  5. `src/ui/app-view.ts` :
     - Remplacement complet du placeholder `#tab-journal` par l'interface du Module 5 :
       - Bannière informative rappelant les principes comptables et les invariants LPF/FEC.
       - Synthèse financière du journal : compteurs en direct des écritures, total Débit (€), total Crédit (€), et statut de balance générale.
       - Sous-onglets internes : *Consultation des écritures & Journaux* vs *+ Nouvelle saisie au kilomètre*.
       - Vue Livre-Journal : filtres interactifs par journal (`VE`, `AC`, `BQ`, `OD`, `AN`), par statut (`DRAFT`, `AI_SUGGESTION`, `VALIDATED`, `REVERSED`), recherche libre, tableau des écritures avec badges de statut et d'équilibre, boutons d'action (Détail, Valider, Extourner, Supprimer).
       - Vue Saisie au kilomètre : formulaire d'entête (journal, date, n° pièce, libellé), grille multi-lignes dynamique avec ajout/suppression de lignes, sélecteur des comptes PCG du dossier avec libellé automatique, barre d'équilibre temps réel (Débit, Crédit, Écart, badge vert/orange), bouton de validation désactivé tant que l'écriture est déséquilibrée.
       - Modale de consultation du détail de la pièce comptable et de ses lignes.
       - Gestion des 5 états d'interface et conformité stricte au Design System officiel (zéro couleur hexadécimale codée en dur).
  6. `src/tests/phase1-lot1-5.test.ts` *(NOUVEAU)* :
     - 11 sous-tests automatisés exhaustifs couvrant : PCG et journaux, création de brouillon en centimes, rejet d'écritures mal formées, blocage de validation sur écriture déséquilibrée, validation humaine avec RBAC `VALIDATE_ACCOUNTING`, inaltérabilité des écritures validées, extourne comptable symétrique, filtres multi-critères du journal, étanchéité multi-tenant absolue, exécution réelle sur instance PostgreSQL 16 locale, et intégration complète de l'API REST.
  7. `src/tests/phase1-readiness-and-postgres.test.ts` :
     - Actualisation de la liste des migrations attendues (inclusion de la migration `008`).
- **Sauvegarde & Intégrité** :
  - Sauvegarde de la base de référence avant travaux : `data/backups/app.db.pre-lot-1.5.bak` (SHA-256 : `047bf2a5758b8569b2b45b05cb0c783bf5a5c1cd804d0ed156e0c0503e607f80`).
- **Résultats des tests** :
  - Commande : `npm test` (`npm run build && node --test dist/tests/*.test.js`)
  - Résultat : **68/68 tests passants** (8 suites de tests, 0 échec, durée `2429.41 ms`).
  - Validation complète sur les 8 suites :
    1. Extension scope international (8/8 pass)
    2. Phase 0 fondations & sécurité (9/9 pass)
    3. Phase 1 Lot 1.1 layout/design/dossiers (4/4 pass)
    4. Phase 1 Lot 1.2 collecte documentaire (8/8 pass)
    5. Phase 1 Lot 1.3 Module 4 facturation/devis (12/12 pass)
    6. Phase 1 Lot 1.4 Module 2 tableaux de bord & pilotage (11/11 pass)
    7. Phase 1 Lot 1.5 Module 5 saisie comptable & journaux (11/11 pass)
    8. Audit complémentaire Phase 0 & PostgreSQL 16 réel (5/5 pass)
- **Réserves / Prochaines étapes** :
  - Le Lot 1.5 est finalisé, persistant et vérifié à 100%.
  - Clôture formelle et vérifications complémentaires consignées dans le commit `9aa0581`.

---

## ACT-0017 — 2026-10-18T22:45:00+01:00 — Implémentation du Lot 1.6 : Modules 5 & 6 — Import Bancaire (CSV/OFX), Rapprochement et Détection Déterministe d'Anomalies
- **Objectif** : Implémenter intégralement les Modules 5 (Import et rapprochement bancaire §17) et 6 (Contrôles comptables et 10 règles déterministes d'anomalies §18), sans aucune validation automatique d'écriture comptable, avec déduplication stricte des imports et transactions, gestion des paiements partiels, et workflow de traitement des faux positifs (justification $\ge 10$ caractères).
- **Périmètre & Fichiers modifiés** :
  1. `src/services/bank-service.ts` *(NOUVEAU)* : Service bancaire complet comprenant :
     - Parseurs robustes CSV (détection automatique de séparateurs `,`, `;`, `\t`, décimales `.`/`,`, dates ISO/FR/US, colonnes signées ou Débit/Crédit séparées) et OFX (SGML/XML, balises `<STMTTRN>`, `<DTPOSTED>`, `<TRNAMT>`, `<FITID>`, `<NAME>`, `<MEMO>`).
     - Normalisation des encodages (UTF-8, Latin-1 / Windows-1252) et assainissement des chaînes.
     - Contrôle strict anti-réimport de fichier via calcul d'empreinte SHA-256 du lot (`import_batches.file_sha256`) et rejet immédiat en cas de duplication.
     - Déduplication unitaire des transactions au sein du dossier via `external_dedup_hash` (hachage normalisé date + montant + libellé / fitid).
     - Moteur d'assistance au rapprochement calculant un score de confiance déterministe (0 à 100%) basé sur le montant exact (50 pts), la concordance de référence de facture dans le libellé bancaire (30 pts), la proximité du tiers (15 pts) et la fenêtre temporelle $\le 30$ jours (5 pts).
     - Rapprochement assisté et manuel (`reconcileBankTransaction`) : **garantie absolue de non-création d'écriture comptable automatique** (zéro écriture insérée dans `accounting_entries`).
     - Prise en charge des règlements partiels et cumulatifs avec mise à jour du statut de facture (`PARTIALLY_PAID` puis `PAID` uniquement lorsque `paid_amount_minor === gross_amount_minor`).
     - Traitement du rejet de proposition (`rejectBankMatchingSuggestion`) et du marquage pour frais bancaires ou absence de justificatif (`flagBankTransactionNoReceipt`).
  2. `src/services/anomaly-service.ts` *(NOUVEAU)* : Moteur de détection déterministe d'anomalies (§18) :
     - Implémentation complète et déterministe des **10 règles de contrôle** :
       1. `RULE_VAT_CALCULATION_MISMATCH` : Incohérence arithmétique de TVA ($\text{HT} + \text{TVA} \neq \text{TTC}$ ou taux invalide).
       2. `RULE_UNBALANCED_ACCOUNTING_ENTRY` : Écriture comptable déséquilibrée ($\sum \text{Débit} \neq \sum \text{Crédit}$).
       3. `RULE_DUPLICATE_INVOICE_NUMBER` : Doublons potentiels de factures (même tiers + même numéro ou même date/montant).
       4. `RULE_INVOICE_SEQUENCE_GAP` : Rupture de séquence chronologique dans les factures émises.
       5. `RULE_UNRECONCILED_DEBIT_WITHOUT_INVOICE` : Opération bancaire débitrice sans facture ni justificatif associé.
       6. `RULE_EXPENSE_WITHOUT_RECEIPT` : Facture reçue d'achat sans document justificatif rattaché (`document_id IS NULL`).
       7. `RULE_AMOUNT_MISMATCH_INVOICE_DOCUMENT` : Discordance de montant entre facture et métadonnées du document extrait.
       8. `RULE_PAYMENT_OVERALLOCATED` : Montant rapproché supérieur au montant TTC de la facture.
       9. `RULE_OVERDUE_UNPAID_INVOICE` : Facture impayée dont la date d'échéance contractuelle est dépassée.
       10. `RULE_OLD_UNRECONCILED_BANK_TX` : Opération bancaire ancienne non rapprochée ($> 60$ jours).
     - Balayage idempotent `scanDossierAnomalies` évitant toute duplication d'anomalie ouverte pour la même règle et la même cible.
     - Traitement formel des faux positifs (`resolveAnomaly`) : statut `RESOLVED_BY_CORRECTION` ou `DISMISSED_WITH_JUSTIFICATION` exigeant impérativement un motif explicite d'au moins 10 caractères, archivé dans `history_json`.
  3. `src/server.ts` :
     - Exposition sécurisée des 8 routes REST :
       - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/import`
       - `GET /api/organizations/:orgId/dossiers/:dossierId/bank/transactions`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/reconcile`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/transactions/:txId/reject-suggestion`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/bank/transactions/:txId/flag-no-receipt`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/anomalies/scan`
       - `GET /api/organizations/:orgId/dossiers/:dossierId/anomalies`
       - `POST /api/organizations/:orgId/dossiers/:dossierId/anomalies/:anomalyId/resolve`
  4. `src/ui/app-view.ts` :
     - Implémentation complète des interfaces `#tab-banking` et `#tab-anomalies` :
       - Banque : En-tête KPI (opérations totales, rapprochées, en attente, solde net), téléversement glisser-déposer CSV/OFX, table des opérations avec badges de statut et score de suggestion, modale de rapprochement manuel/assisté avec recherche de factures, modale de marquage sans justificatif.
       - Anomalies : En-tête KPI (erreurs certaines, suspicions, alertes, total résolues), bouton de lancement du scan déterministe, filtres par sévérité/statut, modale de clôture avec saisie de justification obligatoire ($\ge 10$ car.).
       - Respect strict du Design System ComptaNova : zéro couleur hexadécimale codée en dur en dehors des variables de `:root`.
  5. `src/db/phase1-readiness-migration.ts` :
     - Alignement complet du schéma DDL PostgreSQL 16 dans `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL` pour les tables `import_batches`, `bank_transactions`, `reconciliation_links` et `anomalies`.
  6. `src/tests/phase1-lot1-6.test.ts` *(NOUVEAU)* :
     - Suite automatisée de 11 tests exhaustifs couvrant : parsing CSV/OFX, anti-réimport SHA-256, déduplication unitaire, calcul du score de rapprochement, non-création d'écriture comptable, multi-paiements partiels, frais bancaires/sans justificatif, les 10 règles d'anomalies (§18), résolution avec justification $\ge 10$ car., étanchéité multi-tenant et vérification réelle sur instance PostgreSQL 16.
- **Résultats des tests** :
  - Commande : `npm test` (`npm run build && node --test dist/tests/*.test.js`)
  - Résultat : **80/80 tests passants** (9 suites de tests, 0 échec, durée `2613.76 ms`).
- **Arrêt et point d'étape** :
  - Fin d'exécution du Lot 1.6. Arrêt strict sans enchaînement sur le Lot 1.7 et sans push distant, dans l'attente des instructions de l'utilisateur.



