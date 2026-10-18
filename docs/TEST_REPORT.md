# RAPPORT DES CAMPAGNES DE TESTS (`TEST_REPORT.md`) — ComptaNova

Ce document retrace fidèlement chaque campagne de tests exécutée sur le dépôt, les erreurs réellement observées, les corrections appliquées et les résultats vérifiés. Aucun test non exécuté n'est présenté comme réussi.

---

## Campagne `TEST-CAMP-003` — Audit Complémentaire Phase 0, Schéma Phase 1 & PostgreSQL 16.15 Réel
- **Date** : 2026-10-18 13:47 – 13:52 (+01:00)
- **Environnement** : Linux (`x86_64`), Node.js `v22.22.0` (`node:sqlite` + `node:test`), TypeScript `5.8.2`, instance locale **PostgreSQL 16.15** (`psql -U postgres -h /tmp`).
- **Commandes exécutées** :
  ```bash
  npm run typecheck && npm test && npm run migrate && npm run seed
  ```
- **Objectif** : Vérifier les 3 suites de tests automatisés (Phase 0 + Extension Internationale + Préparation Phase 1 & PostgreSQL 16 réel), l'application des 3 migrations (`001`, `002`, `003`) et l'initialisation des données de démonstration.
- **Erreurs observées lors des premières exécutions & corrections apportées** :
  1. `Error: near "currency": syntax error` lors de l'application de `MIGRATION_003_PHASE1_READINESS_SQL` : une contrainte de table `CHECK (NOT (debit_minor > 0 AND credit_minor > 0))` était placée au milieu de la liste des colonnes de `accounting_entry_lines`. **Correction** : déplacement de la contrainte `CHECK` en fin de définition de table dans [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts).
  2. `Error: Devise non enregistrée dans le catalogue monétaire : "CLF"` : ajout de `CLF` (Unidad de Fomento, `minorUnitExponent: 4`) dans [`src/domain/money.ts`](../src/domain/money.ts).
  3. `Error: FOREIGN KEY constraint failed` dans le test n° 3 sur `ruleVersionId: "FR-PCG-2026.1"` : utilisation de l'identifiant réel `dossierFr.country_config_version_id` (`FR-2026.1.0`) issu du dossier de démonstration.
- **Résultat final après correction** :
  - `npm run typecheck` : **0 erreur**.
  - `npm test` : **21 tests exécutés | 21 réussis | 0 échoué | 0 ignoré** (durée totale : `979.51 ms`).
    - Suite 1 (`src/tests/international-scope.test.ts`) : **8/8 réussis** (`532.85 ms`).
    - Suite 2 (`src/tests/phase0.test.ts`) : **9/9 réussis** (`829.84 ms`).
    - Suite 3 (`src/tests/phase1-readiness-and-postgres.test.ts`) : **4/4 réussis** (`580.06 ms`), incluant la création et le test transactionnel des **20 tables métier** sur **PostgreSQL 16.15** (`psql -U postgres -h /tmp`).
  - `npm run migrate` : `{"status":"OK","appliedVersions":["003_phase1_readiness_schema"],"totalMigrations":3}`.
- **Tests non exécutés (et motifs)** :
  - Appel réseau vers les API externes OpenAI / Anthropic : **Non exécuté** (aucune clé API externe configurée en local ; seul l'adaptateur simulé `mock-deterministic` et son blocage en production sont testés).
  - Écriture vers un bucket distant AWS S3 / compatible S3 : **Non exécuté** (pas de bucket S3 distant configuré en local).
  - Test de validation DGFiP *Test Compta Demat* : **Non applicable en Phase 0** (la génération du fichier d'export FEC relève de la Phase 1).

---

## Campagne `TEST-CAMP-002` — Extension du Scope International (Multi-Devises 0/2/3 décimales, FX, RTL)
- **Date** : 2026-10-18 13:18 (+01:00)
- **Environnement** : Linux, Node.js `v22.22.0`, SQLite (`:memory:` et `./data/app.db`).
- **Commande exécutée** : `npm run typecheck && npm test && npm run migrate`
- **Résultat** : **17 tests exécutés | 17 réussis | 0 échoué** (`phase0.test.ts` [9/9] + `international-scope.test.ts` [8/8]).
- **Détail des vérifications** :
  - Devises à 0 décimale (`XOF`, `JPY`), 2 décimales (`EUR`, `MAD`, `AED`) et 3 décimales (`TND`, `BHD`, `KWD`, `OMR`).
  - Arrondis `HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`.
  - Conversion multi-devises avec piste d'audit et calcul d'écart de change réalisé (`FX_GAIN` / `FX_LOSS`).
  - Rendu localisé (`fr-FR`, `en-GB`, `ar-AE`) et attribut `dir="rtl"`.
  - Reproductibilité historique des versions réglementaires et blocage des juridictions non validées.
  - Analyse statique du code source du cœur métier confirmant l'absence de taux ou seuils nationaux codés en dur.

---

## Campagne `TEST-CAMP-001` — Socle Initial Phase 0
- **Date** : 2026-10-18 12:52 (+01:00)
- **Environnement** : Linux, Node.js `v22.22.0`, SQLite (`:memory:` et `./data/app.db`).
- **Commande exécutée** : `npm run typecheck && npm test`
- **Erreur observée & corrigée** : `FOREIGN KEY constraint failed` lors de la journalisation d'une tentative d'accès sur un identifiant d'organisation inexistant (`"org-intrusion"`). Corrigé dans [`src/audit/audit-service.ts`](../src/audit/audit-service.ts) pour conserver la trace d'audit avec `organization_id = NULL` et `metadata_json.unverifiedOrganizationId = "org-intrusion"`.
- **Résultat après correction** : **9 tests exécutés | 9 réussis | 0 échoué** (`src/tests/phase0.test.ts`).
