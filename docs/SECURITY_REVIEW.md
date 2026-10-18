# REVUE DE SÉCURITÉ APPLICATIVE (`SECURITY_REVIEW.md`) — ComptaNova (Phase 0)

> **Avertissement méthodologique** : Ce document présente une revue de sécurité ciblée du code source, de l'architecture et des tests automatisés de la Phase 0. Il ne constitue pas un audit d'intrusion externe (pentest) ni une certification formelle (ISO 27001 / SOC 2 / SecNumCloud).

---

## 1. Surfaces d'Attaque Examinées

1. **Authentification et gestion des mots de passe** (`POST /api/auth/login`, [`src/auth/auth-service.ts`](../src/auth/auth-service.ts)).
2. **Gestion des sessions et des jetons d'accès** (`Authorization: Bearer <token>`, table `auth_sessions`).
3. **Contrôle d'accès inter-organisations (Multi-Tenant Isolation / IDOR)** (`/api/organizations/:orgId/...`).
4. **Contrôle d'accès intra-organisation par dossier client** (`dossier_assignments`).
5. **Accès administrateur plateforme (`PLATFORM_ADMIN`) aux données clientes**.
6. **Ingestion documentaire et attaque par injection de prompt IA** ([`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts), [`src/services/tenant-service.ts`](../src/services/tenant-service.ts)).
7. **Téléchargement de pièces justificatives privées** (jetons signés `HMAC-SHA256`).
8. **Intégrité du journal d'audit applicatif** ([`src/audit/audit-service.ts`](../src/audit/audit-service.ts)).
9. **Exposition des secrets et dépendances logicielles** (`package.json`, `.env.example`, `.gitignore`).

---

## 2. Mécanismes de Sécurité Implémentés et Vérifiés

### 2.1. Authentification et Mots de Passe
- **Implémentation** : Hachage via `crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })` avec un sel aléatoire de 16 octets par utilisateur. Vérification via `crypto.timingSafeEqual` pour prévenir les attaques temporelles (*timing attacks*).
- **Test exécuté** : Test n° 2 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) (succès avec mot de passe valide, échec avec mot de passe erroné + journalisation d'audit `AUTH_LOGIN_FAILED_WRONG_PASSWORD`).

### 2.2. Sessions Côté Serveur
- **Implémentation** : Jeton aléatoire de 32 octets signé par `HMAC-SHA256` avec `appConfig.sessionSecret`. Seul le hachage `SHA-256` du jeton est stocké dans `auth_sessions.token_hash`. Support de la révocation immédiate (`revokeSession`) et de l'expiration (`expires_at`).
- **Test exécuté** : Test n° 2 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) (vérification qu'une session révoquée retourne immédiatement `null`).

### 2.3. Autorisations et Isolation Multi-Tenant
- **Implémentation** :
  - Chaque opération métier exige un `AuthenticatedSessionContext` valide.
  - `assertOrganizationAccess()` vérifie l'appartenance effective de l'utilisateur à `organizationId` dans `organization_memberships`.
  - `assertDossierAccess()` vérifie pour les collaborateurs (`ACCOUNTANT_COLLABORATOR`) et dirigeants (`CLIENT_DIRECTOR`) que le dossier leur est explicitement affecté dans `dossier_assignments` avec le flag de permission correspondant (`can_view`, `can_upload`, `can_edit_extraction`, `can_validate_accounting`, `can_export`).
  - L'accès `PLATFORM_ADMIN` à une organisation cliente est refusé s'il n'est pas accompagné d'une justification écrite d'au moins 15 caractères (`PLATFORM_ADMIN_CROSS_TENANT_ACCESS_DENIED_NO_JUSTIFICATION`).
- **Tests exécutés** : Tests n° 3, 4 et 9 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) et Test n° 8 de [`src/tests/international-scope.test.ts`](../src/tests/international-scope.test.ts).

### 2.4. Stockage Documentaire et Liens Signés
- **Implémentation** :
  - Validation de la liste blanche MIME (`application/pdf`, `image/png`, `image/jpeg`, `text/csv`) et de la taille (`1 octet` à `15 Mo`).
  - Nettoyage du nom de fichier dans `storage_key` (`replace(/[^a-zA-Z0-9._-]/g, "_")`) pour empêcher toute traversée de répertoires (*path traversal*).
  - Jetons de téléchargement temporaires signés par `HMAC-SHA256` incluant `organizationId`, `dossierId`, `documentId`, `userId` et `expiresAtUnix`.
- **Tests exécutés** : Tests n° 7 et 8 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts).

### 2.5. Sécurité IA et Défense contre l'Injection de Prompt
- **Implémentation** :
  - `inspectAndIsolateUntrustedContent()` détecte les motifs d'injection (`ignore previous instructions`, `system prompt`, `validate_entry`, `grant_admin`, `PLATFORM_ADMIN`, `VALIDATED_BY_HUMAN`, `drop table`), neutralise les balises et encapsule le texte dans `<untrusted_document_content>`.
  - Lorsqu'une tentative d'injection est détectée, tous les champs extraits sont forcés au statut `NEEDS_HUMAN_REVIEW`.
  - `assertAiProviderAllowedForEnvironment()` bloque l'adaptateur simulé `mock-deterministic` en environnement de production (`NODE_ENV === "production"`).
- **Tests exécutés** : Test n° 7 de [`src/tests/phase0.test.ts`](../src/tests/phase0.test.ts) et Test n° 2 de [`src/tests/phase1-readiness-and-postgres.test.ts`](../src/tests/phase1-readiness-and-postgres.test.ts).

### 2.6. En-têtes HTTP de Sécurité et Gestion des Secrets
- **Implémentation** :
  - Le serveur HTTP ([`src/server.ts`](../src/server.ts)) applique systématiquement `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` et `Content-Security-Policy`.
  - Aucun secret réel n'est présent dans le code source ; `.gitignore` exclut `.env`, `data/*.db` et `dist/`.
  - `package.json` ne dépend d'aucune bibliothèque runtime tierce (uniquement `@types/node` et `typescript` en développement), réduisant drastiquement le risque *supply-chain*.

---

## 3. Vulnérabilités Identifiées et Corrigées en Phase 0

| ID | Gravité | Problème identifié | Correction apportée | Statut |
| :--- | :--- | :--- | :--- | :--- |
| `SEC-FIX-01` | Moyenne | Échec d'enregistrement dans `audit_logs` (`FOREIGN KEY constraint failed`) lorsqu'un attaquant tente d'accéder à un `organizationId` ou `dossierId` qui n'existe pas en base. | Vérification préalable de l'existence de `organization_id` / `dossier_id` dans [`src/audit/audit-service.ts`](../src/audit/audit-service.ts) : si l'ID cible est fictif, `organization_id` est mis à `NULL` et l'ID tenté est conservé dans `metadata_json.unverifiedOrganizationId`. | **Corrigé & Testé** |
| `SEC-FIX-02` | Élevée | Risque qu'en production l'adaptateur de test `mock-deterministic` soit utilisé par défaut si `AI_PROVIDER` n'est pas modifié. | Ajout de `isSimulatedTestAdapter: true` et de `assertAiProviderAllowedForEnvironment()` qui lève une exception bloquante si `NODE_ENV === "production"`. | **Corrigé & Testé** |

---

## 4. Risques Restants et Mesures Correctives Planifiées (Phase 1 / Phase 2)

1. **Limitation de débit (*Rate Limiting*) sur `/api/auth/login`** (*Gravité : Moyenne*) : ajouter un limiteur par IP et par compte (ex. blocage temporaire après 5 échecs consécutifs en 5 minutes) en Phase 1.
2. **Validation de la robustesse des secrets en mode `production`** (*Gravité : Élevée*) : ajouter au démarrage du serveur en `NODE_ENV === "production"` une vérification interdisant les valeurs par défaut de `APP_SESSION_SECRET` et `APP_SIGNED_URL_SECRET`.
3. **Protection CSRF par jeton ou cookie `SameSite=Strict`** (*Gravité : Faible actuellement car l'API utilise l'en-tête `Authorization: Bearer`*) : maintenir l'authentification par en-tête `Authorization` ou exiger un jeton anti-CSRF si des cookies de session sont ajoutés.
4. **Ancrage externe du journal d'audit** (*Gravité : Moyenne*) : exporter périodiquement le dernier `integrity_hash` de `audit_logs` vers un stockage WORM externe en production.
