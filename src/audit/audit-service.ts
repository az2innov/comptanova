import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import { AuditLogEntry } from "../domain/types.js";

/**
 * Service de piste d'audit avec chaînage de hachage SHA-256 (Sections 3, 5.8, 7 & 8).
 * - Chaque événement journalisé calcule une empreinte SHA-256 incluant l'empreinte de l'événement précédent (`previous_hash`),
 *   permettant de détecter toute altération ou suppression a posteriori.
 * - Tout accès d'un `PLATFORM_ADMIN` aux données d'une organisation cliente exige une justification non vide et est tracé.
 */

export interface RecordAuditParams {
  organizationId?: string | null;
  dossierId?: string | null;
  actorUserId?: string | null;
  actorRole: string;
  action: string;
  targetEntityType: string;
  targetEntityId?: string | null;
  justification?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

function computeAuditHash(payload: {
  id: string;
  organizationId: string | null;
  dossierId: string | null;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  targetEntityType: string;
  targetEntityId: string | null;
  justification: string | null;
  metadataJson: string;
  previousHash: string | null;
  createdAt: string;
}): string {
  const canonical = [
    payload.id,
    payload.organizationId ?? "",
    payload.dossierId ?? "",
    payload.actorUserId ?? "",
    payload.actorRole,
    payload.action,
    payload.targetEntityType,
    payload.targetEntityId ?? "",
    payload.justification ?? "",
    payload.metadataJson,
    payload.previousHash ?? "GENESIS",
    payload.createdAt,
  ].join("|");

  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function recordAuditLog(
  params: RecordAuditParams,
  db: DatabaseSync = getDatabase()
): AuditLogEntry {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const metadataJson = JSON.stringify(params.metadata ?? {});

  const lastRow = db
    .prepare(
      "SELECT integrity_hash FROM audit_logs ORDER BY rowid DESC LIMIT 1"
    )
    .get() as { integrity_hash: string } | undefined;

  const previousHash = lastRow?.integrity_hash ?? null;

  const entryBase = {
    id,
    organizationId: params.organizationId ?? null,
    dossierId: params.dossierId ?? null,
    actorUserId: params.actorUserId ?? null,
    actorRole: params.actorRole,
    action: params.action,
    targetEntityType: params.targetEntityType,
    targetEntityId: params.targetEntityId ?? null,
    justification: params.justification ?? null,
    metadataJson,
    ipAddress: params.ipAddress ?? null,
    previousHash,
    createdAt,
  };

  const integrityHash = computeAuditHash(entryBase);

  db.prepare(
    `INSERT INTO audit_logs (
      id, organization_id, dossier_id, actor_user_id, actor_role, action,
      target_entity_type, target_entity_id, justification, metadata_json,
      ip_address, previous_hash, integrity_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entryBase.id,
    entryBase.organizationId,
    entryBase.dossierId,
    entryBase.actorUserId,
    entryBase.actorRole,
    entryBase.action,
    entryBase.targetEntityType,
    entryBase.targetEntityId,
    entryBase.justification,
    entryBase.metadataJson,
    entryBase.ipAddress,
    entryBase.previousHash,
    integrityHash,
    entryBase.createdAt
  );

  return {
    ...entryBase,
    integrityHash,
  };
}

/**
 * Vérifie l'intégrité cryptographique de toute la chaîne d'audit en base.
 */
export function verifyAuditChainIntegrity(
  db: DatabaseSync = getDatabase()
): { valid: boolean; checkedCount: number; brokenAtAuditId: string | null } {
  const rows = db
    .prepare("SELECT * FROM audit_logs ORDER BY rowid ASC")
    .all() as Array<Record<string, unknown>>;

  let expectedPreviousHash: string | null = null;
  for (const row of rows) {
    const id = String(row.id);
    const prevHash = (row.previous_hash as string | null) ?? null;
    if (prevHash !== expectedPreviousHash) {
      return {
        valid: false,
        checkedCount: rows.length,
        brokenAtAuditId: id,
      };
    }

    const recomputed = computeAuditHash({
      id,
      organizationId: (row.organization_id as string | null) ?? null,
      dossierId: (row.dossier_id as string | null) ?? null,
      actorUserId: (row.actor_user_id as string | null) ?? null,
      actorRole: String(row.actor_role),
      action: String(row.action),
      targetEntityType: String(row.target_entity_type),
      targetEntityId: (row.target_entity_id as string | null) ?? null,
      justification: (row.justification as string | null) ?? null,
      metadataJson: String(row.metadata_json),
      previousHash: prevHash,
      createdAt: String(row.created_at),
    });

    if (recomputed !== row.integrity_hash) {
      return {
        valid: false,
        checkedCount: rows.length,
        brokenAtAuditId: id,
      };
    }

    expectedPreviousHash = recomputed;
  }

  return {
    valid: true,
    checkedCount: rows.length,
    brokenAtAuditId: null,
  };
}

export function listAuditLogsForOrganization(
  organizationId: string,
  limit: number = 50,
  db: DatabaseSync = getDatabase()
): AuditLogEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM audit_logs
       WHERE organization_id = ?
       ORDER BY rowid DESC
       LIMIT ?`
    )
    .all(organizationId, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    organizationId: (row.organization_id as string | null) ?? null,
    dossierId: (row.dossier_id as string | null) ?? null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorRole: String(row.actor_role),
    action: String(row.action),
    targetEntityType: String(row.target_entity_type),
    targetEntityId: (row.target_entity_id as string | null) ?? null,
    justification: (row.justification as string | null) ?? null,
    metadataJson: String(row.metadata_json),
    ipAddress: (row.ip_address as string | null) ?? null,
    previousHash: (row.previous_hash as string | null) ?? null,
    integrityHash: String(row.integrity_hash),
    createdAt: String(row.created_at),
  }));
}
