import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import { POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL } from "../db/phase1-readiness-migration.js";
import {
  authenticateUser,
  AuthorizationError,
} from "../auth/auth-service.js";
import {
  listDossiersForOrganization,
} from "../services/tenant-service.js";
import {
  normalizeBankFileEncoding,
  parseBankDate,
  parseBankAmountToMinor,
  parseCsvBankStatement,
  parseOfxBankStatement,
  importBankStatement,
  listBankTransactions,
  reconcileBankTransaction,
  rejectReconciliationSuggestion,
  flagBankTransactionNoReceipt,
} from "../services/bank-service.js";
import {
  scanDossierAnomalies,
  listDossierAnomalies,
  resolveDossierAnomaly,
} from "../services/anomaly-service.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.6 : Modules 5 & 6 — Import bancaire, Rapprochement et Détection d'anomalies", () => {
  // Base de données SQLite de test isolée
  const db = createDatabaseConnection(":memory:");
  runMigrations(db);
  seedDemoData(db);

  // Authentification des acteurs
  const firmAdmin = authenticateUser(
    "expert@cabinet-hexagone-demo.local",
    "DemoAdmin2026!",
    "127.0.0.1",
    "test-runner",
    db
  ).context;
  const orgAId = firmAdmin.memberships[0]!.organizationId;

  const tenantBAdmin = authenticateUser(
    "direction@atelier-lumiere-demo.local",
    "DemoAdmin2026!",
    "127.0.0.1",
    "test-runner",
    db
  ).context;
  const orgBId = tenantBAdmin.memberships[0]!.organizationId;

  const dossierA = listDossiersForOrganization({
    session: firmAdmin,
    organizationId: orgAId,
    db,
  })[0]!;

  const dossierB = listDossiersForOrganization({
    session: tenantBAdmin,
    organizationId: orgBId,
    db,
  })[0]!;

  it("1. Parsing CSV de relevés bancaires : séparateurs (, ; tab), formats dates, décimales et colonnes signées ou débit/crédit séparées", () => {
    // 1.1 CSV point-virgule avec montant signé et format français
    const csvContent1 = `Date;Libelle;Montant;Reference
15/02/2026;Virement Client Acropole SAS;1200,00;VIR-ACROPOLE-123
16/02/2026;Prélèvement EDF Entreprises;-245,80;PRLV-EDF-456
17/02/2026;Abonnement Logiciel SAS;-49,00;CB-SAAS-789`;

    const parsed1 = parseCsvBankStatement(csvContent1);
    assert.equal(parsed1.transactions.length, 3);
    assert.equal(parsed1.transactions[0]!.operationDate, "2026-02-15");
    assert.equal(parsed1.transactions[0]!.amountMinor, 120000);
    assert.equal(parsed1.transactions[0]!.label, "Virement Client Acropole SAS");
    assert.equal(parsed1.transactions[0]!.paymentReference, "VIR-ACROPOLE-123");

    assert.equal(parsed1.transactions[1]!.operationDate, "2026-02-16");
    assert.equal(parsed1.transactions[1]!.amountMinor, -24580);

    assert.equal(parsed1.transactions[2]!.operationDate, "2026-02-17");
    assert.equal(parsed1.transactions[2]!.amountMinor, -4900);

    // 1.2 CSV avec colonnes Débit et Crédit séparées, virgule comme délimiteur
    const csvContent2 = `Date,Description,Debit,Credit,Reference
2026-02-10,Virement Entrant,,2500.50,VIR-REC-01
2026-02-11,Achat Fournitures,150.25,,CB-FOURN-02`;

    const parsed2 = parseCsvBankStatement(csvContent2);
    assert.equal(parsed2.transactions.length, 2);
    assert.equal(parsed2.transactions[0]!.operationDate, "2026-02-10");
    assert.equal(parsed2.transactions[0]!.amountMinor, 250050);
    assert.equal(parsed2.transactions[1]!.operationDate, "2026-02-11");
    assert.equal(parsed2.transactions[1]!.amountMinor, -15025);

    // 1.3 Normalisation d'encodage Windows-1252 / ISO-8859-1
    const rawBufferLatin1 = Buffer.from(
      "Date;Libell\xe9;Montant\n18/02/2026;Pr\xe9l\xe8vement T\xe9l\xe9com;-39,99\n",
      "binary"
    );
    const normalizedUtf8 = normalizeBankFileEncoding(rawBufferLatin1);
    assert.ok(normalizedUtf8.includes("Prélèvement Télécom") || normalizedUtf8.includes("Libellé"));
    const parsedLatin1 = parseCsvBankStatement(normalizedUtf8);
    assert.equal(parsedLatin1.transactions.length, 1);
    assert.equal(parsedLatin1.transactions[0]!.amountMinor, -3999);

    // 1.4 Robustesse montants et dates
    assert.equal(parseBankAmountToMinor("1 234,56"), 123456);
    assert.equal(parseBankAmountToMinor("-50,00 €"), -5000);
    assert.equal(parseBankAmountToMinor("+120.50"), 12050);
    assert.equal(parseBankDate("15/03/2026"), "2026-03-15");
    assert.equal(parseBankDate("2026-03-15"), "2026-03-15");
    assert.equal(parseBankDate("15-03-2026"), "2026-03-15");
  });

  it("2. Parsing OFX de relevés bancaires : balises SGML/XML, montants, dates DTPOSTED et identifiants FITID", () => {
    // 2.1 Format OFX standard SGML (sans balises de fermeture)
    const ofxSgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEVERSION:102
NEWFILEVERSION:200

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKTRANLIST>
<DTSTART>20260201120000
<DTEND>20260228120000
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260215120000
<TRNAMT>1450.00
<FITID>OFX-TX-001
<NAME>VIREMENT CLIENT ABC
<MEMO>FACTURE 2026-0042
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260216120000
<TRNAMT>-75.50
<FITID>OFX-TX-002
<NAME>HONORAIRES COMPTABLES
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const parsedOfx = parseOfxBankStatement(ofxSgml);
    assert.equal(parsedOfx.transactions.length, 2);
    assert.equal(parsedOfx.transactions[0]!.operationDate, "2026-02-15");
    assert.equal(parsedOfx.transactions[0]!.amountMinor, 145000);
    assert.equal(parsedOfx.transactions[0]!.label, "VIREMENT CLIENT ABC - FACTURE 2026-0042");
    assert.equal(parsedOfx.transactions[0]!.paymentReference, "OFX-TX-001");

    assert.equal(parsedOfx.transactions[1]!.operationDate, "2026-02-16");
    assert.equal(parsedOfx.transactions[1]!.amountMinor, -7550);
    assert.equal(parsedOfx.transactions[1]!.paymentReference, "OFX-TX-002");
  });

  it("3. Anti-réimport involontaire (SHA-256 du fichier) & Déduplication transactionnelle (external_dedup_hash)", () => {
    const csvContent = `Date;Libelle;Montant;Reference
20/02/2026;Virement Test Dedup 1;600,00;REF-DEDUP-1
21/02/2026;Virement Test Dedup 2;300,00;REF-DEDUP-2`;
    const buffer1 = Buffer.from(csvContent, "utf8");

    // 3.1 Premier import réussi
    const result1 = importBankStatement({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filename: "releve_fevrier_2026.csv",
      fileBuffer: buffer1,
      importType: "BANK_STATEMENT_CSV",
      db,
    });
    assert.equal(result1.totalRows, 2);
    assert.equal(result1.importedTransactionsCount, 2);
    assert.equal(result1.duplicateRows, 0);

    // 3.2 Tentative de réimport du même fichier exact : rejeté par le SHA-256
    assert.throws(
      () => {
        importBankStatement({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          filename: "releve_fevrier_2026_copie.csv",
          fileBuffer: buffer1,
          importType: "BANK_STATEMENT_CSV",
          db,
        });
      },
      /déjà été importé pour ce dossier/,
      "Le réimport exact du même fichier doit être bloqué par empreinte SHA-256"
    );

    // 3.3 Import d'un nouveau fichier contenant une ligne identique (déduplication unitaire)
    const csvContentPartial = `Date;Libelle;Montant;Reference
20/02/2026;Virement Test Dedup 1;600,00;REF-DEDUP-1
22/02/2026;Nouvelle ligne non vue;950,00;REF-NEW-3`;
    const buffer2 = Buffer.from(csvContentPartial, "utf8");

    const result2 = importBankStatement({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filename: "releve_fevrier_complement.csv",
      fileBuffer: buffer2,
      importType: "BANK_STATEMENT_CSV",
      db,
    });
    assert.equal(result2.totalRows, 2);
    assert.equal(result2.importedTransactionsCount, 1);
    assert.equal(result2.duplicateRows, 1, "La ligne déjà importée doit être comptabilisée en doublon ignoré");
  });

  it("4. Moteur de suggestion de rapprochement & Score de confiance (montant exact, libellé, référence)", () => {
    // Création d'une facture client dans la base de données pour tester l'appariement
    const invoiceId = "inv-test-matching-01";
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'ISSUED', 'FAC-2026-MATCH1', 'Client Conseil Alpha',
        '2026-02-01', '2026-03-01', 100000, 20000, 120000,
        0, 'EUR', 2, 'UNPAID',
        'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(invoiceId, orgAId, dossierA.id);

    // Import d'un relevé contenant un virement correspondant avec la référence de la facture
    const csvMatch = `Date;Libelle;Montant;Reference
25/02/2026;Virement FAC-2026-MATCH1 Client Conseil Alpha;1200,00;FAC-2026-MATCH1`;

    importBankStatement({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      filename: "releve_matching.csv",
      fileBuffer: Buffer.from(csvMatch, "utf8"),
      importType: "BANK_STATEMENT_CSV",
      db,
    });

    const txs = listBankTransactions({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      db,
    });
    const matchedTx = txs.transactions.find((t) => t.paymentReference === "FAC-2026-MATCH1");
    assert.ok(matchedTx);
    assert.ok(matchedTx.suggestedMatch);
    assert.equal(matchedTx.suggestedMatch.invoiceId, invoiceId);
    assert.ok(matchedTx.suggestedMatch.confidenceScore >= 0.9);

    // 4.2 Rejet de la suggestion
    const rejectRes = rejectReconciliationSuggestion({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      transactionId: matchedTx.id,
      reason: "Pas la bonne facture selon vérification téléphonique",
      db,
    });
    assert.equal(rejectRes.success, true);

    const txsAfter = listBankTransactions({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      db,
    });
    const rejectedTx = txsAfter.transactions.find((t) => t.id === matchedTx.id)!;
    assert.equal(rejectedTx.reconciliationStatus, "UNRECONCILED");
  });

  it("5. Rapprochement assisté/manuel : NON-CRÉATION d'écriture comptable automatique & Cycle de vie du rapprochement", () => {
    // 5.1 Comptage des écritures comptables avant rapprochement
    const countEntriesBefore = (db.prepare(`
      SELECT COUNT(*) as cnt FROM accounting_entries WHERE organization_id = ? AND dossier_id = ?
    `).get(orgAId, dossierA.id) as { cnt: number }).cnt;

    // Création facture et transaction à rapprocher
    const invId = "inv-test-reconcile-01";
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'ISSUED', 'FAC-2026-NOREC', 'Client Beta',
        '2026-02-05', '2026-03-05', 50000, 10000, 60000,
        0, 'EUR', 2, 'UNPAID',
        'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-02-05T00:00:00Z', '2026-02-05T00:00:00Z'
      )
    `).run(invId, orgAId, dossierA.id);

    const txId = "tx-bank-test-01";
    db.prepare(`
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, operation_date, label, amount_minor,
        currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        ?, ?, ?, '2026-02-26', 'Reglement Client Beta FAC-2026-NOREC', 60000,
        'EUR', 2, 0, 'UNRECONCILED', 'hash-test-manual-01', '2026-02-26T00:00:00Z', '2026-02-26T00:00:00Z'
      )
    `).run(txId, orgAId, dossierA.id);

    // 5.2 Rapprochement manuel
    const recResult = reconcileBankTransaction({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      transactionId: txId,
      invoiceId: invId,
      matchOrigin: "MANUAL_USER",
      db,
    });

    assert.equal(recResult.success, true);
    assert.equal(recResult.transactionStatus, "RECONCILED");
    assert.equal(recResult.invoicePaymentStatus, "PAID");
    assert.equal(recResult.allocatedAmountMinor, 60000);

    // 5.3 VÉRIFICATION CRUCIALE : STRICTEMENT AUCUNE ÉCRITURE COMPTABLE CRÉÉE AUTOMATIQUEMENT
    const countEntriesAfter = (db.prepare(`
      SELECT COUNT(*) as cnt FROM accounting_entries WHERE organization_id = ? AND dossier_id = ?
    `).get(orgAId, dossierA.id) as { cnt: number }).cnt;
    assert.equal(
      countEntriesAfter,
      countEntriesBefore,
      "Le rapprochement bancaire NE DOIT PAS créer d'écriture comptable automatique sans action explicite de l'expert"
    );

    // Vérification du lien dans reconciliation_links
    const link = db.prepare(`
      SELECT * FROM reconciliation_links WHERE bank_transaction_id = ? AND invoice_id = ?
    `).get(txId, invId) as any;
    assert.ok(link);
    assert.equal(link.validation_status, "VALIDATED_BY_HUMAN");
    assert.equal(link.allocated_amount_minor, 60000);
  });

  it("6. Rapprochements partiels successifs (Multi-Paiements) & Solde restant dû exact", () => {
    // Facture de 1 200,00 € TTC
    const multiInvId = "inv-test-multi-01";
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'ISSUED', 'FAC-2026-MULTI', 'Client Grands Comptes',
        '2026-02-01', '2026-03-01', 100000, 20000, 120000,
        0, 'EUR', 2, 'UNPAID',
        'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(multiInvId, orgAId, dossierA.id);

    // Premier paiement partiel de 500,00 €
    const txPart1 = "tx-part-1";
    db.prepare(`
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, operation_date, label, amount_minor,
        currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        ?, ?, ?, '2026-02-10', 'Acompte 1 FAC-2026-MULTI', 50000,
        'EUR', 2, 0, 'UNRECONCILED', 'hash-part-1', '2026-02-10T00:00:00Z', '2026-02-10T00:00:00Z'
      )
    `).run(txPart1, orgAId, dossierA.id);

    const resPart1 = reconcileBankTransaction({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      transactionId: txPart1,
      invoiceId: multiInvId,
      allocatedAmountMinor: 50000,
      db,
    });
    assert.equal(resPart1.transactionStatus, "RECONCILED");
    assert.equal(resPart1.invoicePaymentStatus, "PARTIALLY_PAID");
    assert.equal(resPart1.allocatedAmountMinor, 50000);

    const invAfterPart1 = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(multiInvId) as any;
    assert.equal(invAfterPart1.paid_amount_minor, 50000);
    assert.equal(invAfterPart1.gross_amount_minor - invAfterPart1.paid_amount_minor, 70000);

    // Second paiement du solde de 700,00 €
    const txPart2 = "tx-part-2";
    db.prepare(`
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, operation_date, label, amount_minor,
        currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        ?, ?, ?, '2026-02-25', 'Solde FAC-2026-MULTI', 70000,
        'EUR', 2, 0, 'UNRECONCILED', 'hash-part-2', '2026-02-25T00:00:00Z', '2026-02-25T00:00:00Z'
      )
    `).run(txPart2, orgAId, dossierA.id);

    const resPart2 = reconcileBankTransaction({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      transactionId: txPart2,
      invoiceId: multiInvId,
      allocatedAmountMinor: 70000,
      db,
    });
    assert.equal(resPart2.transactionStatus, "RECONCILED");
    assert.equal(resPart2.invoicePaymentStatus, "PAID");
    assert.equal(resPart2.allocatedAmountMinor, 70000);

    const invAfterPart2 = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(multiInvId) as any;
    assert.equal(invAfterPart2.paid_amount_minor, 120000);
    assert.equal(invAfterPart2.gross_amount_minor - invAfterPart2.paid_amount_minor, 0);

    // Tentative d'un troisième paiement excédentaire (sur-allocation bloquée)
    const txPart3 = "tx-part-3";
    db.prepare(`
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, operation_date, label, amount_minor,
        currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        ?, ?, ?, '2026-02-28', 'Trop perçu FAC-2026-MULTI', 10000,
        'EUR', 2, 0, 'UNRECONCILED', 'hash-part-3', '2026-02-28T00:00:00Z', '2026-02-28T00:00:00Z'
      )
    `).run(txPart3, orgAId, dossierA.id);

    assert.throws(
      () => {
        reconcileBankTransaction({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          transactionId: txPart3,
          invoiceId: multiInvId,
          allocatedAmountMinor: 10000,
          db,
        });
      },
      /intégralement réglée|dépasse le reste dû/,
      "L'allocation d'un montant supérieur au solde restant dû doit être strictement bloquée"
    );
  });

  it("7. Marquage Frais bancaires / Sans justificatif (flagBankTransactionNoReceipt)", () => {
    const feeTxId = "tx-bank-fee-01";
    db.prepare(`
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, operation_date, label, amount_minor,
        currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        ?, ?, ?, '2026-02-28', 'Frais de tenue de compte Q1', -1800,
        'EUR', 2, 0, 'UNRECONCILED', 'hash-fee-01', '2026-02-28T00:00:00Z', '2026-02-28T00:00:00Z'
      )
    `).run(feeTxId, orgAId, dossierA.id);

    const flagRes = flagBankTransactionNoReceipt({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      transactionId: feeTxId,
      notes: "Frais bancaires sans facture spécifique exigée",
      db,
    });
    assert.equal(flagRes.success, true);

    const txAfter = db.prepare(`SELECT reconciliation_status FROM bank_transactions WHERE id = ?`).get(feeTxId) as any;
    assert.equal(txAfter.reconciliation_status, "BANK_FEE_OR_NO_RECEIPT_FLAGGED");

    // Vérification audit log
    const audit = db.prepare(`
      SELECT * FROM audit_logs WHERE organization_id = ? AND action = 'BANK_TRANSACTION_FLAGGED_NO_RECEIPT'
    `).get(orgAId) as any;
    assert.ok(audit);
    assert.equal(audit.target_entity_id, feeTxId);
  });

  it("8. Moteur de 10 règles déterministes d'anomalies (§18) & Faux positifs avec justification obligatoire (≥ 10 caractères)", () => {
    // 8.1 Préparation d'anomalies déterministes pour tester les 10 règles :
    // R1: TVA arithmétique erronée (HT + TVA != TTC)
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        'inv-ano-r1', ?, ?, 'ISSUED', 'FAC-ANO-R1', 'Client R1',
        '2026-02-01', '2026-03-01', 10000, 2000, 15000, -- 10000 + 2000 != 15000
        0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED',
        '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id);

    // R2: Écriture déséquilibrée
    db.prepare(`
      INSERT INTO accounting_entries (
        id, organization_id, dossier_id, journal_code, entry_date, piece_number,
        label, status, currency, currency_minor_unit_exponent,
        total_debit_minor, total_credit_minor, rule_version_id, created_by_user_id, created_at, updated_at
      ) VALUES (
        'entry-ano-r2', ?, ?, 'OD', '2026-02-15', 'OD-ANO-01',
        'Écriture déséquilibrée test', 'DRAFT', 'EUR', 2,
        50000, 40000, '${dossierA.countryConfigVersionId}', ?, '2026-02-15T00:00:00Z', '2026-02-15T00:00:00Z'
      )
    `).run(orgAId, dossierA.id, firmAdmin.user.id);

    // R3: Doublon de facture potentiel (même tiers, même date, même montant)
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES
      ('inv-ano-r3-a', ?, ?, 'RECEIVED', 'FAC-DUP-01', 'Fournisseur Doublon', '2026-02-10', '2026-03-10', 8000, 1600, 9600, 0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-02-10T00:00:00Z', '2026-02-10T00:00:00Z'),
      ('inv-ano-r3-b', ?, ?, 'RECEIVED', 'FAC-DUP-02', 'Fournisseur Doublon', '2026-02-10', '2026-03-10', 8000, 1600, 9600, 0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-02-10T00:00:00Z', '2026-02-10T00:00:00Z')
    `).run(orgAId, dossierA.id, orgAId, dossierA.id);

    // R4: Trou dans la séquence de facturation (FAC-2026-0001 puis FAC-2026-0003 sans le 0002)
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES
      ('inv-ano-r4-1', ?, ?, 'ISSUED', 'FAC-2026-0001', 'Client Seq 1', '2026-01-10', '2026-02-10', 10000, 2000, 12000, 0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z'),
      ('inv-ano-r4-3', ?, ?, 'ISSUED', 'FAC-2026-0003', 'Client Seq 3', '2026-01-15', '2026-02-15', 10000, 2000, 12000, 0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED', '2026-01-15T00:00:00Z', '2026-01-15T00:00:00Z')
    `).run(orgAId, dossierA.id, orgAId, dossierA.id);

    // R5 & R10: Débit non rapproché ancien (> 30 jours et > 60 jours)
    db.prepare(`
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, operation_date, label, amount_minor,
        currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        'tx-ano-r5-r10', ?, ?, '2025-11-01', 'Prelevement Ancien Inconnu', -150000,
        'EUR', 2, 0, 'UNRECONCILED', 'hash-ano-old-tx', '2025-11-01T00:00:00Z', '2025-11-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id);

    // R6: Dépense sans justificatif
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        'inv-ano-r6', ?, ?, 'RECEIVED', 'FAC-DEP-SANS-JUSTIF', 'Fournisseur R6',
        '2026-02-01', '2026-03-01', 5000, 1000, 6000,
        0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED',
        '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id);

    // R7: Discordance montant facture vs document extrait
    db.prepare(`
      INSERT INTO documents (
        id, organization_id, dossier_id, original_filename, mime_type, size_bytes,
        sha256_checksum, storage_key, category, workflow_status, extracted_data_json,
        uploaded_by_user_id, retention_until_date, created_at, updated_at
      ) VALUES (
        'doc-ano-r7', ?, ?, 'facture_r7.pdf', 'application/pdf', 2048,
        'sha-doc-r7', 'storage/docs/doc-r7.pdf', 'SUPPLIER_INVOICE', 'VALIDATED', '{"totalTtcMinor": 50000}',
        ?, '2036-01-01', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id, firmAdmin.user.id);

    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, document_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        'inv-ano-r7', ?, ?, 'doc-ano-r7', 'RECEIVED', 'FAC-ANO-R7', 'Fournisseur R7',
        '2026-02-01', '2026-03-01', 30000, 6000, 36000, -- 36000 != 50000 du document
        0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED',
        '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id);

    // R8: Paiement sur-alloué
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        'inv-ano-r8', ?, ?, 'ISSUED', 'FAC-ANO-R8', 'Client R8',
        '2026-02-01', '2026-03-01', 10000, 2000, 12000,
        15000, -- 15000 > 12000
        'EUR', 2, 'PAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED',
        '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id);

    // R9: Facture en retard d'échéance non payée
    db.prepare(`
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        'inv-ano-r9', ?, ?, 'ISSUED', 'FAC-ANO-R9', 'Client Retardataire',
        '2025-10-01', '2025-11-01', 20000, 4000, 24000,
        0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED',
        '2025-10-01T00:00:00Z', '2025-10-01T00:00:00Z'
      )
    `).run(orgAId, dossierA.id);

    // 8.2 Exécution du scan déterministe
    const scanRes = scanDossierAnomalies({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      db,
    });
    assert.ok(scanRes.totalOpenAnomalies >= 8, `Au moins 8 anomalies attendues, trouvé: ${scanRes.totalOpenAnomalies}`);

    const anomaliesList = listDossierAnomalies({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      db,
    });

    const ruleCodes = new Set(anomaliesList.anomalies.map((a) => a.ruleCode));
    assert.ok(ruleCodes.has("RULE_01_VAT_ARITHMETIC_MISMATCH"), "Règle 1 doit être détectée");
    assert.ok(ruleCodes.has("RULE_02_UNBALANCED_ACCOUNTING_ENTRY"), "Règle 2 doit être détectée");
    assert.ok(ruleCodes.has("RULE_03_POTENTIAL_DUPLICATE_INVOICE"), "Règle 3 doit être détectée");
    assert.ok(ruleCodes.has("RULE_04_INVOICE_SEQUENCE_GAP"), "Règle 4 doit être détectée");
    assert.ok(ruleCodes.has("RULE_05_UNRECONCILED_DEBIT_WITHOUT_INVOICE"), "Règle 5 doit être détectée");
    assert.ok(ruleCodes.has("RULE_06_EXPENSE_WITHOUT_RECEIPT"), "Règle 6 doit être détectée");
    assert.ok(ruleCodes.has("RULE_07_AMOUNT_MISMATCH_INVOICE_DOCUMENT"), "Règle 7 doit être détectée");
    assert.ok(ruleCodes.has("RULE_08_OVERALLOCATED_OR_MISMATCHED_PAYMENT"), "Règle 8 doit être détectée");
    assert.ok(ruleCodes.has("RULE_09_OVERDUE_UNPAID_INVOICE"), "Règle 9 doit être détectée");
    assert.ok(ruleCodes.has("RULE_10_OLD_UNRECONCILED_BANK_TX"), "Règle 10 doit être détectée");

    // 8.3 Résolution d'anomalie : Correction
    const anoR1 = anomaliesList.anomalies.find((a) => a.ruleCode === "RULE_01_VAT_ARITHMETIC_MISMATCH")!;
    const resCorrection = resolveDossierAnomaly({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      anomalyId: anoR1.id,
      resolutionStatus: "RESOLVED_BY_CORRECTION",
      resolutionJustification: "Facture corrigée avec calcul exact de la TVA",
      db,
    });
    assert.equal(resCorrection.status, "RESOLVED_BY_CORRECTION");

    // 8.4 Gestion des faux positifs : Justification obligatoire ≥ 10 caractères
    const anoR3 = anomaliesList.anomalies.find((a) => a.ruleCode === "RULE_03_POTENTIAL_DUPLICATE_INVOICE")!;

    // Rejet si justification trop courte ou absente
    assert.throws(
      () => {
        resolveDossierAnomaly({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          anomalyId: anoR3.id,
          resolutionStatus: "DISMISSED_WITH_JUSTIFICATION",
          resolutionJustification: "ok",
          db,
        });
      },
      /d'au moins 10 caractères est obligatoire/,
      "Rejet d'une justification de faux positif trop courte (< 10 caractères)"
    );

    // Acceptation si justification valide ≥ 10 caractères
    const resDismiss = resolveDossierAnomaly({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      anomalyId: anoR3.id,
      resolutionStatus: "DISMISSED_WITH_JUSTIFICATION",
      resolutionJustification: "Factures distinctes correspondant à deux livraisons séparées le même jour",
      db,
    });
    assert.equal(resDismiss.status, "DISMISSED_WITH_JUSTIFICATION");
    assert.equal(resDismiss.resolutionJustification, "Factures distinctes correspondant à deux livraisons séparées le même jour");
  });

  it("9. Isolation Multi-Tenant stricte & Contrôles RBAC serveur sur les opérations bancaires", () => {
    // 9.1 Isolation Multi-Tenant : Tenant B ne peut pas lister les transactions de Dossier A
    assert.throws(
      () => {
        listBankTransactions({
          session: tenantBAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          db,
        });
      },
      AuthorizationError,
      "L'accès cross-tenant aux transactions bancaires doit lever une AuthorizationError"
    );

    // 9.2 Rejet de rapprochement inter-tenant
    assert.throws(
      () => {
        reconcileBankTransaction({
          session: tenantBAdmin,
          organizationId: orgBId,
          dossierId: dossierB.id,
          transactionId: "tx-bank-test-01", // appartient à dossier A
          invoiceId: "inv-test-matching-01",
          db,
        });
      },
      AuthorizationError,
      "L'accès cross-tenant ou non autorisé au rapprochement doit lever une AuthorizationError"
    );

    // 9.3 Isolation des anomalies : scan et listing protégés
    assert.throws(
      () => {
        listDossierAnomalies({
          session: tenantBAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          db,
        });
      },
      AuthorizationError,
      "L'accès cross-tenant aux anomalies doit lever une AuthorizationError"
    );
  });

  it("10. Test fonctionnel réel sur PostgreSQL 16 local (psql -U postgres -h /tmp)", () => {
    const testSchema = `test_lot1_6_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const sqlScript = `
      SET client_min_messages TO WARNING;
      DROP SCHEMA IF EXISTS ${testSchema} CASCADE;
      CREATE SCHEMA ${testSchema};
      SET search_path TO ${testSchema};

      ${POSTGRESQL_COMPATIBLE_FULL_SCHEMA_SQL}

      INSERT INTO country_config_versions (
        version_id, country_code, country_name, deployment_priority_order,
        version_number, effective_from, validation_status, is_production_enabled,
        default_currency, statutory_retention_years, config_payload_json, created_at
      ) VALUES (
        'FR-PCG-2026.1', 'FR', 'France', 1, '2026.1.0', '2026-01-01',
        'VALIDATED_FOR_PRODUCTION', 1, 'EUR', 10, '{}', '2026-10-18T00:00:00Z'
      );

      INSERT INTO organizations (
        id, name, slug, organization_type, country_code, primary_tax_jurisdiction_code,
        default_currency, created_at, updated_at
      ) VALUES (
        'org-pg-lot1-6', 'Cabinet Test Bank PG', 'cabinet-test-bank-pg', 'ACCOUNTING_FIRM',
        'FR', 'FR', 'EUR', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO users (
        id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at
      ) VALUES (
        'user-pg-lot1-6', 'expert@mod6-pg.fr', 'Expert PG Mod6', 'scrypt$test', 0, 1,
        '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      INSERT INTO client_dossiers (
        id, organization_id, name, code, country_code, tax_jurisdiction_code,
        tax_residence_country_code, country_config_version_id, currency,
        currency_minor_unit_exponent, tax_regime_code,
        fiscal_year_start_month, is_active, created_at, updated_at
      ) VALUES (
        'dossier-pg-lot1-6', 'org-pg-lot1-6', 'SAS Module 6 PG', 'DOS-PG-006', 'FR', 'FR',
        'FR', 'FR-PCG-2026.1', 'EUR',
        2, 'REAL_NORMAL_MONTHLY',
        1, 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      -- Insertion lot d'import bancaire
      INSERT INTO import_batches (
        id, organization_id, dossier_id, import_type, original_filename, file_sha256_checksum,
        status, total_rows, valid_rows, duplicate_rows, error_rows, imported_by_user_id, created_at
      ) VALUES (
        'batch-pg-1', 'org-pg-lot1-6', 'dossier-pg-lot1-6', 'BANK_STATEMENT_CSV', 'banque_pg.csv', 'sha256-pg-batch-1',
        'COMMITTED', 2, 2, 0, 0, 'user-pg-lot1-6', '2026-10-18T00:00:00Z'
      );

      -- Insertion transaction bancaire
      INSERT INTO bank_transactions (
        id, organization_id, dossier_id, import_batch_id, operation_date, label,
        amount_minor, currency, currency_minor_unit_exponent, reconciled_amount_minor,
        reconciliation_status, external_dedup_hash, created_at, updated_at
      ) VALUES (
        'tx-pg-1', 'org-pg-lot1-6', 'dossier-pg-lot1-6', 'batch-pg-1', '2026-10-18', 'Virement Client PG',
        120000, 'EUR', 2, 0, 'UNRECONCILED', 'hash-pg-tx-1', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      -- Insertion facture client
      INSERT INTO invoices (
        id, organization_id, dossier_id, direction, invoice_number, third_party_name,
        issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
        paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
        validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
      ) VALUES (
        'inv-pg-1', 'org-pg-lot1-6', 'dossier-pg-lot1-6', 'ISSUED', 'FAC-PG-2026-001', 'Client PG',
        '2026-10-18', '2026-11-18', 100000, 20000, 120000,
        0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', 'FR-PCG-2026.1', 1, 'FINALIZED',
        '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'
      );

      -- Création lien de rapprochement
      INSERT INTO reconciliation_links (
        id, organization_id, dossier_id, bank_transaction_id, invoice_id,
        allocated_amount_minor, currency, confidence_score, match_origin,
        validation_status, validated_by_user_id, validated_at, created_at
      ) VALUES (
        'rec-pg-1', 'org-pg-lot1-6', 'dossier-pg-lot1-6', 'tx-pg-1', 'inv-pg-1',
        120000, 'EUR', 1.0, 'MANUAL_USER', 'VALIDATED_BY_HUMAN', 'user-pg-lot1-6',
        '2026-10-18T10:00:00Z', '2026-10-18T10:00:00Z'
      );

      -- Mise à jour transaction et facture
      UPDATE bank_transactions SET reconciliation_status = 'RECONCILED', reconciled_amount_minor = 120000 WHERE id = 'tx-pg-1';
      UPDATE invoices SET payment_status = 'PAID', paid_amount_minor = 120000 WHERE id = 'inv-pg-1';

      -- Insertion et résolution d'anomalie
      INSERT INTO anomalies (
        id, organization_id, dossier_id, rule_code, rule_version_id, category,
        severity, is_certain_error, target_entity_type, target_entity_id, message,
        status, detected_at, updated_at
      ) VALUES (
        'ano-pg-1', 'org-pg-lot1-6', 'dossier-pg-lot1-6', 'RULE_03_POTENTIAL_DUPLICATE_INVOICE', 'FR-PCG-2026.1',
        'INVOICING', 'SUSPICION_TO_VERIFY', 0, 'INVOICE', 'inv-pg-1', 'Suspicion de doublon PostgreSQL',
        'OPEN', '2026-10-18T10:00:00Z', '2026-10-18T10:00:00Z'
      );

      UPDATE anomalies
      SET status = 'DISMISSED_WITH_JUSTIFICATION',
          resolution_justification = 'Faux positif justifie par contrat distinct',
          resolved_by_user_id = 'user-pg-lot1-6',
          resolved_at = '2026-10-18T10:05:00Z'
      WHERE id = 'ano-pg-1';

      DROP SCHEMA ${testSchema} CASCADE;
    `;

    const pgResult = execFileSync(
      "psql",
      ["-U", "postgres", "-h", "/tmp", "-v", "ON_ERROR_STOP=1"],
      { input: sqlScript, encoding: "utf8" }
    );
    assert.ok(pgResult !== null, "L'exécution PostgreSQL 16 doit réussir sans erreur");
  });

  it("11. Test d'intégration API REST complet sur les routes Module 5 & 6 (/bank/... et /anomalies/...)", async () => {
    resetRateLimitBucketsForTests();
    const server = createAppServer(db);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;

    try {
      // 11.1 Authentification
      const loginPayload = JSON.stringify({
        email: "expert@cabinet-hexagone-demo.local",
        password: "DemoAdmin2026!",
      });

      const token = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          `${origin}/api/auth/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(loginPayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              const parsed = JSON.parse(body);
              if (parsed.token) resolve(parsed.token);
              else reject(new Error("Token manquant"));
            });
          }
        );
        req.write(loginPayload);
        req.end();
      });

      // 11.2 POST /api/.../bank/import (Import d'un relevé bancaire)
      const importPayload = JSON.stringify({
        filename: "releve_api_test.csv",
        content: `Date;Libelle;Montant;Reference\n25/02/2026;Virement Client API Test;750,00;VIR-API-01\n26/02/2026;Frais bancaires mensuels;-12,00;FRAIS-API-02`,
        importType: "BANK_STATEMENT_CSV",
      });

      const importRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/bank/import`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(importPayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(importPayload);
        req.end();
      });
      assert.equal(importRes.status, 201);
      assert.equal(importRes.data.batch.importedTransactionsCount, 2);

      // 11.3 GET /api/.../bank/transactions (Liste des transactions avec statut)
      const listTxRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/bank/transactions`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(listTxRes.status, 200);
      assert.ok(Array.isArray(listTxRes.data.transactions));
      const apiTx = listTxRes.data.transactions.find((t: any) => t.paymentReference === "VIR-API-01");
      const feeTx = listTxRes.data.transactions.find((t: any) => t.paymentReference === "FRAIS-API-02");
      assert.ok(apiTx);
      assert.ok(feeTx);

      // 11.4 Création d'une facture pour le rapprochement API
      const apiInvId = "inv-api-reconcile-01";
      db.prepare(`
        INSERT INTO invoices (
          id, organization_id, dossier_id, direction, invoice_number, third_party_name,
          issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
          paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
          validation_status, rule_version_id, is_b2b, invoice_status, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'ISSUED', 'FAC-API-001', 'Client API Integration',
          '2026-02-20', '2026-03-20', 62500, 12500, 75000,
          0, 'EUR', 2, 'UNPAID', 'VALIDATED_BY_HUMAN', '${dossierA.countryConfigVersionId}', 1, 'FINALIZED',
          '2026-02-20T00:00:00Z', '2026-02-20T00:00:00Z'
        )
      `).run(apiInvId, orgAId, dossierA.id);

      // 11.5 POST /api/.../bank/reconcile (Rapprochement manuel via API)
      const reconcilePayload = JSON.stringify({
        transactionId: apiTx.id,
        invoiceId: apiInvId,
        matchOrigin: "MANUAL_USER",
      });

      const reconcileRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/bank/reconcile`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(reconcilePayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(reconcilePayload);
        req.end();
      });
      assert.equal(reconcileRes.status, 200);
      assert.equal(reconcileRes.data.transactionStatus, "RECONCILED");
      assert.equal(reconcileRes.data.invoicePaymentStatus, "PAID");

      // 11.6 POST /api/.../bank/transactions/:txId/flag-no-receipt
      const flagPayload = JSON.stringify({
        notes: "Frais tenue de compte bancaire récurrents",
      });
      const flagRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/bank/transactions/${feeTx.id}/flag-no-receipt`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(flagPayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(flagPayload);
        req.end();
      });
      assert.equal(flagRes.status, 200);
      assert.equal(flagRes.data.success, true);

      // 11.7 POST /api/.../anomalies/scan (Lancement du scan d'anomalies via API)
      const scanApiRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/anomalies/scan`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(scanApiRes.status, 200);
      assert.ok(scanApiRes.data.totalOpenAnomalies >= 1);

      // 11.8 GET /api/.../anomalies (Consultation de la liste des anomalies via API)
      const listAnoRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/anomalies`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.end();
      });
      assert.equal(listAnoRes.status, 200);
      assert.ok(Array.isArray(listAnoRes.data.anomalies));
      const targetAno = listAnoRes.data.anomalies.find((a: any) => a.status === "OPEN");
      assert.ok(targetAno);

      // 11.9 POST /api/.../anomalies/:id/resolve (Résolution d'anomalie via API)
      const resolvePayload = JSON.stringify({
        resolutionStatus: "DISMISSED_WITH_JUSTIFICATION",
        resolutionJustification: "Justification valide via API d'un faux positif controle",
      });

      const resolveApiRes = await new Promise<{ status: number; data: any }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgAId}/dossiers/${dossierA.id}/anomalies/${targetAno.id}/resolve`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(resolvePayload),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode || 0, data: JSON.parse(body) }));
          }
        );
        req.write(resolvePayload);
        req.end();
      });
      assert.equal(resolveApiRes.status, 200);
      assert.equal(resolveApiRes.data.anomaly.status, "DISMISSED_WITH_JUSTIFICATION");

      // 11.10 Étanchéité multi-tenant sur l'API : Token A ne peut pas importer sur dossier B
      const crossTenantImport = await new Promise<{ status: number }>((resolve) => {
        const req = http.request(
          `${origin}/api/organizations/${orgBId}/dossiers/${dossierB.id}/bank/import`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(importPayload),
            },
          },
          (res) => resolve({ status: res.statusCode || 0 })
        );
        req.write(importPayload);
        req.end();
      });
      assert.equal(crossTenantImport.status, 403, "Le cross-tenant doit retourner un HTTP 403 Forbidden");

    } finally {
      server.close();
    }
  });
});
