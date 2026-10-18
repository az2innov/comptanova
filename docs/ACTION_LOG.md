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

