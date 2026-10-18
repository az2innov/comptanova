import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import { SystemRole, User, OrganizationMembership } from "../domain/types.js";
import { appConfig } from "../config/app-config.js";
import { recordAuditLog } from "../audit/audit-service.js";

/**
 * Authentification, gestion des sessions et contrôle d'accès côté serveur (RBAC & Isolation Multi-Tenant).
 * - Hachage de mot de passe robuste via `crypto.scryptSync` avec sel aléatoire de 16 octets et comparaison en temps constant (`timingSafeEqual`).
 * - Jetons de session opaques hachés en SHA-256 en base (`auth_sessions`).
 * - Vérification stricte des permissions par organisation ET par dossier côté serveur.
 * - Tout accès d'un `PLATFORM_ADMIN` aux données comptables d'un client exige une justification explicite et génère une trace d'audit.
 */

export class AuthorizationError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export function hashPassword(plainPassword: string): string {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = parts[1]!;
  const expectedHex = parts[2]!;
  const derivedBuffer = crypto.scryptSync(plainPassword, salt, 64);
  const expectedBuffer = Buffer.from(expectedHex, "hex");
  if (derivedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuffer, expectedBuffer);
}

export function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", appConfig.sessionSecret)
    .update(rawToken)
    .digest("hex");
}

export interface AuthenticatedSessionContext {
  sessionId: string;
  user: Omit<User, "passwordHash">;
  activeOrganizationId: string | null;
  memberships: OrganizationMembership[];
}

export function authenticateUser(
  email: string,
  plainPassword: string,
  ipAddress: string | null = null,
  userAgent: string | null = null,
  db: DatabaseSync = getDatabase()
): { rawToken: string; context: AuthenticatedSessionContext } {
  const normalizedEmail = email.trim().toLowerCase();
  const row = db
    .prepare("SELECT * FROM users WHERE LOWER(email) = ? AND is_active = 1")
    .get(normalizedEmail) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(plainPassword, String(row.password_hash))) {
    recordAuditLog(
      {
        actorRole: "ANONYMOUS",
        action: "AUTH_LOGIN_FAILED",
        targetEntityType: "USER",
        metadata: { email: normalizedEmail },
        ipAddress,
      },
      db
    );
    throw new AuthorizationError("Identifiants invalides ou compte inactif.", 401);
  }

  const userId = String(row.id);
  const memberships = getMembershipsForUser(userId, db);
  const defaultOrgId = memberships[0]?.organizationId ?? null;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + appConfig.sessionTtlHours * 3600 * 1000
  ).toISOString();

  db.prepare(
    `INSERT INTO auth_sessions (
      id, token_hash, user_id, active_organization_id, ip_address, user_agent, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    tokenHash,
    userId,
    defaultOrgId,
    ipAddress,
    userAgent,
    expiresAt,
    now.toISOString()
  );

  recordAuditLog(
    {
      organizationId: defaultOrgId,
      actorUserId: userId,
      actorRole:
        Number(row.is_platform_admin) === 1
          ? "PLATFORM_ADMIN"
          : memberships[0]?.role ?? "AUTHENTICATED",
      action: "AUTH_LOGIN_SUCCESS",
      targetEntityType: "SESSION",
      targetEntityId: sessionId,
      ipAddress,
    },
    db
  );

  return {
    rawToken,
    context: {
      sessionId,
      user: {
        id: userId,
        email: String(row.email),
        fullName: String(row.full_name),
        isPlatformAdmin: Number(row.is_platform_admin) === 1,
        isActive: Number(row.is_active) === 1,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      },
      activeOrganizationId: defaultOrgId,
      memberships,
    },
  };
}

export function getMembershipsForUser(
  userId: string,
  db: DatabaseSync = getDatabase()
): OrganizationMembership[] {
  const rows = db
    .prepare("SELECT * FROM organization_memberships WHERE user_id = ?")
    .all(userId) as Array<Record<string, unknown>>;

  return rows.map((m) => ({
    id: String(m.id),
    organizationId: String(m.organization_id),
    userId: String(m.user_id),
    role: String(m.role) as SystemRole,
    createdAt: String(m.created_at),
  }));
}

export function resolveSessionByToken(
  rawToken: string | undefined | null,
  db: DatabaseSync = getDatabase()
): AuthenticatedSessionContext | null {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const nowIso = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT
        s.id AS session_id,
        s.active_organization_id,
        s.expires_at,
        s.revoked_at,
        u.id AS user_id,
        u.email,
        u.full_name,
        u.is_platform_admin,
        u.is_active,
        u.created_at,
        u.updated_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!row) return null;
  if (row.revoked_at !== null && row.revoked_at !== undefined) return null;
  if (String(row.expires_at) <= nowIso) return null;
  if (Number(row.is_active) !== 1) return null;

  const userId = String(row.user_id);
  const memberships = getMembershipsForUser(userId, db);

  return {
    sessionId: String(row.session_id),
    user: {
      id: userId,
      email: String(row.email),
      fullName: String(row.full_name),
      isPlatformAdmin: Number(row.is_platform_admin) === 1,
      isActive: true,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    },
    activeOrganizationId: (row.active_organization_id as string | null) ?? null,
    memberships,
  };
}

export function revokeSession(
  rawToken: string,
  db: DatabaseSync = getDatabase()
): void {
  const tokenHash = hashSessionToken(rawToken);
  db.prepare(
    "UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?"
  ).run(new Date().toISOString(), tokenHash);
}

/**
 * Contrôle d'accès serveur obligatoire pour toute opération au niveau d'une organisation (tenant).
 * Garantit qu'aucun utilisateur ne peut jamais lire ou écrire dans une autre organisation.
 * Si l'utilisateur est `PLATFORM_ADMIN` mais non membre direct, l'accès aux données comptables
 * exige une justification explicite qui est tracée dans le journal d'audit.
 */
export function assertOrganizationAccess(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  allowedRoles?: SystemRole[];
  platformAdminJustification?: string | null;
  actionDescription?: string;
  db?: DatabaseSync;
}): { effectiveRole: SystemRole } {
  const db = params.db ?? getDatabase();
  if (!params.session) {
    throw new AuthorizationError("Authentification requise.", 401);
  }

  const membership = params.session.memberships.find(
    (m) => m.organizationId === params.organizationId
  );

  if (membership) {
    if (
      params.allowedRoles &&
      params.allowedRoles.length > 0 &&
      !params.allowedRoles.includes(membership.role)
    ) {
      recordAuditLog(
        {
          organizationId: params.organizationId,
          actorUserId: params.session.user.id,
          actorRole: membership.role,
          action: "ACCESS_DENIED_INSUFFICIENT_ROLE",
          targetEntityType: "ORGANIZATION",
          targetEntityId: params.organizationId,
          metadata: {
            requiredRoles: params.allowedRoles,
            attemptedAction: params.actionDescription ?? "UNSPECIFIED",
          },
        },
        db
      );
      throw new AuthorizationError(
        `Accès refusé : votre rôle (${membership.role}) ne permet pas cette action.`,
        403
      );
    }
    return { effectiveRole: membership.role };
  }

  // Cas particulier : Administrateur de la plateforme (Section 3 : "L'accès aux données comptables des clients doit être limité, justifié et tracé.")
  if (params.session.user.isPlatformAdmin) {
    const justification = params.platformAdminJustification?.trim() ?? "";
    if (justification.length < 10) {
      recordAuditLog(
        {
          organizationId: params.organizationId,
          actorUserId: params.session.user.id,
          actorRole: "PLATFORM_ADMIN",
          action: "PLATFORM_ADMIN_UNJUSTIFIED_ACCESS_BLOCKED",
          targetEntityType: "ORGANIZATION",
          targetEntityId: params.organizationId,
        },
        db
      );
      throw new AuthorizationError(
        "Accès refusé : un administrateur de plateforme doit fournir une justification explicite (min. 10 caractères) pour accéder aux données d'une organisation cliente.",
        403
      );
    }

    recordAuditLog(
      {
        organizationId: params.organizationId,
        actorUserId: params.session.user.id,
        actorRole: "PLATFORM_ADMIN",
        action: "PLATFORM_ADMIN_JUSTIFIED_TENANT_ACCESS",
        targetEntityType: "ORGANIZATION",
        targetEntityId: params.organizationId,
        justification,
        metadata: { actionDescription: params.actionDescription ?? "READ" },
      },
      db
    );

    return { effectiveRole: "PLATFORM_ADMIN" };
  }

  // Tentative d'accès inter-tenant illégitime : bloquée et journalisée !
  recordAuditLog(
    {
      organizationId: params.organizationId,
      actorUserId: params.session.user.id,
      actorRole: "UNAUTHORIZED_CROSS_TENANT_USER",
      action: "CROSS_TENANT_ACCESS_BLOCKED",
      targetEntityType: "ORGANIZATION",
      targetEntityId: params.organizationId,
      metadata: {
        userOrganizations: params.session.memberships.map((m) => m.organizationId),
      },
    },
    db
  );

  throw new AuthorizationError(
    "Violation d'isolation multi-tenant : vous n'avez aucun droit d'accès sur cette organisation.",
    403
  );
}

export type DossierPermissionType =
  | "VIEW"
  | "UPLOAD"
  | "EDIT_EXTRACTION"
  | "VALIDATE_ACCOUNTING"
  | "EXPORT";

/**
 * Contrôle d'accès serveur par dossier client (Section 3).
 * - Vérifie d'abord que le dossier appartient bien à l'organisation spécifiée (empêche les attaques IDOR croisées).
 * - Les `FIRM_ADMIN` de l'organisation ont accès à tous les dossiers de leur organisation.
 * - Les `ACCOUNTANT_COLLABORATOR` et `CLIENT_DIRECTOR` doivent disposer d'une affectation explicite au dossier (`dossier_assignments`) avec la permission requise.
 */
export function assertDossierAccess(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  permission: DossierPermissionType;
  platformAdminJustification?: string | null;
  db?: DatabaseSync;
}): void {
  const db = params.db ?? getDatabase();

  const { effectiveRole } = assertOrganizationAccess({
    session: params.session,
    organizationId: params.organizationId,
    platformAdminJustification: params.platformAdminJustification,
    actionDescription: `DOSSIER_${params.permission}`,
    db,
  });

  // Vérifier que le dossier appartient bien à cette organisation
  const dossierRow = db
    .prepare(
      "SELECT id, organization_id FROM client_dossiers WHERE id = ? AND organization_id = ?"
    )
    .get(params.dossierId, params.organizationId) as
    | { id: string; organization_id: string }
    | undefined;

  if (!dossierRow) {
    throw new AuthorizationError(
      "Dossier introuvable dans cette organisation (isolation multi-tenant).",
      404
    );
  }

  // FIRM_ADMIN et PLATFORM_ADMIN (avec justification déjà vérifiée) ont les droits complets sur les dossiers de l'organisation
  if (effectiveRole === "FIRM_ADMIN" || effectiveRole === "PLATFORM_ADMIN") {
    return;
  }

  // Sinon, vérifier l'affectation explicite dans `dossier_assignments`
  const userId = params.session!.user.id;
  const assignment = db
    .prepare(
      `SELECT * FROM dossier_assignments
       WHERE organization_id = ? AND dossier_id = ? AND user_id = ?`
    )
    .get(params.organizationId, params.dossierId, userId) as
    | Record<string, unknown>
    | undefined;

  if (!assignment) {
    recordAuditLog(
      {
        organizationId: params.organizationId,
        dossierId: params.dossierId,
        actorUserId: userId,
        actorRole: effectiveRole,
        action: "DOSSIER_ACCESS_DENIED_UNASSIGNED",
        targetEntityType: "CLIENT_DOSSIER",
        targetEntityId: params.dossierId,
      },
      db
    );
    throw new AuthorizationError(
      "Accès refusé : ce dossier client ne vous est pas affecté.",
      403
    );
  }

  const permissionMap: Record<DossierPermissionType, string> = {
    VIEW: "can_view",
    UPLOAD: "can_upload",
    EDIT_EXTRACTION: "can_edit_extraction",
    VALIDATE_ACCOUNTING: "can_validate_accounting",
    EXPORT: "can_export",
  };

  const col = permissionMap[params.permission];
  if (Number(assignment[col]) !== 1) {
    recordAuditLog(
      {
        organizationId: params.organizationId,
        dossierId: params.dossierId,
        actorUserId: userId,
        actorRole: effectiveRole,
        action: `DOSSIER_PERMISSION_DENIED_${params.permission}`,
        targetEntityType: "CLIENT_DOSSIER",
        targetEntityId: params.dossierId,
      },
      db
    );
    throw new AuthorizationError(
      `Accès refusé : vous ne disposez pas de la permission "${params.permission}" sur ce dossier.`,
      403
    );
  }
}

/**
 * Génère et vérifie des liens temporaires signés par HMAC-SHA256 pour le téléchargement privé de documents (Section 8.1).
 */
export function generateSignedDocumentDownloadToken(params: {
  organizationId: string;
  dossierId: string;
  documentId: string;
  userId: string;
  ttlSeconds?: number;
}): { token: string; expiresAtUnix: number } {
  const ttl = params.ttlSeconds ?? appConfig.signedUrlTtlSeconds;
  const expiresAtUnix = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${params.organizationId}:${params.dossierId}:${params.documentId}:${params.userId}:${expiresAtUnix}`;
  const sig = crypto
    .createHmac("sha256", appConfig.signedUrlSecret)
    .update(payload)
    .digest("hex");
  const token = Buffer.from(`${payload}:${sig}`, "utf-8").toString("base64url");
  return { token, expiresAtUnix };
}

export function verifySignedDocumentDownloadToken(token: string): {
  valid: boolean;
  organizationId?: string;
  dossierId?: string;
  documentId?: string;
  userId?: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 6) return { valid: false };
    const [organizationId, dossierId, documentId, userId, expiresStr, providedSig] =
      parts as [string, string, string, string, string, string];
    const expiresAtUnix = Number.parseInt(expiresStr, 10);
    if (
      !Number.isFinite(expiresAtUnix) ||
      Math.floor(Date.now() / 1000) > expiresAtUnix
    ) {
      return { valid: false };
    }
    const payload = `${organizationId}:${dossierId}:${documentId}:${userId}:${expiresAtUnix}`;
    const expectedSig = crypto
      .createHmac("sha256", appConfig.signedUrlSecret)
      .update(payload)
      .digest("hex");
    const a = Buffer.from(providedSig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false };
    }
    return { valid: true, organizationId, dossierId, documentId, userId };
  } catch {
    return { valid: false };
  }
}
