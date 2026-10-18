# ÉTAT GÉNÉRAL DU PROJET (`PROJECT_STATUS.md`) — ComptaNova

- **Date de dernière mise à jour** : 2026-10-18T16:18:00+01:00
- **Phase auditée** : **Phase 0 — Clôture Finale après Contre-Audit (`dce1dd7`) et Correctif Ciblé (`Lot 0.6`)**
- **Référence Git** : Branche `main` (`https://github.com/az2innov/comptanova.git`)
- **Statut global de la Phase 0** : **Phase 0 intégralement vérifiée et clôturée sur le plan technique (`22/22 tests passants`, `4 migrations appliquées`, `PostgreSQL 16.15 vérifié`)** — voir [`docs/PHASE0_FINAL_REAUDIT.md`](./PHASE0_FINAL_REAUDIT.md).

---

## 1. Fonctionnalités Opérationnelles (`VÉRIFIÉ` / `CORRIGÉ ET TESTÉ`)

1. **Identité produit et charte graphique centralisées (`APP_NAME="ComptaNova"`)** ([`src/config/app-config.ts`](../src/config/app-config.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts)) :
   - Application intégrale des 5 couleurs officielles (`#153D35`, `#237D68`, `#D9A441`, `#F7F6F2`, `#1C2421`) sans couleurs ardoise/bleu héritées (`REQ-002` — `CORRIGÉ ET TESTÉ`).
2. **Validation stricte des secrets en mode `production` (`SEC-OPEN-01` — `CORRIGÉ ET TESTÉ`)** ([`src/config/app-config.ts`](../src/config/app-config.ts)) :
   - Refus de démarrage (`FATAL [SEC-OPEN-01]`) si `SESSION_SECRET` ou `SIGNED_URL_SECRET` est absent, $< 32$ caractères, de démo, de faible entropie (`< 10` caractères distincts) ou si `SESSION_SECRET === SIGNED_URL_SECRET`.
3. **Authentification serveur (`scrypt`), sessions (`HMAC-SHA256`) et protection anti-brute-force (`SEC-OPEN-03` — `CORRIGÉ ET TESTÉ`)** ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts), [`src/server.ts`](../src/server.ts)) :
   - Quota dédié sur `POST /api/auth/login` (`10 req/min/IP` par défaut), `resolveClientIp(req, trustProxy)`, purge déterministe des compteurs expirés et tests de révocation/expiration.
4. **Isolation Multi-Tenant (`organization_id`), RBAC `/audit-logs` et résilience UI (`SEC-OPEN-02` — `CORRIGÉ ET TESTÉ`)** ([`src/auth/auth-service.ts`](../src/auth/auth-service.ts), [`src/server.ts`](../src/server.ts), [`src/ui/app-view.ts`](../src/ui/app-view.ts)) :
   - `GET /api/organizations/:orgId/audit-logs` autorisé à `FIRM_ADMIN` et `CLIENT_DIRECTOR` sur leur propre organisation (`200`), refusé à `ACCOUNTANT_COLLABORATOR` (`403`) et en inter-tenant (`403`), avec gestion gracieuse du `403` dans l'interface Web.
5. **Moteur monétaire international exact sans flottants IEEE-754** ([`src/domain/money.ts`](../src/domain/money.ts)) :
   - **20 devises** enregistrées avec exposant explicite (`0`, `2`, `3` et `4` décimales), avoirs négatifs, 4 modes d'arrondi, conversions FX auditées et écarts de change.
6. **Architecture réglementaire à 3 niveaux et registre versionné par dates d'effet** ([`src/countries/country-registry.ts`](../src/countries/country-registry.ts)) :
   - **8 versions couvrant 7 pays** (`FR` [2 versions], `BE`, `LU`, `CH`, `MA`, `TN`, `AE`). Aucune juridiction n'a `isProductionEnabled: true` sans validation professionnelle explicite.
7. **Moteur de règles comptables déterministe & Passerelle IA hybride anti-injection** ([`src/rules/deterministic-engine.ts`](../src/rules/deterministic-engine.ts), [`src/ai/ai-gateway.ts`](../src/ai/ai-gateway.ts)) :
   - Contrôle $\text{HT} + \text{TVA} = \text{TTC}$, équilibre Débit = Crédit, isolation `<UNTRUSTED_DOCUMENT_DATA_ONLY>`, et blocage de `mock-deterministic` en `NODE_ENV=production`.
8. **Modèle de données Phase 0 + Phase 1 (20 tables), migrations `001` à `004` et triggers d'inaltérabilité (`SEC-OPEN-04` — `CORRIGÉ ET TESTÉ`)** ([`src/db/database.ts`](../src/db/database.ts), [`src/db/phase1-readiness-migration.ts`](../src/db/phase1-readiness-migration.ts)) :
   - Triggers `BEFORE UPDATE` et `BEFORE DELETE` installés et vérifiés sur `./data/app.db`, `:memory:` et **PostgreSQL 16.15** réel (`psql -U postgres -h /tmp`), sans conflit `ON DELETE SET NULL`.

---

## 2. Décisions Finales après Lot 0.6 (`docs/PHASE0_FINAL_REAUDIT.md`)

| Décision | Statut | Condition / Justification |
| :--- | :--- | :--- |
| **A. Poursuite du développement de la Phase 1** | **OUI (`AUTORISÉ SANS RÉSERVE TECHNIQUE BLOQUANTE`)** | Les 6 contrôles du contre-audit (`SEC-OPEN-01` à `05` & `REQ-002`) sont `CORRIGÉ ET TESTÉ` (`22/22 tests passants`, `4 migrations appliquées`). |
| **B. Tests d'intégration avec données fictives** | **OUI (`AUTORISÉ`)** | Opérationnel pour l'API et l'interface Web sur les 4 profils de démonstration (`FIRM_ADMIN`, `ACCOUNTANT_COLLABORATOR`, `CLIENT_DIRECTOR`, `PLATFORM_ADMIN`). |
| **C. Utilisation de données comptables réelles hors production** | **SOUS CONDITION OPÉRATIONNELLE** | Prêt techniquement après Lot 0.6 ; requiert la création d'un fichier `.env` local avec deux secrets aléatoires distincts, le remplacement des mots de passe de démo et le respect du cadre RGPD. |
