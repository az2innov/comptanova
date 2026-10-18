# COMPTANOVA — CONTRE-AUDIT FINAL DU LOT 0.5 (`dce1dd7`) & CLÔTURE LOT 0.6 (`PHASE0_FINAL_REAUDIT.md`)

- **Date et heure du contre-audit initial (`dce1dd7`)** : 2026-10-18T15:57:00+01:00
- **Date et heure de la vérification après correctif ciblé (`Lot 0.6`)** : 2026-10-18T16:18:00+01:00
- **Commit audité initialement** : `dce1dd755b78b4f41904d99074bed241657548c8` (`main` / `origin/main`)
- **Méthodologie respectée** :
  1. **Phase 1 (Contre-audit en lecture seule sur `dce1dd7`)** : Inspection de `git status`, `git show --stat dce1dd7` et exécution de contrôles indépendants sans modifier aucun fichier sous `src/`. Les 6 points techniques (`SEC-OPEN-01` à `SEC-OPEN-05` et `REQ-002`) ont été évalués à `PARTIELLEMENT CORRIGÉ` sur `dce1dd7` en raison de cas limites précis documentés ci-dessous.
  2. **Phase 2 (Application et vérification du correctif ciblé `Lot 0.6`)** : Sur demande explicite de l'utilisateur, application du Lot 0.6 et vérification par exécution réelle (`npm run typecheck`, `npm test` **22/22 passants**, `npm run migrate`, `npm run seed` et inspection directe de `./data/app.db` et de PostgreSQL 16.15).

---

## 1. Synthèse Globale des 7 Contrôles Obligatoires (État `dce1dd7` $\rightarrow$ État Final après `Lot 0.6`)

| Réf. | Domaine audité | Statut sur `dce1dd7` | Statut après `Lot 0.6` | Preuve vérifiée après `Lot 0.6` |
| :--- | :--- | :---: | :---: | :--- |
| **1. `SEC-OPEN-01`** | Secrets de production (`SESSION_SECRET`, `SIGNED_URL_SECRET`) | `PARTIELLEMENT CORRIGÉ` | **`CORRIGÉ ET TESTÉ`** | [`src/config/app-config.ts`](../src/config/app-config.ts) rejette désormais en `NODE_ENV=production` : chaque secret absent individuellement, $< 32$ caractères, de démo, à faible entropie (`new Set(trimmed).size < 10`, ex. `"a".repeat(48)`) et l'égalité `SESSION_SECRET === SIGNED_URL_SECRET`, sans jamais divulguer la valeur du secret dans l'erreur (`phase1-readiness-and-postgres.test.ts` #5.1). |
| **2. `SEC-OPEN-02`** | RBAC sur `GET /api/organizations/:orgId/audit-logs` & Web UI | `PARTIELLEMENT CORRIGÉ` | **`CORRIGÉ ET TESTÉ`** | [`src/server.ts` L415](../src/server.ts#L415) autorise `["FIRM_ADMIN", "CLIENT_DIRECTOR"]` sur leur propre organisation (`200`), bloque `ACCOUNTANT_COLLABORATOR` (`403`) et les accès croisés inter-organisations (`403`), et exige la justification $\ge 10$ car. pour `PLATFORM_ADMIN`. Dans [`src/ui/app-view.ts` L800](../src/ui/app-view.ts#L800), l'appel `/audit-logs` est encapsulé dans un `try/catch` afin qu'un `403` ne déconnecte plus les collaborateurs dans l'interface Web (`phase1-readiness-and-postgres.test.ts` #5.5 & #5.6). |
| **3. `SEC-OPEN-03`** | Quota de connexion (`429`), IP `trustProxy`, expiration et multi-instance | `PARTIELLEMENT CORRIGÉ` | **`CORRIGÉ ET TESTÉ`** *(limites multi-instance documentées)* | [`src/server.ts`](../src/server.ts) implémente `resolveClientIp(req, trustProxy)` (ignore `X-Forwarded-For` par défaut contre l'usurpation, l'utilise si `TRUST_PROXY=true`), purge systématiquement les compteurs expirés via `evictExpiredRateLimitBuckets(now)` et expose `rateLimitWindowMs`. Le test #5.7 vérifie : 3 connexions `200` $\rightarrow$ 4e connexion `429` $\rightarrow$ expiration de la fenêtre $\rightarrow$ purge des compteurs (`count === 0`) $\rightarrow$ reconnexion `200`. |
| **4. `SEC-OPEN-04`** | Triggers d'inaltérabilité `audit_logs` (SQLite & PostgreSQL 16) et bases existantes | `PARTIELLEMENT CORRIGÉ` | **`CORRIGÉ ET TESTÉ`** *(limites DBA documentées)* | Ajout de la migration **`004_audit_logs_immutability_triggers`** dans [`src/db/database.ts`](../src/db/database.ts) qui supprime les clauses `ON DELETE SET NULL` sur `audit_logs` (préservant les identifiants historiques sans conflit avec `BEFORE UPDATE`) et installe les triggers sur la base existante `./data/app.db` (`triggers: ["trg_audit_logs_immutable_delete", "trg_audit_logs_immutable_update"]`, `updateBlocked: true`, `deleteBlocked: true`). Testé également sur PostgreSQL 16.15 réel (`phase1-readiness-and-postgres.test.ts` #4 & #5.3). |
| **5. `SEC-OPEN-05`** | En-têtes HTTP, `CSP`, `Cache-Control: no-store` et filtrage SQL | `PARTIELLEMENT CORRIGÉ` | **`CORRIGÉ ET TESTÉ`** *(limite `'unsafe-inline'` documentée)* | `GET /` et `sendJson()` renvoient tous deux `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` et `Cache-Control: no-store`. Le filtre d'erreurs SQLite dans [`src/server.ts` L467](../src/server.ts#L467) couvre désormais `no such table`, `no such column`, `has no column`, `database is locked`, et distingue les erreurs `404` des erreurs `400`. |
| **6. `REQ-002`** | Application intégrale de la charte graphique et centralisation des couleurs | `PARTIELLEMENT CORRIGÉ` | **`CORRIGÉ ET TESTÉ`** | [`src/config/app-config.ts`](../src/config/app-config.ts) et [`src/ui/app-view.ts`](../src/ui/app-view.ts) appliquent les 5 couleurs officielles exactes de `docs/UI_FOUNDATIONS.md` (`#153D35`, `#237D68`, `#D9A441`, `#F7F6F2`, `#1C2421`) et suppriment toutes les couleurs ardoise/bleu héritées (`/#1e293b|#334155|#60a5fa|#0f172a/i.test(htmlText) === false`, vérifié par le test #5.6). |
| **7. Traçabilité** | Inspection Git, absence de secrets et exactitude documentaire | `CORRIGÉ ET TESTÉ` | **`CORRIGÉ ET TESTÉ`** | Aucun fichier `.env`, secret ou base `.db` n'est suivi par Git. Tous les registres documentaires (`SECURITY_REVIEW.md`, `TEST_REPORT.md`, `PROJECT_STATUS.md`, `ACTION_LOG.md`, `CHANGELOG.md`) sont synchronisés. |

---

## 2. Détail des Contrôles, Preuves Exécutées et Limites Architecturales Documentées

### Contrôle 1 — `SEC-OPEN-01` : Validation des secrets en mode `production`
- **Constat initial sur `dce1dd7`** : `getAppConfig()` bloquait les secrets absents, $< 32$ caractères ou de démo, mais acceptait `"a".repeat(32)` (faible entropie) et `SESSION_SECRET === SIGNED_URL_SECRET`.
- **Correctif appliqué en Lot 0.6** ([`src/config/app-config.ts` L91–L130](../src/config/app-config.ts#L91-L130)) :
  - `validateProductionSecret(name, secret)` vérifie individuellement `SESSION_SECRET` et `SIGNED_URL_SECRET` : longueur $\ge 32$, rejet des motifs de démonstration, et exigence d'au moins **10 caractères distincts** (`new Set(trimmed).size >= 10`).
  - Vérification d'unicité : `SESSION_SECRET.trim() === SIGNED_URL_SECRET.trim()` lève `FATAL [SEC-OPEN-01] : SESSION_SECRET et SIGNED_URL_SECRET doivent être strictement distincts en production.`
  - Aucune valeur de secret n'est incluse dans le message d'exception.
- **Preuve exécutée** : Test `phase1-readiness-and-postgres.test.ts` #5.1 vérifiant les 6 cas de rejet et l'absence de fuite du secret dans le message d'erreur.

---

### Contrôle 2 — `SEC-OPEN-02` : Permissions RBAC sur `/audit-logs`, accès croisés et Web UI
- **Constat initial sur `dce1dd7`** :
  1. Dans [`src/ui/app-view.ts` L798](../src/ui/app-view.ts#L798), `refreshActiveOrganizationViews()` appelait `/audit-logs` sans `try/catch`, provoquant l'échec de `bootstrapAuthenticatedApp()` lors de la connexion d'un `ACCOUNTANT_COLLABORATOR`.
  2. Le rôle `CLIENT_DIRECTOR` (`direction@atelier-lumiere-demo.local`) recevait `403` sur les journaux d'audit de sa propre PME (`Atelier Lumière SAS`).
- **Correctif appliqué en Lot 0.6** :
  - Dans [`src/server.ts` L415](../src/server.ts#L415) : `allowedRoles: ["FIRM_ADMIN", "CLIENT_DIRECTOR"]` sur `GET /api/organizations/:orgId/audit-logs`.
  - Dans [`src/ui/app-view.ts` L800–L819](../src/ui/app-view.ts#L800-L819) : encapsulation de l'appel `/audit-logs` dans un bloc `try/catch` affichant un bandeau explicite `Accès restreint RBAC [SEC-OPEN-02]` lorsque l'utilisateur connecté est un collaborateur (`ACCOUNTANT_COLLABORATOR`), sans interrompre sa session.
- **Preuve exécutée** : Test `phase1-readiness-and-postgres.test.ts` #5.5 testant la matrice complète :
  - `ACCOUNTANT_COLLABORATOR` sur son organisation $\rightarrow$ **`403`** ;
  - `FIRM_ADMIN` sur son cabinet $\rightarrow$ **`200`** ;
  - `CLIENT_DIRECTOR` sur sa PME (`Tenant B`) $\rightarrow$ **`200`** ;
  - `CLIENT_DIRECTOR` sur le `Tenant A` (accès croisé inter-organisation) $\rightarrow$ **`403`** ;
  - `PLATFORM_ADMIN` sans justification $\rightarrow$ **`403`**, avec justification $\ge 10$ caractères $\rightarrow$ **`200`**.

---

### Contrôle 3 — `SEC-OPEN-03` : Quota de connexion (`429`), identification IP, expiration et multi-instance
- **Constat initial sur `dce1dd7`** : Pas d'option `TRUST_PROXY`, purge mémoire déclenchée uniquement au-delà de 256 clés, et absence de test automatisé d'expiration de fenêtre.
- **Correctif appliqué en Lot 0.6** ([`src/server.ts` L51–L96](../src/server.ts#L51-L96)) :
  - `resolveClientIp(req, trustProxy)` ignore `X-Forwarded-For` lorsque `trustProxy === false` (protection par défaut contre l'usurpation d'en-tête IP en accès direct) et extrait la première IP valide d'`X-Forwarded-For` lorsque `TRUST_PROXY=true`.
  - `evictExpiredRateLimitBuckets(now)` purge systématiquement les entrées expirées à chaque vérification et est exportée pour les tests.
  - `createAppServer(db, options)` accepte `rateLimitWindowMs` et `trustProxy`.
- **Preuve exécutée** : Test `phase1-readiness-and-postgres.test.ts` #5.2 (test unitaire de `resolveClientIp` avec `trustProxy: false` vs `true`) et #5.7 (3 connexions `200` $\rightarrow$ 4e connexion `429` $\rightarrow$ attente de l'expiration de la fenêtre de `350 ms` $\rightarrow$ vérification `getRateLimitBucketCountForTests() === 0` $\rightarrow$ nouvelle connexion `200`).
- **Limite architecturale documentée (Redémarrage & Multi-instance)** : Le stockage `rateLimitBuckets` étant une `Map` en mémoire du processus Node.js, un redémarrage du processus réinitialise les compteurs en cours, et un déploiement horizontal sur $N$ instances nécessitera un magasin partagé (Redis ou table PostgreSQL/SQLite dédiée) en Phase 1/2.

---

### Contrôle 4 — `SEC-OPEN-04` : Triggers `audit_logs` (SQLite & PostgreSQL 16), bases existantes et limites DBA
- **Constat initial sur `dce1dd7`** : Les triggers avaient été ajoutés dans la migration `003` déjà appliquée sur `./data/app.db`, si bien que `./data/app.db` n'avait aucun trigger installé (`diskTriggers = []`). De plus, `ON DELETE SET NULL` sur `audit_logs` entrait en conflit avec `BEFORE UPDATE`.
- **Correctif appliqué en Lot 0.6** ([`src/db/database.ts` L505–L557](../src/db/database.ts#L505-L557) & [`src/db/phase1-readiness-migration.ts` L403–L418](../src/db/phase1-readiness-migration.ts#L403-L418)) :
  - Ajout de la migration **`004_audit_logs_immutability_triggers`** qui recrée `audit_logs` sans les clauses `ON DELETE SET NULL` (conservant les identifiants historiques `organization_id`, `dossier_id`, `actor_user_id` même après suppression d'un enregistrement référencé) et installe `trg_audit_logs_immutable_update` et `trg_audit_logs_immutable_delete`.
  - Alignement de `POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL` et ajout dans le test PostgreSQL 16 (#4) d'un bloc PL/pgSQL vérifiant que `UPDATE audit_logs` et `DELETE FROM audit_logs` sont effectivement bloqués par `trg_pg_audit_logs_immutable` et que `DELETE FROM users` ne provoque aucun conflit.
- **Preuve exécutée sur `./data/app.db` après `npm run migrate`** :
  ```json
  {
    "triggers": [
      { "name": "trg_audit_logs_immutable_delete" },
      { "name": "trg_audit_logs_immutable_update" }
    ],
    "migrations": [
      { "version": "001_phase0_foundations" },
      { "version": "002_international_scope_extension" },
      { "version": "003_phase1_readiness_schema" },
      { "version": "004_audit_logs_immutability_triggers" }
    ],
    "integrity": { "valid": true, "checkedCount": 1, "brokenAtAuditId": null },
    "updateBlocked": true,
    "deleteBlocked": true
  }
  ```
- **Limite intrinsèque documentée face aux administrateurs de base de données (DBA)** : Les triggers SQLite et PostgreSQL bloquent toute altération ou suppression issue de l'application ou d'une écriture SQL standard, mais **ne garantissent pas une inaltérabilité absolue face à un administrateur système/DBA** disposant du privilège `DROP TRIGGER` ou d'un accès direct en écriture au fichier SQLite sur disque. En production, l'inaltérabilité opposable repose sur l'export continu des empreintes vers un stockage WORM externe (S3 Object Lock / horodatage RFC 3161).

---

### Contrôle 5 — `SEC-OPEN-05` : En-têtes HTTP, `CSP` et gestion des erreurs
- **Correctif appliqué en Lot 0.6** ([`src/server.ts` L162–L171 & L460–L481](../src/server.ts#L162-L171)) :
  - Ajout de `"Cache-Control": "no-store"` sur `GET /` (en complément de `sendJson()`).
  - Extension du filtre de masquage des erreurs SQLite (`SQLITE_|syntax error|near "|constraint failed|no such table|no such column|has no column|database is locked`) et retour du code HTTP `404` lorsque le message indique une ressource introuvable.
- **Limite documentée sur la `CSP`** : La politique `Content-Security-Policy` applique `frame-ancestors 'none'; base-uri 'self'; default-src 'self'`, mais conserve `'unsafe-inline'` pour `script-src` et `style-src` car l'interface Phase 0 (`src/ui/app-view.ts`) est servie en une seule page HTML autonome avec `<style>` et `<script>` embarqués. Le passage à un bundle JS externe ou à un `nonce` cryptographique par requête est planifié en Phase 1.

---

### Contrôle 6 — `REQ-002` : Charte graphique centralisée et application complète
- **Correctif appliqué en Lot 0.6** ([`src/config/app-config.ts` L183–L189](../src/config/app-config.ts#L183-L189) & [`src/ui/app-view.ts` L36–L350](../src/ui/app-view.ts#L36-L350)) :
  - Alignement exact des 5 couleurs par défaut dans `appConfig.brandColors` sur `docs/UI_FOUNDATIONS.md` : `#153D35` (Vert émeraude profond), `#237D68` (Jade secondaire), `#D9A441` (Ambre chaud), `#F7F6F2` (Fond pierre claire), `#1C2421` (Texte graphite).
  - Remplacement de toutes les couleurs hexadécimales ardoise/bleu héritées (`#1e293b`, `#334155`, `#60a5fa`, `#0f172a`) dans `.nav-btn:hover`, `#lang-selector`, `#org-selector` et `.btn-secondary` par les variables CSS de la charte.
- **Preuve exécutée** : Test `phase1-readiness-and-postgres.test.ts` #5.6 vérifiant la présence des 5 codes `#153D35`, `#237D68`, `#D9A441`, `#F7F6F2`, `#1C2421` et l'absence totale de `#1e293b`, `#334155`, `#60a5fa`, `#0f172a` dans le HTML rendu par `GET /`.

---

## 3. Décisions Finales Distinctes (Après Application et Vérification du Lot 0.6)

### A. Poursuite du développement de la Phase 1
- **Décision : OUI (`AUTORISÉ SANS RÉSERVE TECHNIQUE BLOQUANTE`)**
- **Justification** : Les 6 points du contre-audit (`SEC-OPEN-01` à `SEC-OPEN-05` et `REQ-002`) sont désormais **`CORRIGÉ ET TESTÉ`**, les 4 migrations (`001` à `004`) sont appliquées sur `./data/app.db` et en mémoire, le schéma de 20 tables et le trigger d'inaltérabilité sont vérifiés sur PostgreSQL 16.15 réel, et **22/22 tests automatisés** passent sans erreur.

### B. Tests d'intégration avec données fictives
- **Décision : OUI (`AUTORISÉ`)**
- **Justification** : L'API et l'interface Web (`GET /`) fonctionnent désormais pour l'ensemble des 4 profils de démonstration (`FIRM_ADMIN`, `ACCOUNTANT_COLLABORATOR`, `CLIENT_DIRECTOR`, `PLATFORM_ADMIN`), y compris la gestion gracieuse du `403` sur `/audit-logs` pour le collaborateur comptable.

### C. Utilisation de données comptables réelles hors production
- **Décision : SOUS CONDITION OPÉRATIONNELLE (`PRÊT TECHNIQUEMENT APRÈS LOT 0.6, SOUMIS À LA CONFIGURATION D'UN .env LOCAL ET AU CADRE RGPD`)**
- **Justification** : Les 3 blocages techniques identifiés lors du contre-audit de `dce1dd7` (triggers sur `./data/app.db`, régression UI `/audit-logs`, unicité/entropie des secrets) sont levés. Avant d'importer des pièces comptables réelles hors production, l'opérateur doit uniquement :
  1. Créer un fichier `.env` local (non versionné) avec deux secrets aléatoires distincts à forte entropie (`SESSION_SECRET` et `SIGNED_URL_SECRET`) et des mots de passe forts remplaçant `DemoAdmin2026!`.
  2. Respecter le cadre RGPD applicable aux données personnelles contenues dans les pièces comptables réelles.

> **Rappel formel** : Conformément aux règles de l'audit, aucune autorisation de mise en production commerciale n'est délivrée en Phase 0 (la validation professionnelle par un expert-comptable des règles fiscales nationales et l'infrastructure de production S3 WORM / Redis restant des prérequis de mise en production).
