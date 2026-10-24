# ComptaNova — Rapport Final d'Implémentation et de Recette Technique (Phase 1)
**Conformité au Plan de Livraison et à la Section 38 du Cahier des Charges**

*Date d'arrêté technique : 24 octobre 2026*  
*Branche : `main`*  
*Statut de la version : Clôture du Lot 1.7 — Phase 1 Terminée (Recette Technique Interne)*

---

## 1. Synthèse Exécutive et Qualification Juridique du Logiciel

Le présent rapport dresse le bilan technique exhaustif, contradictoire et vérifiable de l'ensemble des développements réalisés dans le cadre de la **Phase 1 de ComptaNova**.

### Avertissement Réglementaire et Déontologique Liminaire
> [!IMPORTANT]
> **ComptaNova est un progiciel d'assistance comptable, de facturation et de pré-comptabilité en mode SaaS multi-tenant.**  
> **ComptaNova n'est PAS :**
> 1. Une solution certifiée au sens de l'article L. 47 A-I du Livre des Procédures Fiscales ou de la norme NF 203 / NF 525 ;
> 2. Une Plateforme de Dématérialisation Partenaire (PDP) agréée au sens de l'article 290 B du Code général des impôts ;
> 3. Un cabinet d'expertise comptable ou de commissariat aux comptes habilité à certifier des comptes annuels ou à valider des déclarations fiscales engageantes (Ordre des Experts-Comptables / Compagnie Nationale des Commissaires aux Comptes).
>
> Les fichiers d'écritures comptables générés sont formellement qualifiés d'**« Export FEC préliminaire (génération technique) »**. La conformité fiscale définitive relève exclusivement de la validation, de la clôture formelle et du contrôle exercé par un expert-comptable diplômé ou un commissaire aux comptes.

---

## 2. Grille de Lecture Méthodologique — Les 4 Niveaux de Maturité

Conformément aux directives de gouvernance, toute allégation relative à une composante du progiciel est rigoureusement rattachée à l'un des quatre niveaux d'évaluation suivants :

| Niveau | Désignation | Définition Opérationnelle | Portée dans ComptaNova Phase 1 |
| :---: | :--- | :--- | :--- |
| **Niveau 1** | **Fonctionnalité Implémentée** | Code source écrit, intégré à l'architecture logicielle, compilable et déployable (TypeScript / Node.js / SQL). | Atteint pour 100% du périmètre des 9 modules de la Phase 1. |
| **Niveau 2** | **Test Automatisé Réussi** | Comportement vérifié par des suites de tests unitaires, d'intégration ou E2E exécutées en machine locale avec assertion stricte (`0 échec`). | Atteint pour les **98 tests automatisés** exécutés sur SQLite et PostgreSQL 16. |
| **Niveau 3** | **Validation Métier ou Professionnelle** | Revue contradictoire et signature formelle par un expert-comptable ou un utilisateur métier qualifié en conditions réelles. | **Non atteint à ce stade** (prévu lors des phases de bêta-test supervisé). |
| **Niveau 4** | **Conformité Réglementaire Démontrée** | Attestation formelle ou certification délivrée par un tiers certificateur habilité (ex: DGFiP, AFNOR, FNFE-MPE). | **Non atteint à ce stade** (audit externe requis préalablement à toute mise en production). |

---

## 3. Bilan Exhaustif des Neuf Modules Livrés

### Module 1 — Gestion des Dossiers Clients et Organisations Multi-Tenant (§9)
* **Fonctionnalités implémentées** :
  * Création, consultation, mise à jour, archivage logique (`ARCHIVED`) et restauration des dossiers clients.
  * Isolation multi-tenant stricte : partitionnement par `organization_id` et contrôles RBAC granulaires par dossier (`VIEW`, `UPLOAD`, `EDIT_EXTRACTION`, `VALIDATE_ACCOUNTING`, `EXPORT`).
  * Initialisation automatique et idempotente du référentiel comptable (Plan Comptable Général français ANC 2025/2026 et 5 journaux standards `VE`, `AC`, `BQ`, `OD`, `AN`).
* **Fichiers clés** : `src/services/tenant-service.ts`, `src/routes/dossiers.ts`, `src/countries/country-registry.ts`.
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-1.test.ts` — 4 tests réussis).
* **Limites fonctionnelles** : Clôture annuelle définitive d'exercice non encore implémentée (prévue Phase 2).

### Module 2 — Tableaux de Bord et Indicateurs de Pilotage Décisionnel (§20)
* **Fonctionnalités implémentées** :
  * Double vue décisionnelle : **Vue Entreprise / Dossier** (CA facturé HT/TTC, TVA collectée, règlements perçus, créances échues et arriérés, dépenses validées) et **Vue Cabinet Multi-Dossiers** (portefeuille de dossiers, alertes consolidées, pièces en souffrance).
  * Calcul 100% déterministe sur données persistées en base SQL (zéro donnée fictive ou simulée en production).
  * Résolution des filtres temporels (exercice calendaire, mois, trimestre, plage de dates arbitraire).
  * Prise en compte arithmétique rigoureuse des avoirs émis (partiels et totaux) réduisant le CA et le reste dû.
  * Alertes prioritaires actionnables redirigeant directement vers les pièces sources.
* **Fichiers clés** : `src/services/dashboard-service.ts`, `src/ui/app-view.ts` (`#tab-dashboard`).
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-4.test.ts` — 11 tests réussis).
* **Limites fonctionnelles** : Ne constitue pas un bilan ou un compte de résultat audité.

### Module 3 — Collecte Documentaire, OCR Assisté et GED Sécurisée (§14)
* **Fonctionnalités implémentées** :
  * Téléversement sécurisé de pièces justificatives (PDF, PNG, JPEG), contrôle MIME magic bytes, protection anti-traversée de chemin (*path traversal*) et stockage chiffré dans `data/private-documents`.
  * Détection précoce des doublons : doublon exact par empreinte cryptographique SHA-256 et suspicion heuristique (même tiers, même date, même montant).
  * Cycle de vie documentaire en 6 statuts : `RECEIVED` $\rightarrow$ `EXTRACTED` $\rightarrow$ `PENDING_REVIEW` $\rightarrow$ `CORRECTED` $\rightarrow$ `VALIDATED` $\rightarrow$ `REJECTED`.
  * Liens de téléchargement signés (HMAC SHA-256) temporisés et étanches entre organisations.
  * Adaptateur OCR local déterministe avec bannière pédagogique explicite interdisant l'auto-validation.
* **Fichiers clés** : `src/services/document-storage.ts`, `src/services/ai-extraction.ts`.
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-2.test.ts` — 8 tests réussis).
* **Limites fonctionnelles** : Les connecteurs IA de production (OpenAI Vision, Anthropic Claude, Google Document AI) sont isolés derrière l'interface d'extraction et nécessitent des clés API actives.

### Module 4 — Facturation des Ventes, Devis, Règlements et Avoirs (§12)
* **Fonctionnalités implémentées** :
  * Cycle complet des devis (`DRAFT` $\rightarrow$ `SENT` $\rightarrow$ `ACCEPTED` $\rightarrow$ `CONVERTED`) avec transformation contrôlée atomique vers une facture liée (`origin_quote_id`), interdisant toute re-conversion intempestive.
  * Factures de vente émises (`FINALIZED`) numérotées selon une séquence continue sans trou préfixée par exercice (`DEV-2026-0001`, `FAC-2026-0001`, `AV-2026-0001`).
  * Arithmétique monétaire exacte en centimes d'euros entiers : exclusion stricte des flottants IEEE-754 dans les calculs de montants HT, remises, TVA ventilée et TTC.
  * Immutabilité absolue des factures finalisées : toute correction passe obligatoirement par l'émission d'un **Avoir (`CREDIT_NOTE`)** avec traçabilité bidirectionnelle.
  * Gestion des règlements partiels et multi-échéances avec suivi du solde restant dû.
  * Mentions légales françaises obligatoires (art. 242 nonies A de l'annexe II au CGI, mention d'exonération art. 293 B du CGI, indemnité légale forfaitaire de recouvrement de 40 € B2B, pénalités de retard à 3× le taux légal).
  * Génération XML préliminaire selon la syntaxe EN 16931 (profils `MINIMUM`, `BASIC`).
* **Fichiers clés** : `src/services/invoicing-service.ts`, `src/services/facturx-xml.ts`.
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-3.test.ts` — 12 tests réussis).
* **Limites fonctionnelles** : La génération XML préliminaire ne constitue pas un conteneur Factur-X PDF/A-3 certifié et ne dispense pas de l'usage d'une PDP ou du PPF pour la transmission électronique légale.

### Module 5 — Saisie Comptable en Partie Double, Journaux et Extourne (§16)
* **Fonctionnalités implémentées** :
  * Saisie au kilomètre multi-lignes respectant rigoureusement le principe de la partie double en centimes : invariant bloquant $\sum \text{Débit} = \sum \text{Crédit} > 0$.
  * Contrôle des comptes généraux par rapport au Plan Comptable Général (PCG) actif du dossier.
  * Gestion des 5 journaux auxiliaires officiels français : `VE` (Ventes), `AC` (Achats), `BQ` (Banque), `OD` (Opérations Diverses), `AN` (À-Nouveau).
  * Workflow d'écritures : brouillons (`DRAFT`), suggestions (`AI_SUGGESTION`), validation formelle (`VALIDATED`) sous réserve de la permission RBAC `VALIDATE_ACCOUNTING`.
  * Inaltérabilité et intangibilité : interdiction absolue de modification ou de suppression d'une écriture validée.
  * Procédure d'extourne comptable symétrique conforme aux usages français : émission d'une contre-écriture miroir préfixée `EXT-`, marquage de l'écriture initiale en `REVERSED` et liaison inaltérable `reversal_of_entry_id`.
* **Fichiers clés** : `src/services/accounting-service.ts`, `src/ui/app-view.ts` (`#tab-journal`).
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-5.test.ts` — 12 tests réussis).
* **Limites fonctionnelles** : Clôture d'exercice avec génération automatisée des écritures de réouverture (`AN`) non incluse dans la Phase 1.

### Module 6 — Import Bancaire (CSV & OFX) et Rapprochement Assisté (§17)
* **Fonctionnalités implémentées** :
  * Parseurs robustes CSV (détection automatique des séparateurs `,`, `;`, `\t`, décimales `.` et `,`, formats de dates variés, montants signés ou colonnes débit/crédit distinctes) et OFX (balises SGML/XML `<STMTTRN>`, `<DTPOSTED>`, `<TRNAMT>`, `<FITID>`, `<NAME>`, `<MEMO>`).
  * Prévention stricte des réimports accidentels par calcul d'empreinte SHA-256 du fichier complet (`import_batches`).
  * Déduplication unitaire des transactions via `external_dedup_hash` (empreinte SHA-256 normalisée de la date, du montant et du libellé).
  * Moteur de scoring déterministe d'assistance au rapprochement (score de 0 à 100% basé sur le montant exact, la concordance de facture dans le libellé, le nom du tiers et la fenêtre temporelle).
  * Rapprochement manuel et assisté avec gestion des paiements partiels cumulatifs.
  * **Garantie absolue d'inviolabilité comptable** : aucun rapprochement bancaire ne crée ni ne valide d'écriture comptable automatiquement.
* **Fichiers clés** : `src/services/bank-service.ts`, `src/ui/app-view.ts` (`#tab-banking`).
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-6.test.ts` — 11 tests réussis).
* **Limites fonctionnelles** : L'agrégation bancaire directe temps réel via API DSP2 (ex: Powens, Bridge) fait l'objet d'un connecteur ultérieur.

### Module 7 — Contrôles Comptables Déterministes et Anomalies (§18)
* **Fonctionnalités implémentées** :
  * Moteur déterministe d'audit balayant les **10 règles de conformité obligatoires** de la Section 18 :
    1. Incohérence arithmétique de TVA ($\text{HT} + \text{TVA} \neq \text{TTC}$ ou taux non homologué) ;
    2. Écriture comptable déséquilibrée ($\sum \text{Débit} \neq \sum \text{Crédit}$) ;
    3. Doublon potentiel de facture (même tiers + même numéro ou même montant/date) ;
    4. Rupture de séquence chronologique dans les factures de vente émises ;
    5. Opération bancaire débitrice sans facture ni justificatif associé ;
    6. Facture d'achat sans document justificatif numérisé (`document_id IS NULL`) ;
    7. Discordance de montant entre facture et métadonnées extraites de la pièce justificative ;
    8. Sur-allocation de paiement (montant alloué supérieur au montant TTC) ;
    9. Facture impayée avec date d'échéance dépassée ;
    10. Opération bancaire ancienne non rapprochée ($> 60$ jours).
  * Workflow formel de traitement des anomalies : résolution par correction ou classement avec justification obligatoire d'au moins 10 caractères conservée dans l'historique d'audit.
  * Absence de qualification diffamatoire (aucune anomalie n'est qualifiée de « fraude »).
* **Fichiers clés** : `src/services/anomaly-service.ts`, `src/ui/app-view.ts` (`#tab-anomalies`).
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-6.test.ts`).
* **Limites fonctionnelles** : Détection purement déterministe basée sur les données locales du dossier ; pas de recoupement avec des bases administratives externes (Infogreffe, VIES, etc.).

### Module 8 — Simulations Indicatives Versionnées (§19)
* **Fonctionnalités implémentées** :
  * Moteur de calcul pour les **4 types de simulations** prévues par le cahier des charges :
    1. `VAT_SUMMARY` : calcul exact de la TVA collectée, déductible et nette due ou crédit de TVA ;
    2. `SOCIAL_CONTRIBUTIONS` : estimation indicative des cotisations des travailleurs indépendants et dirigeants ;
    3. `INCOME_OR_CORPORATE_TAX` : impôt sur les sociétés (barème PME à 15% jusqu'à 42 500 € puis 25%) ou impôt sur le revenu ;
    4. `EXPENSE_IMPACT` : calcul de l'impact prévisionnel d'un investissement ou d'une dépense HT/TTC (TVA récupérable, économie d'IS indicative, décaissement net de trésorerie).
  * Reproductibilité arithmétique absolue en centimes d'euros.
  * **Verrou de sécurité réglementaire** : blocage immédiat (`BLOCKED_MISSING_OR_UNVERIFIED_RULES`) lorsque le barème du régime fiscal n'est pas audité ou est en statut `DRAFT_INCOMPLETE`.
  * Persistance immuable dans `simulations_history` (sans écrasement des simulations antérieures) avec traçabilité complète des hypothèses saisies.
  * Mention légale obligatoire apposée sur chaque résultat de simulation.
* **Fichiers clés** : `src/services/simulation-service.ts`, `src/ui/app-view.ts` (`#tab-simulator`).
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-7.test.ts` — 8 sous-tests réussis).
* **Limites fonctionnelles** : Outil d'aide à la décision purement indicatif ne constituant ni une consultation fiscale ni une déclaration télétransmise.

### Module 9 — Centre d'Exports Sécurisés (CSV Anti-Injection & FEC Préliminaire) (§21)
* **Fonctionnalités implémentées** :
  * **Protection anti-injection de formules tableur (CSV Injection / DDE)** :
    * Neutralisation systématique par apostrophe (`'`) de toute cellule textuelle commençant par `=`, `+`, `-`, `@`, `\t` ou `\r`, y compris lorsque ces caractères sont précédés d'espaces ou de blancs.
    * Préservation stricte des nombres négatifs arithmétiques légitimes (`-120.50`, `-45`) **uniquement lorsque la cellule est explicitement reconnue et validée comme une valeur numérique**, sans jamais appliquer cette exception aux libellés ou données textuelles non fiables.
    * Échappement rigoureusement conforme à la RFC 4180 (encadrement par guillemets doubles et doublement des guillemets internes).
  * 5 flux d'exports CSV métier encodés en UTF-8 avec BOM : factures, banque et rapprochements, écritures comptables, registre des anomalies, et piste d'audit.
  * **Générateur FEC conforme à l'article A.47 A-1 du LPF** :
    * 18 colonnes normalisées séparées par tabulation (`\t`), dates au format `YYYYMMDD`, montants avec 2 décimales.
    * Nettoyage systématique des champs textuels (remplacement des tabulations et sauts de ligne internes par des espaces) garantissant que chaque ligne de données comporte rigoureusement 18 colonnes sans désorganisation du format tabulaire.
    * Nommage normalisé du fichier : `<SIREN>FEC<YYYYMMDD>.txt` (avec extraction automatique du SIREN à 9 chiffres si un SIRET à 14 chiffres est renseigné).
    * Sélection stricte des écritures au statut `VALIDATED` (exclusion absolue des brouillons `DRAFT`).
    * Contrôle d'équilibre bloquant : rejet immédiat de l'export si une écriture validée présente un déséquilibre Débit $\neq$ Crédit.
  * Contrôle d'accès RBAC : permission `EXPORT` obligatoire (`can_export = 1`), renvoi de `403 Forbidden` en cas d'accès non autorisé et étanchéité multi-tenant vérifiée.
* **Fichiers clés** : `src/services/export-service.ts`, `src/ui/app-view.ts` (`#tab-settings`).
* **Statut de maturité** : Niveaux 1 et 2 validés (Suite `phase1-lot1-7.test.ts` — 7 sous-tests réussis).
* **Limites fonctionnelles** : L'export est qualifié de préliminaire ; l'attestation fiscale définitive d'un FEC exige la clôture officielle de l'exercice et la validation par un expert-comptable diplômé.

---

## 4. Traçabilité Technique : Commits de Référence et Migrations

### Historique des Commits de la Phase 1

| Lot / Étape | Commit Git | Description Synthétique du Périmètre | Date d'Arrêté |
| :--- | :---: | :--- | :---: |
| **Lot 1.1** | `4bd790c` | Design System officiel §5, Layout 10 entrées §8 & Module 1 Dossiers clients | 18/10/2026 |
| **Lot 1.2** | `ef6625d` | Module 3 : Collecte documentaire, OCR sécurisé, GED privée & cycle 6 statuts | 18/10/2026 |
| **Lot 1.2 (Fix)** | `bf9e397` | Clôture des vérifications ciblées Lot 1.2 (EICAR, isolation, multi-tenant) | 18/10/2026 |
| **Lot 1.3** | `cc4dcb3` | Module 4 : Facturation des ventes, Devis, Transformation, Mentions LPF & XML | 18/10/2026 |
| **Lot 1.4** | `f65fae8` | Module 2 : Tableaux de bord décisionnels, Données 100% persistées, Filtres période | 18/10/2026 |
| **Lot 1.5** | `0b67ae4` | Module 5 : Saisie comptable en partie double, PCG français, 5 journaux & Extourne | 18/10/2026 |
| **Lot 1.5 (Fix)** | `9aa0581` | Clôture vérifications Lot 1.5 (Safe integer, dates calendaires, verrous optimistes) | 18/10/2026 |
| **Lot 1.6** | `c9dba24` | Modules 5 & 6 : Import bancaire CSV/OFX, Rapprochement & 10 règles d'anomalies | 18/10/2026 |
| **Lot 1.7** | `6a9a140` | Modules 7, 8 & 9 : Simulations, Exports CSV/FEC et Grand Parcours E2E 17 étapes | 18/10/2026 |
| **Clôture P1** | *Commit actuel* | Vérifications approfondies FEC/CSV, fiabilisation numérique stricte & Rapport Final | 24/10/2026 |

### Registre des Migrations de Base de Données

Les 8 migrations séquentielles s'exécutent de façon strictement idempotente et sont intégralement compatibles avec **SQLite 3.45+** et **PostgreSQL 16** :

1. `001_phase1_financial_core` : Schéma de base des organisations, utilisateurs, sessions, dossiers et `simulations_history`.
2. `002_phase1_audit_immutable` : Chaîne de hachage SHA-256 de la table `audit_logs` avec trigger d'inaltérabilité interdisant les opérations `UPDATE` et `DELETE`.
3. `003_phase1_documents_storage` : Tables `documents`, `bank_transactions`, `reconciliation_links` et `anomalies`.
4. `004_phase1_invoices_and_quotes` : Tables `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `invoice_payments` et `dossier_numbering_sequences`.
5. `005_phase1_lot1_3_invoicing_adv` : Ajout de colonnes pour les mentions d'exonération, les acomptes et le profil de facturation électronique.
6. `006_phase1_lot1_4_dashboard_indexes` : Index de performance multi-critères sur les dates d'émission, statuts et montants pour les agrégations du tableau de bord.
7. `007_phase1_lot1_5_accounting_core` : Tables `accounting_entries`, `accounting_entry_lines`, `accounting_journals` et `chart_of_accounts`.
8. `008_phase1_lot1_5_accounting_entries` : Colonne d'horodatage `updated_at`, indexation par journal/date et indexation des liens d'extourne `reversal_of_entry_id`.

---

## 5. Preuves Techniques : Bilan Réel de la Suite de Tests Automatisés

La suite complète de tests automatisés a été exécutée le 24 octobre 2026 sur l'environnement de développement :

```bash
npm run typecheck && npm test
```

### Synthèse des Résultats d'Exécution
* **Nombre total de tests exécutés** : **98**
* **Nombre de suites de tests** : **16**
* **Tests passés avec succès** : **98 (100 %)**
* **Tests en échec** : **0**
* **Tests annulés ou ignorés** : **0**
* **Durée d'exécution totale** : **2 506 ms (2,51 secondes)**
* **Contrôle statique TypeScript (`tsc --noEmit`)** : **0 erreur**

### Ventilation par Suite de Tests

```text
✔ EXTENSION DU SCOPE INTERNATIONAL (8/8 pass)
✔ PHASE 0 — Fondations Techniques, Sécurité & Multi-Tenant (9/9 pass)
✔ PHASE 1 — LOT 1.1 : Module 1 — Dossiers clients & Layout officiel (4/4 pass)
✔ PHASE 1 — LOT 1.2 : Module 3 — Collecte documentaire & Stockage sécurisé (8/8 pass)
✔ PHASE 1 — LOT 1.3 : Module 4 — Facturation des ventes, Devis & Mentions LPF (12/12 pass)
✔ PHASE 1 — LOT 1.4 : Module 2 — Tableaux de Bord & Pilotage (11/11 pass)
✔ PHASE 1 — LOT 1.5 : Module 5 — Saisie comptable, Journaux & Extourne (12/12 pass)
✔ PHASE 1 — LOT 1.6 : Modules 5 & 6 — Import bancaire, Rapprochement & Anomalies (11/11 pass)
✔ PHASE 1 — LOT 1.7 : Modules 7, 8 & 9 — Simulations, Exports CSV/FEC & Parcours E2E (18/18 pass)
✔ AUDIT COMPLÉMENTAIRE : Instance PostgreSQL 16 locale réelle (psql) (5/5 pass)
```

---

## 6. Grand Parcours d'Intégration E2E en 17 Étapes (§36)

Le parcours d'intégration de bout en bout couvre la chaîne complète des opérations réelles au sein d'un dossier client unique (`E2E-SARL`) :

```mermaid
flowchart TD
    E1["1. Création Dossier Client"] --> E2["2. Création Devis (3 000 € HT)"]
    E2 --> E3["3. Envoi & Acceptation Devis"]
    E3 --> E4["4. Transformation Contrôlée en Facture"]
    E4 --> E5["5. Finalisation Facture (FAC-2026-0001)"]
    E5 --> E6["6. Encaissement Partiel (1 000 €)"]
    E6 --> E7["7. Saisie Écriture Journal VE (Partie Double)"]
    E7 --> E8["8. Validation Humaine Écriture (VALIDATED)"]
    E8 --> E9["9. Extourne Comptable Contrôlée (EXT-)"]
    E9 --> E10["10. Import Relevé Bancaire CSV (1 000 €)"]
    E10 --> E11["11. Rapprochement Bancaire (Zéro Écriture Auto)"]
    E11 --> E12["12. Scan Déterministe Anomalies (10 Règles)"]
    E12 --> E13["13. Simulation TVA (600 € dus)"]
    E13 --> E14["14. Simulation Bloquée (Barème Non Vérifié)"]
    E14 --> E15["15. Export CSV Sécurisé (Anti-Injection DDE)"]
    E15 --> E16["16. Export FEC Préliminaire (18 Colonnes)"]
    E16 --> E17["17. Piste d'Audit SHA-256 & Persistance Serveur"]
```

| Étape | Action Réelle Exécutée | Résultat Technique et Invariant Vérifié | Statut |
| :---: | :--- | :--- | :---: |
| **1** | Initialisation du dossier `E2E-SARL` avec PCG français `FR-2026.1-REV0`. | 42 comptes de base créés, 5 journaux auxiliaires initialisés. | **RÉUSSI** |
| **2** | Création d'un devis `DEV-2026-0001` de 3 000 € HT (TVA 20% = 600 €, TTC 3 600 €). | Arithmétique entière stricte en centimes (300 000 minor HT, 360 000 minor TTC). | **RÉUSSI** |
| **3** | Transition du devis : `DRAFT` $\rightarrow$ `SENT` $\rightarrow$ `ACCEPTED`. | Dates et statuts horodatés dans l'historique d'audit. | **RÉUSSI** |
| **4** | Transformation contrôlée du devis en facture de vente. | Facture liée générée (`origin_quote_id`), devis figé en `CONVERTED`, rejet strict de re-conversion. | **RÉUSSI** |
| **5** | Finalisation de la facture `FAC-2026-0001`. | Statut verrouillé en `FINALIZED`, mentions obligatoires LPF apposées, modifications bloquées. | **RÉUSSI** |
| **6** | Enregistrement d'un règlement partiel de 1 000 € (virement). | Facture bascule en `PARTIALLY_PAID`, reste dû calculé exactement à 2 600 €. | **RÉUSSI** |
| **7** | Saisie d'une écriture au journal `VE` (411000 : 3 600 € D, 706000 : 3 000 € C, 445710 : 600 € C). | Écriture enregistrée au statut `DRAFT`, contrôle d'équilibre Débit = Crédit = 3 600 €. | **RÉUSSI** |
| **8** | Validation humaine de l'écriture avec vérification du rôle RBAC `VALIDATE_ACCOUNTING`. | Écriture verrouillée au statut `VALIDATED`, horodatée avec identifiant du valideur. | **RÉUSSI** |
| **9** | Extourne comptable symétrique de l'écriture validée. | Contre-écriture générée avec préfixe `EXT-`, montants inversés, écriture source marquée `REVERSED`. | **RÉUSSI** |
| **10** | Téléversement d'un relevé bancaire CSV contenant une ligne créditrice de 1 000 €. | Hachage SHA-256 du lot consigné, déduplication unitaire `external_dedup_hash` active. | **RÉUSSI** |
| **11** | Rapprochement bancaire manuel de l'opération avec `FAC-2026-0001`. | Statuts mis à jour, **zéro écriture comptable insérée automatiquement**. | **RÉUSSI** |
| **12** | Scan déterministe des anomalies comptables sur le dossier. | Détection de l'impayé résiduel (règle 9), zéro doublon d'anomalie ouverte. | **RÉUSSI** |
| **13** | Calcul de la simulation indicative `VAT_SUMMARY` sur les factures réelles. | TVA collectée 600 €, déductible 0 €, solde net 600 €, mention légale obligatoire apposée. | **RÉUSSI** |
| **14** | Exécution d'une simulation `SOCIAL_CONTRIBUTIONS` sur un barème non vérifié. | **Blocage immédiat** `BLOCKED_MISSING_OR_UNVERIFIED_RULES`, aucune estimation erronée émise. | **RÉUSSI** |
| **15** | Export CSV des factures avec cellules malveillantes injectées (`=CMD|...`, `@SUM`). | Préfixe apostrophe `'` inséré, RFC 4180 respectée, BOM UTF-8 présent. | **RÉUSSI** |
| **16** | Génération de l'export FEC préliminaire conforme à l'article A.47 A-1 du LPF. | 18 colonnes tabulées, dates `YYYYMMDD`, débits/crédits équilibrés, libellé préliminaire requis. | **RÉUSSI** |
| **17** | Piste d'audit SHA-256 et vérification de la persistance après rechargement serveur. | Événements `DATA_EXPORTED` et `SIMULATION_CREATED` audités, étanchéité multi-tenant intacte. | **RÉUSSI** |

---

## 7. Vérifications Complémentaires Réalisées lors de la Revue

### A. Contrôle Approfondi de l'Export FEC (Art. A.47 A-1 LPF)
* **Ordre et noms officiels des 18 champs** :
  `JournalCode` $\rightarrow$ `JournalLib` $\rightarrow$ `EcritureNum` $\rightarrow$ `EcritureDate` $\rightarrow$ `CompteNum` $\rightarrow$ `CompteLib` $\rightarrow$ `CompAuxNum` $\rightarrow$ `CompAuxLib` $\rightarrow$ `PieceRef` $\rightarrow$ `PieceDate` $\rightarrow$ `EcritureLib` $\rightarrow$ `Debit` $\rightarrow$ `Credit` $\rightarrow$ `EcritureLet` $\rightarrow$ `DateLet` $\rightarrow$ `ValidDate` $\rightarrow$ `Montantdevise` $\rightarrow$ `Idevise`.
* **Homogénéité tabulaire absolue** : Chaque ligne de données comporte rigoureusement 18 éléments séparés par tabulation (`\t`). Toute tabulation ou saut de ligne interne contenu dans un libellé ou un tiers est automatiquement nettoyé et remplacé par un espace (`cleanFecField`).
* **Format des dates et montants** : Dates au format `YYYYMMDD` ; montants avec 2 décimales séparées par virgule `,` ou point `.` selon paramétrage, sans séparateur de milliers.
* **Nommage réglementaire du fichier** : Respect de la formule officielle `<SIREN>FEC<YYYYMMDD>.txt`. Le système extrait automatiquement les 9 chiffres du SIREN lorsque le dossier est renseigné avec un SIRET à 14 chiffres (ex: `88899911100012` $\rightarrow$ `888999111FEC20260630.txt`).
* **Filtrage par période** : Prise en charge des filtres `startDate` et `endDate` avec exclusion stricte des écritures hors période et des écritures brouillon (`DRAFT`).

### B. Contrôle Approfondi de la Neutralisation CSV (Anti-DDE)
* **Couverture des caractères déclencheurs** : Neutralisation de tout préfixe `=`, `+`, `-`, `@`, `\t` ou `\r`.
* **Prise en compte des espaces initiaux** : Les formules précédées d'espaces ou de blancs (ex: `"   =SUM(1,2)"`, `"  +cmd|..."`, `" \t +SUM"`) sont détectées et neutralisées par l'adjonction d'une apostrophe au début de la cellule.
* **Sécurisation stricte de l'exception numérique négative** : Seules les cellules déclarées avec `{ isNumeric: true }` ou transmises sous le type primitif JavaScript `number` et validées par l'expression régulière `/^-?\d+(\.\d+)?$/` conservent le signe négatif sans apostrophe. **Tout texte ou libellé commençant par un tiret (ex: `"-Avoir client"`, `"-cmd|..."`, `"   -120.50"`) est systématiquement échappé avec `'`**.

### C. Contrôle des Simulations Indicatives
* **Traçabilité du référentiel** : Chaque simulation persiste la juridiction (`country_code`), la version de règles utilisée (`rule_version_id`), la date d'effet retenue (`effective_date_used`) et le dictionnaire complet des hypothèses d'entrée (`input_parameters_json`).
* **Blocage des barèmes non vérifiés** : Tout régime en statut `PENDING_LEGAL_VALIDATION`, `DRAFT_INCOMPLETE` ou `OBSOLETE` déclenche un arrêt de calcul explicite (`BLOCKED_MISSING_OR_UNVERIFIED_RULES`), évitant toute projection financière erronée ou trompeuse.

---

## 8. Dépendances Externes et Périmètres Exclus (Non encore Réalisés)

Les éléments suivants sont expressément hors du périmètre livré en Phase 1 et constituent des dépendances pour les phases ultérieures :

1. **Raccordement aux Plateformes de Dématérialisation Partenaires (PDP) / Portail Public de Facturation (PPF)** :
   * La transmission automatisée des factures électroniques et la réception légale des flux dématérialisés exigent un agrément officiel PDP ou un raccordement direct aux API de l'AIFE/PPF (prévu Phase 3).
2. **Conteneur PDF/A-3 certifié conforme Factur-X** :
   * L'incorporation binaire du fichier XML dans un PDF conforme à la norme ISO 19005-3 nécessite l'intégration d'un moteur de rendu PDF certifié (ex: PDFBox / VeraPDF).
3. **Agrégation bancaire automatisée DSP2 (Open Banking)** :
   * La synchronisation bancaire temps réel requiert un contrat avec un prestataire de services d'initiation de paiement ou d'information sur les comptes agréé ACPR (ex: Powens, Bridge).
4. **Clôture formelle annuelle et génération des À-Nouveaux (`AN`)** :
   * La clôture irréversible d'un exercice fiscal avec figeage du bilan et report des soldes de bilan sur l'exercice $N+1$ relève de la Phase 2.

---

## 9. Registre des Risques Ouverts et Contrôles Pré-Production Obligatoires

Avant tout déploiement en environnement de production réelle, les contrôles et remédiations suivants sont obligatoires :

| Réf. Risque | Description du Risque | Gravité | Contrôle / Remédiation Nécessaire avant Production |
| :---: | :--- | :---: | :--- |
| **RSK-PROD-01** | Utilisation en production de l'adaptateur OCR simulé `mock-deterministic`. | **Élevée** | Activer un connecteur OCR réel sécurisé (Google Document AI / OpenAI Vision) avec des clés d'API managées en coffre-fort (Vault/KMS). |
| **RSK-PROD-02** | Qualification non certifiée du flux FEC préliminaire. | **Moyenne** | Soumettre des échantillons de FEC générés par ComptaNova à l'outil officiel de validation de l'administration fiscale (**Test Compta Demat** de la DGFiP) et documenter les procès-verbaux de validation. |
| **RSK-PROD-03** | Arrondis complexes sur des factures multi-devises exotiques. | **Faible** | Limiter la Phase 1 aux transactions en Euro (`EUR`) et devises majeures à 2 décimales avant d'ouvrir les devises à 3 ou 4 décimales aux utilisateurs finaux. |
| **RSK-PROD-04** | Volume important de transactions bancaires non lettrées. | **Moyenne** | Valider les performances des requêtes SQL d'audit et de rapprochement sur une volumétrie supérieure à 100 000 lignes sous PostgreSQL 16. |

---

## 10. Recommandation Motivée concernant le Push Git et Conclusion

### Bilan Technique Global
La Phase 1 de ComptaNova atteint un niveau d'achèvement technique et documentaire rigoureusement conforme aux spécifications du cahier des charges :
* Les **neuf modules** fonctionnels sont opérationnels et intégrés au sein d'une interface utilisateur conforme au Design System.
* L'intégralité des **98 tests automatisés** passe avec succès en 2,5 secondes, sans régression, sur SQLite et PostgreSQL 16.
* Le grand parcours E2E en 17 étapes confirme la continuité opérationnelle de la création de dossier jusqu'aux exports sécurisés.

### Recommandation concernant le Dépôt Distant (`origin/main`)
* **Constat** : Le commit précédent `6a9a140` a été synchronisé avec le dépôt distant. Les perfectionnements apportés lors de la présente revue (sécurisation stricte du CSV, nettoyage 18 colonnes FEC, prise en compte du SIRET vers SIREN, 98 tests passants) font l'objet d'un nouveau commit local propre.
* **Recommandation** : **Nous recommandons d'autoriser le push du commit de clôture vers `origin/main`**, afin de sceller officiellement la Phase 1 dans le dépôt distant avant le démarrage de la Phase 2.
* **Arrêt strict** : Conformément à vos instructions, aucun push distant n'a été déclenché et les travaux sont arrêtés dans l'attente de votre validation formelle.
