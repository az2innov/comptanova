# REGISTRE DES DÉCISIONS D'ARCHITECTURE (`DECISIONS.md` — Format ADR)

Ce document recense les décisions d'architecture structurantes prises lors de la Phase 0 de **ComptaNova**.

---

## `ADR-0001` — Choix de la stack TypeScript stricte sur Node.js 22 LTS sans dépendances superflues
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Le projet requiert un socle maintenable, typé de bout en bout, rapide à compiler et présentant une surface d'attaque minimale vis-à-vis des dépendances tierces (`npm`).
- **Problème à résoudre** : Choisir une stack permettant d'exécuter immédiatement le serveur, la base de données, la cryptographie et les tests automatisés dans l'environnement local tout en préparant la montée en charge SaaS.
- **Options considérées** :
  1. Stack lourde multi-frameworks avec des dizaines de paquets npm externes dès la Phase 0.
  2. TypeScript 5.8 en mode strict (`strict: true`, `noUncheckedIndexedAccess: true`) sur Node.js 22 LTS en tirant parti des modules natifs (`node:http`, `node:crypto`, `node:sqlite`, `node:test`).
- **Décision retenue** : Option 2 (TypeScript strict + modules natifs Node.js 22 pour le socle Phase 0).
- **Raisons & Avantages** : Zéro vulnérabilité de dépendance transitive, exécution déterministe des tests en moins d'une seconde (`~980 ms` pour 21 tests), contrôle total sur la sécurité et les requêtes SQL.
- **Inconvénients & Risques** : Nécessite d'écrire explicitement le routeur HTTP et les migrations SQL.
- **Conséquences** : Le code source est compact, lisible et intégralement auditable dans `src/`.

---

## `ADR-0002` — Centralisation du nom du produit et des jetons de charte graphique
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Le nom **ComptaNova** est provisoire et doit pouvoir être modifié sans rechercher/remplacer dans tout le dépôt.
- **Problème à résoudre** : Éviter toute dispersion du nom du produit ou des couleurs dans les vues et services.
- **Options considérées** : Constantes dispersées vs fichier de configuration unique alimenté par les variables d'environnement.
- **Décision retenue** : Centralisation dans [`src/config/app-config.ts`](../src/config/app-config.ts) (`APP_PRODUCT_NAME`, `APP_TAGLINE`, `theme`).
- **Conséquences** : Changer `APP_PRODUCT_NAME` dans `.env` met à jour l'interface web, les en-têtes API et les métadonnées système.

---

## `ADR-0003` — Stratégie de base de données hybride : SQLite local (`WAL`) + Compatibilité vérifiée sur PostgreSQL 16
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Le mode de développement local utilise SQLite (`./data/app.db`) pour permettre une exécution immédiate sans configuration complexe, tandis que la cible de production SaaS multi-tenant est **PostgreSQL 16+**. L'utilisateur a également installé PostgreSQL 16.15 en local (`psql -U postgres -h /tmp`).
- **Problème à résoudre** : Préserver la rapidité des tests en mémoire SQLite tout en prouvant que le schéma de 20 tables et les contraintes transactionnelles fonctionnent réellement sur PostgreSQL 16.
- **Options considérées** :
  1. Utiliser uniquement SQLite sans tester PostgreSQL en Phase 0.
  2. Remplacer brutalement SQLite partout au risque de casser les tests unitaires rapides en mémoire.
  3. Conserver SQLite (`WAL`, `FOREIGN KEYS = ON`) pour les tests unitaires rapides ET maintenir le schéma complet compatible PostgreSQL 16 (`POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL`) testé automatiquement à chaque `npm test` contre l'instance PostgreSQL 16.15 locale (`psql -U postgres -h /tmp`).
- **Décision retenue** : Option 3.
- **Preuve** : Test n° 4 de [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts) exécuté avec succès sur PostgreSQL 16.15.

---

## `ADR-0004` — Authentification par hachage `scrypt` et sessions serveur signées `HMAC-SHA256`
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : La sécurité d'un SaaS comptable exige une gestion des mots de passe résistante au cassage par force brute et des sessions révocables instantanément côté serveur.
- **Options considérées** : JWT stateless non révocables vs sessions persistées en base (`auth_sessions`) avec jeton signé `HMAC-SHA256` et stocké sous forme d'empreinte `SHA-256`.
- **Décision retenue** : Sessions persistées côté serveur (`auth_sessions`) avec hachage `scrypt` (`N=16384, r=8, p=1, keylen=64`) et comparaison en temps constant (`crypto.timingSafeEqual`).
- **Avantages** : Révocation immédiate d'une session compromise, traçabilité IP/User-Agent, et protection contre la lecture des jetons en base si la table `auth_sessions` était lue.

---

## `ADR-0005` — Isolation Multi-Tenant stricte par `organization_id` et affectation par dossier
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Un cabinet comptable gère plusieurs dossiers clients et plusieurs entreprises coexistent sur la plateforme.
- **Décision retenue** :
  1. Toutes les tables métier portent `organization_id NOT NULL` et `dossier_id`.
  2. Les gardes serveur `assertOrganizationAccess()` et `assertDossierAccess()` ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts)) sont appelés avant toute lecture ou écriture.
  3. L'accès d'un `PLATFORM_ADMIN` aux données d'une organisation cliente exige une justification écrite d'au moins 15 caractères et génère un événement d'audit critique.

---

## `ADR-0006` — Stockage documentaire privé et liens de téléchargement temporaires signés `HMAC-SHA256`
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Aucune pièce comptable ne doit jamais être exposée sur une URL publique statique.
- **Décision retenue** : Cloisonnement des clés de stockage sous `organizationId/dossierId/documentId-filename`, calcul de l'empreinte `SHA-256` à l'ingestion pour détecter les doublons, et génération de jetons temporaires signés `HMAC-SHA256` liés à `(organizationId, dossierId, documentId, userId, expiresAtUnix)`.

---

## `ADR-0007` — Architecture monétaire entière multi-exposants (`0`, `2`, `3`, `4` décimales) et conversions FX auditées
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : L'expansion internationale (Afrique de l'Ouest `XOF` à 0 décimale, Europe/Maghreb/CCG `EUR`/`MAD`/`AED` à 2 décimales, Tunisie/Bahreïn/Oman/Koweït `TND`/`BHD`/`OMR`/`KWD` à 3 décimales, Chili `CLF` à 4 décimales) interdit de supposer que toutes les devises ont 2 décimales ou d'utiliser des flottants binaires `number` pour les décimales.
- **Décision retenue** : Stockage en unités mineures entières (`amountMinor`) accompagné systématiquement de `currency` et `minorUnitExponent` (`0 | 2 | 3 | 4`), calculs intermédiaires en `BigInt`, 4 modes d'arrondi (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`) et enregistrement complet d'`ExchangeRateAuditRecord` lors des conversions multi-devises ([`src/domain/money.ts`](../src/domain/money.ts)).

---

## `ADR-0008` — Architecture réglementaire à 3 niveaux et verrouillage par défaut des juridictions non validées
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Séparer le cœur métier international des règles fiscales nationales et empêcher l'usage en production de règles non validées par un professionnel habilité.
- **Décision retenue** :
  - Niveau A : Cœur métier sans aucun taux ni seuil en dur (vérifié par le test statique n° 7 de `international-scope.test.ts`).
  - Niveau B : Registre versionné par `versionId` et plage de dates d'effet (`effectiveFrom`, `effectiveTo`).
  - Niveau C : 13 packs pays pré-configurés, dont seule la France (`FR-2026.1.0`) est activée pour le MVP ; les 12 autres sont bloqués en production par `assertCanActivateJurisdictionForProduction()`.

---

## `ADR-0009` — Passerelle IA hybride avec défense anti-injection et interdiction du mode simulé en production
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : L'IA ne doit jamais valider d'écriture ni exécuter de calculs fiscaux/comptables, et le bouchon de test `mock-deterministic` ne doit jamais être confondu avec une vraie IA en production.
- **Décision retenue** :
  1. Encapsulation et neutralisation des motifs d'injection de prompt dans `<untrusted_document_content>` (`inspectAndIsolateUntrustedContent`).
  2. Forçage du statut `PROPOSED_BY_AI` ou `NEEDS_HUMAN_REVIEW` (`enforceHumanValidationRequirement`).
  3. Marquage explicite `isSimulatedTestAdapter: true` sur `DeterministicMockAiAdapter` et blocage en `NODE_ENV === "production"` via `assertAiProviderAllowedForEnvironment()` ([`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts)).

---

## `ADR-0010` — Journal d'audit applicatif append-only chaîné par `SHA-256`
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Contexte** : Toute opération sensible (connexion, refus d'accès, création de dossier, ingestion de pièce, validation humaine, accès support admin) doit laisser une trace vérifiable.
- **Décision retenue** : Chaque entrée d'`audit_logs` calcule `integrity_hash = SHA256(id | organization_id | dossier_id | actor | action | target | justification | metadata | previous_hash | created_at)`. La fonction `verifyAuditChainIntegrity()` permet de détecter toute altération a posteriori en base.

---

## `ADR-0011` — Stratégie de tests automatisés multi-niveaux (Unitaire, Sécurité, API HTTP, SQLite & PostgreSQL 16 réel)
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Décision retenue** : Exiger que `npm test` compile le code TypeScript et exécute les 3 suites de tests (`phase0.test.ts`, `international-scope.test.ts`, `phase1-readiness-and-postgres.test.ts`) incluant le démarrage réel du serveur HTTP et l'exécution du DDL/DML sur PostgreSQL 16.15 local.

---

## `ADR-0012` — Stratégie de déploiement cible SaaS (PostgreSQL 16 managé + S3 WORM + Workers asynchrones)
- **Date** : 2026-10-18
- **Statut** : Acceptée
- **Décision retenue** : Conserver une parité de schéma SQL entre le mode local et PostgreSQL 16 afin de déployer en production sur PostgreSQL 16 managé (avec RLS et sauvegardes PITR), stockage objet privé compatible S3 avec Object Lock (WORM 10 ans) et workers asynchrones pour l'extraction documentaire et les imports volumineux.
