# JOURNAL DES MODIFICATIONS (`CHANGELOG.md`) — ComptaNova

Toutes les modifications et vérifications notables apportées au dépôt sont consignées de manière chronologique et vérifiable dans ce fichier.

---

## [Lot 0.5 — Remédiation Post-Audit Indépendant : Sécurité Production, RBAC Audit-Logs, Rate-Limit Login, Triggers Audit & Charte UI] — 2026-10-18

- **Identifiant du lot** : `LOT-0.5-SECURITY-AND-UI-REMEDIATION`
- **Objectif** : Lever immédiatement les réserves techniques de sécurité (`SEC-OPEN-01` à `SEC-OPEN-05`) et l'écart cosmétique (`REQ-002`) identifiés lors de l'audit indépendant de clôture de la Phase 0 (`Lot 0.4`), et couvrir l'ensemble par des tests automatisés.
- **Modifications principales** :
  - `SEC-OPEN-01` : Blocage du démarrage en `NODE_ENV=production` si `SESSION_SECRET` ou `SIGNED_URL_SECRET` est absent, $< 32$ caractères ou égal à un secret de démonstration ([`src/config/app-config.ts`](../src/config/app-config.ts)).
  - `SEC-OPEN-02` : Restriction RBAC de `GET /api/organizations/:orgId/audit-logs` au rôle `FIRM_ADMIN` (ou `PLATFORM_ADMIN` justifié) ([`src/server.ts`](../src/server.ts)).
  - `SEC-OPEN-03` : Ajout d'un limiteur de débit spécifique sur `POST /api/auth/login` (`10 req/min/IP` par défaut), purge des clés expirées et tests automatisés de `revokeSession()`, `expires_at` et HTTP `429`.
  - `SEC-OPEN-04` : Ajout des triggers SQL `BEFORE UPDATE` et `BEFORE DELETE` sur `audit_logs` dans SQLite et PostgreSQL 16 ([`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)).
  - `SEC-OPEN-05` & `REQ-002` : En-tête `Content-Security-Policy`, filtrage des erreurs SQL internes et injection dynamique de la palette officielle `#153D35` / `#237D68` / `#D9A441` dans [`src/ui/app-view.ts`](../src/ui/app-view.ts).
- **Tests exécutés & résultats** :
  - `npm run typecheck` $\rightarrow$ `0 erreur`.
  - `npm test` $\rightarrow$ **22/22 tests réussis** en `1061.28 ms` (`TEST-CAMP-005`).

---

## [Lot 0.4 — Audit Indépendant de Clôture de la Phase 0 & Alignement Documentaire Factuel] — 2026-10-18

- **Identifiant du lot** : `LOT-0.4-INDEPENDENT-CLOSURE-AUDIT`
- **Objectif** : Réaliser un audit technique, sécurité, comptable/international et documentaire indépendant sur l'état réel du dépôt après le commit `430bc22`, rejouer toutes les commandes de vérification, clarifier le décompte exact des tests par lot et corriger les incohérences factuelles de la documentation sans altérer le comportement métier.
- **Modifications principales** :
  - Création du rapport d'audit indépendant [`docs/PHASE0_CLOSURE_AUDIT.md`](./PHASE0_CLOSURE_AUDIT.md) classant chaque contrôle selon les statuts `VÉRIFIÉ`, `PARTIELLEMENT VÉRIFIÉ`, `ÉCHEC CONFIRMÉ`, `NON VÉRIFIÉ`, `NON APPLICABLE`.
  - Clarification dans [`docs/TEST_REPORT.md`](./TEST_REPORT.md) du décompte par lot : Lot 0.1 (`9` tests), Lot 0.2 (`+8` = `17` tests cumulés), Lot 0.3 (`+4` = `21` tests cumulés et exécutés).
  - Documentation transparente des écarts de sécurité découverts lors de l'inspection ligne par ligne du code (`SEC-OPEN-01` : repli sur `defaultDevSecret` en `NODE_ENV=production` dans `app-config.ts` ; `SEC-OPEN-02` : absence de filtre `FIRM_ADMIN` sur `GET /api/organizations/:orgId/audit-logs` ; `SEC-OPEN-03` : seuil du rate limiter sur `/api/auth/login` et tests `revokeSession`/`expires_at`/`429` à ajouter ; `SEC-OPEN-04` : triggers SQL d'immuabilité sur `audit_logs`).
  - Correction des incohérences factuelles dans `ARCHITECTURE.md`, `OPERATIONS.md`, `DECISIONS.md`, `PROJECT_STATUS.md`, `REQUIREMENTS_TRACEABILITY.md` et `RISK_REGISTER.md` (distinction exacte entre les **8 versions / 7 pays** de `country-registry.ts` où `FR-2026.1-REV0` est en `PENDING_LEGAL_VALIDATION` avec `isProductionEnabled: false`, et les **20 devises** de `money.ts` ; noms exacts des variables `.env` ; liste exacte des 15 routes HTTP de `src/server.ts` ; seuil de 10 caractères pour la justification `PLATFORM_ADMIN` ; constat de la palette CSS actuelle dans `src/ui/app-view.ts`).
- **Fichiers créés ou modifiés** :
  - `docs/PHASE0_CLOSURE_AUDIT.md` (créé)
  - `docs/TEST_REPORT.md`, `docs/SECURITY_REVIEW.md`, `docs/RISK_REGISTER.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/PROJECT_STATUS.md`, `docs/ACTION_LOG.md`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/DECISIONS.md` (mis à jour)
  - *Aucun fichier de code source (`src/`) n'a été modifié pendant l'audit.*
- **Tests exécutés & résultats** :
  - `npm run typecheck` $\rightarrow$ `0 erreur`.
  - `npm test` $\rightarrow$ **21/21 tests réussis** en `934.74 ms` (`TEST-CAMP-004`).
  - `npm run migrate` & `npm run seed` $\rightarrow$ `OK`.
- **Référence au rapport détaillé** : [`docs/PHASE0_CLOSURE_AUDIT.md`](./PHASE0_CLOSURE_AUDIT.md) et [`docs/TEST_REPORT.md`](./TEST_REPORT.md).

---

## [Lot 0.3 — Audit Complémentaire Phase 0, Schéma Phase 1, Garde-fou IA, PostgreSQL 16 & Traçabilité] — 2026-10-18

- **Identifiant du lot** : `LOT-0.3-AUDIT-PHASE1-PG16-DOCS`
- **Objectif** : Tester l'instance locale PostgreSQL 16.15, compléter le schéma relationnel pour la Phase 1 France (`003_phase1_readiness_schema` — +8 tables, soit 20 tables métier au total), verrouiller l'adaptateur IA simulé en production (`assertAiProviderAllowedForEnvironment`), ajouter la devise `CLF` (4 décimales) et créer les registres documentaires sous `docs/`.
- **Migrations appliquées** : `003_phase1_readiness_schema`.
- **Tests exécutés & résultats** : **4 nouveaux tests** (`src/tests/phase1-readiness-and-postgres.test.ts`), portant le total cumulé à **21/21 tests réussis** (`TEST-CAMP-003`).

---

## [Lot 0.2 — Extension du Scope International, Multi-Devises 0/2/3 Décimales & RTL] — 2026-10-18

- **Identifiant du lot** : `LOT-0.2-INTERNATIONAL-EXTENSION`
- **Objectif** : Étendre l'architecture Phase 0 à une plateforme internationale (séparation stricte en 3 niveaux, support des devises à 0, 2 et 3 décimales, conversions FX auditées, 8 versions de juridictions couvrant 7 pays et support RTL arabe).
- **Migrations appliquées** : `002_international_scope_extension`.
- **Tests exécutés & résultats** : **8 nouveaux tests** (`src/tests/international-scope.test.ts`), portant le total cumulé à **17/17 tests réussis** (`TEST-CAMP-002`).

---

## [Lot 0.1 — Fondations Phase 0 : Multi-Tenant, Auth, RBAC, Moteur Déterministe, Audit SHA-256 & UI] — 2026-10-18

- **Identifiant du lot** : `LOT-0.1-PHASE0-FOUNDATIONS`
- **Objectif** : Construire le socle technique initial de ComptaNova.
- **Migrations appliquées** : `001_phase0_foundations` (12 tables).
- **Tests exécutés & résultats** : **9 tests initiaux** (`src/tests/phase0.test.ts` — **9/9 réussis**, `TEST-CAMP-001`).
