# JOURNAL CHRONOLOGIQUE DES ACTIONS DE DÉVELOPPEMENT (`ACTION_LOG`) — ComptaNova

> **Avertissement** : Ce document constitue la documentation d'ingénierie et de traçabilité des actions de développement réalisées sur le dépôt. Il est distinct du journal d'audit applicatif (`audit_logs` en base de données, géré par [`src/audit/audit-service.ts`](../src/audit/audit-service.ts)). Aucun secret, mot de passe réel ou jeton d'accès n'y est enregistré.

---

### `ACT-0001` — Audit initial de l'environnement et initialisation du socle TypeScript / Node.js 22
- **Date et heure** : 2026-10-18 12:30 – 12:36 (+01:00)
- **Lot concerné** : `LOT-0.1-PHASE0-FOUNDATIONS`
- **Action effectuée** : Inspection du répertoire de travail `/home/bse/Documents/ComptaNova` (initialement vide), vérification de l'environnement d'exécution (`Node.js v22.22.0`, `npm 10.9.4`, module natif `node:sqlite`) et création des fichiers de configuration de base.
- **Motif** : Établir un socle TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`), sans dépendances superflues risquant d'introduire des vulnérabilités de chaîne d'approvisionnement.
- **Éléments examinés** : Répertoire racine `/home/bse/Documents/ComptaNova`, binaires système `node` et `npm`.
- **Fichiers créés** : `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `src/config/app-config.ts`.
- **Commandes utilisées** : `node -v`, `npm install`.
- **Tests associés** : Vérification de la compilation via `npm run typecheck`.
- **Résultat observé** : Installation propre des types `@types/node` et compilation TypeScript sans erreur.
- **Décision prise** : Voir `ADR-0001` et `ADR-0002` dans [`docs/DECISIONS.md`](./DECISIONS.md).
- **Limites et suites** : Git n'était pas initialisé dans le dossier ; conserver la structure prête pour un `git init` contrôlé.

---

### `ACT-0002` — Implémentation du cœur métier, de l'authentification, du RBAC, de l'audit SHA-256 et de la migration `001`
- **Date et heure** : 2026-10-18 12:36 – 12:55 (+01:00)
- **Lot concerné** : `LOT-0.1-PHASE0-FOUNDATIONS`
- **Action effectuée** : Développement des modules fondamentaux de la Phase 0 (modèle monétaire, types métier, registre pays initial `FR`/`BE`/`LU`/`CH`, moteur de règles déterministe, passerelle IA avec isolation anti-prompt injection, base SQLite avec migration `001_phase0_foundations`, piste d'audit chaînée SHA-256, authentification `scrypt` + sessions `HMAC-SHA256`, RBAC serveur, interface web initiale et serveur HTTP).
- **Motif** : Répondre aux critères fonctionnels et de sécurité de la Phase 0 avec persistance réelle en base de données.
- **Éléments examinés** : Cahier des charges du Prompt Maître (Sections 1 à 15).
- **Fichiers créés** : `src/domain/money.ts`, `src/domain/types.ts`, `src/countries/country-registry.ts`, `src/rules/deterministic-engine.ts`, `src/ai/ai-gateway.ts`, `src/db/database.ts`, `src/db/migrate-cli.ts`, `src/db/seed.ts`, `src/db/seed-cli.ts`, `src/audit/audit-service.ts`, `src/auth/auth-service.ts`, `src/services/tenant-service.ts`, `src/ui/app-view.ts`, `src/server.ts`, `src/tests/phase0.test.ts`.
- **Commandes utilisées** : `npm run typecheck && npm test && npm run migrate && npm run seed`.
- **Tests associés** : Suite `src/tests/phase0.test.ts` (9 tests).
- **Résultat observé** : Lors du premier lancement de test, l'insertion d'audit avec un identifiant d'organisation fictif `"org-intrusion"` déclenchait une erreur de clé étrangère (`FOREIGN KEY constraint failed`). Correction apportée dans `src/audit/audit-service.ts` pour vérifier l'existence de `organization_id` / `dossier_id` avant insertion et reporter un identifiant inexistant dans `metadata_json.unverifiedOrganizationId` afin de ne jamais perdre une trace d'intrusion. Relance : **9/9 tests passants**.
- **Décision prise** : Voir `ADR-0004`, `ADR-0005`, `ADR-0010` dans [`docs/DECISIONS.md`](./DECISIONS.md).
- **Limites et suites** : Étendre le périmètre monétaire et réglementaire à l'échelle mondiale (Maghreb, CCG, Afrique, Amériques, Asie-Pacifique).

---

### `ACT-0003` — Audit et extension de l'architecture au périmètre international (Migration `002`)
- **Date et heure** : 2026-10-18 12:58 – 13:20 (+01:00)
- **Lot concerné** : `LOT-0.2-INTERNATIONAL-EXTENSION`
- **Action effectuée** :
  1. Audit du code Phase 0 vis-à-vis des exigences internationales (devises à 0 et 3 décimales, conversions FX auditées, séparation pays d'établissement / juridiction fiscale / résidence fiscale, support RTL arabe).
  2. Extension de `src/domain/money.ts` aux devises à 0 (`XOF`, `XAF`, `JPY`), 2 (`EUR`, `MAD`, `DZD`, `AED`, `SAR`, `QAR`, `USD`, `GBP`, `CHF`, `CAD`, `AUD`, `SGD`) et 3 décimales (`TND`, `BHD`, `OMR`, `KWD`), avec 4 modes d'arrondi et conversion FX auditée.
  3. Extension de `src/countries/country-registry.ts` à 13 juridictions et ajout de la migration non destructive `002_international_scope_extension`.
  4. Ajout du module i18n (`fr-FR`, `en-GB`, `ar-AE` RTL) et de la suite de tests `src/tests/international-scope.test.ts` (8 tests).
- **Motif** : Garantir que le cœur métier ne contient aucune hypothèse eurocentrée ou limitée à 2 décimales monétaires.
- **Fichiers créés ou modifiés** : `src/domain/money.ts`, `src/domain/types.ts`, `src/countries/country-registry.ts`, `src/i18n/translations.ts`, `src/db/database.ts`, `src/services/tenant-service.ts`, `src/ui/app-view.ts`, `src/server.ts`, `src/tests/international-scope.test.ts`.
- **Commandes utilisées** : `npm run typecheck && npm test && npm run migrate`.
- **Tests associés** : `src/tests/phase0.test.ts` (9 tests) + `src/tests/international-scope.test.ts` (8 tests).
- **Résultat observé** : **17/17 tests réussis** et migration `002_international_scope_extension` appliquée sans perte de données sur `./data/app.db`.
- **Décision prise** : Voir `ADR-0007` et `ADR-0008` dans [`docs/DECISIONS.md`](./DECISIONS.md).
- **Limites et suites** : Tester PostgreSQL 16 en conditions réelles et préparer les tables détaillées de la Phase 1.

---

### `ACT-0004` — Vérification de l'instance PostgreSQL 16.15 locale (`psql -U postgres -h /tmp`)
- **Date et heure** : 2026-10-18 13:25 – 13:27 (+01:00)
- **Lot concerné** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Action effectuée** : Connexion et diagnostic de l'instance PostgreSQL installée via Snap sur le poste local via le socket Unix `/tmp`.
- **Motif** : Vérifier le fonctionnement réel de PostgreSQL localement et valider la compatibilité PostgreSQL du schéma relationnel ComptaNova.
- **Commandes utilisées** : `psql -U postgres -h /tmp -c "SELECT version(), current_database(), current_user;"`
- **Résultat observé** : `PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu | postgres | postgres`.
- **Décision prise** : Intégrer un test d'intégration automatisé exécutant le schéma complet (20 tables) et des écritures multi-lignes directement sur PostgreSQL 16.15 via `psql -U postgres -h /tmp` (voir `ADR-0003`).

---

### `ACT-0005` — Implémentation de la migration `003_phase1_readiness_schema`, du garde-fou IA de production et du support 4 décimales (`CLF`)
- **Date et heure** : 2026-10-18 13:28 – 13:52 (+01:00)
- **Lot concerné** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Action effectuée** :
  1. Création de `src/db/phase1-readiness-migration.ts` définissant les 8 tables complémentaires pour la Phase 1 (`third_parties`, `chart_of_accounts`, `accounting_journals`, `accounting_entry_lines`, `import_batches`, `bank_transactions`, `reconciliation_links`, `anomalies`), le DDL complet PostgreSQL 16 (`POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL` — 20 tables) et `recordMultiLineAccountingEntry()`.
  2. Mise à jour de `src/ai/ai-gateway.ts` avec `isSimulatedTestAdapter: true`, `simulationNotice` et `assertAiProviderAllowedForEnvironment()` bloquant `mock-deterministic` lorsque `NODE_ENV === "production"`.
  3. Ajout de la devise `CLF` (4 décimales) dans `src/domain/money.ts`.
  4. Création de `src/tests/phase1-readiness-and-postgres.test.ts` (4 nouveaux tests automatisés incluant le test réel PostgreSQL 16.15).
- **Commandes utilisées** : `npm run typecheck && npm test && npm run migrate && npm run seed`.
- **Tests associés** : 3 suites de tests (21 tests au total).
- **Résultat observé** :
  - Correction d'une contrainte de table `CHECK (NOT (debit_minor > 0 AND credit_minor > 0))` placée avant les dernières colonnes dans `accounting_entry_lines` (déplacée en fin de table conformément à la grammaire SQLite/PostgreSQL).
  - Correction de l'emplacement de `PRAGMA foreign_keys = OFF;` dans `src/db/database.ts` (exécuté avant `BEGIN TRANSACTION;` car SQLite ignore ce pragma à l'intérieur d'une transaction ouverte).
  - Après correction : **21/21 tests passants** (`0 fail`) et migration `003_phase1_readiness_schema` appliquée avec succès.
- **Décision prise** : Voir `ADR-0003`, `ADR-0007` et `ADR-0009` dans [`docs/DECISIONS.md`](./DECISIONS.md).

---

### `ACT-0006` — Structuration complète du corpus documentaire et de la traçabilité Phase 0 (`docs/`)
- **Date et heure** : 2026-10-18 14:08 – 14:25 (+01:00)
- **Lot concerné** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Action effectuée** : Création et consolidation des 11 documents obligatoires de la Section 4.1 (`PROJECT_STATUS.md`, `CHANGELOG.md`, `ACTION_LOG.md`, `DECISIONS.md`, `TEST_REPORT.md`, `RISK_REGISTER.md`, `REQUIREMENTS_TRACEABILITY.md`, `SECURITY_REVIEW.md`, `ARCHITECTURE.md`, `OPERATIONS.md`, `LEGAL_AND_COMPLIANCE_CHECKLIST.md`) ainsi que de la spécification Phase 0 reformulée (`PHASE0_SPECIFICATION_CONSOLIDEE.md`), tout en préservant les fichiers `.odt` de l'utilisateur présents dans `docs/`.
- **Motif** : Assurer une traçabilité intégrale et vérifiable entre exigences, code, base de données, tests, risques et décisions d'architecture avant le lancement de la Phase 1.
- **Fichiers créés** : 12 fichiers Markdown sous `docs/`.
- **Résultat observé** : Corpus documentaire complet, cohérent avec le code réel et les 21 tests automatisés.
