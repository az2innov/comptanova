import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createAppServer } from "../server.js";
import { createDatabaseConnection, runMigrations } from "../db/database.js";
import { seedDemoData } from "../db/seed.js";
import { renderAppHtml } from "../ui/app-view.js";

describe("PRÉ-TEST GÉNÉRAL — Audit d'intégrité de tous les boutons et comportements par profil", () => {
  it("1. Audit d'intégrité du template HTML et des sélecteurs interactifs", () => {
    const html = renderAppHtml("fr");
    assert.ok(html.length > 50000, "Le template HTML doit être rendu et supérieur à 50 Ko");

    const keySelectors = [
      "login-form", "login-email", "login-password", "i18n-login-submit",
      "logout-btn", "org-selector", "active-dossier-selector",
      "i18n-nav-dashboard", "i18n-nav-dossiers", "i18n-nav-documents",
      "i18n-nav-invoicing", "i18n-nav-journal", "i18n-nav-banking",
      "i18n-nav-vat", "i18n-nav-simulator", "i18n-nav-anomalies",
      "i18n-nav-settings", "i18n-nav-orgs", "i18n-nav-users", "i18n-nav-countries",
      // Module 4 Invoicing
      "subtab-btn-invoices", "subtab-btn-quotes", "subtab-btn-create",
      "subtab-view-invoices", "subtab-view-quotes", "subtab-view-create",
      "invoicing-create-form", "doc-type-select", "inv-client-name",
      "inv-add-line-btn", "inv-cancel-create-btn", "inv-submit-create-btn",
      "filter-sales-status", "filter-quotes-status",
      // Module 5 Journal
      "subtab-btn-journal-list", "subtab-btn-journal-create",
      "subtab-view-journal-list", "subtab-view-journal-create",
      "accounting-entry-form", "btn-add-entry-line", "btn-save-entry-draft",
      "btn-validate-entry-submit", "btn-refresh-journal-entries",
      // Module 6 Banque
      "btn-import-bank", "btn-refresh-bank", "bank-reconcile-modal",
      // Module 7 Simulateur
      "sim-run-form", "sim-submit-btn", "sim-reset-btn", "btn-refresh-simulations",
      // Module 8 Anomalies
      "btn-scan-anomalies", "btn-refresh-anomalies", "anomaly-resolve-modal",
      // Module 9 Exports
      "export-csv-delimiter", "fec-decimal-sep", "btn-download-fec"
    ];

    for (const sel of keySelectors) {
      assert.ok(html.includes(`id="${sel}"`) || html.includes(`id='${sel}'`), `Élément manquant : #${sel}`);
    }
  });

  it("2. Matrice dynamique d'exécution des boutons pour les 4 profils utilisateurs", async () => {
    const db = createDatabaseConnection(":memory:");
    runMigrations(db);
    seedDemoData(db);

    const server = createAppServer(db);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const profiles = [
        {
          name: "Expert / Admin Cabinet (Tenant A)",
          email: "expert@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
          expectedRole: "ADMIN",
          canExport: true,
          canValidateAccounting: true,
          canAccessAllDossiers: true
        },
        {
          name: "Collaborateur Cabinet (Tenant A)",
          email: "collab@cabinet-hexagone-demo.local",
          password: "DemoAdmin2026!",
          expectedRole: "COLLABORATOR",
          canExport: false,
          canValidateAccounting: true,
          canAccessAllDossiers: false
        },
        {
          name: "Dirigeante Entreprise (Tenant B)",
          email: "direction@atelier-lumiere-demo.local",
          password: "DemoAdmin2026!",
          expectedRole: "CLIENT_DIRECTOR",
          canExport: false,
          canValidateAccounting: false,
          canAccessAllDossiers: false
        },
        {
          name: "SuperAdmin Plateforme",
          email: "superadmin@demo.local",
          password: "DemoAdmin2026!",
          expectedRole: "PLATFORM_ADMIN",
          canExport: true,
          canValidateAccounting: false,
          canAccessAllDossiers: true
        }
      ];

      for (const prof of profiles) {
        // 1. Bouton Connexion
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: prof.email, password: prof.password })
        });
        assert.equal(loginRes.status, 200, `Connexion réussie pour ${prof.email}`);
        const loginData = (await loginRes.json()) as any;
        const token = loginData.token;
        const authHeaders = {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        };

        // 2. Profil /me
        const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: authHeaders });
        const meData = (await meRes.json()) as any;
        assert.equal(meData.session.user.email, prof.email);

        const orgId = meData.session.activeOrganizationId || (meData.organizations[0] && meData.organizations[0].id);

        if (prof.expectedRole === "PLATFORM_ADMIN") {
          // Onglets admin globale
          const orgsRes = await fetch(`${baseUrl}/api/organizations`, { headers: authHeaders });
          assert.equal(orgsRes.status, 200);

          const countriesRes = await fetch(`${baseUrl}/api/countries`, { headers: authHeaders });
          assert.equal(countriesRes.status, 200);

          // Blocage client sans justification
          const unauthRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers`, { headers: authHeaders });
          assert.equal(unauthRes.status, 403);

          // Accès client avec justification
          const justifiedRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers`, {
            headers: { ...authHeaders, "X-Platform-Admin-Justification": "Audit de conformité" }
          });
          assert.equal(justifiedRes.status, 200);

          await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: authHeaders });
          continue;
        }

        // Dossiers
        const dossiersRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers`, { headers: authHeaders });
        assert.equal(dossiersRes.status, 200);
        const dossiersData = (await dossiersRes.json()) as any;
        const targetDossierId = dossiersData.dossiers[0].id;

        // Facturation : listing factures et devis
        const invRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers/${targetDossierId}/sales-invoices`, { headers: authHeaders });
        assert.equal(invRes.status, 200);
        const quotesRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers/${targetDossierId}/quotes`, { headers: authHeaders });
        assert.equal(quotesRes.status, 200);

        // Création Facture via formulaire
        const createInvRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers/${targetDossierId}/sales-invoices`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            thirdPartyName: `Client Test ${prof.expectedRole}`,
            issueDate: "2026-03-01",
            dueDate: "2026-03-31",
            lines: [{ description: "Audit", quantityMinor: 100, unitPriceNetMinor: 100000, vatRateBps: 2000 }]
          })
        });
        assert.equal(createInvRes.status, 201);
        const createdInv = ((await createInvRes.json()) as any).invoice;

        // Finalisation
        const finalizeRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers/${targetDossierId}/sales-invoices/${createdInv.id}/finalize`, {
          method: "POST",
          headers: authHeaders
        });
        if (prof.canValidateAccounting) {
          assert.equal(finalizeRes.status, 200);
        } else {
          assert.equal(finalizeRes.status, 403);
        }

        // Simulateur
        const simRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers/${targetDossierId}/simulations`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            simulationType: "VAT_SUMMARY",
            parameters: { collectedVatMinor: 20000, deductibleVatMinor: 5000 }
          })
        });
        assert.equal(simRes.status, 201);

        // Exports
        const expRes = await fetch(`${baseUrl}/api/organizations/${orgId}/dossiers/${targetDossierId}/exports/csv/invoices`, { headers: authHeaders });
        if (prof.canExport) {
          assert.equal(expRes.status, 200);
        } else {
          assert.equal(expRes.status, 403);
        }

        // Déconnexion
        await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: authHeaders });
      }
    } finally {
      server.close();
    }
  });
});
