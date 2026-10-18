# ÉTAT GÉNÉRAL DU PROJET (`PROJECT_STATUS.md`) — ComptaNova

- **Date de dernière mise à jour** : 2026-10-18T15:27:00+01:00
- **Phase auditée** : **Phase 0 — Audit Indépendant de Clôture, Architecture, Sécurité et Traçabilité**
- **Référence Git** : Branche `main` (`https://github.com/az2innov/comptanova.git`, commit initial `430bc22`)
- **Statut global de la Phase 0** : **Phase 0 validée sous réserves documentées** (voir [`docs/PHASE0_CLOSURE_AUDIT.md`](./PHASE0_CLOSURE_AUDIT.md)).

---

## 1. Fonctionnalités Opérationnelles (`VÉRIFIÉ`)

1. **Identité produit centralisée (`APP_NAME="ComptaNova"`)** ([`src/config/app-config.ts`](../src/config/app-config.ts), [`.env.example`](../.env.example)).
2. **Authentification serveur (`scrypt`) et sessions signées (`HMAC-SHA256`)** ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts)).
3. **Isolation Multi-Tenant (`organization_id`) et contrôle d'accès par dossier (`dossier_assignments`)** ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts), [`src/services/tenant-service.ts`](../src/services/tenant-service.ts)) avec justification minimale de **10 caractères** exigée pour tout accès `PLATFORM_ADMIN`.
4. **Moteur monétaire international exact sans flottants IEEE-754** ([`src/domain/money.ts`](../src/domain/money.ts)) :
   - **20 devises** enregistrées avec exposant explicite : `0` décimale (`XOF`, `XAF`, `JPY`), `2` décimales (`EUR`, `CHF`, `USD`, `GBP`, `MAD`, `DZD`, `AED`, `SAR`, `QAR`, `CAD`, `AUD`, `SGD`), `3` décimales (`TND`, `BHD`, `OMR`, `KWD`) et `4` décimales (`CLF`).
   - Support des avoirs négatifs, de 4 modes d'arrondi (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`), des conversions FX auditées (`convertCurrencyWithAudit`) et des écarts de change (`computeRealizedExchangeDifference`).
5. **Architecture réglementaire à 3 niveaux et registre versionné par dates d'effet** ([`src/countries/country-registry.ts`](../src/countries/country-registry.ts)) :
   - **8 versions couvrant 7 pays** (`FR` [2 versions : `FR-2025.1-HISTORICAL` (`OBSOLETE`) et `FR-2026.1-REV0` (`PENDING_LEGAL_VALIDATION`)], `BE`, `LU`, `CH`, `MA`, `TN`, `AE` [`DRAFT_INCOMPLETE`]).
   - Aucune juridiction n'a `isProductionEnabled: true` tant qu'une validation professionnelle n'est pas enregistrée (`assertCanActivateJurisdictionForProduction`).
6. **Moteur de règles comptables déterministe** ([`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts)) : contrôle $\text{HT} + \text{TVA} = \text{TTC}$, équilibre Débit = Crédit, simulations indicatives.
7. **Passerelle IA hybride anti-injection et garde de production** ([`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts)) : isolation `<UNTRUSTED_DOCUMENT_DATA_ONLY>`, statut forcé `PROPOSED_BY_AI` / `NEEDS_HUMAN_REVIEW`, et blocage de `mock-deterministic` en `NODE_ENV=production`.
8. **Modèle de données Phase 0 + Phase 1 (20 tables) et migrations reproductibles (`001`, `002`, `003`)** ([`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)) : testé sur SQLite et sur **PostgreSQL 16.15** réel (`psql -U postgres -h /tmp`).
9. **Interface web initiale et internationalisation (`fr-FR`, `en-GB`, `ar-AE` RTL)** ([`src/server.ts`](../src/server.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts), [`src/i18n/translations.ts`](../src/i18n/translations.ts)).

---

## 2. Remédiations de Sécurité et UI Clôturées en Lot 0.5 (`VÉRIFIÉ`) & Périmètre Reporté à la Phase 1

1. **`SEC-OPEN-01` $\rightarrow$ `VÉRIFIÉ`** : `getAppConfig()` dans [`src/config/app-config.ts`](../src/config/app-config.ts) lève désormais une exception fatale `FATAL [SEC-OPEN-01]` si `NODE_ENV === "production"` et que `SESSION_SECRET` ou `SIGNED_URL_SECRET` est absent, $< 32$ caractères ou égal à un secret de démo.
2. **`SEC-OPEN-02` $\rightarrow$ `VÉRIFIÉ`** : `GET /api/organizations/:orgId/audit-logs` dans [`src/server.ts`](../src/server.ts) exige désormais le rôle `FIRM_ADMIN` (ou `PLATFORM_ADMIN` justifié).
3. **`SEC-OPEN-03` $\rightarrow$ `VÉRIFIÉ`** : Limiteur de débit spécifique sur `POST /api/auth/login` (`10 req/min/IP` par défaut), purge des clés expirées et tests automatisés de `revokeSession()`, `expires_at` et HTTP `429`.
4. **`SEC-OPEN-04` $\rightarrow$ `VÉRIFIÉ`** : Triggers SQL `BEFORE UPDATE` et `BEFORE DELETE` ajoutés sur `audit_logs` en SQLite et PostgreSQL 16.
5. **`SEC-OPEN-05` & `REQ-002` $\rightarrow$ `VÉRIFIÉ`** : En-tête `Content-Security-Policy` ajouté, erreurs SQL internes filtrées et palette officielle (`#153D35` / `#237D68` / `#D9A441` / `#F6F8F7` / `#111827`) injectée dans `src/ui/app-view.ts`.
6. **Stockage binaire des documents et routes HTTP associées (`PARTIELLEMENT VÉRIFIÉ` — Périmètre Phase 1)** : l'ingestion SQLite (`ingestDocumentIntoDossier`) et les jetons signés `HMAC-SHA256` sont testés au niveau service ; l'écriture binaire sur disque/S3 et les routes HTTP d'upload/download seront exposées en Phase 1.

---

## 3. Fonctionnalités Simulées (`VÉRIFIÉ`)

- **Adaptateur `mock-deterministic`** ([`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts)) : clairement identifié par `isSimulatedTestAdapter: true` et `simulationNotice`, et interdit en `NODE_ENV=production`.

---

## 4. Fonctionnalités Absentes (Reportées à la Phase 1)

- Import opérationnel de listings de factures CSV/Excel, interface de saisie comptable multi-lignes, import bancaire CSV/OFX, rapprochement bancaire et export FEC (les 8 tables correspondantes sont déjà créées et testées en base).

---

## 5. Décisions de Passage (Section 9 de l'Audit de Clôture — Après Lot 0.5)

| Décision | Statut | Condition / Justification |
| :--- | :--- | :--- |
| **A. Poursuivre le développement de la Phase 1** | **OUI (`AUTORISÉ`)** | Socle technique, sécurité (`SEC-OPEN-01` à `05` corrigés), monétaire et base de données (20 tables SQLite + PG16) validé par **22/22 tests**. |
| **B. Tests d'intégration avec données fictives** | **OUI (`AUTORISÉ`)** | Fonctionnel immédiatement en local (`seedDemoData` + `mock-deterministic`). |
| **C. Utilisation de données comptables réelles hors production** | **SOUS CONDITIONS** | Prérequis techniques levés en Lot 0.5 ; requiert la configuration d'un `.env` local avec secrets forts, une sauvegarde chiffrée et le cadre RGPD. |
| **D. Mise en production commerciale** | **NON (`BLOQUÉ`)** | Requiert la réalisation des Phases métier 1–4, l'infrastructure cloud (PG16 managé + S3 WORM) et les validations professionnelles externes (`LEGAL_AND_COMPLIANCE_CHECKLIST.md`). |
