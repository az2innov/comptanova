# GUIDE D'EXPLOITATION, D'INSTALLATION ET DE DIAGNOSTIC (`OPERATIONS.md`) — ComptaNova

Ce document fournit les instructions vérifiées pour installer, configurer, lancer, migrer, tester, sauvegarder et diagnostiquer **ComptaNova** en environnement local, ainsi que les procédures de transition vers PostgreSQL 16 et le stockage distant.

---

## 1. Prérequis Techniques Vérifiés

- **Système d'exploitation** : Linux (`x86_64` — Ubuntu 24.04 LTS vérifié).
- **Node.js** : `v22.22.0` (ou toute version Node.js $\ge 22.5.0$ disposant des modules natifs `node:sqlite` et `node:test`).
- **PostgreSQL (pour les tests de compatibilité SGBD de production)** : `PostgreSQL 16.15` (installé via Snap et accessible via `psql -U postgres -h /tmp`).

---

## 2. Installation et Configuration

1. **Installer les dépendances de développement TypeScript** :
   ```bash
   npm install
   ```
2. **Configurer les variables d'environnement** :
   Copiez `.env.example` vers `.env` (ne commitez jamais `.env`) :
   ```bash
   cp .env.example .env
   ```
   Principales variables définies dans [`.env.example`](../.env.example) et lues par [`src/config/app-config.ts`](../src/config/app-config.ts) :
   - `APP_PRODUCT_NAME=ComptaNova` (nom du produit centralisé et remplaçable).
   - `PORT=3000` / `HOST=127.0.0.1`.
   - `SQLITE_DB_PATH=./data/app.db`.
   - `APP_SESSION_SECRET` et `APP_SIGNED_URL_SECRET` (secrets HMAC à remplacer impérativement en production).
   - `AI_PROVIDER=mock-deterministic` (mode simulé de test local ; interdit lorsque `NODE_ENV=production`).

---

## 3. Migrations et Initialisation des Données de Démonstration

1. **Appliquer les migrations versionnées (`001`, `002`, `003`)** :
   ```bash
   npm run build && npm run migrate
   ```
   Sortie attendue :
   ```json
   {
     "status": "OK",
     "appliedVersions": [],
     "totalMigrations": 3
   }
   ```
2. **Initialiser les données de démonstration multi-tenant** :
   ```bash
   npm run seed
   ```
   Comptes de démonstration créés (mot de passe commun de démo : `DemoAdmin2026!`) :
   - Administrateur Plateforme : `superadmin@demo.local`
   - Administrateur Cabinet Comptable (Tenant 1) : `expert@cabinet-hexagone-demo.local`
   - Collaborateur Comptable (Tenant 1) : `collab@cabinet-hexagone-demo.local`
   - Dirigeante PME Indépendante (Tenant 2) : `direction@atelier-lumiere-demo.local`

---

## 4. Lancement Local et Exécution des Tests

- **Vérification statique des types TypeScript** :
  ```bash
  npm run typecheck
  ```
- **Exécution complète des 3 suites de tests (21 tests incluant PostgreSQL 16.15)** :
  ```bash
  npm test
  ```
- **Démarrage du serveur HTTP local** :
  ```bash
  npm start
  ```
  L'interface web est alors accessible sur `http://127.0.0.1:3000` (ou `?lang=en-GB`, `?lang=ar-AE`) et l'état de santé sur `http://127.0.0.1:3000/api/health`.

---

## 5. Sauvegarde et Restauration

### 5.1. Mode SQLite Local (`./data/app.db`)
- **Sauvegarde à chaud cohérente** :
  ```bash
  sqlite3 ./data/app.db ".backup './data/backup-app.db'"
  ```
  *(Alternative si l'application est arrêtée : copier `./data/app.db` après fermeture propre du processus Node.js).*
- **Vérification d'intégrité de la sauvegarde et de la chaîne d'audit** :
  1. Restaurer `./data/backup-app.db` vers un fichier de test.
  2. Appeler `GET /api/audit/verify` ou `verifyAuditChainIntegrity()` pour confirmer que `"valid": true`.

### 5.2. Mode PostgreSQL 16 Local (`psql -U postgres -h /tmp`)
- **Sauvegarde logique avec `pg_dump`** :
  ```bash
  pg_dump -U postgres -h /tmp -Fc -f ./data/comptanova_pg16.dump postgres
  ```
- **Restauration avec `pg_restore`** :
  ```bash
  pg_restore -U postgres -h /tmp -d postgres --clean --if-exists ./data/comptanova_pg16.dump
  ```
  > **Note de transparence** : La création et l'exécution du schéma de 20 tables sur PostgreSQL 16.15 sont testées automatiquement à chaque `npm test` ; la sauvegarde/restauration PITR de production devra faire l'objet d'un exercice dédié lors du déploiement de l'environnement cloud managé.

---

## 6. Procédures de Diagnostic

1. **Vérifier que PostgreSQL 16 répond sur le socket `/tmp`** :
   ```bash
   psql -U postgres -h /tmp -c "SELECT version(), current_database(), current_user;"
   ```
2. **Vérifier les migrations appliquées dans SQLite** :
   ```bash
   node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("./data/app.db"); console.log(db.prepare("SELECT * FROM schema_migrations").all());'
   ```
3. **Vérifier l'intégrité de la chaîne d'audit SHA-256** :
   Lancer `npm test` (Test n° 8 de `phase0.test.ts`) ou interroger `GET /api/health` (`auditChainValid: true`).

---

## 7. Limites Documentées du Mode Local

1. **Adaptateur IA simulé** : En mode local par défaut (`AI_PROVIDER=mock-deterministic`), aucune requête réseau n'est envoyée à OpenAI ou Anthropic ; l'extraction utilise des règles déterministes de test clairement signalées par `isSimulatedTestAdapter: true`.
2. **Stockage documentaire local** : Les métadonnées et empreintes `SHA-256` sont stockées en base locale ; l'archivage probant WORM sur 10 ans nécessite le branchement d'un bucket S3 avec *Object Lock* en environnement de production.
3. **Concurrence SQLite** : SQLite en mode `WAL` convient au développement et aux tests rapides, mais la cible multi-utilisateurs de production doit utiliser **PostgreSQL 16+** via le schéma `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL` déjà validé.
