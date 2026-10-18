# JOURNAL DES MODIFICATIONS (CHANGELOG) — ComptaNova

Toutes les modifications notables apportées au dépôt sont consignées de manière chronologique et vérifiable dans ce fichier. Aucune fonctionnalité n'est inscrite comme livrée sans test exécuté et vérifié.

---

## [Lot 0.3 — Audit Complémentaire Phase 0, Schéma Phase 1, Garde-fou IA, PostgreSQL 16 & Traçabilité Complète] — 2026-10-18

- **Identifiant du lot** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Objectif** : Tester l'instance locale PostgreSQL 16.15, compléter le schéma relationnel pour la Phase 1 France (`003_phase1_readiness_schema`), verrouiller l'adaptateur IA simulé en production, ajouter la devise `CLF` (4 décimales) au catalogue monétaire, et établir l'ensemble des 11 registres documentaires de traçabilité exigés par la Phase 0.
- **Modifications principales** :
  - Ajout de la migration `003_phase1_readiness_schema` créant 8 nouvelles tables (`third_parties`, `chart_of_accounts`, `accounting_journals`, `accounting_entry_lines`, `import_batches`, `bank_transactions`, `reconciliation_links`, `anomalies`) et portant le modèle à 20 tables métier.
  - Ajout de `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL` et de la fonction transactionnelle `recordMultiLineAccountingEntry()` imposant l'équilibre Débit = Crédit sur $\ge 2$ lignes.
  - Ajout de `isSimulatedTestAdapter: true`, `simulationNotice` et du garde-fou `assertAiProviderAllowedForEnvironment()` dans `src/ai/ai-gateway.ts`.
  - Ajout de la devise ISO 4217 à 4 décimales `CLF` (Unidad de Fomento) dans `src/domain/money.ts`.
  - Création de la suite de tests `src/tests/phase1-readiness-and-postgres.test.ts` incluant le test réel sur PostgreSQL 16.15 (`psql -U postgres -h /tmp`).
  - Création du corpus documentaire complet sous `docs/`.
- **Fichiers créés ou modifiés** :
  - `src/db/phase1-readiness-migration.ts` (créé)
  - `src/db/database.ts` (modifié : enregistrement de la migration `003` et gestion de `PRAGMA foreign_keys = OFF` hors transaction SQLite)
  - `src/ai/ai-gateway.ts` (modifié)
  - `src/domain/money.ts` (modifié)
  - `src/tests/phase1-readiness-and-postgres.test.ts` (créé)
  - `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/ACTION_LOG.md`, `docs/DECISIONS.md`, `docs/TEST_REPORT.md`, `docs/RISK_REGISTER.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/SECURITY_REVIEW.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`, `docs/PHASE0_SPECIFICATION_CONSOLIDEE.md` (créés)
- **Migrations appliquées** : `003_phase1_readiness_schema` (appliquée sur `./data/app.db` et testée sur PostgreSQL 16.15).
- **Tests exécutés & résultats** :
  - `npm run typecheck` $\rightarrow$ `0 erreur`.
  - `npm test` $\rightarrow$ **21/21 tests réussis** (3 suites : Phase 0 [9 tests], Extension Internationale [8 tests], Préparation Phase 1 & PostgreSQL 16 réel [4 tests]).
- **Problèmes connus** : Les connecteurs externes LLM et S3 restent non activés en local par absence volontaire de clés API tierces ; les règles fiscales restent soumises à validation par un expert-comptable.
- **Référence au rapport détaillé** : [`docs/TEST_REPORT.md`](./TEST_REPORT.md) (Campagne `TEST-CAMP-003`).

---

## [Lot 0.2 — Extension du Scope International, Multi-Devises 0/2/3 Décimales & RTL] — 2026-10-18

- **Identifiant du lot** : `LOT-0.2-INTERNATIONAL-EXTENSION`
- **Objectif** : Étendre l'architecture Phase 0 à une plateforme internationale (Europe, Maghreb, Moyen-Orient/CCG, Afrique subsaharienne, Amériques, Asie-Pacifique) avec séparation stricte en 3 niveaux, support des devises à 0, 2 et 3 décimales, conversions FX auditées et support RTL (arabe).
- **Modifications principales** :
  - Refactorisation de `src/domain/money.ts` pour gérer explicitement `minorUnitExponent` (`0`, `2`, `3`, `4`), 4 modes d'arrondi (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`), `convertCurrencyWithAudit()` et `computeRealizedExchangeDifference()`.
  - Extension de `src/countries/country-registry.ts` à 13 juridictions (`FR`, `BE`, `LU`, `CH`, `MA`, `TN`, `DZ`, `AE`, `SA`, `QA`, `BH`, `OM`, `KW`) avec cycle de vie explicite (`DRAFT`, `IN_REVIEW`, `VALIDATED`, `ACTIVE`, `SUSPENDED`, `OBSOLETE`) et blocage en production des juridictions non validées.
  - Ajout de la migration `002_international_scope_extension` (ajout des colonnes de juridiction fiscale, résidence fiscale, exposant monétaire et audit de change).
  - Ajout du module d'internationalisation `src/i18n/translations.ts` (`fr-FR`, `en-GB`, `ar-AE` RTL) et prise en charge `dir="rtl"` dans `src/ui/app-view.ts`.
- **Fichiers créés ou modifiés** :
  - `src/domain/money.ts`, `src/domain/types.ts`, `src/countries/country-registry.ts`, `src/db/database.ts`, `src/services/tenant-service.ts`, `src/server.ts`, `src/ui/app-view.ts` (modifiés)
  - `src/i18n/translations.ts`, `src/tests/international-scope.test.ts` (créés)
- **Migrations appliquées** : `002_international_scope_extension`.
- **Tests exécutés & résultats** : **17/17 tests réussis** (`phase0.test.ts` [9] + `international-scope.test.ts` [8]).
- **Référence au rapport détaillé** : [`docs/TEST_REPORT.md`](./TEST_REPORT.md) (Campagne `TEST-CAMP-002`).

---

## [Lot 0.1 — Fondations Phase 0 : Multi-Tenant, Auth, RBAC, Moteur Déterministe, Audit SHA-256 & UI] — 2026-10-18

- **Identifiant du lot** : `LOT-0.1-PHASE0-FOUNDATIONS`
- **Objectif** : Construire le socle technique initial de ComptaNova (configuration centralisée, base SQLite avec migration `001`, authentification `scrypt` + sessions `HMAC-SHA256`, RBAC serveur, isolation multi-tenant, moteur déterministe, passerelle IA anti-injection, audit chaîné `SHA-256` et interface web initiale).
- **Fichiers créés** :
  - `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`
  - `src/config/app-config.ts`, `src/domain/money.ts`, `src/domain/types.ts`, `src/countries/country-registry.ts`, `src/rules/deterministic-engine.ts`, `src/ai/ai-gateway.ts`, `src/db/database.ts`, `src/db/migrate-cli.ts`, `src/db/seed.ts`, `src/db/seed-cli.ts`, `src/audit/audit-service.ts`, `src/auth/auth-service.ts`, `src/services/tenant-service.ts`, `src/ui/app-view.ts`, `src/server.ts`, `src/tests/phase0.test.ts`
- **Migrations appliquées** : `001_phase0_foundations`.
- **Tests exécutés & résultats** : **9/9 tests réussis** (`src/tests/phase0.test.ts`).
- **Référence au rapport détaillé** : [`docs/TEST_REPORT.md`](./TEST_REPORT.md) (Campagne `TEST-CAMP-001`).
