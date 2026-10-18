import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  Organization,
  OrganizationType,
  ClientDossier,
  DossierStatus,
  SystemRole,
  User,
  StoredDocument,
  DocumentCategory,
  DocumentWorkflowStatus,
} from "../domain/types.js";
import { CurrencyCode, getCurrencyExponent } from "../domain/money.js";
import {
  INITIAL_COUNTRY_CONFIGURATIONS,
  CountryConfigurationVersion,
  resolveJurisdictionConfigForDate,
} from "../countries/country-registry.js";
import {
  AuthenticatedSessionContext,
  assertOrganizationAccess,
  assertDossierAccess,
  hashPassword,
  AuthorizationError,
  generateSignedDocumentDownloadToken,
  verifySignedDocumentDownloadToken,
} from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";
import { DeterministicMockAiAdapter } from "../ai/ai-gateway.js";
import {
  validateFileBuffer,
  sanitizeFilename,
  scanFileSafety,
  defaultDocumentStorage,
} from "./file-security.js";

/**
 * Services métier de la Phase 0 & Extension Internationale.
 * - Supporte la résolution de version réglementaire par `versionId` explicite ou par date d'effet (`effectiveDate`).
 * - Gère la distinction entre pays d'établissement, juridiction fiscale, résidence fiscale et pays d'activité.
 * - Stocke explicitement l'exposant monétaire (`currency_minor_unit_exponent` : 0, 2, 3, 4 décimales).
 */

export function syncCountryConfigurationsToDatabase(
  db: DatabaseSync = getDatabase()
): void {
  const stmt = db.prepare(`
    INSERT INTO country_config_versions (
      version_id, country_code, country_name, deployment_priority_order,
      version_number, effective_from, effective_to, validation_status,
      is_production_enabled, validated_by_professional, validated_at,
      default_currency, statutory_retention_years, config_payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(version_id) DO UPDATE SET
      validation_status = excluded.validation_status,
      is_production_enabled = excluded.is_production_enabled,
      config_payload_json = excluded.config_payload_json
  `);

  const now = new Date().toISOString();
  for (const cfg of INITIAL_COUNTRY_CONFIGURATIONS) {
    stmt.run(
      cfg.versionId,
      cfg.countryCode,
      cfg.countryName,
      cfg.deploymentPriorityOrder,
      cfg.versionNumber,
      cfg.effectiveFrom,
      cfg.effectiveTo,
      cfg.validationStatus,
      cfg.isProductionEnabled ? 1 : 0,
      cfg.validatedByProfessional,
      cfg.validatedAt,
      cfg.defaultCurrency,
      cfg.statutoryRetentionYears,
      JSON.stringify(cfg),
      now
    );
  }
}

/**
 * Permet d'enregistrer une nouvelle version de configuration de juridiction en base (ex: nouvelle juridiction ou nouveau millésime)
 * sans modifier le cœur métier.
 */
export function registerCountryConfigurationVersion(
  config: CountryConfigurationVersion,
  db: DatabaseSync = getDatabase()
): CountryConfigurationVersion {
  syncCountryConfigurationsToDatabase(db);
  // Vérifier que la devise par défaut est bien enregistrée avec une précision explicite
  getCurrencyExponent(config.defaultCurrency);

  db.prepare(`
    INSERT INTO country_config_versions (
      version_id, country_code, country_name, deployment_priority_order,
      version_number, effective_from, effective_to, validation_status,
      is_production_enabled, validated_by_professional, validated_at,
      default_currency, statutory_retention_years, config_payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(version_id) DO UPDATE SET
      validation_status = excluded.validation_status,
      is_production_enabled = excluded.is_production_enabled,
      config_payload_json = excluded.config_payload_json
  `).run(
    config.versionId,
    config.countryCode.toUpperCase(),
    config.countryName,
    config.deploymentPriorityOrder,
    config.versionNumber,
    config.effectiveFrom,
    config.effectiveTo,
    config.validationStatus,
    config.isProductionEnabled ? 1 : 0,
    config.validatedByProfessional,
    config.validatedAt,
    config.defaultCurrency,
    config.statutoryRetentionYears,
    JSON.stringify(config),
    new Date().toISOString()
  );

  return config;
}

/**
 * Liste les versions actives ou les plus récentes par juridiction (par défaut 1 par `countryCode`),
 * ou toutes les versions historiques si `includeHistoricalVersions === true`.
 */
export function listCountryConfigurations(
  db: DatabaseSync = getDatabase(),
  options: { includeHistoricalVersions?: boolean } = {}
): CountryConfigurationVersion[] {
  syncCountryConfigurationsToDatabase(db);
  const rows = db
    .prepare(
      "SELECT config_payload_json FROM country_config_versions ORDER BY deployment_priority_order ASC, effective_from DESC"
    )
    .all() as Array<{ config_payload_json: string }>;

  const all = rows.map(
    (r) => JSON.parse(r.config_payload_json) as CountryConfigurationVersion
  );

  if (options.includeHistoricalVersions) {
    return all;
  }

  const seenCountries = new Set<string>();
  const latestPerCountry: CountryConfigurationVersion[] = [];
  for (const cfg of all) {
    if (!seenCountries.has(cfg.countryCode)) {
      seenCountries.add(cfg.countryCode);
      latestPerCountry.push(cfg);
    }
  }
  return latestPerCountry;
}

export function getCountryConfigurationByVersionId(
  versionId: string,
  db: DatabaseSync = getDatabase()
): CountryConfigurationVersion {
  syncCountryConfigurationsToDatabase(db);
  const row = db
    .prepare(
      "SELECT config_payload_json FROM country_config_versions WHERE version_id = ?"
    )
    .get(versionId) as { config_payload_json: string } | undefined;

  if (!row) {
    throw new Error(
      `Version de configuration réglementaire introuvable : "${versionId}"`
    );
  }
  return JSON.parse(row.config_payload_json) as CountryConfigurationVersion;
}

export function getCountryConfigurationByCode(
  countryCode: string,
  db: DatabaseSync = getDatabase(),
  effectiveDate?: string
): CountryConfigurationVersion {
  syncCountryConfigurationsToDatabase(db);
  const code = countryCode.trim().toUpperCase();

  if (effectiveDate) {
    const allForCountry = listCountryConfigurations(db, {
      includeHistoricalVersions: true,
    }).filter((c) => c.countryCode.toUpperCase() === code);
    return resolveJurisdictionConfigForDate(allForCountry, code, effectiveDate);
  }

  const row = db
    .prepare(
      "SELECT config_payload_json FROM country_config_versions WHERE country_code = ? ORDER BY effective_from DESC, version_number DESC LIMIT 1"
    )
    .get(code) as { config_payload_json: string } | undefined;

  if (!row) {
    throw new Error(`Configuration pays introuvable pour le code : ${countryCode}`);
  }
  return JSON.parse(row.config_payload_json) as CountryConfigurationVersion;
}

export function createOrganization(params: {
  session: AuthenticatedSessionContext | null;
  name: string;
  slug: string;
  organizationType: OrganizationType;
  countryCode: string;
  primaryTaxJurisdictionCode?: string;
  operatingCountryCodes?: string[];
  defaultCurrency?: CurrencyCode;
  defaultTimezone?: string;
  defaultLocale?: string;
  initialAdminUserId?: string;
  db?: DatabaseSync;
}): Organization {
  const db = params.db ?? getDatabase();
  if (!params.session) {
    throw new AuthorizationError("Authentification requise pour créer une organisation.", 401);
  }

  const cleanName = params.name.trim();
  const cleanSlug = params.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

  if (cleanName.length < 2 || cleanSlug.length < 2) {
    throw new Error("Le nom et l'identifiant (slug) de l'organisation doivent comporter au moins 2 caractères.");
  }

  const countryCfg = getCountryConfigurationByCode(params.countryCode, db);
  const currency = params.defaultCurrency ?? countryCfg.defaultCurrency;
  // Vérifier que la devise est enregistrée avec une précision explicite
  getCurrencyExponent(currency);

  const primaryJurisdiction = (
    params.primaryTaxJurisdictionCode ?? countryCfg.countryCode
  ).toUpperCase();
  const operatingCountries =
    params.operatingCountryCodes && params.operatingCountryCodes.length > 0
      ? params.operatingCountryCodes.map((c) => c.toUpperCase())
      : [countryCfg.countryCode];
  const timezone =
    params.defaultTimezone ?? countryCfg.defaultTimezone ?? "UTC";
  const locale =
    params.defaultLocale ?? countryCfg.supportedLocales[0] ?? "fr-FR";

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(
      `INSERT INTO organizations (
        id, name, slug, organization_type, country_code,
        primary_tax_jurisdiction_code, operating_countries_json,
        default_currency, default_timezone, default_locale,
        quota_max_dossiers, quota_max_users, quota_max_documents_per_month, quota_max_ai_calls_per_month,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 25, 10, 500, 500, 1, ?, ?)`
    ).run(
      id,
      cleanName,
      cleanSlug,
      params.organizationType,
      countryCfg.countryCode,
      primaryJurisdiction,
      JSON.stringify(operatingCountries),
      currency,
      timezone,
      locale,
      now,
      now
    );

    const adminUserId = params.initialAdminUserId ?? params.session.user.id;
    const membershipId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'FIRM_ADMIN', ?)`
    ).run(membershipId, id, adminUserId, now);

    recordAuditLog(
      {
        organizationId: id,
        actorUserId: params.session.user.id,
        actorRole: params.session.user.isPlatformAdmin ? "PLATFORM_ADMIN" : "FIRM_ADMIN",
        action: "ORGANIZATION_CREATED",
        targetEntityType: "ORGANIZATION",
        targetEntityId: id,
        metadata: {
          name: cleanName,
          slug: cleanSlug,
          countryCode: countryCfg.countryCode,
          primaryTaxJurisdictionCode: primaryJurisdiction,
          operatingCountryCodes: operatingCountries,
          defaultCurrency: currency,
        },
      },
      db
    );

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  if (
    !params.session.memberships.some((m) => m.organizationId === id) &&
    (params.initialAdminUserId ?? params.session.user.id) === params.session.user.id
  ) {
    params.session.memberships.push({
      id: crypto.randomUUID(),
      organizationId: id,
      userId: params.session.user.id,
      role: "FIRM_ADMIN",
      createdAt: now,
    });
  }

  return getOrganizationById({
    session: params.session,
    organizationId: id,
    platformAdminJustification: "Création initiale de l'organisation",
    db,
  });
}

export function getOrganizationById(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): Organization {
  const db = params.db ?? getDatabase();
  assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: "GET_ORGANIZATION",
    db,
  });

  const row = db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(params.organizationId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Organisation introuvable.");
  }

  return mapOrganizationRow(row);
}

export function listAccessibleOrganizations(
  session: AuthenticatedSessionContext | null,
  db: DatabaseSync = getDatabase()
): Organization[] {
  if (!session) {
    throw new AuthorizationError("Authentification requise.", 401);
  }

  if (session.user.isPlatformAdmin) {
    const rows = db
      .prepare("SELECT * FROM organizations ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapOrganizationRow);
  }

  const orgIds = session.memberships.map((m) => m.organizationId);
  if (orgIds.length === 0) return [];

  const placeholders = orgIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM organizations WHERE id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(...orgIds) as Array<Record<string, unknown>>;

  return rows.map(mapOrganizationRow);
}

function mapOrganizationRow(row: Record<string, unknown>): Organization {
  let operatingCountries: string[] = [String(row.country_code)];
  if (typeof row.operating_countries_json === "string" && row.operating_countries_json) {
    try {
      operatingCountries = JSON.parse(row.operating_countries_json) as string[];
    } catch {
      operatingCountries = [String(row.country_code)];
    }
  }
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    organizationType: String(row.organization_type) as OrganizationType,
    countryCode: String(row.country_code),
    primaryTaxJurisdictionCode: String(
      row.primary_tax_jurisdiction_code ?? row.country_code
    ),
    operatingCountryCodes: operatingCountries,
    defaultCurrency: String(row.default_currency) as CurrencyCode,
    defaultTimezone: String(row.default_timezone ?? "UTC"),
    defaultLocale: String(row.default_locale ?? "fr-FR"),
    quotaMaxDossiers: Number(row.quota_max_dossiers),
    quotaMaxUsers: Number(row.quota_max_users),
    quotaMaxDocumentsPerMonth: Number(row.quota_max_documents_per_month),
    quotaMaxAiCallsPerMonth: Number(row.quota_max_ai_calls_per_month),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function addMemberToOrganization(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  email: string;
  fullName: string;
  plainPassword: string;
  role: SystemRole;
  db?: DatabaseSync;
}): { user: Omit<User, "passwordHash">; role: SystemRole } {
  const db = params.db ?? getDatabase();
  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    allowedRoles: ["FIRM_ADMIN", "PLATFORM_ADMIN"],
    actionDescription: "ADD_ORGANIZATION_MEMBER",
    db,
  });

  if (params.role === "PLATFORM_ADMIN" && !params.session?.user.isPlatformAdmin) {
    throw new AuthorizationError(
      "Seul un administrateur de la plateforme peut attribuer le rôle PLATFORM_ADMIN.",
      403
    );
  }

  const org = getOrganizationById({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: "Vérification quota utilisateurs",
    db,
  });
  const countRow = db
    .prepare("SELECT COUNT(*) AS cnt FROM organization_memberships WHERE organization_id = ?")
    .get(params.organizationId) as { cnt: number };

  if (Number(countRow.cnt) >= org.quotaMaxUsers) {
    throw new Error(
      `Quota d'utilisateurs atteint pour l'organisation (${org.quotaMaxUsers} max).`
    );
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  const now = new Date().toISOString();

  let existingUser = db
    .prepare("SELECT * FROM users WHERE LOWER(email) = ?")
    .get(normalizedEmail) as Record<string, unknown> | undefined;

  let userId: string;
  if (!existingUser) {
    userId = crypto.randomUUID();
    const pwdHash = hashPassword(params.plainPassword);
    db.prepare(
      `INSERT INTO users (id, email, full_name, password_hash, is_platform_admin, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?)`
    ).run(userId, normalizedEmail, params.fullName.trim(), pwdHash, now, now);
    existingUser = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as Record<string, unknown>;
  } else {
    userId = String(existingUser.id);
  }

  db.prepare(
    `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(crypto.randomUUID(), params.organizationId, userId, params.role, now);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      actorUserId: params.session!.user.id,
      actorRole: effectiveRole,
      action: "ORGANIZATION_MEMBER_ADDED",
      targetEntityType: "USER",
      targetEntityId: userId,
      metadata: { email: normalizedEmail, assignedRole: params.role },
    },
    db
  );

  return {
    user: {
      id: userId,
      email: String(existingUser.email),
      fullName: String(existingUser.full_name),
      isPlatformAdmin: Number(existingUser.is_platform_admin) === 1,
      isActive: Number(existingUser.is_active) === 1,
      createdAt: String(existingUser.created_at),
      updatedAt: String(existingUser.updated_at),
    },
    role: params.role,
  };
}

export function listOrganizationMembers(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): Array<{
  userId: string;
  email: string;
  fullName: string;
  role: SystemRole;
  joinedAt: string;
}> {
  const db = params.db ?? getDatabase();
  assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: "LIST_ORGANIZATION_MEMBERS",
    db,
  });

  const rows = db
    .prepare(
      `SELECT m.user_id, m.role, m.created_at AS joined_at, u.email, u.full_name
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(params.organizationId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    userId: String(r.user_id),
    email: String(r.email),
    fullName: String(r.full_name),
    role: String(r.role) as SystemRole,
    joinedAt: String(r.joined_at),
  }));
}

function mapClientDossierRow(r: Record<string, unknown>): ClientDossier {
  let operatingCountries: string[] = [String(r.country_code)];
  if (
    typeof r.operating_countries_json === "string" &&
    r.operating_countries_json
  ) {
    try {
      operatingCountries = JSON.parse(r.operating_countries_json) as string[];
    } catch {
      operatingCountries = [String(r.country_code)];
    }
  }
  let allowedCurrencies: CurrencyCode[] = [String(r.currency)];
  if (
    typeof r.allowed_currencies_json === "string" &&
    r.allowed_currencies_json
  ) {
    try {
      allowedCurrencies = JSON.parse(r.allowed_currencies_json) as CurrencyCode[];
    } catch {
      allowedCurrencies = [String(r.currency)];
    }
  }
  const isActive = Number(r.is_active) === 1;
  const rawStatus = (r.dossier_status as string | null) ?? (isActive ? "ACTIVE" : "ARCHIVED");
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    name: String(r.name),
    code: String(r.code),
    legalForm: String(r.legal_form ?? "SAS"),
    legalRegistrationNumber:
      (r.legal_registration_number as string | null) ?? null,
    vatIntracommunityNumber:
      (r.vat_intracommunity_number as string | null) ?? null,
    addressLine: (r.address_line as string | null) ?? null,
    postalCode: (r.postal_code as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    countryCode: String(r.country_code),
    taxJurisdictionCode: String(
      r.tax_jurisdiction_code ?? r.country_code
    ),
    taxResidenceCountryCode: String(
      r.tax_residence_country_code ?? r.country_code
    ),
    operatingCountryCodes: operatingCountries,
    countryConfigVersionId: String(r.country_config_version_id),
    currency: String(r.currency) as CurrencyCode,
    allowedTransactionCurrencies: allowedCurrencies,
    taxRegimeCode: String(r.tax_regime_code),
    vatRegimeCode: String(r.vat_regime_code ?? "FR_TVA_REEL_NORMAL"),
    fiscalYearStartMonth: Number(r.fiscal_year_start_month),
    fiscalYearStartDate: (r.fiscal_year_start_date as string | null) ?? null,
    fiscalYearEndDate: (r.fiscal_year_end_date as string | null) ?? null,
    dossierStatus: rawStatus as DossierStatus,
    activitySector: (r.activity_sector as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    contactEmail: (r.contact_email as string | null) ?? null,
    contactPhone: (r.contact_phone as string | null) ?? null,
    internalNotes: (r.internal_notes as string | null) ?? null,
    archivedAt: (r.archived_at as string | null) ?? null,
    archivedByUserId: (r.archived_by_user_id as string | null) ?? null,
    archiveReason: (r.archive_reason as string | null) ?? null,
    isActive,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function resolveJournalTypeFromCode(
  code: string
): "PURCHASES" | "SALES" | "BANK" | "CASH" | "MISC_OPERATIONS" | "OPENING_BALANCE" {
  const upper = code.trim().toUpperCase();
  if (upper.startsWith("AC") || upper.startsWith("HA")) return "PURCHASES";
  if (upper.startsWith("VE") || upper.startsWith("VT")) return "SALES";
  if (upper.startsWith("BQ") || upper.startsWith("BA")) return "BANK";
  if (upper.startsWith("CA")) return "CASH";
  if (upper.startsWith("AN")) return "OPENING_BALANCE";
  return "MISC_OPERATIONS";
}

/**
 * Initialisation strictement idempotente du Plan Comptable Général (PCG) et des journaux standards d'un dossier :
 * - Utilise `ON CONFLICT DO NOTHING` pour ne jamais créer de doublons ni écraser les personnalisations existantes (libellés, statut actif, comptes personnalisés).
 */
export function initializeDossierAccountingReferential(params: {
  organizationId: string;
  dossierId: string;
  countryConfigVersionId?: string;
  db?: DatabaseSync;
}): {
  insertedAccountsCount: number;
  totalAccountsCount: number;
  insertedJournalsCount: number;
  totalJournalsCount: number;
} {
  const db = params.db ?? getDatabase();
  const dossierRow = db
    .prepare(
      "SELECT id, organization_id, country_config_version_id FROM client_dossiers WHERE id = ? AND organization_id = ?"
    )
    .get(params.dossierId, params.organizationId) as
    | { id: string; organization_id: string; country_config_version_id: string }
    | undefined;

  if (!dossierRow) {
    throw new AuthorizationError("Dossier introuvable dans cette organisation.", 404);
  }

  const versionId =
    params.countryConfigVersionId ?? dossierRow.country_config_version_id;
  const countryCfg = getCountryConfigurationByVersionId(versionId, db);
  const now = new Date().toISOString();

  const insertAccountStmt = db.prepare(`
    INSERT INTO chart_of_accounts (
      id, organization_id, dossier_id, account_number, label,
      account_class, allow_auxiliary, is_active, source_rule_version_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(dossier_id, account_number) DO NOTHING
  `);

  const insertJournalStmt = db.prepare(`
    INSERT INTO accounting_journals (
      id, organization_id, dossier_id, code, label, journal_type, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(dossier_id, code) DO NOTHING
  `);

  let insertedAccountsCount = 0;
  for (const acc of countryCfg.chartOfAccountsSample) {
    const res = insertAccountStmt.run(
      crypto.randomUUID(),
      params.organizationId,
      params.dossierId,
      acc.accountNumber.trim(),
      acc.label.trim(),
      acc.accountClass,
      acc.allowAuxiliary ? 1 : 0,
      versionId,
      now
    );
    if (res.changes > 0) {
      insertedAccountsCount += 1;
    }
  }

  let insertedJournalsCount = 0;
  for (const j of countryCfg.standardJournals) {
    const cleanCode = j.code.trim().toUpperCase();
    const res = insertJournalStmt.run(
      crypto.randomUUID(),
      params.organizationId,
      params.dossierId,
      cleanCode,
      j.label.trim(),
      resolveJournalTypeFromCode(cleanCode),
      now
    );
    if (res.changes > 0) {
      insertedJournalsCount += 1;
    }
  }

  const totalAccountsCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM chart_of_accounts WHERE dossier_id = ? AND organization_id = ?")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );
  const totalJournalsCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM accounting_journals WHERE dossier_id = ? AND organization_id = ?")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );

  return {
    insertedAccountsCount,
    totalAccountsCount,
    insertedJournalsCount,
    totalJournalsCount,
  };
}

/**
 * Création d'un dossier client (Phase 1 Section 9) avec distinction explicite :
 * - `countryCode` (pays d'établissement)
 * - `taxJurisdictionCode` (juridiction fiscale applicable, par défaut `countryCode`)
 * - `taxResidenceCountryCode` (résidence fiscale, par défaut `countryCode`)
 * - `operatingCountryCodes` (pays d'activité)
 * - `currency` (devise de tenue comptable) et son `minorUnitExponent` (0, 2, 3, 4 décimales)
 * - Métadonnées complètes Phase 1 : forme juridique, n° TVA intracommunautaire, adresse, régime TVA, dates d'exercice, contact, notes internes
 * - Auto-initialisation idempotente du Plan Comptable et des journaux standards.
 */
export function createClientDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  name: string;
  code: string;
  legalForm?: string;
  legalRegistrationNumber?: string | null;
  vatIntracommunityNumber?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode: string;
  taxJurisdictionCode?: string;
  taxResidenceCountryCode?: string;
  operatingCountryCodes?: string[];
  currency?: CurrencyCode;
  allowedTransactionCurrencies?: CurrencyCode[];
  taxRegimeCode: string;
  vatRegimeCode?: string;
  fiscalYearStartMonth?: number;
  fiscalYearStartDate?: string | null;
  fiscalYearEndDate?: string | null;
  dossierStatus?: DossierStatus;
  activitySector?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  internalNotes?: string | null;
  effectiveDate?: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): ClientDossier {
  const db = params.db ?? getDatabase();
  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    allowedRoles: ["FIRM_ADMIN", "PLATFORM_ADMIN"],
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: "CREATE_CLIENT_DOSSIER",
    db,
  });

  const cleanName = params.name.trim();
  const cleanCode = params.code.trim().toUpperCase();
  if (cleanName.length < 2 || cleanCode.length < 2) {
    throw new Error(
      "La raison sociale et le code dossier doivent comporter au moins 2 caractères."
    );
  }

  const fiscalMonth = params.fiscalYearStartMonth ?? 1;
  if (!Number.isInteger(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12) {
    throw new Error(
      "Le mois d'ouverture de l'exercice comptable doit être compris entre 1 et 12."
    );
  }

  const org = getOrganizationById({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification:
      params.platformAdminJustification ?? "Vérification quota dossiers",
    db,
  });

  const countRow = db
    .prepare("SELECT COUNT(*) AS cnt FROM client_dossiers WHERE organization_id = ?")
    .get(params.organizationId) as { cnt: number };

  if (Number(countRow.cnt) >= org.quotaMaxDossiers) {
    throw new Error(
      `Quota de dossiers clients atteint pour l'organisation (${org.quotaMaxDossiers} max).`
    );
  }

  const taxJurisdiction = (params.taxJurisdictionCode ?? params.countryCode)
    .trim()
    .toUpperCase();
  const countryCfg = getCountryConfigurationByCode(
    taxJurisdiction,
    db,
    params.effectiveDate
  );

  const establishmentCountry = params.countryCode.trim().toUpperCase();
  const taxResidenceCountry = (
    params.taxResidenceCountryCode ?? establishmentCountry
  )
    .trim()
    .toUpperCase();
  const operatingCountries =
    params.operatingCountryCodes && params.operatingCountryCodes.length > 0
      ? params.operatingCountryCodes.map((c) => c.toUpperCase())
      : Array.from(new Set([establishmentCountry, taxJurisdiction]));

  const currency = params.currency ?? countryCfg.defaultCurrency;
  const currencyExponent = getCurrencyExponent(currency);
  const allowedCurrencies =
    params.allowedTransactionCurrencies &&
    params.allowedTransactionCurrencies.length > 0
      ? params.allowedTransactionCurrencies
      : countryCfg.allowedCurrencies ?? [currency];

  const initialStatus: DossierStatus =
    params.dossierStatus &&
    ["ACTIVE", "TO_COMPLETE", "SUSPENDED"].includes(params.dossierStatus)
      ? params.dossierStatus
      : "ACTIVE";

  const legalForm = params.legalForm?.trim() || "SAS";
  const vatRegimeCode =
    params.vatRegimeCode?.trim() ||
    (params.taxRegimeCode.includes("MICRO")
      ? "FR_TVA_FRANCHISE_BASE"
      : "FR_TVA_REEL_NORMAL");

  const currentYear = new Date().getUTCFullYear();
  const defaultStartDate = `${currentYear}-${String(fiscalMonth).padStart(2, "0")}-01`;
  const defaultEndDate = `${currentYear}-12-31`;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO client_dossiers (
      id, organization_id, name, code, legal_form, legal_registration_number, vat_intracommunity_number,
      address_line, postal_code, city,
      country_code, tax_jurisdiction_code, tax_residence_country_code, operating_countries_json,
      country_config_version_id, currency, currency_minor_unit_exponent, allowed_currencies_json,
      tax_regime_code, vat_regime_code, fiscal_year_start_month, fiscal_year_start_date, fiscal_year_end_date,
      dossier_status, activity_sector, contact_name, contact_email, contact_phone, internal_notes,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    id,
    params.organizationId,
    cleanName,
    cleanCode,
    legalForm,
    params.legalRegistrationNumber?.trim() || null,
    params.vatIntracommunityNumber?.trim() || null,
    params.addressLine?.trim() || null,
    params.postalCode?.trim() || null,
    params.city?.trim() || null,
    establishmentCountry,
    taxJurisdiction,
    taxResidenceCountry,
    JSON.stringify(operatingCountries),
    countryCfg.versionId,
    currency,
    currencyExponent,
    JSON.stringify(allowedCurrencies),
    params.taxRegimeCode,
    vatRegimeCode,
    fiscalMonth,
    params.fiscalYearStartDate?.trim() || defaultStartDate,
    params.fiscalYearEndDate?.trim() || defaultEndDate,
    initialStatus,
    params.activitySector?.trim() || null,
    params.contactName?.trim() || null,
    params.contactEmail?.trim() || null,
    params.contactPhone?.trim() || null,
    params.internalNotes?.trim() || null,
    now,
    now
  );

  // Auto-initialisation idempotente du Plan Comptable et des journaux standards du dossier
  const referentialInit = initializeDossierAccountingReferential({
    organizationId: params.organizationId,
    dossierId: id,
    countryConfigVersionId: countryCfg.versionId,
    db,
  });

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: id,
      actorUserId: params.session!.user.id,
      actorRole: effectiveRole,
      action: "CLIENT_DOSSIER_CREATED",
      targetEntityType: "CLIENT_DOSSIER",
      targetEntityId: id,
      metadata: {
        name: cleanName,
        code: cleanCode,
        legalForm,
        establishmentCountry,
        taxJurisdiction,
        taxResidenceCountry,
        operatingCountries,
        countryConfigVersionId: countryCfg.versionId,
        currency,
        currencyExponent,
        taxRegimeCode: params.taxRegimeCode,
        vatRegimeCode,
        dossierStatus: initialStatus,
        initializedAccounts: referentialInit.insertedAccountsCount,
        initializedJournals: referentialInit.insertedJournalsCount,
      },
    },
    db
  );

  const createdRow = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ?")
    .get(id) as Record<string, unknown>;
  return mapClientDossierRow(createdRow);
}

/**
 * Consultation détaillée d'un dossier client avec ses compteurs, ses journaux initialisés et ses affectations.
 */
export function getClientDossierDetails(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): {
  dossier: ClientDossier;
  chartOfAccountsCount: number;
  journals: Array<{ id: string; code: string; label: string; journalType: string; isActive: boolean }>;
  assignments: Array<{
    userId: string;
    email: string;
    fullName: string;
    orgRole: SystemRole;
    canView: boolean;
    canUpload: boolean;
    canEditExtraction: boolean;
    canValidateAccounting: boolean;
    canExport: boolean;
  }>;
  metrics: {
    documentsCount: number;
    invoicesCount: number;
    entriesCount: number;
    openAnomaliesCount: number;
  };
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const row = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new AuthorizationError("Dossier introuvable dans cette organisation.", 404);
  }

  const dossier = mapClientDossierRow(row);
  const chartOfAccountsCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM chart_of_accounts WHERE dossier_id = ? AND organization_id = ?")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );

  const journalRows = db
    .prepare(
      "SELECT id, code, label, journal_type, is_active FROM accounting_journals WHERE dossier_id = ? AND organization_id = ? ORDER BY code ASC"
    )
    .all(params.dossierId, params.organizationId) as Array<Record<string, unknown>>;

  const journals = journalRows.map((j) => ({
    id: String(j.id),
    code: String(j.code),
    label: String(j.label),
    journalType: String(j.journal_type),
    isActive: Number(j.is_active) === 1,
  }));

  const assignments = listDossierAssignments({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const documentsCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM documents WHERE dossier_id = ? AND organization_id = ?")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );
  const invoicesCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM invoices WHERE dossier_id = ? AND organization_id = ?")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );
  const entriesCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM accounting_entries WHERE dossier_id = ? AND organization_id = ?")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );
  const openAnomaliesCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM anomalies WHERE dossier_id = ? AND organization_id = ? AND status = 'OPEN'")
        .get(params.dossierId, params.organizationId) as { c: number }
    ).c
  );

  return {
    dossier,
    chartOfAccountsCount,
    journals,
    assignments,
    metrics: {
      documentsCount,
      invoicesCount,
      entriesCount,
      openAnomaliesCount,
    },
  };
}

/**
 * Mise à jour des informations d'un dossier client (Phase 1 Section 9) avec contrôle RBAC :
 * - Autorisé pour `FIRM_ADMIN` et `PLATFORM_ADMIN` (avec justification).
 * - Autorisé pour `CLIENT_DIRECTOR` affecté au dossier.
 * - Autorisé pour `ACCOUNTANT_COLLABORATOR` affecté au dossier disposant de `can_validate_accounting = 1` ou `can_edit_extraction = 1`.
 * - Interdit sur un dossier archivé logiquement tant qu'il n'est pas restauré.
 */
export function updateClientDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  name?: string;
  legalForm?: string;
  legalRegistrationNumber?: string | null;
  vatIntracommunityNumber?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  taxRegimeCode?: string;
  vatRegimeCode?: string;
  fiscalYearStartMonth?: number;
  fiscalYearStartDate?: string | null;
  fiscalYearEndDate?: string | null;
  dossierStatus?: Exclude<DossierStatus, "ARCHIVED">;
  activitySector?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  internalNotes?: string | null;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): ClientDossier {
  const db = params.db ?? getDatabase();
  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: "UPDATE_CLIENT_DOSSIER",
    db,
  });

  const existingRow = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as Record<string, unknown> | undefined;

  if (!existingRow) {
    throw new AuthorizationError("Dossier introuvable dans cette organisation.", 404);
  }

  // Vérification fine des permissions par rôle sur le dossier
  if (effectiveRole !== "FIRM_ADMIN" && effectiveRole !== "PLATFORM_ADMIN") {
    assertDossierAccess({
      session: params.session,
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      permission: "VIEW",
      platformAdminJustification: params.platformAdminJustification,
      db,
    });

    if (effectiveRole === "ACCOUNTANT_COLLABORATOR") {
      const assignment = db
        .prepare(
          "SELECT can_edit_extraction, can_validate_accounting FROM dossier_assignments WHERE organization_id = ? AND dossier_id = ? AND user_id = ?"
        )
        .get(params.organizationId, params.dossierId, params.session!.user.id) as
        | { can_edit_extraction: number; can_validate_accounting: number }
        | undefined;
      if (
        !assignment ||
        (Number(assignment.can_edit_extraction) !== 1 &&
          Number(assignment.can_validate_accounting) !== 1)
      ) {
        recordAuditLog(
          {
            organizationId: params.organizationId,
            dossierId: params.dossierId,
            actorUserId: params.session!.user.id,
            actorRole: effectiveRole,
            action: "DOSSIER_UPDATE_DENIED_READONLY_COLLABORATOR",
            targetEntityType: "CLIENT_DOSSIER",
            targetEntityId: params.dossierId,
          },
          db
        );
        throw new AuthorizationError(
          "Accès refusé : un collaborateur en lecture seule ne peut pas modifier les paramètres du dossier.",
          403
        );
      }
    }
  }

  const currentDossier = mapClientDossierRow(existingRow);
  if (!currentDossier.isActive || currentDossier.dossierStatus === "ARCHIVED") {
    throw new Error(
      "Ce dossier est archivé logiquement. Restaurez-le d'abord avant de modifier ses paramètres."
    );
  }

  const nextName = params.name !== undefined ? params.name.trim() : currentDossier.name;
  if (nextName.length < 2) {
    throw new Error("La raison sociale du dossier doit comporter au moins 2 caractères.");
  }

  const nextFiscalMonth =
    params.fiscalYearStartMonth !== undefined
      ? Number(params.fiscalYearStartMonth)
      : currentDossier.fiscalYearStartMonth;
  if (!Number.isInteger(nextFiscalMonth) || nextFiscalMonth < 1 || nextFiscalMonth > 12) {
    throw new Error(
      "Le mois d'ouverture de l'exercice comptable doit être compris entre 1 et 12."
    );
  }

  const nextStatus =
    params.dossierStatus !== undefined
      ? params.dossierStatus
      : (currentDossier.dossierStatus ?? "ACTIVE");
  if (!["ACTIVE", "TO_COMPLETE", "SUSPENDED"].includes(nextStatus)) {
    throw new Error(
      "Statut de dossier invalide pour une modification courante (utilisez l'action d'archivage dédiée pour archiver)."
    );
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE client_dossiers SET
      name = ?,
      legal_form = ?,
      legal_registration_number = ?,
      vat_intracommunity_number = ?,
      address_line = ?,
      postal_code = ?,
      city = ?,
      tax_regime_code = ?,
      vat_regime_code = ?,
      fiscal_year_start_month = ?,
      fiscal_year_start_date = ?,
      fiscal_year_end_date = ?,
      dossier_status = ?,
      activity_sector = ?,
      contact_name = ?,
      contact_email = ?,
      contact_phone = ?,
      internal_notes = ?,
      updated_at = ?
     WHERE id = ? AND organization_id = ?`
  ).run(
    nextName,
    params.legalForm !== undefined ? params.legalForm.trim() : (currentDossier.legalForm ?? "SAS"),
    params.legalRegistrationNumber !== undefined
      ? params.legalRegistrationNumber?.trim() || null
      : currentDossier.legalRegistrationNumber,
    params.vatIntracommunityNumber !== undefined
      ? params.vatIntracommunityNumber?.trim() || null
      : (currentDossier.vatIntracommunityNumber ?? null),
    params.addressLine !== undefined
      ? params.addressLine?.trim() || null
      : (currentDossier.addressLine ?? null),
    params.postalCode !== undefined
      ? params.postalCode?.trim() || null
      : (currentDossier.postalCode ?? null),
    params.city !== undefined
      ? params.city?.trim() || null
      : (currentDossier.city ?? null),
    params.taxRegimeCode !== undefined
      ? params.taxRegimeCode.trim()
      : currentDossier.taxRegimeCode,
    params.vatRegimeCode !== undefined
      ? params.vatRegimeCode.trim()
      : (currentDossier.vatRegimeCode ?? "FR_TVA_REEL_NORMAL"),
    nextFiscalMonth,
    params.fiscalYearStartDate !== undefined
      ? params.fiscalYearStartDate?.trim() || null
      : (currentDossier.fiscalYearStartDate ?? null),
    params.fiscalYearEndDate !== undefined
      ? params.fiscalYearEndDate?.trim() || null
      : (currentDossier.fiscalYearEndDate ?? null),
    nextStatus,
    params.activitySector !== undefined
      ? params.activitySector?.trim() || null
      : (currentDossier.activitySector ?? null),
    params.contactName !== undefined
      ? params.contactName?.trim() || null
      : (currentDossier.contactName ?? null),
    params.contactEmail !== undefined
      ? params.contactEmail?.trim() || null
      : (currentDossier.contactEmail ?? null),
    params.contactPhone !== undefined
      ? params.contactPhone?.trim() || null
      : (currentDossier.contactPhone ?? null),
    params.internalNotes !== undefined
      ? params.internalNotes?.trim() || null
      : (currentDossier.internalNotes ?? null),
    now,
    params.dossierId,
    params.organizationId
  );

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: effectiveRole,
      action: "CLIENT_DOSSIER_UPDATED",
      targetEntityType: "CLIENT_DOSSIER",
      targetEntityId: params.dossierId,
      metadata: {
        name: nextName,
        taxRegimeCode: params.taxRegimeCode ?? currentDossier.taxRegimeCode,
        vatRegimeCode: params.vatRegimeCode ?? currentDossier.vatRegimeCode,
        dossierStatus: nextStatus,
      },
    },
    db
  );

  const updatedRow = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as Record<string, unknown>;
  return mapClientDossierRow(updatedRow);
}

/**
 * Archivage logique ou restauration d'un dossier client (Garde-fou Lot 1.1) :
 * - Strictement réservé aux rôles `FIRM_ADMIN` et `PLATFORM_ADMIN` (avec justification).
 * - L'archivage est 100 % logique (`dossier_status = 'ARCHIVED'`, `is_active = 0`) : aucune pièce, écriture, facture ni entrée d'audit n'est supprimée.
 * - Exige un motif explicite (`reason` >= 5 caractères).
 */
export function archiveOrRestoreClientDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  archive: boolean;
  reason: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): ClientDossier {
  const db = params.db ?? getDatabase();
  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    allowedRoles: ["FIRM_ADMIN", "PLATFORM_ADMIN"],
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: params.archive ? "ARCHIVE_CLIENT_DOSSIER" : "RESTORE_CLIENT_DOSSIER",
    db,
  });

  const existingRow = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as Record<string, unknown> | undefined;

  if (!existingRow) {
    throw new AuthorizationError("Dossier introuvable dans cette organisation.", 404);
  }

  const cleanReason = (params.reason || "").trim();
  if (cleanReason.length < 5) {
    throw new Error(
      "Un motif explicite (minimum 5 caractères) est obligatoire pour archiver ou restaurer un dossier client."
    );
  }

  const now = new Date().toISOString();
  if (params.archive) {
    db.prepare(
      `UPDATE client_dossiers SET
        dossier_status = 'ARCHIVED',
        is_active = 0,
        archived_at = ?,
        archived_by_user_id = ?,
        archive_reason = ?,
        updated_at = ?
       WHERE id = ? AND organization_id = ?`
    ).run(
      now,
      params.session!.user.id,
      cleanReason,
      now,
      params.dossierId,
      params.organizationId
    );
  } else {
    db.prepare(
      `UPDATE client_dossiers SET
        dossier_status = 'ACTIVE',
        is_active = 1,
        archived_at = NULL,
        archived_by_user_id = NULL,
        archive_reason = ?,
        updated_at = ?
       WHERE id = ? AND organization_id = ?`
    ).run(cleanReason, now, params.dossierId, params.organizationId);
  }

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: effectiveRole,
      action: params.archive
        ? "CLIENT_DOSSIER_ARCHIVED_LOGICALLY"
        : "CLIENT_DOSSIER_RESTORED",
      targetEntityType: "CLIENT_DOSSIER",
      targetEntityId: params.dossierId,
      justification: cleanReason,
      metadata: {
        archive: params.archive,
        reason: cleanReason,
        preservedHistoricalReferences: true,
      },
    },
    db
  );

  const updatedRow = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as Record<string, unknown>;
  return mapClientDossierRow(updatedRow);
}

export function assignUserToDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  targetUserId: string;
  canView: boolean;
  canUpload: boolean;
  canEditExtraction: boolean;
  canValidateAccounting: boolean;
  canExport: boolean;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): void {
  const db = params.db ?? getDatabase();
  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    allowedRoles: ["FIRM_ADMIN", "PLATFORM_ADMIN"],
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: "ASSIGN_USER_TO_DOSSIER",
    db,
  });

  const dossier = db
    .prepare("SELECT id FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId);
  if (!dossier) {
    throw new AuthorizationError("Dossier introuvable dans cette organisation.", 404);
  }

  const targetMembership = db
    .prepare(
      "SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ?"
    )
    .get(params.organizationId, params.targetUserId);
  if (!targetMembership) {
    throw new AuthorizationError(
      "Impossible d'affecter à un dossier un utilisateur qui n'appartient pas à cette organisation.",
      403
    );
  }

  db.prepare(
    `INSERT INTO dossier_assignments (
      id, organization_id, dossier_id, user_id,
      can_view, can_upload, can_edit_extraction, can_validate_accounting, can_export, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dossier_id, user_id) DO UPDATE SET
      can_view = excluded.can_view,
      can_upload = excluded.can_upload,
      can_edit_extraction = excluded.can_edit_extraction,
      can_validate_accounting = excluded.can_validate_accounting,
      can_export = excluded.can_export`
  ).run(
    crypto.randomUUID(),
    params.organizationId,
    params.dossierId,
    params.targetUserId,
    params.canView ? 1 : 0,
    params.canUpload ? 1 : 0,
    params.canEditExtraction ? 1 : 0,
    params.canValidateAccounting ? 1 : 0,
    params.canExport ? 1 : 0,
    new Date().toISOString()
  );

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: effectiveRole,
      action: "DOSSIER_ASSIGNMENT_UPDATED",
      targetEntityType: "DOSSIER_ASSIGNMENT",
      targetEntityId: params.dossierId,
      metadata: {
        targetUserId: params.targetUserId,
        canView: params.canView,
        canUpload: params.canUpload,
        canEditExtraction: params.canEditExtraction,
        canValidateAccounting: params.canValidateAccounting,
        canExport: params.canExport,
      },
    },
    db
  );
}

export function listDossierAssignments(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): Array<{
  userId: string;
  email: string;
  fullName: string;
  orgRole: SystemRole;
  canView: boolean;
  canUpload: boolean;
  canEditExtraction: boolean;
  canValidateAccounting: boolean;
  canExport: boolean;
}> {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const rows = db
    .prepare(
      `SELECT
        a.user_id,
        a.can_view,
        a.can_upload,
        a.can_edit_extraction,
        a.can_validate_accounting,
        a.can_export,
        u.email,
        u.full_name,
        m.role AS org_role
       FROM dossier_assignments a
       JOIN users u ON u.id = a.user_id
       JOIN organization_memberships m ON m.organization_id = a.organization_id AND m.user_id = a.user_id
       WHERE a.organization_id = ? AND a.dossier_id = ?
       ORDER BY u.full_name ASC`
    )
    .all(params.organizationId, params.dossierId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    userId: String(r.user_id),
    email: String(r.email),
    fullName: String(r.full_name),
    orgRole: String(r.org_role) as SystemRole,
    canView: Number(r.can_view) === 1,
    canUpload: Number(r.can_upload) === 1,
    canEditExtraction: Number(r.can_edit_extraction) === 1,
    canValidateAccounting: Number(r.can_validate_accounting) === 1,
    canExport: Number(r.can_export) === 1,
  }));
}

export function listDossiersForOrganization(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): ClientDossier[] {
  const db = params.db ?? getDatabase();
  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: "LIST_DOSSIERS",
    db,
  });

  let rows: Array<Record<string, unknown>>;
  if (effectiveRole === "FIRM_ADMIN" || effectiveRole === "PLATFORM_ADMIN") {
    rows = db
      .prepare(
        "SELECT * FROM client_dossiers WHERE organization_id = ? ORDER BY created_at ASC"
      )
      .all(params.organizationId) as Array<Record<string, unknown>>;
  } else {
    rows = db
      .prepare(
        `SELECT d.*
         FROM client_dossiers d
         JOIN dossier_assignments a ON a.dossier_id = d.id AND a.organization_id = d.organization_id
         WHERE d.organization_id = ? AND a.user_id = ? AND a.can_view = 1
         ORDER BY d.created_at ASC`
      )
      .all(params.organizationId, params.session!.user.id) as Array<
      Record<string, unknown>
    >;
  }

  return rows.map(mapClientDossierRow);
}

export interface IngestionResult {
  document: StoredDocument;
  duplicateDetected: boolean;
  duplicateType?: "EXACT_SHA256" | "HEURISTIC" | null;
  conflictingDocumentId?: string;
  heuristicWarning?: string;
}

/**
 * Valide les transitions autorisées et interdites sur le cycle de vie documentaire à 6 statuts.
 * Protège contre la réouverture sauvage d'un document validé ou le passage direct d'un document rejeté vers validé.
 */
export function validateDocumentWorkflowTransition(
  currentStatus: DocumentWorkflowStatus,
  targetStatus: DocumentWorkflowStatus
): void {
  const allowedTransitions: Record<DocumentWorkflowStatus, DocumentWorkflowStatus[]> = {
    RECEIVED: ["EXTRACTED", "PENDING_REVIEW", "REJECTED"],
    STORED: ["EXTRACTED", "PENDING_REVIEW", "REJECTED"],
    EXTRACTED: ["PENDING_REVIEW", "CORRECTED", "VALIDATED", "REJECTED"],
    CHECKED: ["PENDING_REVIEW", "CORRECTED", "VALIDATED", "REJECTED"],
    SUGGESTED: ["PENDING_REVIEW", "CORRECTED", "VALIDATED", "REJECTED"],
    PENDING_REVIEW: ["CORRECTED", "VALIDATED", "REJECTED"],
    CORRECTED: ["VALIDATED", "REJECTED", "CORRECTED"],
    VALIDATED: ["EXPORTED"], // Un document VALIDATED ne peut plus être directement REJECTED ou rétrogradé
    REJECTED: ["PENDING_REVIEW", "CORRECTED"], // Un document rejeté doit être réexaminé ou corrigé avant validation
    EXPORTED: [], // Statut terminal
  };

  const allowed = allowedTransitions[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `Transition de statut documentaire interdite : impossible de passer de "${currentStatus}" à "${targetStatus}".`
    );
  }
}

export async function ingestDocumentIntoDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  originalFilename: string;
  mimeType: string;
  contentBuffer: Buffer;
  category?: DocumentCategory;
  allowDuplicateOverride?: boolean;
  overrideReason?: string;
  db?: DatabaseSync;
}): Promise<IngestionResult> {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "UPLOAD",
    db,
  });

  // 1. Validation de sécurité du fichier (octets magiques, taille 1o - 15Mo, extensions interdites)
  const validation = validateFileBuffer(
    params.contentBuffer,
    params.mimeType,
    params.originalFilename
  );

  const safeFilename = sanitizeFilename(params.originalFilename);

  // 2. Scan de sécurité antimalware
  const scanResult = await scanFileSafety(params.contentBuffer, safeFilename);
  if (!scanResult.isClean) {
    recordAuditLog(
      {
        organizationId: params.organizationId,
        dossierId: params.dossierId,
        actorUserId: params.session?.user.id ?? null,
        actorRole: "AUTHENTICATED_USER",
        action: "MALWARE_PAYLOAD_DETECTED_UPLOAD_REJECTED",
        targetEntityType: "DOCUMENT",
        targetEntityId: null,
        justification: `Fichier rejeté : menace ${scanResult.threatName}`,
        metadata: {
          originalFilename: params.originalFilename,
          sanitizedFilename: safeFilename,
          threatName: scanResult.threatName,
          engine: scanResult.scannerEngine,
        },
      },
      db
    );
    throw new Error(
      `Fichier rejeté par la sécurité : menace détectée (${scanResult.threatName}).`
    );
  }

  // 3. Empreinte SHA-256 et détection de doublon exact
  const sha256Checksum = crypto
    .createHash("sha256")
    .update(params.contentBuffer)
    .digest("hex");

  const existingDuplicate = db
    .prepare(
      "SELECT id, original_filename, created_at FROM documents WHERE organization_id = ? AND dossier_id = ? AND sha256_checksum = ?"
    )
    .get(params.organizationId, params.dossierId, sha256Checksum) as
    | { id: string; original_filename: string; created_at: string }
    | undefined;

  let duplicateDetected = Boolean(existingDuplicate);
  let duplicateType: "EXACT_SHA256" | "HEURISTIC" | null = existingDuplicate
    ? "EXACT_SHA256"
    : null;
  let conflictingDocumentId: string | undefined = existingDuplicate?.id;
  let heuristicWarning: string | undefined;

  // 4. Dossier et rétention légale
  const dossierRow = db
    .prepare(
      "SELECT country_config_version_id, country_code FROM client_dossiers WHERE id = ?"
    )
    .get(params.dossierId) as { country_config_version_id: string; country_code: string };

  const countryCfg = getCountryConfigurationByVersionId(
    dossierRow.country_config_version_id,
    db
  );
  const retentionYear =
    new Date().getUTCFullYear() + countryCfg.statutoryRetentionYears;
  const retentionUntilDate = `${retentionYear}-12-31`;

  // 5. Stockage privé sécurisé
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const storageKey = `${params.organizationId}/${params.dossierId}/${id}-${safeFilename}`;

  await defaultDocumentStorage.saveFile(storageKey, params.contentBuffer);

  try {
    // 6. Extraction OCR / IA assistée (déterministe test avec isolation anti-injection)
    const aiAdapter = new DeterministicMockAiAdapter();
    const { extraction, metadata } = await aiAdapter.extractInvoiceData({
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      filename: safeFilename,
      mimeType: validation.detectedMimeType,
      rawTextContent: params.contentBuffer.toString("utf-8"),
    });

    // 7. Détection de doublon heuristique (même tiers, même date, même montant TTC)
    let heuristicDuplicateOfId: string | null = null;
    let overrideDuplicateReason: string | null = null;

    if (!duplicateDetected) {
      const candidateGross = extraction.grossAmountMinor?.value;
      const candidateDate = extraction.invoiceDate?.value;
      const candidateIssuer = extraction.issuerName?.value;

      if (candidateGross && candidateDate && candidateIssuer) {
        const existingDocs = db
          .prepare(
            "SELECT id, original_filename, extracted_data_json FROM documents WHERE organization_id = ? AND dossier_id = ? AND workflow_status != 'REJECTED'"
          )
          .all(params.organizationId, params.dossierId) as Array<{
          id: string;
          original_filename: string;
          extracted_data_json: string;
        }>;

        for (const d of existingDocs) {
          try {
            const parsed = JSON.parse(d.extracted_data_json);
            const ext = parsed.extraction;
            if (
              ext &&
              ext.invoiceDate?.value === candidateDate &&
              ext.grossAmountMinor?.value === candidateGross
            ) {
              duplicateDetected = true;
              duplicateType = "HEURISTIC";
              conflictingDocumentId = d.id;
              heuristicDuplicateOfId = d.id;
              heuristicWarning = `Suspicion de doublon heuristique : document ${d.original_filename} (${d.id}) a la même date (${candidateDate}) et le même montant (${(candidateGross / 100).toFixed(2)} €).`;
              break;
            }
          } catch {
            // ignore parsing error on legacy document
          }
        }
      }
    }

    // Traitement du dépassement de doublon si autorisé et justifié
    if (duplicateDetected && params.allowDuplicateOverride && params.overrideReason) {
      overrideDuplicateReason = params.overrideReason.trim();
    }

    // 8. Insertion en base de données avec statut PENDING_REVIEW
    db.prepare(
      `INSERT INTO documents (
        id, organization_id, dossier_id, original_filename, mime_type,
        size_bytes, sha256_checksum, storage_key, category, workflow_status,
        extracted_data_json, ai_model_version, rule_version_id, uploaded_by_user_id,
        validated_by_user_id, validated_at, rejection_reason, rejected_by_user_id, rejected_at,
        override_duplicate_reason, heuristic_duplicate_of_id, quarantine_status,
        retention_until_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, 'CLEAN', ?, ?, ?)`
    ).run(
      id,
      params.organizationId,
      params.dossierId,
      safeFilename,
      validation.detectedMimeType,
      params.contentBuffer.byteLength,
      sha256Checksum,
      storageKey,
      params.category ?? extraction.category.value,
      JSON.stringify({ extraction, aiMetadata: metadata }),
      metadata.modelName,
      dossierRow.country_config_version_id,
      params.session!.user.id,
      overrideDuplicateReason,
      heuristicDuplicateOfId,
      retentionUntilDate,
      now,
      now
    );

    // 9. Journal d'audit inaltérable
    recordAuditLog(
      {
        organizationId: params.organizationId,
        dossierId: params.dossierId,
        actorUserId: params.session!.user.id,
        actorRole: "AUTHENTICATED_USER",
        action: overrideDuplicateReason
          ? "DOCUMENT_INGESTED_WITH_DUPLICATE_OVERRIDE"
          : "DOCUMENT_INGESTED_PENDING_HUMAN_REVIEW",
        targetEntityType: "DOCUMENT",
        targetEntityId: id,
        justification: overrideDuplicateReason,
        metadata: {
          filename: safeFilename,
          sha256Checksum,
          duplicateDetected,
          duplicateType,
          conflictingDocumentId,
          heuristicWarning,
          promptInjectionDetected: metadata.promptInjectionDetected,
        },
      },
      db
    );

    const document: StoredDocument = {
      id,
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      originalFilename: safeFilename,
      mimeType: validation.detectedMimeType,
      sizeBytes: params.contentBuffer.byteLength,
      sha256Checksum,
      storageKey,
      category: params.category ?? extraction.category.value,
      workflowStatus: "PENDING_REVIEW",
      extractedDataJson: JSON.stringify({ extraction, aiMetadata: metadata }),
      aiModelVersion: metadata.modelName,
      ruleVersionId: dossierRow.country_config_version_id,
      uploadedByUserId: params.session!.user.id,
      validatedByUserId: null,
      validatedAt: null,
      rejectionReason: null,
      rejectedByUserId: null,
      rejectedAt: null,
      overrideDuplicateReason,
      heuristicDuplicateOfId,
      quarantineStatus: "CLEAN",
      retentionUntilDate,
      createdAt: now,
      updatedAt: now,
    };

    return {
      document,
      duplicateDetected,
      duplicateType,
      conflictingDocumentId,
      heuristicWarning,
    };
  } catch (err) {
    // Nettoyage immédiat du fichier physique orphelin en cas d'échec SQL ou de traitement
    await defaultDocumentStorage.deleteFile(storageKey).catch(() => {});
    throw err;
  }
}

export function listDossierDocuments(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  category?: string;
  workflowStatus?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  db?: DatabaseSync;
}): {
  documents: StoredDocument[];
  total: number;
  countsByStatus: Record<string, number>;
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  const conditions: string[] = ["organization_id = ?", "dossier_id = ?"];
  const args: any[] = [params.organizationId, params.dossierId];

  if (params.category && params.category !== "ALL") {
    conditions.push("category = ?");
    args.push(params.category);
  }

  if (params.workflowStatus && params.workflowStatus !== "ALL") {
    conditions.push("workflow_status = ?");
    args.push(params.workflowStatus);
  }

  if (params.searchQuery && params.searchQuery.trim()) {
    conditions.push(
      "(original_filename LIKE ? OR extracted_data_json LIKE ?)"
    );
    const like = `%${params.searchQuery.trim()}%`;
    args.push(like, like);
  }

  const whereSql = conditions.join(" AND ");

  const total = Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS c FROM documents WHERE ${whereSql}`)
        .get(...args) as { c: number }
    ).c
  );

  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const offset = Math.max(Number(params.offset) || 0, 0);

  const rows = db
    .prepare(
      `SELECT * FROM documents WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as any[];

  const documents: StoredDocument[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    dossierId: r.dossier_id,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    sha256Checksum: r.sha256_checksum,
    storageKey: r.storage_key,
    category: r.category,
    workflowStatus: r.workflow_status,
    extractedDataJson: r.extracted_data_json,
    aiModelVersion: r.ai_model_version,
    ruleVersionId: r.rule_version_id,
    uploadedByUserId: r.uploaded_by_user_id,
    validatedByUserId: r.validated_by_user_id,
    validatedAt: r.validated_at,
    rejectionReason: r.rejection_reason,
    rejectedByUserId: r.rejected_by_user_id,
    rejectedAt: r.rejected_at,
    overrideDuplicateReason: r.override_duplicate_reason,
    heuristicDuplicateOfId: r.heuristic_duplicate_of_id,
    quarantineStatus: r.quarantine_status,
    retentionUntilDate: r.retention_until_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  // Compteurs par statut
  const statusRows = db
    .prepare(
      "SELECT workflow_status, COUNT(*) as c FROM documents WHERE organization_id = ? AND dossier_id = ? GROUP BY workflow_status"
    )
    .all(params.organizationId, params.dossierId) as Array<{
    workflow_status: string;
    c: number;
  }>;

  const countsByStatus: Record<string, number> = {
    ALL: 0,
    RECEIVED: 0,
    EXTRACTED: 0,
    PENDING_REVIEW: 0,
    CORRECTED: 0,
    VALIDATED: 0,
    REJECTED: 0,
  };

  for (const s of statusRows) {
    countsByStatus[s.workflow_status] = Number(s.c);
    countsByStatus["ALL"] = (countsByStatus["ALL"] ?? 0) + Number(s.c);
  }

  return { documents, total, countsByStatus };
}

export function getDocumentDetails(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  documentId: string;
  db?: DatabaseSync;
}): {
  document: StoredDocument;
  downloadToken: string;
  downloadExpiresAtUnix: number;
  downloadUrl: string;
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  const row = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(params.documentId, params.organizationId, params.dossierId) as any;

  if (!row) {
    throw new Error(`Document introuvable : ${params.documentId}`);
  }

  const document: StoredDocument = {
    id: row.id,
    organizationId: row.organization_id,
    dossierId: row.dossier_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256Checksum: row.sha256_checksum,
    storageKey: row.storage_key,
    category: row.category,
    workflowStatus: row.workflow_status,
    extractedDataJson: row.extracted_data_json,
    aiModelVersion: row.ai_model_version,
    ruleVersionId: row.rule_version_id,
    uploadedByUserId: row.uploaded_by_user_id,
    validatedByUserId: row.validated_by_user_id,
    validatedAt: row.validated_at,
    rejectionReason: row.rejection_reason,
    rejectedByUserId: row.rejected_by_user_id,
    rejectedAt: row.rejected_at,
    overrideDuplicateReason: row.override_duplicate_reason,
    heuristicDuplicateOfId: row.heuristic_duplicate_of_id,
    quarantineStatus: row.quarantine_status,
    retentionUntilDate: row.retention_until_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const { token, expiresAtUnix } = generateSignedDocumentDownloadToken({
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    documentId: params.documentId,
    userId: params.session!.user.id,
  });

  const downloadUrl = `/api/organizations/${params.organizationId}/dossiers/${params.dossierId}/documents/${params.documentId}/download?token=${token}`;

  return { document, downloadToken: token, downloadExpiresAtUnix: expiresAtUnix, downloadUrl };
}

export function updateDocumentExtraction(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  documentId: string;
  fields: {
    issuerName?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    netAmountMinor?: number;
    vatAmountMinor?: number;
    grossAmountMinor?: number;
    vatRateBps?: number;
    currency?: string;
    suggestedAccountCode?: string;
    category?: DocumentCategory;
  };
  db?: DatabaseSync;
}): StoredDocument {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "EDIT_EXTRACTION",
    db,
  });

  const doc = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(params.documentId, params.organizationId, params.dossierId) as any;

  if (!doc) {
    throw new Error(`Document introuvable : ${params.documentId}`);
  }

  validateDocumentWorkflowTransition(doc.workflow_status, "CORRECTED");

  let parsed: any = {};
  try {
    parsed = JSON.parse(doc.extracted_data_json);
  } catch {
    parsed = { extraction: {} };
  }

  const ext = parsed.extraction || {};
  const now = new Date().toISOString();
  const userId = params.session!.user.id;

  const updateField = (name: string, val: any) => {
    if (val !== undefined) {
      ext[name] = {
        value: val,
        source: "HUMAN_ENTRY",
        confidenceScore: 1.0,
        validationStatus: "VALIDATED_BY_HUMAN",
        validatedByUserId: userId,
        validatedAt: now,
      };
    }
  };

  updateField("issuerName", params.fields.issuerName);
  updateField("invoiceNumber", params.fields.invoiceNumber);
  updateField("invoiceDate", params.fields.invoiceDate);
  updateField("dueDate", params.fields.dueDate);
  updateField("netAmountMinor", params.fields.netAmountMinor);
  updateField("vatAmountMinor", params.fields.vatAmountMinor);
  updateField("grossAmountMinor", params.fields.grossAmountMinor);
  updateField("vatRateBps", params.fields.vatRateBps);
  updateField("currency", params.fields.currency);
  updateField("suggestedAccountCode", params.fields.suggestedAccountCode);
  if (params.fields.category) {
    updateField("category", params.fields.category);
  }

  parsed.extraction = ext;
  const newJson = JSON.stringify(parsed);
  const newCategory = params.fields.category ?? doc.category;
  const newStatus = "CORRECTED";

  db.prepare(
    `UPDATE documents
     SET category = ?, workflow_status = ?, extracted_data_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(newCategory, newStatus, newJson, now, params.documentId);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: "DOCUMENT_EXTRACTION_CORRECTED_BY_HUMAN",
      targetEntityType: "DOCUMENT",
      targetEntityId: params.documentId,
      metadata: {
        updatedFields: Object.keys(params.fields),
        previousStatus: doc.workflow_status,
        newStatus,
      },
    },
    db
  );

  return {
    id: doc.id,
    organizationId: doc.organization_id,
    dossierId: doc.dossier_id,
    originalFilename: doc.original_filename,
    mimeType: doc.mime_type,
    sizeBytes: Number(doc.size_bytes),
    sha256Checksum: doc.sha256_checksum,
    storageKey: doc.storage_key,
    category: newCategory,
    workflowStatus: newStatus,
    extractedDataJson: newJson,
    aiModelVersion: doc.ai_model_version,
    ruleVersionId: doc.rule_version_id,
    uploadedByUserId: doc.uploaded_by_user_id,
    validatedByUserId: doc.validated_by_user_id,
    validatedAt: doc.validated_at,
    rejectionReason: doc.rejection_reason,
    rejectedByUserId: doc.rejected_by_user_id,
    rejectedAt: doc.rejected_at,
    overrideDuplicateReason: doc.override_duplicate_reason,
    heuristicDuplicateOfId: doc.heuristic_duplicate_of_id,
    quarantineStatus: doc.quarantine_status,
    retentionUntilDate: doc.retention_until_date,
    createdAt: doc.created_at,
    updatedAt: now,
  };
}

export function validateDocument(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  documentId: string;
  db?: DatabaseSync;
}): StoredDocument {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    db,
  });

  const doc = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(params.documentId, params.organizationId, params.dossierId) as any;

  if (!doc) {
    throw new Error(`Document introuvable : ${params.documentId}`);
  }

  validateDocumentWorkflowTransition(doc.workflow_status, "VALIDATED");

  const now = new Date().toISOString();
  const userId = params.session!.user.id;

  db.prepare(
    `UPDATE documents
     SET workflow_status = 'VALIDATED', validated_by_user_id = ?, validated_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(userId, now, now, params.documentId);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: "DOCUMENT_VALIDATED_BY_HUMAN",
      targetEntityType: "DOCUMENT",
      targetEntityId: params.documentId,
      metadata: {
        previousStatus: doc.workflow_status,
        validatedStatus: "VALIDATED",
      },
    },
    db
  );

  return {
    ...doc,
    workflowStatus: "VALIDATED",
    validatedByUserId: userId,
    validatedAt: now,
    updatedAt: now,
  };
}

export function rejectDocument(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  documentId: string;
  rejectionReason: string;
  db?: DatabaseSync;
}): StoredDocument {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    db,
  });

  if (!params.rejectionReason || params.rejectionReason.trim().length < 3) {
    throw new Error("Le motif de rejet est obligatoire et doit contenir au moins 3 caractères.");
  }

  const doc = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(params.documentId, params.organizationId, params.dossierId) as any;

  if (!doc) {
    throw new Error(`Document introuvable : ${params.documentId}`);
  }

  validateDocumentWorkflowTransition(doc.workflow_status, "REJECTED");

  const now = new Date().toISOString();
  const userId = params.session!.user.id;
  const reason = params.rejectionReason.trim();

  db.prepare(
    `UPDATE documents
     SET workflow_status = 'REJECTED', rejection_reason = ?, rejected_by_user_id = ?, rejected_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(reason, userId, now, now, params.documentId);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: "DOCUMENT_REJECTED_BY_HUMAN",
      targetEntityType: "DOCUMENT",
      targetEntityId: params.documentId,
      justification: reason,
      metadata: {
        previousStatus: doc.workflow_status,
        newStatus: "REJECTED",
        rejectionReason: reason,
      },
    },
    db
  );

  return {
    ...doc,
    workflowStatus: "REJECTED",
    rejectionReason: reason,
    rejectedByUserId: userId,
    rejectedAt: now,
    updatedAt: now,
  };
}

export function createDraftEntryFromDocument(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  documentId: string;
  db?: DatabaseSync;
}): {
  entry: any;
  lines: any[];
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    db,
  });

  const doc = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(params.documentId, params.organizationId, params.dossierId) as any;

  if (!doc) {
    throw new Error(`Document introuvable : ${params.documentId}`);
  }

  if (doc.workflow_status !== "VALIDATED") {
    throw new Error(
      `Le document doit être au statut VALIDATED pour générer une écriture (statut actuel : ${doc.workflow_status}).`
    );
  }

  // Empêche la génération répétée d'écritures pour une même pièce justificative sans action explicite
  const existingEntry = db
    .prepare(
      "SELECT id, piece_number, status FROM accounting_entries WHERE document_id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(doc.id, params.organizationId, params.dossierId) as any;

  if (existingEntry) {
    throw new Error(
      `Une écriture comptable (${existingEntry.piece_number} / ID: ${existingEntry.id}) a déjà été générée pour cette pièce justificative. Supprimez ou extournez l'écriture existante avant de régénérer un brouillon.`
    );
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(doc.extracted_data_json);
  } catch {
    parsed = {};
  }

  const ext = parsed.extraction || {};
  const isCustomer = doc.category === "CUSTOMER_INVOICE";
  const journalCode = isCustomer ? "VEN" : "ACH";

  const invoiceNumber = ext.invoiceNumber?.value || `DOC-${doc.id.slice(0, 8)}`;
  const entryDate = ext.invoiceDate?.value || new Date().toISOString().slice(0, 10);
  const thirdParty = ext.issuerName?.value || ext.recipientName?.value || "Tiers";
  const label = `${isCustomer ? "Facture client" : "Facture fournisseur"} ${thirdParty} - ${invoiceNumber}`;

  const grossMinor = Math.round(Number(ext.grossAmountMinor?.value) || 0);
  const vatMinor = Math.round(Number(ext.vatAmountMinor?.value) || 0);
  let netMinor = Math.round(Number(ext.netAmountMinor?.value) || 0);

  // Garantie stricte de l'égalité Débit === Crédit
  if (grossMinor > 0 && netMinor + vatMinor !== grossMinor) {
    netMinor = grossMinor - vatMinor;
  }

  const currency = ext.currency?.value || "EUR";
  const entryId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = params.session!.user.id;

  const lines: any[] = [];

  if (isCustomer) {
    // Vente : Débit Client 411000 (TTC)
    lines.push({
      id: crypto.randomUUID(),
      lineNumber: 1,
      generalAccountCode: "411000",
      label,
      debitMinor: grossMinor,
      creditMinor: 0,
    });

    // Crédit TVA Collectée 445710 si > 0
    if (vatMinor > 0) {
      lines.push({
        id: crypto.randomUUID(),
        lineNumber: 2,
        generalAccountCode: "445710",
        label: `TVA collectée - ${invoiceNumber}`,
        debitMinor: 0,
        creditMinor: vatMinor,
      });
    }

    // Crédit Vente 706000 (HT)
    lines.push({
      id: crypto.randomUUID(),
      lineNumber: lines.length + 1,
      generalAccountCode: "706000",
      label: `Prestations / Ventes - ${invoiceNumber}`,
      debitMinor: 0,
      creditMinor: netMinor,
    });
  } else {
    // Achat : Débit Charge 606000 ou compte suggéré (HT)
    const chargeAccount = ext.suggestedAccountCode?.value || "606000";
    lines.push({
      id: crypto.randomUUID(),
      lineNumber: 1,
      generalAccountCode: chargeAccount,
      label: `Achats / Charges - ${invoiceNumber}`,
      debitMinor: netMinor,
      creditMinor: 0,
    });

    // Débit TVA Déductible 445660 si > 0
    if (vatMinor > 0) {
      lines.push({
        id: crypto.randomUUID(),
        lineNumber: 2,
        generalAccountCode: "445660",
        label: `TVA déductible - ${invoiceNumber}`,
        debitMinor: vatMinor,
        creditMinor: 0,
      });
    }

    // Crédit Fournisseur 401000 (TTC)
    lines.push({
      id: crypto.randomUUID(),
      lineNumber: lines.length + 1,
      generalAccountCode: "401000",
      label,
      debitMinor: 0,
      creditMinor: grossMinor,
    });
  }

  const totalDebit = lines.reduce((acc, l) => acc + l.debitMinor, 0);
  const totalCredit = lines.reduce((acc, l) => acc + l.creditMinor, 0);

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Écriture déséquilibrée : total débit (${totalDebit}) !== total crédit (${totalCredit}).`
    );
  }

  // Insertion de l'écriture en statut STRICTEMENT DRAFT (brouillon)
  db.prepare(
    `INSERT INTO accounting_entries (
      id, organization_id, dossier_id, journal_code, entry_date,
      piece_number, label, status, currency, total_debit_minor, total_credit_minor,
      document_id, rule_version_id, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entryId,
    params.organizationId,
    params.dossierId,
    journalCode,
    entryDate,
    invoiceNumber,
    label,
    currency,
    totalDebit,
    totalCredit,
    doc.id,
    doc.rule_version_id,
    userId,
    now
  );

  // Insertion des lignes
  const insertLine = db.prepare(
    `INSERT INTO accounting_entry_lines (
      id, organization_id, dossier_id, entry_id, line_number,
      general_account_code, label, debit_minor, credit_minor,
      currency, currency_minor_unit_exponent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)`
  );

  for (const l of lines) {
    insertLine.run(
      l.id,
      params.organizationId,
      params.dossierId,
      entryId,
      l.lineNumber,
      l.generalAccountCode,
      l.label,
      l.debitMinor,
      l.creditMinor,
      currency,
      now
    );
  }

  // Traçabilité audit inaltérable
  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: "ACCOUNTING_DRAFT_ENTRY_GENERATED_FROM_DOCUMENT",
      targetEntityType: "ACCOUNTING_ENTRY",
      targetEntityId: entryId,
      metadata: {
        documentId: doc.id,
        journalCode,
        entryDate,
        pieceNumber: invoiceNumber,
        status: "DRAFT",
        totalDebit,
        totalCredit,
        linesCount: lines.length,
      },
    },
    db
  );

  return {
    entry: {
      id: entryId,
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      journalCode,
      entryDate,
      pieceNumber: invoiceNumber,
      label,
      status: "DRAFT",
      currency,
      totalDebitMinor: totalDebit,
      totalCreditMinor: totalCredit,
      documentId: doc.id,
      createdAt: now,
    },
    lines,
  };
}

export async function deleteDocument(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  documentId: string;
  db?: DatabaseSync;
}): Promise<{ deleted: boolean; documentId: string }> {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "EDIT_EXTRACTION",
    db,
  });

  const doc = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
    )
    .get(params.documentId, params.organizationId, params.dossierId) as any;

  if (!doc) {
    throw new Error(`Document introuvable : ${params.documentId}`);
  }

  // Vérifier qu'aucune écriture validée, extournée ou exportée n'y est rattachée
  const validatedEntry = db
    .prepare(
      "SELECT id FROM accounting_entries WHERE document_id = ? AND status IN ('VALIDATED', 'EXPORTED', 'REVERSED')"
    )
    .get(params.documentId) as { id: string } | undefined;

  if (validatedEntry) {
    throw new Error(
      "Impossible de supprimer un document rattaché à une écriture comptable validée, extournée ou exportée."
    );
  }

  // Dédier les écritures brouillons associées
  db.prepare(
    "UPDATE accounting_entries SET document_id = NULL WHERE document_id = ?"
  ).run(params.documentId);

  // Suppression du fichier du stockage privé
  try {
    await defaultDocumentStorage.deleteFile(doc.storage_key);
  } catch {
    // Si déjà supprimé ou fichier introuvable, on poursuit le nettoyage en base
  }

  db.prepare("DELETE FROM documents WHERE id = ?").run(params.documentId);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: "AUTHENTICATED_USER",
      action: "DOCUMENT_DELETED",
      targetEntityType: "DOCUMENT",
      targetEntityId: params.documentId,
      metadata: {
        filename: doc.original_filename,
        sha256Checksum: doc.sha256_checksum,
        previousStatus: doc.workflow_status,
      },
    },
    db
  );

  return { deleted: true, documentId: params.documentId };
}

export function getOrganizationDashboardMetrics(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): {
  organization: Organization;
  activeDossiersCount: number;
  membersCount: number;
  documentsPendingReviewCount: number;
  documentsValidatedCount: number;
  invoicesIssuedCount: number;
  invoicesReceivedCount: number;
  draftOrSuggestedEntriesCount: number;
  validatedEntriesCount: number;
  auditEventsCount: number;
} {
  const db = params.db ?? getDatabase();
  const org = getOrganizationById({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: params.platformAdminJustification,
    db,
  });

  const dossiersCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM client_dossiers WHERE organization_id = ? AND is_active = 1"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const membersCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM organization_memberships WHERE organization_id = ?"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const docsPending = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM documents WHERE organization_id = ? AND workflow_status != 'VALIDATED' AND workflow_status != 'EXPORTED'"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const docsValidated = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM documents WHERE organization_id = ? AND (workflow_status = 'VALIDATED' OR workflow_status = 'EXPORTED')"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const invIssued = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM invoices WHERE organization_id = ? AND direction = 'ISSUED'"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const invReceived = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM invoices WHERE organization_id = ? AND direction = 'RECEIVED'"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const entriesDraft = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM accounting_entries WHERE organization_id = ? AND status IN ('DRAFT', 'AI_SUGGESTION')"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const entriesValidated = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM accounting_entries WHERE organization_id = ? AND status IN ('VALIDATED', 'EXPORTED')"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  const auditCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM audit_logs WHERE organization_id = ?"
      )
      .get(params.organizationId) as { c: number }
  ).c;

  return {
    organization: org,
    activeDossiersCount: Number(dossiersCount),
    membersCount: Number(membersCount),
    documentsPendingReviewCount: Number(docsPending),
    documentsValidatedCount: Number(docsValidated),
    invoicesIssuedCount: Number(invIssued),
    invoicesReceivedCount: Number(invReceived),
    draftOrSuggestedEntriesCount: Number(entriesDraft),
    validatedEntriesCount: Number(entriesValidated),
    auditEventsCount: Number(auditCount),
  };
}
