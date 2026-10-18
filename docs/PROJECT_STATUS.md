# ÉTAT GÉNÉRAL DU PROJET — ComptaNova (Nom Provisoire et Configurable)

- **Date de dernière mise à jour** : 2026-10-18T14:10:00+01:00
- **Phase en cours** : **Phase 0 — Audit, Architecture, Fondations, Sécurité et Traçabilité Complète** (Terminée et vérifiée — Prête pour le lancement de la Phase 1)
- **Statut global de la Phase 0** : **Phase 0 validée sous réserves documentées** *(100 % des fondations techniques et des 21 tests automatisés passent sur SQLite et PostgreSQL 16.15 ; les validations juridiques, fiscales et RGPD externes sont tracées comme réserves pré-commercialisation dans [`docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`](./LEGAL_AND_COMPLIANCE_CHECKLIST.md))*.

---

## 1. Fonctionnalités Opérationnelles (Implémentées et Testées)

1. **Configuration centralisée et identité produit configurable** ([`src/config/app-config.ts`](../src/config/app-config.ts), [`.env.example`](../.env.example)) :
   - Le nom du produit (`ComptaNova`), le slogan, les jetons de design (`#153D35`, `#237D68`, `#F7F8FA`, `#FFFFFF`, `#17212B`, `#64748B`, `#E2E8F0`, `#D9A441`) et les paramètres de sécurité sont centralisés dans une source unique.
2. **Authentification serveur et gestion des sessions** ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts)) :
   - Hachage des mots de passe par `crypto.scryptSync` avec sel aléatoire de 16 octets et comparaison en temps constant (`crypto.timingSafeEqual`).
   - Jetons de session signés par `HMAC-SHA256`, stockés sous forme d'empreinte `SHA-256` dans la table `auth_sessions`, avec expiration, révocation et contexte d'organisation active.
3. **Isolation Multi-Tenant et contrôle d'accès granulaire (RBAC) côté serveur** ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts), [`src/services/tenant-service.ts`](../src/services/tenant-service.ts)) :
   - 4 rôles (`PLATFORM_ADMIN`, `FIRM_ADMIN`, `ACCOUNTANT_COLLABORATOR`, `CLIENT_DIRECTOR`).
   - Cloisonnement strict par `organization_id` sur toutes les requêtes et affectation granulaire par dossier (`can_view`, `can_upload`, `can_edit_extraction`, `can_validate_accounting`, `can_export`).
   - Accès `PLATFORM_ADMIN` aux données d'un tenant conditionné à une justification écrite d'au moins 15 caractères, systématiquement journalisée.
4. **Moteur monétaire international exact sans flottants IEEE-754** ([`src/domain/money.ts`](../src/domain/money.ts)) :
   - Calculs en unités mineures entières (`BigInt` / `safeInteger`) supportant explicitement les devises à **0 décimale** (`XOF`, `XAF`, `JPY`), **2 décimales** (`EUR`, `CHF`, `USD`, `GBP`, `MAD`, `DZD`, `AED`, `SAR`, `QAR`, `CAD`, `AUD`, `SGD`), **3 décimales** (`TND`, `BHD`, `OMR`, `KWD`) et **4 décimales** (`CLF`).
   - Support des montants négatifs (avoirs / notes de crédit), de 4 modes d'arrondi (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`), des conversions multi-devises avec piste d'audit (`convertCurrencyWithAudit`) et du calcul des écarts de change (`computeRealizedExchangeDifference`).
5. **Architecture réglementaire multi-juridictions à 3 niveaux** ([`src/countries/country-registry.ts`](../src/countries/country-registry.ts)) :
   - Séparation stricte entre Cœur métier international (Niveau A), Couche de configuration par juridiction (Niveau B) et Packs réglementaires versionnés (Niveau C).
   - 13 juridictions pré-enregistrées : `FR` (seule active par défaut), `BE`, `LU`, `CH`, `MA`, `TN`, `DZ`, `AE`, `SA`, `QA`, `BH`, `OM`, `KW` (verrouillées en statut `IN_REVIEW` ou `DRAFT` avec `isProductionEnabled: false`).
6. **Moteur de règles comptables déterministe** ([`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts)) :
   - Vérification exacte $\text{HT} + \text{TVA} = \text{TTC}$, cohérence des taux en points de base, équilibre Débit = Crédit, et simulations indicatives horodatées avec hypothèses et avertissement non opposable.
7. **Journal d'audit applicatif chaîné par SHA-256** ([`src/audit/audit-service.ts`](../src/audit/audit-service.ts)) :
   - Enregistrement append-only avec chaînage cryptographique (`previous_hash` $\rightarrow$ `integrity_hash`) et fonction de vérification d'intégrité `verifyAuditChainIntegrity()`.
8. **Modèle de données Phase 0 + Phase 1 (20 tables) et migrations reproductibles** ([`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)) :
   - 3 migrations versionnées (`001_phase0_foundations`, `002_international_scope_extension`, `003_phase1_readiness_schema`) appliquées sur SQLite et testées en conditions réelles sur **PostgreSQL 16.15** (`psql -U postgres -h /tmp`).
   - Fonction transactionnelle `recordMultiLineAccountingEntry()` imposant au moins 2 lignes et l'équilibre strict $\sum \text{Débit} = \sum \text{Crédit} > 0$.
9. **Interface web initiale, API REST et internationalisation (`fr-FR`, `en-GB`, `ar-AE` RTL)** ([`src/server.ts`](../src/server.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts), [`src/i18n/translations.ts`](../src/i18n/translations.ts)).

---

## 2. Fonctionnalités Partielles

- **Stockage binaire des documents** : les métadonnées, l'empreinte `SHA-256`, la détection de doublons, le calcul de la date de rétention légale et les jetons de téléchargement signés `HMAC-SHA256` sont implémentés et testés ; l'écriture binaire vers un bucket S3 distant WORM reste à connecter en Phase 1/2.
- **Adaptation du runtime applicatif à PostgreSQL** : le schéma complet de 20 tables et les requêtes SQL transactionnelles sont testés et validés sur PostgreSQL 16.15 local ; les services TypeScript utilisent `node:sqlite` par défaut en mode local en attendant l'introduction du pool `pg` asynchrone.

---

## 3. Fonctionnalités Simulées (Identifiées Explicitement)

- **Adaptateur d'extraction IA `mock-deterministic`** ([`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts)) :
  - Porte le drapeau `isSimulatedTestAdapter: true` et la mention explicite `MODE SIMULÉ DE TEST (mock-deterministic)`.
  - Son exécution est **bloquée par code** lorsque `NODE_ENV === "production"` via `assertAiProviderAllowedForEnvironment()`.

---

## 4. Fonctionnalités Absentes (Volontairement Reportées à la Phase 1)

- Import opérationnel de listings de factures CSV/Excel (tables `import_batches` et `invoices` prêtes).
- Interface de saisie comptable manuelle multi-lignes (table `accounting_entry_lines` et fonction `recordMultiLineAccountingEntry()` prêtes).
- Import opérationnel de relevés bancaires CSV/OFX et moteur de rapprochement bancaire (tables `bank_transactions` et `reconciliation_links` prêtes).
- Génération et téléchargement de l'export FEC France (tables `accounting_entries` et `accounting_entry_lines` prêtes).

---

## 5. Blocages et Risques Majeurs

- **Aucun blocage technique** pour démarrer la Phase 1.
- **Blocages réglementaires pré-production (attendus)** : validation par un expert-comptable inscrit à l'OEC, consultation juridique sur le périmètre d'assistance technique, test de l'export FEC avec *Test Compta Demat* (DGFiP), et validation RGPD/DPA/AIPD par un DPO (voir [`docs/LEGAL_AND_COMPLIANCE_CHECKLIST.md`](./LEGAL_AND_COMPLIANCE_CHECKLIST.md) et [`docs/RISK_REGISTER.md`](./RISK_REGISTER.md)).

---

## 6. Prochaines Actions (Entrée en Phase 1 — MVP Opérationnel France)

1. Implémenter l'import de listings de factures CSV/Excel avec prévisualisation, détection de doublons via `import_batches` et rapport d'erreurs par ligne.
2. Connecter la saisie et la génération d'écritures comptables multi-lignes (`recordMultiLineAccountingEntry`) à l'interface et à l'API REST.
3. Implémenter l'import bancaire CSV/OFX et le rapprochement bancaire assisté avec validation humaine obligatoire.
4. Implémenter l'export préparatoire au format FEC France et les rapports de gestion/TVA indicatifs.
