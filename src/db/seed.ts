import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase, runMigrations } from "./database.js";
import {
  syncCountryConfigurationsToDatabase,
  initializeDossierAccountingReferential,
} from "../services/tenant-service.js";
import { hashPassword } from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";

/**
 * Initialisation des données de démonstration clairement identifiées comme telles (Section 14).
 * Crée :
 * - Les configurations pays versionnées (FR, BE, LU, CH).
 * - Un administrateur de plateforme (`admin@demo-platform.local` / `DemoAdmin2026!`).
 * - Deux organisations distinctes pour tester et démontrer l'isolation multi-tenant :
 *   1. "Cabinet Hexagone Expertise (Démo)" (Cabinet comptable français)
 *   2. "Atelier Lumière SAS (Démo)" (PME française indépendante)
 * - Un collaborateur comptable et des dossiers clients rattachés.
 */

export function seedDemoData(db: DatabaseSync = getDatabase()): {
  seeded: boolean;
  organizationsCount: number;
  usersCount: number;
} {
  runMigrations(db);
  syncCountryConfigurationsToDatabase(db);

  const existingUsers = (
    db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
  ).c;

  if (Number(existingUsers) > 0) {
    const orgsCount = (
      db.prepare("SELECT COUNT(*) AS c FROM organizations").get() as { c: number }
    ).c;
    return {
      seeded: false,
      organizationsCount: Number(orgsCount),
      usersCount: Number(existingUsers),
    };
  }

  const now = new Date().toISOString();
  const defaultPasswordHash = hashPassword("DemoAdmin2026!");

  const platformAdminId = crypto.randomUUID();
  const firmAdminId = crypto.randomUUID();
  const collaboratorId = crypto.randomUUID();
  const otherTenantDirectorId = crypto.randomUUID();

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    insertUser.run(
      platformAdminId,
      "superadmin@demo.local",
      "Camille Moreau (Admin Plateforme - Démo)",
      defaultPasswordHash,
      1,
      now,
      now
    );
    insertUser.run(
      firmAdminId,
      "expert@cabinet-hexagone-demo.local",
      "Claire Lefèvre (Admin Cabinet - Démo)",
      defaultPasswordHash,
      0,
      now,
      now
    );
    insertUser.run(
      collaboratorId,
      "collab@cabinet-hexagone-demo.local",
      "Thomas Bernard (Collaborateur Comptable - Démo)",
      defaultPasswordHash,
      0,
      now,
      now
    );
    insertUser.run(
      otherTenantDirectorId,
      "direction@atelier-lumiere-demo.local",
      "Sophie Martin (Dirigeante PME - Démo)",
      defaultPasswordHash,
      0,
      now,
      now
    );

    const org1Id = crypto.randomUUID();
    const org2Id = crypto.randomUUID();

    const insertOrg = db.prepare(`
      INSERT INTO organizations (
        id, name, slug, organization_type, country_code, default_currency,
        quota_max_dossiers, quota_max_users, quota_max_documents_per_month, quota_max_ai_calls_per_month,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'FR', 'EUR', 50, 20, 1000, 1000, 1, ?, ?)
    `);

    insertOrg.run(
      org1Id,
      "Cabinet Hexagone Expertise [JEU DE DÉMO]",
      "cabinet-hexagone-demo",
      "ACCOUNTING_FIRM",
      now,
      now
    );
    insertOrg.run(
      org2Id,
      "Atelier Lumière SAS [JEU DE DÉMO]",
      "atelier-lumiere-demo",
      "COMPANY",
      now,
      now
    );

    const insertMembership = db.prepare(`
      INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertMembership.run(crypto.randomUUID(), org1Id, firmAdminId, "FIRM_ADMIN", now);
    insertMembership.run(
      crypto.randomUUID(),
      org1Id,
      collaboratorId,
      "ACCOUNTANT_COLLABORATOR",
      now
    );
    insertMembership.run(
      crypto.randomUUID(),
      org2Id,
      otherTenantDirectorId,
      "CLIENT_DIRECTOR",
      now
    );

    const dossier1Id = crypto.randomUUID();
    const dossier2Id = crypto.randomUUID();
    const dossier3Id = crypto.randomUUID();

    const insertDossier = db.prepare(`
      INSERT INTO client_dossiers (
        id, organization_id, name, code, legal_form, legal_registration_number, vat_intracommunity_number,
        address_line, postal_code, city,
        country_code, tax_jurisdiction_code, tax_residence_country_code, operating_countries_json,
        country_config_version_id, currency, currency_minor_unit_exponent, allowed_currencies_json,
        tax_regime_code, vat_regime_code, fiscal_year_start_month, fiscal_year_start_date, fiscal_year_end_date,
        dossier_status, activity_sector, contact_name, contact_email,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FR', 'FR', 'FR', '["FR"]', 'FR-2026.1-REV0', 'EUR', 2, '["EUR","USD"]', ?, ?, 1, '2026-01-01', '2026-12-31', 'ACTIVE', ?, ?, ?, 1, ?, ?)
    `);

    insertDossier.run(
      dossier1Id,
      org1Id,
      "Boulangerie Artisanale Dupuis SARL (Démo)",
      "DOS-DUPUIS-01",
      "SARL",
      "81234567800019",
      "FR45812345678",
      "14 Rue des Martyrs",
      "75009",
      "Paris",
      "FR_REEL_NORMAL_IS",
      "FR_TVA_REEL_NORMAL",
      "Boulangerie-Pâtisserie artisanale",
      "Jean Dupuis",
      "j.dupuis@boulangerie-dupuis-demo.local",
      now,
      now
    );
    insertDossier.run(
      dossier2Id,
      org1Id,
      "Marc Veyrat Conseil — Micro-Entreprise (Démo)",
      "DOS-VEYRAT-02",
      "EI_MICRO",
      "90123456700011",
      null,
      "8 Cours Lafayette",
      "69003",
      "Lyon",
      "FR_MICRO_ENTREPRISE",
      "FR_TVA_FRANCHISE_BASE",
      "Conseil en systèmes et logiciels informatiques",
      "Marc Veyrat",
      "contact@veyrat-conseil-demo.local",
      now,
      now
    );
    insertDossier.run(
      dossier3Id,
      org2Id,
      "Atelier Lumière — Dossier Principal (Démo)",
      "DOS-LUMIERE-01",
      "SAS",
      "52345678900024",
      "FR92523456789",
      "22 Quai des Chartrons",
      "33000",
      "Bordeaux",
      "FR_REEL_NORMAL_IS",
      "FR_TVA_REEL_NORMAL",
      "Design industriel et luminaires",
      "Sophie Martin",
      "direction@atelier-lumiere-demo.local",
      now,
      now
    );

    initializeDossierAccountingReferential({
      organizationId: org1Id,
      dossierId: dossier1Id,
      countryConfigVersionId: "FR-2026.1-REV0",
      db,
    });
    initializeDossierAccountingReferential({
      organizationId: org1Id,
      dossierId: dossier2Id,
      countryConfigVersionId: "FR-2026.1-REV0",
      db,
    });
    initializeDossierAccountingReferential({
      organizationId: org2Id,
      dossierId: dossier3Id,
      countryConfigVersionId: "FR-2026.1-REV0",
      db,
    });

    // Affecter uniquement le dossier 1 au collaborateur Thomas Bernard (le dossier 2 ne lui est pas affecté pour démontrer le contrôle granulaire par dossier)
    db.prepare(`
      INSERT INTO dossier_assignments (
        id, organization_id, dossier_id, user_id,
        can_view, can_upload, can_edit_extraction, can_validate_accounting, can_export, created_at
      ) VALUES (?, ?, ?, ?, 1, 1, 1, 1, 0, ?)
    `).run(crypto.randomUUID(), org1Id, dossier1Id, collaboratorId, now);

    // Affecter le dossier 3 à la dirigeante de l'organisation 2
    db.prepare(`
      INSERT INTO dossier_assignments (
        id, organization_id, dossier_id, user_id,
        can_view, can_upload, can_edit_extraction, can_validate_accounting, can_export, created_at
      ) VALUES (?, ?, ?, ?, 1, 1, 0, 0, 0, ?)
    `).run(crypto.randomUUID(), org2Id, dossier3Id, otherTenantDirectorId, now);

    recordAuditLog(
      {
        organizationId: org1Id,
        actorUserId: firmAdminId,
        actorRole: "SYSTEM_SEED",
        action: "DEMO_DATA_INITIALIZED",
        targetEntityType: "ORGANIZATION",
        targetEntityId: org1Id,
        metadata: { note: "Jeu de données de démonstration Phase 0 clairement identifié" },
      },
      db
    );

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return {
    seeded: true,
    organizationsCount: 2,
    usersCount: 4,
  };
}
