import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import { appConfig } from "../config/app-config.js";
import {
  PHASE1_NAVIGATION_MODULES,
  calculateWcagContrastRatio,
  buildDesignSystemStylesheet,
} from "../ui/design-system.js";
import { renderAppHtml } from "../ui/app-view.js";
import { authenticateUser } from "../auth/auth-service.js";
import {
  createClientDossier,
  initializeDossierAccountingReferential,
  listDossiersForOrganization,
} from "../services/tenant-service.js";
import { verifyAuditChainIntegrity } from "../audit/audit-service.js";
import { createAppServer, resetRateLimitBucketsForTests } from "../server.js";

describe("PHASE 1 — LOT 1.1 : Design System (§5), Navigation 10 entrées (§8) & Module 1 Gestion complète des dossiers clients (§9)", () => {
  it("1. Tokens graphiques officiels (Section 5), absence de couleurs codées en dur hors :root et contrastes WCAG 2.1 AA", () => {
    assert.equal(
      appConfig.appTagline,
      "ComptaNova — La comptabilité, plus claire.",
      "Le slogan officiel de la Phase 1 Section 5 doit être configuré par défaut"
    );
    assert.equal(appConfig.brandColors.primaryDeepEmerald, "#153D35");
    assert.equal(appConfig.brandColors.secondaryJade, "#237D68");
    assert.equal(appConfig.brandColors.accentWarmAmber, "#D9A441");
    assert.equal(appConfig.brandColors.surfaceOffWhite, "#F7F8FA");
    assert.equal(appConfig.brandColors.surfaceCard, "#FFFFFF");
    assert.equal(appConfig.brandColors.textGraphite, "#17212B");
    assert.equal(appConfig.brandColors.textSecondary, "#64748B");
    assert.equal(appConfig.brandColors.borderSubtle, "#E2E8F0");
    assert.equal(appConfig.brandColors.statusSuccess, "#16794B");
    assert.equal(appConfig.brandColors.statusWarning, "#B45309");
    assert.equal(appConfig.brandColors.statusDanger, "#B42318");
    assert.equal(appConfig.brandColors.statusInfo, "#1D4ED8");

    // Vérification qu'aucune couleur hexadécimale n'est codée en dur dans src/ui/app-view.ts
    const appViewSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/ui/app-view.ts"),
      "utf-8"
    );
    const hardcodedHexInAppView = appViewSource.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(
      hardcodedHexInAppView,
      null,
      `Aucune couleur hexadécimale ne doit être codée en dur dans src/ui/app-view.ts (trouvé : ${hardcodedHexInAppView?.join(", ")})`
    );

    // Vérification dans la feuille de style générée que les hexadécimaux n'apparaissent que dans le bloc :root
    const css = buildDesignSystemStylesheet(appConfig);
    const cssWithoutRoot = css.replace(/:root\s*\{[\s\S]*?\}/, "");
    const hexOutsideRoot = cssWithoutRoot.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(
      hexOutsideRoot,
      null,
      `Aucune couleur hexadécimale ne doit exister hors de :root dans la feuille CSS (trouvé : ${hexOutsideRoot?.join(", ")})`
    );

    // Contrôles mathématiques de contraste WCAG 2.1 AA (>= 4.5:1 pour le texte courant)
    const contrastTextOnBg = calculateWcagContrastRatio("#17212B", "#F7F8FA");
    const contrastTextOnCard = calculateWcagContrastRatio("#17212B", "#FFFFFF");
    const contrastWhiteOnPrimary = calculateWcagContrastRatio("#FFFFFF", "#153D35");
    const contrastWhiteOnAction = calculateWcagContrastRatio("#FFFFFF", "#237D68");
    const contrastSuccessBadge = calculateWcagContrastRatio("#16794B", "#ECFDF3");
    const contrastWarningBadge = calculateWcagContrastRatio("#B45309", "#FFFBEB");
    const contrastDangerBadge = calculateWcagContrastRatio("#B42318", "#FEF3F2");
    const contrastInfoBadge = calculateWcagContrastRatio("#1D4ED8", "#EFF6FF");

    assert.ok(contrastTextOnBg >= 4.5, `Contraste texte principal sur fond #F7F8FA insuffisant : ${contrastTextOnBg}`);
    assert.ok(contrastTextOnCard >= 4.5, `Contraste texte principal sur carte #FFFFFF insuffisant : ${contrastTextOnCard}`);
    assert.ok(contrastWhiteOnPrimary >= 4.5, `Contraste blanc sur #153D35 insuffisant : ${contrastWhiteOnPrimary}`);
    assert.ok(contrastWhiteOnAction >= 4.5, `Contraste blanc sur #237D68 insuffisant : ${contrastWhiteOnAction}`);
    assert.ok(contrastSuccessBadge >= 4.5, `Contraste badge succès insuffisant : ${contrastSuccessBadge}`);
    assert.ok(contrastWarningBadge >= 4.5, `Contraste badge alerte insuffisant : ${contrastWarningBadge}`);
    assert.ok(contrastDangerBadge >= 4.5, `Contraste badge erreur insuffisant : ${contrastDangerBadge}`);
    assert.ok(contrastInfoBadge >= 4.5, `Contraste badge info insuffisant : ${contrastInfoBadge}`);
  });

  it("2. Layout Global (10 entrées de navigation), sélecteurs Dossier/Période, accessibilité clavier/focus, responsive et 5 états UI", () => {
    assert.equal(PHASE1_NAVIGATION_MODULES.length, 10, "La navigation principale doit comporter exactement 10 entrées");

    const htmlFr = renderAppHtml("fr");
    const htmlAr = renderAppHtml("ar");

    assert.ok(htmlFr.includes('lang="fr" dir="ltr"'));
    assert.ok(htmlAr.includes('lang="ar" dir="rtl"'));

    // Vérifier la présence des 10 boutons de navigation dans le DOM
    for (const mod of PHASE1_NAVIGATION_MODULES) {
      assert.ok(
        htmlFr.includes(`id="${mod.navButtonId}"`),
        `Le bouton de navigation #${mod.navButtonId} (${mod.defaultLabelFr}) doit être présent`
      );
      assert.ok(
        htmlFr.includes(`id="${mod.tabId}"`),
        `La section d'onglet #${mod.tabId} doit être présente`
      );
    }

    // Sélecteurs de dossier actif et de période comptable
    assert.ok(htmlFr.includes('id="active-dossier-selector"'));
    assert.ok(htmlFr.includes('id="active-period-selector"'));

    // Accessibilité clavier, visibilité du focus et responsive
    assert.ok(htmlFr.includes('class="skip-link"'), "Lien d'évitement clavier requis");
    assert.ok(htmlFr.includes(":focus-visible"), "Règle CSS :focus-visible obligatoire");
    assert.ok(htmlFr.includes('aria-current="page"'), "Attribut aria-current requis sur l'entrée active");
    assert.ok(htmlFr.includes("@media (max-width: 1023px)"), "Breakpoint tablette requis");
    assert.ok(htmlFr.includes("@media (max-width: 767px)"), "Breakpoint mobile requis");

    // Les 5 états d'interface obligatoires (chargement, liste vide, erreur, confirmation, permission insuffisante)
    assert.ok(htmlFr.includes("cn-state-loading"), "État de chargement requis");
    assert.ok(htmlFr.includes("cn-state-empty"), "État de liste vide requis");
    assert.ok(htmlFr.includes("cn-state-error"), "État d'erreur requis");
    assert.ok(htmlFr.includes("cn-state-confirm"), "État de confirmation requis");
    assert.ok(htmlFr.includes("cn-state-forbidden"), "État de permission insuffisante requis");

    // Réserves réglementaires explicites (TVA, barèmes sociaux, mentions de facturation et FEC provisoires)
    assert.ok(
      htmlFr.includes("BLOQUÉ PAR UNE VALIDATION EXTERNE"),
      "La réserve réglementaire sur la TVA, les barèmes sociaux, les mentions de facturation et le FEC doit être affichée"
    );
  });

  it("3. Initialisation strictement idempotente du Plan Comptable Français (PCG) et des journaux standards", () => {
    const db = createDatabaseConnection(":memory:");
    try {
      runMigrations(db);
      seedDemoData(db);

      const authAdmin = authenticateUser(
        "expert@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "lot1-1-test",
        db
      );
      const orgId = authAdmin.context.memberships[0]!.organizationId;

      const dossier = createClientDossier({
        session: authAdmin.context,
        organizationId: orgId,
        name: "Idempotence PCG Conseil SAS",
        code: "DOS-IDEMP-01",
        legalForm: "SAS",
        legalRegistrationNumber: "88877766600015",
        vatIntracommunityNumber: "FR19888777666",
        countryCode: "FR",
        taxRegimeCode: "FR_REEL_NORMAL_IS",
        vatRegimeCode: "FR_TVA_REEL_NORMAL",
        db,
      });

      const initialCounts = db
        .prepare("SELECT COUNT(*) AS c FROM chart_of_accounts WHERE dossier_id = ?")
        .get(dossier.id) as { c: number };
      const initialJournals = db
        .prepare("SELECT COUNT(*) AS c FROM accounting_journals WHERE dossier_id = ?")
        .get(dossier.id) as { c: number };

      assert.ok(Number(initialCounts.c) >= 35, "Le PCG français de base doit comporter au moins 35 comptes");
      assert.ok(Number(initialJournals.c) >= 5, "Les journaux standards (ACH, VEN, BQ, OD, AN) doivent être créés");

      // Personnalisation d'un compte existant (512000), ajout d'un compte personnalisé (512999) et personnalisation d'un journal (BQ)
      db.prepare(
        "UPDATE chart_of_accounts SET label = 'Banque BNP Paribas Principale' WHERE dossier_id = ? AND account_number = '512000'"
      ).run(dossier.id);
      db.prepare(
        `INSERT INTO chart_of_accounts (id, organization_id, dossier_id, account_number, label, account_class, allow_auxiliary, is_active, created_at)
         VALUES ('custom-acc-1', ?, ?, '512999', 'Compte Bancaire Qonto Secondaire', 5, 0, 1, '2026-01-01T00:00:00.000Z')`
      ).run(orgId, dossier.id);
      db.prepare(
        "UPDATE accounting_journals SET label = 'Journal Banque BNP' WHERE dossier_id = ? AND code = 'BQ'"
      ).run(dossier.id);

      // Répétition 1 et 2 de l'initialisation
      const repeat1 = initializeDossierAccountingReferential({
        organizationId: orgId,
        dossierId: dossier.id,
        db,
      });
      const repeat2 = initializeDossierAccountingReferential({
        organizationId: orgId,
        dossierId: dossier.id,
        db,
      });

      assert.equal(repeat1.insertedAccountsCount, 0, "Aucun doublon de compte ne doit être inséré au second appel");
      assert.equal(repeat1.insertedJournalsCount, 0, "Aucun doublon de journal ne doit être inséré au second appel");
      assert.equal(repeat2.insertedAccountsCount, 0);
      assert.equal(repeat2.totalAccountsCount, Number(initialCounts.c) + 1);

      // Vérifier que les personnalisations n'ont PAS été écrasées
      const acc512 = db
        .prepare("SELECT label FROM chart_of_accounts WHERE dossier_id = ? AND account_number = '512000'")
        .get(dossier.id) as { label: string };
      assert.equal(
        acc512.label,
        "Banque BNP Paribas Principale",
        "L'initialisation idempotente ne doit jamais écraser un libellé de compte personnalisé"
      );

      const journalBq = db
        .prepare("SELECT label FROM accounting_journals WHERE dossier_id = ? AND code = 'BQ'")
        .get(dossier.id) as { label: string };
      assert.equal(
        journalBq.label,
        "Journal Banque BNP",
        "L'initialisation idempotente ne doit jamais écraser un libellé de journal personnalisé"
      );
    } finally {
      db.close();
    }
  });

  it("4. Cycle complet API Module 1 (Création, Détail, Édition, Archivage logique, Restauration), RBAC par rôle et Isolation Multi-Tenant", async () => {
    const db = createDatabaseConnection(":memory:");
    resetRateLimitBucketsForTests();
    runMigrations(db);
    seedDemoData(db);

    const server = createAppServer(db, { maxRequestsPerMinute: 500, maxLoginRequestsPerMinute: 50 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const authFirmAdminA = authenticateUser(
        "expert@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "test",
        db
      );
      const authCollabA = authenticateUser(
        "collab@cabinet-hexagone-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "test",
        db
      );
      const authDirectorB = authenticateUser(
        "direction@atelier-lumiere-demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "test",
        db
      );
      const authPlatformAdmin = authenticateUser(
        "superadmin@demo.local",
        "DemoAdmin2026!",
        "127.0.0.1",
        "test",
        db
      );

      const orgAId = authFirmAdminA.context.memberships[0]!.organizationId;
      const orgBId = authDirectorB.context.memberships[0]!.organizationId;

      // 4.1 Création d'un dossier complet par FIRM_ADMIN dans l'organisation A
      const createRes = await fetch(`${baseUrl}/api/organizations/${orgAId}/dossiers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authFirmAdminA.rawToken}`,
        },
        body: JSON.stringify({
          name: "Menuiserie des Alpes SARL",
          code: "DOS-ALPES-26",
          legalForm: "SARL",
          legalRegistrationNumber: "45123698700014",
          vatIntracommunityNumber: "FR88451236987",
          addressLine: "12 Avenue du Mont-Blanc",
          postalCode: "74000",
          city: "Annecy",
          countryCode: "FR",
          taxJurisdictionCode: "FR",
          taxRegimeCode: "FR_REEL_SIMPLIFIE",
          vatRegimeCode: "FR_TVA_REEL_SIMPLIFIE",
          fiscalYearStartMonth: 1,
          fiscalYearStartDate: "2026-01-01",
          fiscalYearEndDate: "2026-12-31",
          dossierStatus: "TO_COMPLETE",
          activitySector: "Menuiserie bois & agencement",
          contactName: "Lucille Mercier",
          contactEmail: "l.mercier@menuiserie-alpes.fr",
          contactPhone: "+33450001122",
          internalNotes: "Attente Kbis mis à jour",
        }),
      });
      assert.equal(createRes.status, 201);
      const createdBody = (await createRes.json()) as { dossier: Record<string, unknown> };
      const dossierId = String(createdBody.dossier.id);
      assert.equal(createdBody.dossier.legalForm, "SARL");
      assert.equal(createdBody.dossier.city, "Annecy");
      assert.equal(createdBody.dossier.dossierStatus, "TO_COMPLETE");

      // 4.2 Un collaborateur (ACCOUNTANT_COLLABORATOR) ne peut PAS créer de dossier (403)
      const collabCreateRes = await fetch(`${baseUrl}/api/organizations/${orgAId}/dossiers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authCollabA.rawToken}`,
        },
        body: JSON.stringify({
          name: "Dossier Interdit",
          code: "DOS-FORBIDDEN",
          countryCode: "FR",
          taxRegimeCode: "FR_MICRO_ENTREPRISE",
        }),
      });
      assert.equal(collabCreateRes.status, 403);

      // 4.3 Un collaborateur non encore affecté à DOS-ALPES-26 ne peut ni le consulter ni le modifier (403)
      const unassignedGetRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          headers: { Authorization: `Bearer ${authCollabA.rawToken}` },
        }
      );
      assert.equal(unassignedGetRes.status, 403);

      // 4.4 Affectation du collaborateur en lecture seule (canView=true, canEditExtraction=false, canValidateAccounting=false)
      const assignReadOnlyRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/assignments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authFirmAdminA.rawToken}`,
          },
          body: JSON.stringify({
            targetUserId: authCollabA.context.user.id,
            canView: true,
            canUpload: false,
            canEditExtraction: false,
            canValidateAccounting: false,
            canExport: false,
          }),
        }
      );
      assert.equal(assignReadOnlyRes.status, 200);

      // Le collaborateur en lecture seule peut maintenant consulter la fiche (200) mais PAS la modifier (403)
      const readOnlyGetRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          headers: { Authorization: `Bearer ${authCollabA.rawToken}` },
        }
      );
      assert.equal(readOnlyGetRes.status, 200);

      const readOnlyPatchRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authCollabA.rawToken}`,
          },
          body: JSON.stringify({ city: "Chambéry" }),
        }
      );
      assert.equal(readOnlyPatchRes.status, 403, "Un collaborateur en lecture seule ne doit pas pouvoir modifier le dossier");

      // 4.5 Promotion du collaborateur avec canValidateAccounting=true -> il peut modifier la fiche (200) mais toujours PAS archiver (403) ni affecter des utilisateurs (403)
      await fetch(`${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/assignments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authFirmAdminA.rawToken}`,
        },
        body: JSON.stringify({
          targetUserId: authCollabA.context.user.id,
          canView: true,
          canUpload: true,
          canEditExtraction: true,
          canValidateAccounting: true,
          canExport: false,
        }),
      });

      const collabPatchRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authCollabA.rawToken}`,
          },
          body: JSON.stringify({
            city: "Annecy-le-Vieux",
            dossierStatus: "ACTIVE",
            internalNotes: "Kbis vérifié par le collaborateur",
          }),
        }
      );
      assert.equal(collabPatchRes.status, 200);
      const patchedBody = (await collabPatchRes.json()) as { dossier: Record<string, unknown> };
      assert.equal(patchedBody.dossier.city, "Annecy-le-Vieux");
      assert.equal(patchedBody.dossier.dossierStatus, "ACTIVE");

      const collabArchiveRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/archive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authCollabA.rawToken}`,
          },
          body: JSON.stringify({ archive: true, reason: "Tentative non autorisée" }),
        }
      );
      assert.equal(collabArchiveRes.status, 403, "Seul FIRM_ADMIN ou PLATFORM_ADMIN justifié peut archiver un dossier");

      // 4.6 Isolation stricte inter-organisations : la dirigeante du Tenant B est bloquée sur toutes les routes du dossier du Tenant A
      const crossTenantGet = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          headers: { Authorization: `Bearer ${authDirectorB.rawToken}` },
        }
      );
      assert.equal(crossTenantGet.status, 403);

      const crossTenantPatch = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authDirectorB.rawToken}`,
          },
          body: JSON.stringify({ name: "Piratage Tenant B" }),
        }
      );
      assert.equal(crossTenantPatch.status, 403);

      // Impossibilité pour FIRM_ADMIN du Tenant A d'affecter un utilisateur du Tenant B
      const crossUserAssign = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/assignments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authFirmAdminA.rawToken}`,
          },
          body: JSON.stringify({
            targetUserId: authDirectorB.context.user.id,
            canView: true,
          }),
        }
      );
      assert.equal(crossUserAssign.status, 403);

      // 4.7 Archivage logique par FIRM_ADMIN : motif trop court rejeté (400), motif valide accepté (200) avec préservation des données et de l'audit
      const shortReasonArchive = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/archive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authFirmAdminA.rawToken}`,
          },
          body: JSON.stringify({ archive: true, reason: "fin" }),
        }
      );
      assert.equal(shortReasonArchive.status, 400);

      const validArchiveRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/archive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authFirmAdminA.rawToken}`,
          },
          body: JSON.stringify({
            archive: true,
            reason: "Clôture annuelle et fin de lettre de mission 2026",
          }),
        }
      );
      assert.equal(validArchiveRes.status, 200);
      const archivedData = (await validArchiveRes.json()) as { dossier: Record<string, unknown> };
      assert.equal(archivedData.dossier.dossierStatus, "ARCHIVED");
      assert.equal(archivedData.dossier.isActive, false);
      assert.ok(archivedData.dossier.archivedAt);

      // Un dossier archivé ne peut pas être modifié par PATCH tant qu'il n'est pas restauré
      const patchWhileArchivedRes = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authFirmAdminA.rawToken}`,
          },
          body: JSON.stringify({ city: "Grenoble" }),
        }
      );
      assert.equal(patchWhileArchivedRes.status, 400);

      // Les comptes PCG, journaux et logs d'audit sont intégralement préservés pendant l'archivage
      const detailsWhileArchived = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}`,
        {
          headers: { Authorization: `Bearer ${authFirmAdminA.rawToken}` },
        }
      );
      assert.equal(detailsWhileArchived.status, 200);
      const detailsJson = (await detailsWhileArchived.json()) as {
        chartOfAccountsCount: number;
        journals: unknown[];
      };
      assert.ok(detailsJson.chartOfAccountsCount >= 35);
      assert.ok(detailsJson.journals.length >= 5);

      // 4.8 Restauration du dossier par PLATFORM_ADMIN : bloqué sans justification (403), autorisé avec justification (200)
      const platformRestoreNoJustif = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/archive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authPlatformAdmin.rawToken}`,
          },
          body: JSON.stringify({
            archive: false,
            reason: "Réouverture demandée par le cabinet",
          }),
        }
      );
      assert.equal(platformRestoreNoJustif.status, 403);

      const platformRestoreJustified = await fetch(
        `${baseUrl}/api/organizations/${orgAId}/dossiers/${dossierId}/archive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authPlatformAdmin.rawToken}`,
            "X-Platform-Admin-Justification": "Ticket support #1102 : réactivation du dossier client",
          },
          body: JSON.stringify({
            archive: false,
            reason: "Réouverture demandée par le cabinet",
          }),
        }
      );
      assert.equal(platformRestoreJustified.status, 200);
      const restoredData = (await platformRestoreJustified.json()) as {
        dossier: Record<string, unknown>;
      };
      assert.equal(restoredData.dossier.dossierStatus, "ACTIVE");
      assert.equal(restoredData.dossier.isActive, true);
      assert.equal(restoredData.dossier.archivedAt, null);

      // Vérification finale de l'intégrité cryptographique de la chaîne d'audit SHA-256
      const chainCheck = verifyAuditChainIntegrity(db);
      assert.equal(chainCheck.valid, true, "La chaîne d'audit SHA-256 doit rester 100 % intègre après archivage et restauration");
    } finally {
      resetRateLimitBucketsForTests();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    }
  });
});
