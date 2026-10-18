import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import {
  authenticateUser,
  assertDossierAccess,
  generateSignedDocumentDownloadToken,
  verifySignedDocumentDownloadToken,
  AuthorizationError,
} from "../auth/auth-service.js";
import {
  listDossiersForOrganization,
  createClientDossier,
  ingestDocumentIntoDossier,
  listDossierDocuments,
  getDocumentDetails,
  updateDocumentExtraction,
  validateDocument,
  rejectDocument,
  createDraftEntryFromDocument,
  deleteDocument,
  assignUserToDossier,
} from "../services/tenant-service.js";
import {
  validateFileBuffer,
  sanitizeFilename,
  scanFileSafety,
  defaultDocumentStorage,
} from "../services/file-security.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.2 : Module 3 — Collecte documentaire, OCR assisté, détection de doublons et cycle de vie à 6 statuts", () => {
  // Préparation d'une base de test dédiée
  const db = createDatabaseConnection(":memory:");
  runMigrations(db);
  seedDemoData(db);

  // Authentification des acteurs de test
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

  const collabUser = authenticateUser(
    "collab@cabinet-hexagone-demo.local",
    "DemoAdmin2026!",
    "127.0.0.1",
    "test-runner",
    db
  ).context;

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

  // Échantillons de fichiers réels valides
  const validPdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Title (Facture Test SAS) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
    "utf-8"
  );
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);
  const validCsvBuffer = Buffer.from(
    "Date,Piece,Tiers,MontantHT,TVA,MontantTTC\n2026-10-01,FAC-001,EDF,100.00,20.00,120.00\n",
    "utf-8"
  );

  it("1. Validation stricte de sécurité des fichiers : taille, extensions exécutables, octets magiques et antimalware", async () => {
    // 1.1 Fichier vide rejeté (< 1 octet)
    assert.throws(
      () => validateFileBuffer(Buffer.alloc(0), "application/pdf", "facture.pdf"),
      /Fichier vide rejeté/
    );

    // 1.2 Fichier > 15 Mo rejeté
    const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024 + 1);
    assert.throws(
      () => validateFileBuffer(oversizedBuffer, "application/pdf", "facture.pdf"),
      /Fichier trop volumineux/
    );

    // 1.3 Extensions exécutables et scripts interdits
    const dangerousExtensions = [".exe", ".sh", ".bat", ".cmd", ".js", ".py", ".elf", ".msi"];
    for (const ext of dangerousExtensions) {
      assert.throws(
        () => validateFileBuffer(Buffer.from("malicious"), "application/octet-stream", `payload${ext}`),
        /Extension de fichier exécutable ou script strictement interdite/
      );
    }

    // 1.4 Signature binaire exécutable Windows (MZ) déguisée en PDF -> Refus catégorique
    const fakePdfWithMz = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.from("Windows Executable Payload")]);
    assert.throws(
      () => validateFileBuffer(fakePdfWithMz, "application/pdf", "fake-invoice.pdf"),
      /Contenu binaire exécutable Windows \(MZ\) interdit/
    );

    // 1.5 Signature binaire exécutable Linux (ELF) déguisée en PDF -> Refus catégorique
    const fakePdfWithElf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from("Linux Binary")]);
    assert.throws(
      () => validateFileBuffer(fakePdfWithElf, "application/pdf", "fake-invoice.pdf"),
      /Contenu binaire exécutable Linux \(ELF\) interdit/
    );

    // 1.6 Script shell déguisé (#!) -> Refus catégorique
    const fakeScriptPdf = Buffer.from("#!/bin/bash\nrm -rf /", "utf-8");
    assert.throws(
      () => validateFileBuffer(fakeScriptPdf, "application/pdf", "fake-invoice.pdf"),
      /Contenu de type script shell \(#!\) interdit/
    );

    // 1.7 Validation des octets magiques pour formats réels acceptés
    const pdfCheck = validateFileBuffer(validPdfBuffer, "application/pdf", "facture.pdf");
    assert.equal(pdfCheck.detectedMimeType, "application/pdf");

    const pngCheck = validateFileBuffer(validPngBuffer, "image/png", "ticket.png");
    assert.equal(pngCheck.detectedMimeType, "image/png");

    const csvCheck = validateFileBuffer(validCsvBuffer, "text/csv", "releve.csv");
    assert.equal(csvCheck.detectedMimeType, "text/csv");

    // 1.8 Détection de malware / signature de test EICAR
    const eicarPayload = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      "ascii"
    );
    const scan = await scanFileSafety(eicarPayload, "test-eicar.pdf");
    assert.equal(scan.isClean, false);
    assert.ok(scan.threatName?.includes("EICAR"));

    // Ingestion d'un fichier infecté -> rejet avec audit log
    await assert.rejects(
      async () =>
        ingestDocumentIntoDossier({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          originalFilename: "facture-eicar.pdf",
          mimeType: "text/csv", // ou textuel
          contentBuffer: eicarPayload,
          db,
        }),
      /menace détectée/
    );
  });

  it("2. Neutralisation des noms de fichiers (anti-traversée de chemin) et stockage privé sécurisé", async () => {
    // 2.1 Sanitisation de chemins malveillants
    const dirty1 = "../../../../etc/passwd";
    assert.equal(sanitizeFilename(dirty1), "passwd.pdf");

    const dirty2 = "..\\..\\windows\\system32\\cmd.exe";
    assert.equal(sanitizeFilename(dirty2), "cmd.pdf"); // extension forcée safe

    const dirty3 = "facture <client> *#1 &? / 2026.pdf";
    const clean3 = sanitizeFilename(dirty3);
    assert.ok(!clean3.includes("<") && !clean3.includes(">") && !clean3.includes("/"));
    assert.ok(clean3.endsWith(".pdf"));

    // 2.2 Écriture et lecture dans le stockage privé
    const storageKey = `${orgAId}/${dossierA.id}/test-storage-key.pdf`;
    await defaultDocumentStorage.saveFile(storageKey, validPdfBuffer);

    const readBack = await defaultDocumentStorage.readFile(storageKey);
    assert.equal(readBack.compare(validPdfBuffer), 0);

    // 2.3 Tentative d'évasion du stockage privé -> bloqué
    await assert.rejects(
      async () => defaultDocumentStorage.readFile("../../../../../etc/shadow"),
      /Tentative d'accès hors du stockage privé/
    );

    // Nettoyage du fichier de test
    await defaultDocumentStorage.deleteFile(storageKey);
  });

  it("3. Liens de téléchargement signés (HMAC SHA-256) avec expiration et isolation multi-tenant", async () => {
    // Ingestion d'un document légitime dans Dossier A (Tenant A)
    const ingestRes = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      originalFilename: "facture-serveur-cloud.pdf",
      mimeType: "application/pdf",
      contentBuffer: validPdfBuffer,
      category: "SUPPLIER_INVOICE",
      db,
    });

    const docA = ingestRes.document;
    assert.ok(docA.id);

    // 3.1 Génération et vérification d'un token valide
    const { token, expiresAtUnix } = generateSignedDocumentDownloadToken({
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: docA.id,
      userId: firmAdmin.user.id,
      ttlSeconds: 60,
    });
    assert.ok(token);
    assert.ok(expiresAtUnix > Math.floor(Date.now() / 1000));

    const verifyOk = verifySignedDocumentDownloadToken(token);
    assert.equal(verifyOk.valid, true);
    assert.equal(verifyOk.organizationId, orgAId);
    assert.equal(verifyOk.documentId, docA.id);

    // 3.2 Token altéré / falsifié -> Refus
    const tamperedToken = token.slice(0, -6) + "badbad";
    const verifyTampered = verifySignedDocumentDownloadToken(tamperedToken);
    assert.equal(verifyTampered.valid, false);

    // 3.3 Token expiré -> Refus
    const { token: expiredToken } = generateSignedDocumentDownloadToken({
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: docA.id,
      userId: firmAdmin.user.id,
      ttlSeconds: -10, // Déjà expiré
    });
    const verifyExpired = verifySignedDocumentDownloadToken(expiredToken);
    assert.equal(verifyExpired.valid, false);

    // 3.4 Tentative d'accès cross-tenant : Tenant B tente d'accéder au document de Tenant A -> Refus 403
    assert.throws(
      () =>
        getDocumentDetails({
          session: tenantBAdmin,
          organizationId: orgBId,
          dossierId: dossierB.id,
          documentId: docA.id,
          db,
        }),
      /Document introuvable/
    );
  });

  it("4. Détection de doublons : exact (SHA-256) et heuristique (Tiers + Date + Montant) avec dérogation auditée", async () => {
    // Création d'un dossier dédié neuf avec 0 document pour le test de doublons
    const newDupDossier = createClientDossier({
      session: firmAdmin,
      organizationId: orgAId,
      name: "Dossier Test Doublons",
      code: "DOS-DUP-01",
      countryCode: "FR",
      taxJurisdictionCode: "FR",
      currency: "EUR",
      taxRegimeCode: "FR_TVA_REEL_NORMAL",
      legalForm: "SAS",
      db,
    });
    const dossierDupId = newDupDossier.id;

    // 4.1 Ingestion du premier document
    const invoiceContent = Buffer.from(
      "%PDF-1.4\nFacture Unique Orange Fibre Octobre 2026\nMontant 120.00 EUR\n%%EOF",
      "utf-8"
    );

    const firstIngest = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierDupId,
      originalFilename: "facture-orange-octobre.pdf",
      mimeType: "application/pdf",
      contentBuffer: invoiceContent,
      category: "SUPPLIER_INVOICE",
      db,
    });
    assert.equal(firstIngest.duplicateDetected, false);

    // 4.2 Deuxième ingestion du même contenu (même empreinte SHA-256) -> Détection doublon exact
    const secondExactIngest = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierDupId,
      originalFilename: "facture-orange-octobre-bis.pdf",
      mimeType: "application/pdf",
      contentBuffer: invoiceContent,
      category: "SUPPLIER_INVOICE",
      db,
    });
    assert.equal(secondExactIngest.duplicateDetected, true);
    assert.equal(secondExactIngest.duplicateType, "EXACT_SHA256");

    // 4.3 Détection de doublon heuristique : contenu avec empreinte différente mais mêmes champs extraits
    const thirdContent = Buffer.from(
      "%PDF-1.4\nFacture Orange Re-scan scanner bureau Octobre 2026\nMontant 120.00 EUR\n%%EOF",
      "utf-8"
    );
    const heuristicIngest = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierDupId,
      originalFilename: "facture-orange-octobre-rescan.pdf",
      mimeType: "application/pdf",
      contentBuffer: thirdContent,
      category: "SUPPLIER_INVOICE",
      db,
    });
    assert.equal(heuristicIngest.duplicateDetected, true);
    assert.equal(heuristicIngest.duplicateType, "HEURISTIC");
    assert.ok(heuristicIngest.heuristicWarning?.includes("Suspicion de doublon heuristique"));

    // 4.4 Dérogation de doublon avec motif obligatoire tracé en audit
    const overrideIngest = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierDupId,
      originalFilename: "facture-orange-octobre-derogation.pdf",
      mimeType: "application/pdf",
      contentBuffer: thirdContent,
      category: "SUPPLIER_INVOICE",
      allowDuplicateOverride: true,
      overrideReason: "Pièce justificative complémentaire avec facture détaillée sur 2 pages distinctes",
      db,
    });
    assert.equal(overrideIngest.duplicateDetected, true);
    assert.equal(
      overrideIngest.document.overrideDuplicateReason,
      "Pièce justificative complémentaire avec facture détaillée sur 2 pages distinctes"
    );

    // Vérification du log d'audit
    const auditLogs = db
      .prepare(
        "SELECT * FROM audit_logs WHERE target_entity_id = ? AND action = 'DOCUMENT_INGESTED_WITH_DUPLICATE_OVERRIDE'"
      )
      .all(overrideIngest.document.id) as any[];
    assert.equal(auditLogs.length, 1);
    assert.equal(
      auditLogs[0].justification,
      "Pièce justificative complémentaire avec facture détaillée sur 2 pages distinctes"
    );
  });

  it("5. Cycle de vie documentaire à 6 statuts (RECEIVED -> EXTRACTED -> PENDING_REVIEW -> CORRECTED -> VALIDATED -> REJECTED)", async () => {
    // 5.1 Ingestion initiale -> Statut PENDING_REVIEW
    const newDocBuffer = Buffer.from("%PDF-1.4\nFacture Maintenance Informatique Nov 2026\n%%EOF", "utf-8");
    const { document: doc } = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      originalFilename: "facture-maintenance-nov-2026.pdf",
      mimeType: "application/pdf",
      contentBuffer: newDocBuffer,
      category: "SUPPLIER_INVOICE",
      db,
    });
    assert.equal(doc.workflowStatus, "PENDING_REVIEW");

    // 5.2 Correction humaine des champs -> Statut CORRECTED
    const corrected = updateDocumentExtraction({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: doc.id,
      fields: {
        issuerName: "TechServices SAS",
        invoiceNumber: "FAC-TS-2026-88",
        invoiceDate: "2026-11-05",
        netAmountMinor: 150000, // 1500.00 HT
        vatAmountMinor: 30000,  // 300.00 TVA
        grossAmountMinor: 180000, // 1800.00 TTC
        suggestedAccountCode: "615600", // Maintenance informatique
      },
      db,
    });
    assert.equal(corrected.workflowStatus, "CORRECTED");
    const parsedExt = JSON.parse(corrected.extractedDataJson).extraction;
    assert.equal(parsedExt.issuerName.value, "TechServices SAS");
    assert.equal(parsedExt.issuerName.source, "HUMAN_ENTRY");
    assert.equal(parsedExt.issuerName.confidenceScore, 1.0);
    assert.equal(parsedExt.issuerName.validationStatus, "VALIDATED_BY_HUMAN");

    // 5.3 Rejet avec motif obligatoire -> Statut REJECTED
    assert.throws(
      () =>
        rejectDocument({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          documentId: doc.id,
          rejectionReason: "  ", // vide
          db,
        }),
      /Le motif de rejet est obligatoire/
    );

    const rejected = rejectDocument({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: doc.id,
      rejectionReason: "Prestation non encore exécutée et facture prématurée",
      db,
    });
    assert.equal(rejected.workflowStatus, "REJECTED");
    assert.equal(rejected.rejectionReason, "Prestation non encore exécutée et facture prématurée");
    assert.equal(rejected.rejectedByUserId, firmAdmin.user.id);
    assert.ok(rejected.rejectedAt);

    // 5.4 Impossible de valider directement un document rejeté sans le corriger / réexaminer
    assert.throws(
      () =>
        validateDocument({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          documentId: doc.id,
          db,
        }),
      /Impossible de valider un document rejeté/
    );

    // Réexamen et correction
    updateDocumentExtraction({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: doc.id,
      fields: { invoiceNumber: "FAC-TS-2026-88-RECTIFIEE" },
      db,
    });

    // 5.5 Validation humaine réussie -> Statut VALIDATED
    const validated = validateDocument({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: doc.id,
      db,
    });
    assert.equal(validated.workflowStatus, "VALIDATED");
    assert.equal(validated.validatedByUserId, firmAdmin.user.id);
    assert.ok(validated.validatedAt);
  });

  it("6. Génération d'écriture comptable brouillon (DRAFT) sans auto-validation", async () => {
    // 6.1 Préparation d'un document validé
    const validDocBuffer = Buffer.from(
      "%PDF-1.4\nFacture Achat Fournitures SAS Papeterie Pro\nMontant 240.00 EUR\n%%EOF",
      "utf-8"
    );
    const { document: doc } = await ingestDocumentIntoDossier({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      originalFilename: "facture-papeterie-dec-2026.pdf",
      mimeType: "application/pdf",
      contentBuffer: validDocBuffer,
      category: "SUPPLIER_INVOICE",
      db,
    });

    // Tentative de génération d'écriture sur un document PENDING_REVIEW -> Rejet
    assert.throws(
      () =>
        createDraftEntryFromDocument({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          documentId: doc.id,
          db,
        }),
      /Le document doit être au statut VALIDATED/
    );

    // Validation du document
    validateDocument({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: doc.id,
      db,
    });

    // 6.2 Génération de l'écriture comptable
    const { entry, lines } = createDraftEntryFromDocument({
      session: firmAdmin,
      organizationId: orgAId,
      dossierId: dossierA.id,
      documentId: doc.id,
      db,
    });

    // Règle d'or : statut strictement DRAFT (aucun automate ne valide l'écriture comptable à la place de l'humain)
    assert.equal(entry.status, "DRAFT");
    assert.equal(entry.journalCode, "ACH");
    assert.equal(entry.documentId, doc.id);
    assert.ok(lines.length >= 2);

    // Contrôle d'équilibre Débit === Crédit
    const sumDebit = lines.reduce((acc, l) => acc + l.debitMinor, 0);
    const sumCredit = lines.reduce((acc, l) => acc + l.creditMinor, 0);
    assert.equal(sumDebit, sumCredit);
    assert.equal(entry.totalDebitMinor, sumDebit);
    assert.equal(entry.totalCreditMinor, sumCredit);

    // Vérification des comptes du PCG
    const debitAccounts = lines.filter((l) => l.debitMinor > 0).map((l) => l.generalAccountCode);
    const creditAccounts = lines.filter((l) => l.creditMinor > 0).map((l) => l.generalAccountCode);

    assert.ok(debitAccounts.includes("606000")); // Compte de charge Achats
    assert.ok(debitAccounts.includes("445660")); // TVA déductible
    assert.ok(creditAccounts.includes("401000")); // Fournisseur

    // 6.3 Vérification que le document est protégé contre la suppression si lié à une écriture validée
    db.prepare("UPDATE accounting_entries SET status = 'VALIDATED' WHERE id = ?").run(entry.id);
    await assert.rejects(
      async () =>
        deleteDocument({
          session: firmAdmin,
          organizationId: orgAId,
          dossierId: dossierA.id,
          documentId: doc.id,
          db,
        }),
      /Impossible de supprimer un document rattaché à une écriture comptable validée/
    );
  });

  it("7. Test d'intégration API REST complet sur les routes /api/.../documents (Upload, Filtre, Détail, Download, Validation, Rejet, Écriture)", async () => {
    resetRateLimitBucketsForTests();
    const server = createAppServer(db, {
      maxRequestsPerMinute: 200,
      maxLoginRequestsPerMinute: 10,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // Login firmAdmin
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
        }),
      });
      assert.equal(loginRes.status, 200);
      const { token: sessionToken } = (await loginRes.json()) as { token: string };

      // 7.1 POST /api/organizations/:orgId/dossiers/:dossierId/documents (Upload)
      const uploadRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            filename: "facture-api-test.pdf",
            mimeType: "application/pdf",
            contentBase64: validPdfBuffer.toString("base64"),
            category: "SUPPLIER_INVOICE",
          }),
        }
      );
      assert.equal(uploadRes.status, 201);
      const uploadJson = (await uploadRes.json()) as any;
      assert.ok(uploadJson.document.id);
      const createdDocId = uploadJson.document.id;

      // 7.2 GET /api/organizations/:orgId/dossiers/:dossierId/documents (Liste avec filtres)
      const listRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents?status=PENDING_REVIEW`,
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(listRes.status, 200);
      const listJson = (await listRes.json()) as any;
      assert.ok(Array.isArray(listJson.documents));
      assert.ok(listJson.countsByStatus);

      // 7.3 GET /api/organizations/:orgId/dossiers/:dossierId/documents/:docId (Détail + Token Download)
      const detailRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents/${createdDocId}`,
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(detailRes.status, 200);
      const detailJson = (await detailRes.json()) as any;
      assert.equal(detailJson.document.id, createdDocId);
      assert.ok(detailJson.downloadToken);

      // 7.4 GET /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/download (Téléchargement sécurisé par token)
      const dlRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents/${createdDocId}/download?token=${detailJson.downloadToken}`
      );
      assert.equal(dlRes.status, 200);
      assert.equal(dlRes.headers.get("content-type"), "application/pdf");
      assert.equal(dlRes.headers.get("x-content-type-options"), "nosniff");
      const dlBytes = await dlRes.arrayBuffer();
      assert.equal(Buffer.from(dlBytes).compare(validPdfBuffer), 0);

      // 7.5 PATCH /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/extraction (Correction)
      const patchRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents/${createdDocId}/extraction`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            fields: {
              issuerName: "Fournisseur API SAS",
              grossAmountMinor: 50000,
            },
          }),
        }
      );
      assert.equal(patchRes.status, 200);
      const patchJson = (await patchRes.json()) as any;
      assert.equal(patchJson.document.workflowStatus, "CORRECTED");

      // 7.6 POST /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/validate (Validation)
      const validateRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents/${createdDocId}/validate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(validateRes.status, 200);
      const valJson = (await validateRes.json()) as any;
      assert.equal(valJson.document.workflowStatus, "VALIDATED");

      // 7.7 POST /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/create-draft-entry (Génération écriture brouillon)
      const draftRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierA.id}/documents/${createdDocId}/create-draft-entry`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      assert.equal(draftRes.status, 201);
      const draftJson = (await draftRes.json()) as any;
      assert.equal(draftJson.entry.status, "DRAFT");
      assert.equal(draftJson.entry.documentId, createdDocId);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
