# COMPTANOVA — RAPPORT D'AUDIT INDÉPENDANT DE CLÔTURE DE LA PHASE 0 (`PHASE0_CLOSURE_AUDIT.md`)

- **Date de l'audit** : 2026-10-18T15:23:00+01:00
- **Auditeur** : Audit technique indépendant (Architecture, Sécurité applicative, QA & Traçabilité)
- **Référence Git auditée** : Branche `main`, commit `430bc22` (`https://github.com/az2innov/comptanova.git`), arbre de travail propre avant audit.
- **Principe directeur appliqué** : Aucune affirmation du rapport précédent n'a été acceptée sans vérification directe dans le code source (`src/`), dans la configuration et par ré-exécution complète des commandes.

---

## 1. Légende des Statuts de Constat

Conformément au référentiel d'audit (Section 8), chaque constat est classé selon l'un des cinq états suivants :
- **`VÉRIFIÉ`** : Implémenté dans le code, cohérent avec la documentation et prouvé par un test ou une commande exécutée pendant cet audit.
- **`PARTIELLEMENT VÉRIFIÉ`** : Le mécanisme principal existe et fonctionne, mais présente une limite technique, un écart documentaire ou une couverture de test incomplète.
- **`ÉCHEC CONFIRMÉ`** : Une exigence annoncée comme acquise est absente ou présente un défaut avéré dans le code actuel.
- **`NON VÉRIFIÉ`** : Dépend d'un service ou d'une validation externe impossible à exécuter dans l'environnement local.
- **`NON APPLICABLE`** : Ne s'applique pas à l'architecture technique actuelle de la Phase 0.

---

## 2. Vérification de l'État Réel du Dépôt (Section 3)

| Élément inspecté | Statut | Preuve factuelle constatée sur le dépôt |
| :--- | :--- | :--- |
| **Structure du projet (`src/` — 20 fichiers TypeScript)** | **`VÉRIFIÉ`** | 17 fichiers sources métier/techniques + 3 fichiers de tests sous `src/tests/`. Compilation vers `dist/`. |
| **Configuration TypeScript (`tsconfig.json`) & `package.json`** | **`VÉRIFIÉ`** | `target: ES2024`, `module: NodeNext`, `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`. Zéro dépendance runtime tierce ; seules `@types/node` et `typescript` sont en `devDependencies`. |
| **Fichiers `.env`, `.env.example`, `.gitignore` et secrets** | **`VÉRIFIÉ`** | Aucun fichier `.env` local n'existe ; `.gitignore` exclut `.env*`, `*.db*`, `data/`, `dist/`, `node_modules/`, `.~lock.*`, `*.dump`. Aucun secret réel n'est présent dans l'historique Git (`430bc22`). |
| **État Git** | **`VÉRIFIÉ`** | Dépôt Git initialisé sur `main`, synchronisé avec `origin/main` (`https://github.com/az2innov/comptanova.git`, commit `430bc22`). |
| **Migrations SQLite (`001`, `002`, `003`) & Schéma PostgreSQL 16 (20 tables)** | **`VÉRIFIÉ`** | 3 migrations enregistrées dans `schema_migrations` ([`src/db/database.ts`](../src/db/database.ts)). Les 20 tables métier (12 en Phase 0 + 8 en migration `003`) sont créées sans erreur sur SQLite et sur PostgreSQL 16.15 local. |
| **Alignement Charte Graphique (`src/ui/app-view.ts`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | Les variables CSS de [`src/ui/app-view.ts`](../src/ui/app-view.ts) injectent désormais dynamiquement `appConfig.brandColors` (`#153D35`, `#237D68`, `#D9A441`, `#F6F8F7`, `#111827`). Vérifié par le test n° 5 de `phase1-readiness-and-postgres.test.ts`. |

---

## 3. Rejeu des Vérifications et Décompte Exact des Tests (Section 4)

### 3.1. Commandes réellement ré-exécutées pendant l'audit et après remédiation Lot 0.5 (2026-10-18 à 15:38)

```bash
npm run typecheck && npm test && npm run migrate && npm run seed
```

- **`npm run typecheck` (`tsc --noEmit`)** : **`VÉRIFIÉ`** — Code de sortie `0`, aucune erreur de type.
- **`npm test` (`npm run build && node --test dist/tests/*.test.js`)** : **`VÉRIFIÉ`** — **22 tests exécutés, 22 réussis, 0 échoué, 0 ignoré** en `1061.28 ms`.
- **`npm run migrate`** : **`VÉRIFIÉ`** — `{"status":"OK","appliedVersions":[],"totalMigrations":3}`.
- **`npm run seed`** : **`VÉRIFIÉ`** — `{"status":"OK","seeded":false,"organizationsCount":2,"usersCount":4}`.

### 3.2. Décompte clarifié des tests par lot et par nature

| Lot / Fichier de test | Tests propres au lot | Total cumulé | Exécutés & Réussis | Répartition par catégorie |
| :--- | :---: | :---: | :---: | :--- |
| **Lot 0.1** — [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) | **9** | **9** | **9 / 9** (`800.78 ms`) | • 2 tests unitaires (monnaie #1, règles déterministes #6)<br>• 3 tests d'intégration SQLite (auth #2, multi-pays #5, sécurité IA/doublon #7)<br>• 3 tests de sécurité/RBAC/audit (isolation #3, dossier/admin #4, jetons signés & chaîne SHA-256 #8)<br>• 1 test d'intégration HTTP complet (`createAppServer` + `fetch` #9) |
| **Lot 0.2** — [`src/tests/international-scope.test.ts`](../src/tests/international-scope.test.ts) | **8** | **17** | **8 / 8** (`520.38 ms`) | • 5 tests unitaires (devises 0/2/3 décimales #1, arrondis #2, FX & écarts de change #3, locales & RTL #4, analyse statique code cœur #7)<br>• 2 tests d'intégration SQLite (versionnement daté #5, blocage juridictions non validées #6)<br>• 1 test d'intégration HTTP multi-tenant international (#8) |
| **Lot 0.3 & Lot 0.5** — [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) | **+5** *(4 en Lot 0.3 + 1 en Lot 0.5)* | **22** | **5 / 5** (`948.67 ms`) | • 2 tests unitaires (avoirs négatifs & 4 décimales `CLF` #1, garde-fou IA production #2)<br>• 1 test d'intégration SQLite schéma Phase 1 & écritures multi-lignes (#3)<br>• 1 test d'intégration réel sur **PostgreSQL 16.15** via `psql -U postgres -h /tmp` (#4)<br>• 1 test de sécurité post-audit (#5 : secrets prod `SEC-OPEN-01`, RBAC `/audit-logs` `SEC-OPEN-02`, révocation/expiration session & rate-limit `429` `SEC-OPEN-03`, triggers SQL `audit_logs` `SEC-OPEN-04`, CSP & palette UI `SEC-OPEN-05` / `REQ-002`) |
| **Services externes distants** (OpenAI, Anthropic, AWS S3, DGFiP) | **0** | **22** | **0 exécuté (`NON VÉRIFIÉ`)** | Aucune clé API externe ni bucket S3 distant configuré en local. |

---

## 4. Revue Indépendante de Sécurité Applicative & Remédiations Lot 0.5 (Section 5)

| Point de contrôle | Statut final | Fichiers & Lignes examinés | Test exécuté | Gravité résiduelle | Constat détaillé & Remédiation appliquée (Lot 0.5) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **5.1 Isolation des organisations & RBAC sur `/audit-logs` (`SEC-OPEN-02`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | [`src/server.ts` L390-L401](../src/server.ts#L390-L401)<br>[`src/auth/auth-service.ts` L230-L340](../src/auth/auth-service.ts#L230-L340) | `phase0.test.ts` #3, #4, #9 ; `international-scope.test.ts` #8 ; `phase1-readiness-and-postgres.test.ts` #5.4. | Conforme | `GET /api/organizations/:orgId/audit-logs` exige désormais explicitement `allowedRoles: ["FIRM_ADMIN"]` (ou `PLATFORM_ADMIN` avec justification). Testé : `403` pour un collaborateur, `200` pour `FIRM_ADMIN`. |
| **5.2 Contrôles RBAC côté serveur & privilèges `PLATFORM_ADMIN`** | **`VÉRIFIÉ`** | [`src/auth/auth-service.ts` L253-L451](../src/auth/auth-service.ts#L253-L451)<br>[`src/services/tenant-service.ts` L500-L785](../src/services/tenant-service.ts#L500-L785) | `phase0.test.ts` #4, #9. | Conforme | Vérification côté serveur systématique des rôles et des 5 permissions granulaires de `dossier_assignments` + justification `PLATFORM_ADMIN` $\ge 10$ caractères. |
| **5.3 Création, expiration, révocation et validation des sessions (`SEC-OPEN-03`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | [`src/auth/auth-service.ts` L105-L225](../src/auth/auth-service.ts#L105-L225) | `phase0.test.ts` #2, #9 ; `phase1-readiness-and-postgres.test.ts` #5.3. | Conforme | Révocation immédiate (`revokeSession`) et expiration (`expires_at <= now`) vérifiées par test automatisé dédié (#5.3). |
| **5.4 Paramètres des cookies** | **`NON APPLICABLE`** | [`src/server.ts` L122-L128](../src/server.ts#L122-L128) | N/A | Info | Authentification exclusivement par en-tête `Authorization: Bearer <token>`. |
| **5.5 Configurations de production & blocage des secrets par défaut (`SEC-OPEN-01`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | [`src/config/app-config.ts` L78-L115](../src/config/app-config.ts#L78-L115) | `phase1-readiness-and-postgres.test.ts` #5.1. | Conforme | `getAppConfig()` lève désormais une erreur fatale `FATAL [SEC-OPEN-01]` si `NODE_ENV === "production"` et que `SESSION_SECRET` ou `SIGNED_URL_SECRET` est absent, $< 32$ caractères ou contient une valeur d'exemple. |
| **5.6 Limitation de débit (*Rate Limiting*) de l'authentification (`SEC-OPEN-03`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | [`src/server.ts` L43-L76 & L189-L197](../src/server.ts#L43-L76) | `phase1-readiness-and-postgres.test.ts` #5.6. | Conforme | Ajout d'un quota spécifique sur `POST /api/auth/login` (`10 req/min/IP` par défaut), purge automatique des entrées expirées et test automatisé vérifiant le code HTTP `429`. |
| **5.7 Téléchargements de documents et jetons signés** | **`PARTIELLEMENT VÉRIFIÉ`** | [`src/auth/auth-service.ts` L456-L508](../src/auth/auth-service.ts#L456-L508)<br>[`src/services/tenant-service.ts` L873-L1006](../src/services/tenant-service.ts#L873-L1006) | `phase0.test.ts` #7 et #8. | **Faible** (Périmètre Phase 1) | Jetons `HMAC-SHA256` temporaires vérifiés en temps constant (`phase0.test.ts` #8). L'exposition des routes HTTP d'upload/download binaire relève du Lot 1 de la Phase 1. |
| **5.8 Validation des entrées, en-têtes HTTP (`CSP`) et erreurs (`SEC-OPEN-05`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | [`src/server.ts` L40-L41, L99-L117, L442-L455](../src/server.ts#L99-L117) | `phase1-readiness-and-postgres.test.ts` #5.5. | Conforme | Ajout de `Content-Security-Policy` et `Referrer-Policy` sur toutes les réponses JSON et HTML, et filtrage des erreurs SQL internes dans le gestionnaire d'erreurs HTTP. |
| **5.9 Journaux et absence de fuite de données sensibles** | **`VÉRIFIÉ`** | [`src/audit/audit-service.ts`](../src/audit/audit-service.ts)<br>[`src/auth/auth-service.ts`](../src/auth/auth-service.ts) | Vérifié par inspection et tests d'audit. | Conforme | Aucun secret, mot de passe ou jeton n'apparaît dans `audit_logs` ni sur la sortie standard. |
| **5.10 Inaltérabilité SQL et cryptographique de `audit_logs` (`SEC-OPEN-04`)** | **`VÉRIFIÉ`** *(Corrigé en Lot 0.5)* | [`src/db/database.ts` L504-L516](../src/db/database.ts#L504-L516)<br>[`src/db/phase1-readiness-migration.ts` L422-L437](../src/db/phase1-readiness-migration.ts#L422-L437) | `phase0.test.ts` #8 ; `phase1-readiness-and-postgres.test.ts` #4 et #5.2. | Conforme | Ajout des triggers `BEFORE UPDATE` et `BEFORE DELETE` (`trg_audit_logs_immutable_update`, `trg_audit_logs_immutable_delete` sur SQLite et `trg_pg_audit_logs_immutable` sur PostgreSQL 16) interdisant toute modification ou suppression de ligne dans `audit_logs`, en complément du chaînage `SHA-256`. |
| **5.11 Protection contre l'injection de prompt et limites de l'IA simulée** | **`VÉRIFIÉ`** | [`src/ai/ai-gateway.ts` L74-L185](../src/ai/ai-gateway.ts#L74-L185) | `phase0.test.ts` #7 et `phase1-readiness-and-postgres.test.ts` #2. | Conforme | Isolation `<UNTRUSTED_DOCUMENT_DATA_ONLY>`, détection des motifs d'injection, rétrogradation en `NEEDS_HUMAN_REVIEW`, et blocage de `mock-deterministic` en `NODE_ENV=production`. |

---

## 5. Revue du Modèle Comptable et International (Section 6)

| Point vérifié | Statut | Constat factuel dans le code |
| :--- | :--- | :--- |
| **Représentation des montants, devises et précisions (`0`, `2`, `3`, `4` décimales)** | **`VÉRIFIÉ`** | [`src/domain/money.ts`](../src/domain/money.ts) catalogue **20 devises** avec exposant explicite : `0` (`XOF`, `XAF`, `JPY`), `2` (`EUR`, `CHF`, `USD`, `GBP`, `MAD`, `DZD`, `AED`, `SAR`, `QAR`, `CAD`, `AUD`, `SGD`), `3` (`TND`, `BHD`, `OMR`, `KWD`) et `4` (`CLF`). Aucun calcul en flottant binaire. |
| **Arrondis (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`), avoirs négatifs et conversions FX auditées** | **`VÉRIFIÉ`** | Testés unitairement dans `international-scope.test.ts` (#1, #2, #3) et `phase1-readiness-and-postgres.test.ts` (#1). Le taux, sa date, sa source et la méthode d'arrondi sont conservés dans `ExchangeRateAuditRecord`. |
| **Contrôles déterministes & validation humaine obligatoire** | **`VÉRIFIÉ`** | [`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts) vérifie $\text{HT} + \text{TVA} = \text{TTC}$ et $\sum \text{Débit} = \sum \text{Crédit}$. Aucune entité issue de l'IA n'est créée à l'état validé. |
| **Absence de taux fiscaux nationaux codés en dur dans le cœur métier** | **`VÉRIFIÉ`** | Prouvé par l'inspection de code et le test statique automatisé n° 7 de [`src/tests/international-scope.test.ts` L316-L364](../src/tests/international-scope.test.ts#L316-L364). |
| **Versionnement daté et distinction entre juridiction préstructurée, validée et autorisée en production** | **`VÉRIFIÉ`** | Dans [`src/countries/country-registry.ts`](../src/countries/country-registry.ts), `INITIAL_COUNTRY_CONFIGURATIONS` contient **8 versions couvrant 7 pays** (`FR` [2 versions : `FR-2025.1-HISTORICAL` et `FR-2026.1-REV0`], `BE`, `LU`, `CH`, `MA`, `TN`, `AE`). **Aucune juridiction n'a `isProductionEnabled: true` par défaut** : même `FR-2026.1-REV0` est au statut `PENDING_LEGAL_VALIDATION` (`isProductionEnabled: false`) tant qu'un expert-comptable n'a pas validé les seuils. |
| **Intégrité des écritures multi-lignes et contraintes SGBD (SQLite & PostgreSQL 16)** | **`VÉRIFIÉ`** | [`recordMultiLineAccountingEntry()`](../src/db/phase1-readiness-migration.ts#L446-L579) impose $\ge 2$ lignes, interdit Débit et Crédit simultanés sur une même ligne (`CHECK (NOT (debit_minor > 0 AND credit_minor > 0))`), et exige $\sum \text{Débit} = \sum \text{Crédit} > 0$ dans une transaction atomique. Testé sur SQLite et PostgreSQL 16.15. |

---

## 6. Incohérences Documentaires Identifiées et Corrigées (Section 7)

Conformément à la Section 7 de l'audit, les incohérences factuelles suivantes entre les documents créés précédemment et le code réel ont été identifiées et corrigées :
1. **Statut et identifiant du pack France et nombre de juridictions dans `country-registry.ts`** :
   - *Fait réel* : `src/countries/country-registry.ts` contient **8 versions pour 7 pays** (`FR`, `BE`, `LU`, `CH`, `MA`, `TN`, `AE`) et le catalogue monétaire `src/domain/money.ts` contient **20 devises**. La version courante française s'appelle `FR-2026.1-REV0` et son statut est `PENDING_LEGAL_VALIDATION` avec `isProductionEnabled: false`.
2. **Noms exacts des variables d'environnement** :
   - *Fait réel* : `src/config/app-config.ts` et `.env.example` utilisent `APP_NAME`, `DATABASE_PATH`, `SESSION_SECRET`, `SIGNED_URL_SECRET` et `AI_DEFAULT_PROVIDER` (aligné dans `OPERATIONS.md` et `DECISIONS.md`).
3. **Liste exacte des routes HTTP exposées dans `src/server.ts`** :
   - *Fait réel* : `src/server.ts` expose 15 routes HTTP effectives (documentées dans `ARCHITECTURE.md`).
4. **Longueur minimale de justification `PLATFORM_ADMIN` et palette CSS** :
   - *Fait réel* : `justification.length >= 10` dans `src/auth/auth-service.ts` L285 (aligné dans la documentation), et palette CSS officielle (`#153D35`, `#237D68`, `#D9A441`) désormais injectée dynamiquement dans `src/ui/app-view.ts`.

---

## 7. Décisions Finales Séparées et Motivées (Section 9 — Après Remédiation Lot 0.5)

### A. Possibilité de poursuivre le développement de la Phase 1 (MVP Opérationnel France)
- **Décision : OUI (`AUTORISÉ IMMÉDIATEMENT`)**
- **Preuves** : Compilation TypeScript stricte sans erreur, **22/22 tests automatisés passants**, réserves de sécurité `SEC-OPEN-01` à `SEC-OPEN-05` et charte `REQ-002` corrigées et testées, schéma relationnel de 20 tables opérationnel sur SQLite et vérifié sur **PostgreSQL 16.15**.

### B. Possibilité d'effectuer des tests d'intégration avec des données fictives
- **Décision : OUI (`AUTORISÉ IMMÉDIATEMENT`)**
- **Preuves** : Les jeux de données fictifs (`seedDemoData`), l'adaptateur déterministe de test `mock-deterministic` (`isSimulatedTestAdapter: true`), la base SQLite locale et l'instance PostgreSQL 16.15 locale fonctionnent de bout en bout.

### C. Possibilité d'utiliser des données comptables réelles hors production
- **Décision : SOUS CONDITIONS (`PRÉREQUIS TECHNIQUES LEVÉS EN LOT 0.5 ; RESTE LA CONFIGURATION LOCALE .env ET LA GOUVERNANCE RGPD`)**
- **Conditions opérationnelles avant d'importer de vraies pièces hors production** :
  1. Définir un fichier `.env` local avec des secrets aléatoires forts (`SESSION_SECRET` et `SIGNED_URL_SECRET` $\ge 32$ caractères) et activer une sauvegarde locale chiffrée.
  2. Respecter la minimisation RGPD (anonymisation recommandée hors production).

### D. Possibilité d'une mise en production commerciale
- **Décision : NON (`BLOQUÉ JUSQU'À LA RÉALISATION DES PHASES MÉTIER 1–4 ET DES VALIDATIONS PROFESSIONNELLES EXTERNES`)**
- **Motifs bloquants** :
  1. **Fonctionnalités métier Phase 1 non encore développées** (imports CSV/Excel/OFX, écritures via UI/API, rapprochement bancaire, export FEC).
  2. **Infrastructure de production cible** : branchement du pool PostgreSQL 16 en runtime applicatif principal, stockage objet distant S3 WORM (10 ans) et MFA/2FA pour les rôles privilégiés.
  3. **Validations externes obligatoires non encore réalisées** : validation par un expert-comptable inscrit à l'OEC (`FR-2026.1-REV0` est en `PENDING_LEGAL_VALIDATION`), consultation juridique (Ordonnance de 1945), test DGFiP *Test Compta Demat*, DPA sous-traitants et évaluation AIPD/DPIA RGPD par un DPO.

