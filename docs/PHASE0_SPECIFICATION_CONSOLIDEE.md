# COMPTANOVA — PHASE 0 (DOCUMENT DE RÉFÉRENCE REFORMULÉ ET CONSOLIDÉ)
## AUDIT, ARCHITECTURE, FONDATIONS, SÉCURITÉ ET TRAÇABILITÉ COMPLÈTE

- **Version du document** : `2.0 (Consolidée après audit et implémentation vérifiée sur le dépôt réel)`
- **Projet** : **ComptaNova** — nom provisoire et centralisé dans [`src/config/app-config.ts`](../src/config/app-config.ts) (`APP_PRODUCT_NAME`)
- **Phase** : `0 — Audit, architecture, fondations, sécurité, extension internationale et préparation du schéma Phase 1`
- **Statut vérifié au 2026-10-18** : **Phase 0 validée sous réserves documentées** (`21/21` tests automatisés passants sur SQLite et sur PostgreSQL 16.15 local ; réserves pré-commercialisation d'ordre juridique, fiscal et RGPD tracées dans [`docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`](./LEGAL_AND_COMPLIANCE_CHECKLIST.md))
- **Règle fondamentale appliquée** : aucune fonctionnalité, modification ou validation n'est déclarée réalisée sans preuve vérifiable (fichier source, migration, commande exécutée ou test automatisé).

---

## 1. RÔLE ET PÉRIMÈTRE D'INTERVENTION

L'équipe d'ingénierie logicielle (architecture, développement full-stack TypeScript, ingénierie IA, sécurité applicative et assurance qualité) intervient sur **ComptaNova**, plateforme SaaS B2B d'assistance comptable destinée aux micro-entrepreneurs, indépendants, professions libérales, dirigeants de TPE/PME et cabinets d'expertise comptable.

Le produit automatise la collecte, le classement, la pré-extraction et le contrôle déterministe des pièces comptables tout en laissant **systématiquement** la validation comptable et fiscale finale à un utilisateur humain habilité.

---

## 2. OBJECTIF GÉNÉRAL RÉALISÉ EN PHASE 0

Établir un socle technique vérifié et évolutif répondant aux 10 propriétés cardinales :
1. **Multi-utilisateur** : authentification serveur par hachage `scrypt` et sessions révocables `HMAC-SHA256` ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts)).
2. **Multi-organisation (Multi-Tenant)** : cloisonnement strict par `organization_id` et permissions granulaires par dossier client ([`src/services/tenant-service.ts`](../src/services/tenant-service.ts)).
3. **Sécurisé** : contrôle d'accès côté serveur, défense anti-prompt injection IA, liens de téléchargement signés temporaires et justification obligatoire des accès support ([`docs/SECURITY_REVIEW.md`](./SECURITY_REVIEW.md)).
4. **Extensible & International** : architecture séparée en 3 niveaux (Cœur métier international / Registre de juridiction / Packs pays versionnés) couvrant la France (premier marché actif) et préparant l'Europe, le Maghreb, le Moyen-Orient/CCG, l'Afrique subsaharienne, les Amériques et l'Asie-Pacifique sans aucune déclaration abusive de conformité réglementaire ([`src/countries/country-registry.ts`](../src/countries/country-registry.ts)).
5. **Exact financièrement** : moteur monétaire en unités mineures entières (`BigInt`) supportant explicitement `0`, `2`, `3` et `4` décimales, les avoirs négatifs, 4 modes d'arrondi et les conversions de devises auditées ([`src/domain/money.ts`](../src/domain/money.ts)).
6. **Testable & Vérifié** : 3 suites de tests automatisés (**21/21 tests passants**) exécutées sur SQLite et sur une véritable instance **PostgreSQL 16.15** locale ([`docs/TEST_REPORT.md`](./TEST_REPORT.md)).
7. **Maintenable** : TypeScript strict (`tsc --noEmit` sans erreur), zéro dépendance runtime superflue.
8. **Documenté & Traçable** : 11 registres documentaires normalisés sous `docs/`.
9. **Auditable** : journal d'audit applicatif append-only chaîné par `SHA-256` ([`src/audit/audit-service.ts`](../src/audit/audit-service.ts)) distinct du journal des actions de développement ([`docs/ACTION_LOG.md`](./ACTION_LOG.md)).
10. **Prêt pour la Phase 1** : schéma complet de **20 tables métier** incluant déjà les tiers, le plan comptable, les journaux, les lignes d'écritures en partie double, les lots d'import, les transactions bancaires, les liens de rapprochement et les anomalies ([`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)).

---

## 3. RÈGLES D'INGÉNIERIE ET DE TRAÇABILITÉ APPLIQUÉES

- **Vérification sur le dépôt réel** : chaque affirmation renvoie à un fichier exact de `src/` ou `docs/` et à une commande exécutée.
- **Préservation de l'existant et migrations non destructives** : les 3 migrations (`001_phase0_foundations`, `002_international_scope_extension`, `003_phase1_readiness_schema`) s'appliquent séquentiellement sans perte de données.
- **Distinction stricte entre réel, simulé, partiel et bloqué** :
  - L'adaptateur IA local `mock-deterministic` porte `isSimulatedTestAdapter: true` et est interdit en `NODE_ENV=production` par `assertAiProviderAllowedForEnvironment()`.
  - Les 12 juridictions hors France sont verrouillées en `IN_REVIEW` ou `DRAFT` (`isProductionEnabled: false`).

---

## 4. CORPUS DOCUMENTAIRE ET DE TRAÇABILITÉ (`docs/`)

L'intégralité des documents exigés en Phase 0 est présente et maintenue à jour dans `docs/` :
- **A. État du projet** : [`docs/PROJECT_STATUS.md`](./PROJECT_STATUS.md)
- **B. Historique des versions et lots** : [`docs/CHANGELOG.md`](./CHANGELOG.md)
- **C. Journal des actions de développement (`ACT-0001` à `ACT-0006`)** : [`docs/ACTION_LOG.md`](./ACTION_LOG.md)
- **D. Registre des décisions d'architecture (`ADR-0001` à `ADR-0012`)** : [`docs/DECISIONS.md`](./DECISIONS.md)
- **E. Rapport des campagnes de tests (`TEST-CAMP-001` à `TEST-CAMP-003`)** : [`docs/TEST_REPORT.md`](./TEST_REPORT.md)
- **F. Registre des risques (`RISK-001` à `RISK-010`)** : [`docs/RISK_REGISTER.md`](./RISK_REGISTER.md)
- **G. Matrice de traçabilité des exigences (`REQ-001` à `REQ-015`)** : [`docs/REQUIREMENTS_TRACEABILITY.md`](./REQUIREMENTS_TRACEABILITY.md)
- **H. Revue de sécurité applicative** : [`docs/SECURITY_REVIEW.md`](./SECURITY_REVIEW.md)
- **I. Architecture technique détaillée** : [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) (complétant [`docs/ARCHITECTURE_PHASE0.md`](./ARCHITECTURE_PHASE0.md))
- **J. Guide d'installation, d'exploitation et de sauvegarde** : [`docs/OPERATIONS.md`](./OPERATIONS.md)
- **K. Liste des validations juridiques, fiscales, comptables et RGPD** : [`docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`](./LEGAL_AND_COMPLIANCE_CHECKLIST.md)

---

## 5. SYNTHÈSE DES ÉTAPES 1 À 16 RÉALISÉES ET VÉRIFIÉES

| Étape du référentiel Phase 0 | État vérifié | Référence technique et preuve |
| :--- | :--- | :--- |
| **Étape 1 — Audit initial du dépôt** | **Réalisé & Documenté** | `ACT-0001` à `ACT-0006` dans [`docs/ACTION_LOG.md`](./ACTION_LOG.md) |
| **Étape 2 — Architecture technique** | **Implémenté & Documenté** | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), `ADR-0001` à `ADR-0012` dans [`docs/DECISIONS.md`](./DECISIONS.md) |
| **Étape 3 — Modèle de données (20 tables)** | **Implémenté & Testé (SQLite + PostgreSQL 16.15)** | [`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts) |
| **Étape 4 — Authentification et sécurité** | **Implémenté & Testé** | [`src/auth/auth-service.ts`](../src/auth/auth-service.ts), Tests 2, 3, 4 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) |
| **Étape 5 — Monnaies et arithmétique financière (0, 2, 3, 4 décimales, FX, avoirs)** | **Implémenté & Testé** | [`src/domain/money.ts`](../src/domain/money.ts), Tests 1-3 de [`src/tests/international-scope.test.ts`](../src/tests/international-scope.test.ts), Test 1 de [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) |
| **Étape 6 — Configuration des juridictions et internationalisation (13 pays, RTL)** | **Implémenté & Testé** | [`src/countries/country-registry.ts`](../src/countries/country-registry.ts), [`src/i18n/translations.ts`](../src/i18n/translations.ts), Tests 4-8 de [`src/tests/international-scope.test.ts`](../src/tests/international-scope.test.ts) |
| **Étape 7 — Abstraction des fournisseurs IA & garde-fou `mock-deterministic`** | **Implémenté & Testé (Mode local simulé explicite)** | [`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts), Test 7 de `phase0.test.ts`, Test 2 de `phase1-readiness-and-postgres.test.ts` |
| **Étape 8 — Stockage documentaire privé & liens signés `HMAC-SHA256`** | **Partiellement implémenté & Testé** | [`src/services/tenant-service.ts`](../src/services/tenant-service.ts), [`src/auth/auth-service.ts`](../src/auth/auth-service.ts) (stockage S3 distant prévu en Phase 1/2) |
| **Étape 9 — Journal d'audit applicatif chaîné `SHA-256`** | **Implémenté & Testé** | [`src/audit/audit-service.ts`](../src/audit/audit-service.ts), Test 8 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) |
| **Étape 10 — Interface initiale et charte graphique (`#153D35`, `#237D68`, `#D9A441`)** | **Implémenté & Testé** | [`src/ui/app-view.ts`](../src/ui/app-view.ts), [`src/config/app-config.ts`](../src/config/app-config.ts) |
| **Étape 11 — Base de données et migrations (`001`, `002`, `003`)** | **Implémenté & Testé (SQLite + PostgreSQL 16.15)** | `npm run migrate`, Test 3 et Test 4 de [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) |
| **Étape 12 — Qualité et tests (`21/21` passants)** | **Implémenté & Testé** | [`docs/TEST_REPORT.md`](./TEST_REPORT.md) |
| **Étape 13 — Configuration et installation** | **Implémenté & Documenté** | [`.env.example`](../.env.example), [`docs/OPERATIONS.md`](./OPERATIONS.md) |
| **Étape 14 — Revue de sécurité** | **Réalisé & Documenté** | [`docs/SECURITY_REVIEW.md`](./SECURITY_REVIEW.md) |
| **Étape 15 — Revue juridique et conformité** | **Réalisé & Documenté** | [`docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`](./LEGAL_AND_COMPLIANCE_CHECKLIST.md) |
| **Étape 16 — Revue finale de la Phase 0** | **Réalisé & Vérifié** | [`docs/REQUIREMENTS_TRACEABILITY.md`](./REQUIREMENTS_TRACEABILITY.md), [`docs/PROJECT_STATUS.md`](./PROJECT_STATUS.md) |
