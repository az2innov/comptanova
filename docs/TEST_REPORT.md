# RAPPORT DES CAMPAGNES DE TESTS (`TEST_REPORT.md`) — ComptaNova

Ce document retrace chaque campagne de tests exécutée sur le dépôt, le décompte exact par lot (propres au lot, cumulés et réellement exécutés), les erreurs observées, les corrections appliquées et les tests non encore écrits ou dépendant de services externes.

---

## 1. Synthèse du Décompte des Tests par Lot (Clarification d'Audit Indépendant)

| Lot | Fichier de suite de tests | Tests propres au lot | Nombre cumulé | Tests réellement exécutés | Résultat constaté |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Lot 0.1** | [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) | **9** | **9** | **9** | **9 / 9 réussis** |
| **Lot 0.2** | [`src/tests/international-scope.test.ts`](../src/tests/international-scope.test.ts) | **8** | **17** (`9 + 8`) | **8** | **8 / 8 réussis** |
| **Lot 0.3, 0.5 & 0.6** | [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) | **+5** *(4 en Lot 0.3 + 1 enrichi en Lot 0.5/0.6)* | **22** (`9 + 8 + 5`) | **5** | **5 / 5 réussis** |
| **TOTAL** | **3 suites de tests** | **22** | **22** | **22** | **22 / 22 réussis (`0 fail`, `0 skipped`)** |

### Répartition par nature des 22 tests exécutés :
1. **Tests unitaires (9 tests)** :
   - `phase0.test.ts` #1 (arithmétique `EUR` & équilibre Débit/Crédit), #6 (contrôles déterministes TVA & écritures).
   - `international-scope.test.ts` #1 (devises 0, 2, 3 décimales `XOF`, `JPY`, `MAD`, `AED`, `TND`, `BHD`, `KWD`, `OMR`), #2 (arrondis `HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`), #3 (conversions FX auditées & écarts de change), #4 (formatage localisé & rendu RTL `ar-AE`), #7 (analyse statique vérifiant l'absence de taux ou seuils nationaux codés en dur dans le cœur métier).
   - `phase1-readiness-and-postgres.test.ts` #1 (avoirs négatifs, devise `CLF` à 4 décimales & FX), #2 (identification `isSimulatedTestAdapter: true` et blocage de `mock-deterministic` en `NODE_ENV=production`).
2. **Tests d'intégration SQLite & services métier (6 tests)** :
   - `phase0.test.ts` #2 (`authenticateUser` succès et rejet 401), #5 (registre pays, statut `PENDING_LEGAL_VALIDATION` de `FR-2026.1-REV0`, blocage simulation barème non vérifié), #7 (défense anti-injection de prompt & détection de doublon documentaire `SHA-256`).
   - `international-scope.test.ts` #5 (reproductibilité historique `FR-2025.1-HISTORICAL` vs `FR-2026.1-REV0`), #6 (`assertCanActivateJurisdictionForProduction` bloquant les juridictions non validées).
   - `phase1-readiness-and-postgres.test.ts` #3 (migrations `001` à `004`, table `third_parties`, rejet écriture multi-lignes déséquilibrée, insertion écriture équilibrée 3 lignes, `import_batches`, `bank_transactions`, `reconciliation_links`).
3. **Tests de sécurité, RBAC, isolation multi-tenant et intégrité d'audit (4 tests dédiés)** :
   - `phase0.test.ts` #3 (rejet 403 accès croisé Tenant A $\leftrightarrow$ Tenant B), #4 (droits granulaires par dossier `VIEW` vs `EXPORT` et justification minimale de 10 caractères pour `PLATFORM_ADMIN`), #8 (jetons signés `HMAC-SHA256` et vérification d'intégrité `verifyAuditChainIntegrity`).
   - `phase1-readiness-and-postgres.test.ts` #5 (refus de démarrage en production pour chaque secret absent, court, de démo, sans entropie ou identique `SEC-OPEN-01` ; `resolveClientIp` avec `trustProxy: false/true` `SEC-OPEN-03` ; triggers d'inaltérabilité `BEFORE UPDATE/DELETE` sur `audit_logs` et préservation de `actor_user_id` lors de la suppression d'un utilisateur `SEC-OPEN-04` ; révocation `revokeSession()` et expiration `expires_at` de session ; matrice RBAC complète sur `/audit-logs` incluant `FIRM_ADMIN`, `CLIENT_DIRECTOR`, `ACCOUNTANT_COLLABORATOR` et `PLATFORM_ADMIN` `SEC-OPEN-02` ; en-têtes `CSP` / `Cache-Control: no-store` et vérification des 5 couleurs `#153D35`/`#237D68`/`#D9A441`/`#F7F6F2`/`#1C2421` sans aucune couleur ardoise/bleu héritée `SEC-OPEN-05`/`REQ-002` ; rate-limiting `429` sur `POST /api/auth/login` suivi de l'expiration de la fenêtre temporelle, de la purge mémoire et du retour à `200`).
4. **Tests d'intégration HTTP de bout en bout avec démarrage réel du serveur (2 tests)** :
   - `phase0.test.ts` #9 (`createAppServer`, `GET /api/health`, `GET /`, `POST /api/auth/login`, `GET /api/organizations`, `GET /api/organizations/:id/dashboard`, rejet 403 inter-tenant).
   - `international-scope.test.ts` #8 (`GET /?lang=ar-AE`, `POST /api/organizations` avec `TN`/`TND` et `AE`/`AED`, création de dossiers et vérification de l'isolation inter-organisations).
5. **Test d'intégration réel sur SGBD PostgreSQL 16.15 (1 test)** :
   - `phase1-readiness-and-postgres.test.ts` #4 (connexion à `psql -U postgres -h /tmp`, création d'un schéma isolé, déploiement des 20 tables métier et du trigger PostgreSQL `trg_pg_audit_logs_immutable`, test effectif de rejet d'`UPDATE` et `DELETE` sur `audit_logs` et de suppression d'utilisateur sans conflit FK, vérification de `information_schema.tables = 20`, nettoyage).

---

## 2. Campagne `TEST-CAMP-006` — Vérification Finale du Correctif Ciblé Lot 0.6
- **Date** : 2026-10-18 16:14 – 16:17 (+01:00)
- **Commandes exécutées** :
  - `npm run typecheck` $\rightarrow$ `0 erreur`.
  - `npm test` $\rightarrow$ **22 réussis / 0 échoué / 0 ignoré** (`1506.65 ms`).
  - `npm run migrate` $\rightarrow$ Application de `004_audit_logs_immutability_triggers` sur `./data/app.db` (`totalMigrations: 4`).
  - `npm run seed` $\rightarrow$ `status: "OK", seeded: false, organizationsCount: 2, usersCount: 4`.
  - Vérification directe de `./data/app.db` $\rightarrow$ `triggers: ["trg_audit_logs_immutable_delete", "trg_audit_logs_immutable_update"]`, `updateBlocked: true`, `deleteBlocked: true`, `integrity.valid: true`.

---

## 3. Historique des Campagnes Précédentes (`TEST-CAMP-001` à `TEST-CAMP-005`)

- **`TEST-CAMP-005` (2026-10-18 15:38)** : Ajout du test #5 dans `src/tests/phase1-readiness-and-postgres.test.ts` (Lot 0.5). Résultat : **22/22 réussis** (`1061.28 ms`).
- **`TEST-CAMP-004` (2026-10-18 15:16 – 15:22)** : Rejeu indépendant de clôture Phase 0 (**21/21 réussis** en `934.74 ms`).
- **`TEST-CAMP-003` (2026-10-18 13:47 – 13:52)** : Ajout de `src/tests/phase1-readiness-and-postgres.test.ts` (4 tests incluant PostgreSQL 16.15 réel). Résultat : **21/21 réussis** (`979.51 ms`).
- **`TEST-CAMP-002` (2026-10-18 13:18)** : Ajout de `src/tests/international-scope.test.ts` (8 tests). Résultat : **17/17 réussis**.
- **`TEST-CAMP-001` (2026-10-18 12:52)** : Exécution initiale de `src/tests/phase0.test.ts` (9 tests). Résultat : **9/9 réussis**.
