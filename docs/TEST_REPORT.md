# RAPPORT DES CAMPAGNES DE TESTS (`TEST_REPORT.md`) — ComptaNova

Ce document retrace chaque campagne de tests exécutée sur le dépôt, le décompte exact par lot (propres au lot, cumulés et réellement exécutés), les erreurs observées, les corrections appliquées et les tests non encore écrits ou dépendant de services externes.

---

## 1. Synthèse du Décompte des Tests par Lot (Clarification d'Audit Indépendant)

| Lot | Fichier de suite de tests | Tests propres au lot | Nombre cumulé | Tests réellement exécutés | Résultat constaté |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Lot 0.1** | [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) | **9** | **9** | **9** | **9 / 9 réussis** |
| **Lot 0.2** | [`src/tests/international-scope.test.ts`](../src/tests/international-scope.test.ts) | **8** | **17** (`9 + 8`) | **8** | **8 / 8 réussis** |
| **Lot 0.3 & Lot 0.5** | [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) | **+5** *(4 en Lot 0.3 + 1 en Lot 0.5)* | **22** (`9 + 8 + 5`) | **5** | **5 / 5 réussis** |
| **TOTAL** | **3 suites de tests** | **22** | **22** | **22** | **22 / 22 réussis (`0 fail`, `0 skipped`)** |

### Répartition par nature des 22 tests exécutés :
1. **Tests unitaires (9 tests)** :
   - `phase0.test.ts` #1 (arithmétique `EUR` & équilibre Débit/Crédit), #6 (contrôles déterministes TVA & écritures).
   - `international-scope.test.ts` #1 (devises 0, 2, 3 décimales `XOF`, `JPY`, `MAD`, `AED`, `TND`, `BHD`, `KWD`, `OMR`), #2 (arrondis `HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`), #3 (conversions FX auditées & écarts de change), #4 (formatage localisé & rendu RTL `ar-AE`), #7 (analyse statique vérifiant l'absence de taux ou seuils nationaux codés en dur dans le cœur métier).
   - `phase1-readiness-and-postgres.test.ts` #1 (avoirs négatifs, devise `CLF` à 4 décimales & FX), #2 (identification `isSimulatedTestAdapter: true` et blocage de `mock-deterministic` en `NODE_ENV=production`).
2. **Tests d'intégration SQLite & services métier (6 tests)** :
   - `phase0.test.ts` #2 (`authenticateUser` succès et rejet 401), #5 (registre pays, statut `PENDING_LEGAL_VALIDATION` de `FR-2026.1-REV0`, blocage simulation barème non vérifié), #7 (défense anti-injection de prompt & détection de doublon documentaire `SHA-256`).
   - `international-scope.test.ts` #5 (reproductibilité historique `FR-2025.1-HISTORICAL` vs `FR-2026.1-REV0`), #6 (`assertCanActivateJurisdictionForProduction` bloquant les juridictions non validées).
   - `phase1-readiness-and-postgres.test.ts` #3 (migration `003`, table `third_parties`, rejet écriture multi-lignes déséquilibrée, insertion écriture équilibrée 3 lignes, `import_batches`, `bank_transactions`, `reconciliation_links`).
3. **Tests de sécurité, RBAC, isolation multi-tenant et intégrité d'audit (4 tests dédiés)** :
   - `phase0.test.ts` #3 (rejet 403 accès croisé Tenant A $\leftrightarrow$ Tenant B), #4 (droits granulaires par dossier `VIEW` vs `EXPORT` et justification minimale de 10 caractères pour `PLATFORM_ADMIN`), #8 (jetons signés `HMAC-SHA256` et détection d'altération SQL sur `audit_logs` via `verifyAuditChainIntegrity`).
   - `phase1-readiness-and-postgres.test.ts` #5 (refus de démarrage en production sans secrets `SEC-OPEN-01`, triggers d'inaltérabilité `BEFORE UPDATE/DELETE` sur `audit_logs` `SEC-OPEN-04`, révocation `revokeSession()` et expiration `expires_at` de session `SEC-OPEN-03`, restriction RBAC `FIRM_ADMIN` sur `/audit-logs` `SEC-OPEN-02`, en-têtes `Content-Security-Policy` et palette `#153D35`/`#237D68`/`#D9A441` `SEC-OPEN-05`/`REQ-002`, et rate-limiting `429` sur `POST /api/auth/login`).
4. **Tests d'intégration HTTP de bout en bout avec démarrage réel du serveur (2 tests)** :
   - `phase0.test.ts` #9 (`createAppServer`, `GET /api/health`, `GET /`, `POST /api/auth/login`, `GET /api/organizations`, `GET /api/organizations/:id/dashboard`, rejet 403 inter-tenant).
   - `international-scope.test.ts` #8 (`GET /?lang=ar-AE`, `POST /api/organizations` avec `TN`/`TND` et `AE`/`AED`, création de dossiers et vérification de l'isolation inter-organisations).
5. **Test d'intégration réel sur SGBD PostgreSQL 16.15 (1 test)** :
   - `phase1-readiness-and-postgres.test.ts` #4 (connexion à `psql -U postgres -h /tmp`, création d'un schéma isolé, déploiement des 20 tables métier et du trigger PostgreSQL `trg_pg_audit_logs_immutable` de `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL`, insertions multi-tenant et écriture multi-lignes équilibrée, vérification de `information_schema.tables = 20`, nettoyage).

---

## 2. Campagne `TEST-CAMP-005` — Vérification Post-Remédiation Lot 0.5 (`SEC-OPEN-01` à `SEC-OPEN-05` & `REQ-002`)
- **Date** : 2026-10-18 15:38 (+01:00)
- **Commande exécutée** : `npm run typecheck && npm test`
- **Résultats observés** :
  - `npm run typecheck` : `0 erreur`.
  - `npm test` : **22 réussis / 0 échoué / 0 ignoré** (`1061.28 ms`).
  - Les 4 scénarios de sécurité précédemment identifiés lors de `TEST-CAMP-004` (`revokeSession`, `expires_at`, HTTP `429` sur login, refus de démarrage `NODE_ENV=production` sans secrets, triggers `audit_logs`, RBAC `/audit-logs` et `CSP`) sont désormais intégralement couverts et validés par le test n° 5 de `phase1-readiness-and-postgres.test.ts`.
  - Seuls les tests d'intégration vers des services cloud externes (LLM OpenAI/Anthropic, AWS S3) restent **`NON VÉRIFIÉ`** en local faute de clés API externes.

---

## 3. Campagne `TEST-CAMP-004` — Rejeu Indépendant de Clôture Phase 0
- **Date** : 2026-10-18 15:16 – 15:22 (+01:00)
- **Résultats observés** : `npm run typecheck` (`0 erreur`), `npm test` (**21/21 réussis** en `934.74 ms`), identification des scénarios de tests de sécurité complémentaires ensuite implémentés en `TEST-CAMP-005`.

---

## 3. Historique des Campagnes Précédentes (`TEST-CAMP-001` à `TEST-CAMP-003`)

- **`TEST-CAMP-003` (2026-10-18 13:47 – 13:52)** : Ajout de `src/tests/phase1-readiness-and-postgres.test.ts` (4 nouveaux tests). Corrections appliquées pendant la campagne : placement de la contrainte `CHECK` en fin de table `accounting_entry_lines`, ajout de `CLF` (4 décimales) dans `money.ts`, utilisation de `schema_migrations.version` et de `dossierFr.country_config_version_id`. Résultat final : **21/21 réussis** (`979.51 ms`).
- **`TEST-CAMP-002` (2026-10-18 13:18)** : Ajout de `src/tests/international-scope.test.ts` (8 nouveaux tests). Résultat : **17/17 réussis**.
- **`TEST-CAMP-001` (2026-10-18 12:52)** : Exécution initiale de `src/tests/phase0.test.ts` (9 tests). Correction de la journalisation d'audit sur identifiant d'organisation fictif (`SEC-FIX-01`). Résultat : **9/9 réussis**.
