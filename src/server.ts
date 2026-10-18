import http from "node:http";
import { URL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { appConfig } from "./config/app-config.js";
import { getDatabase, runMigrations } from "./db/database.js";
import { seedDemoData } from "./db/seed.js";
import {
  authenticateUser,
  resolveSessionByToken,
  revokeSession,
  assertOrganizationAccess,
  assertDossierAccess,
  AuthorizationError,
  verifySignedDocumentDownloadToken,
} from "./auth/auth-service.js";
import {
  listAccessibleOrganizations,
  createOrganization,
  getOrganizationDashboardMetrics,
  listOrganizationMembers,
  addMemberToOrganization,
  listDossiersForOrganization,
  createClientDossier,
  getClientDossierDetails,
  updateClientDossier,
  archiveOrRestoreClientDossier,
  assignUserToDossier,
  listDossierAssignments,
  initializeDossierAccountingReferential,
  listCountryConfigurations,
  getCountryConfigurationByCode,
  getCountryConfigurationByVersionId,
  ingestDocumentIntoDossier,
  listDossierDocuments,
  getDocumentDetails,
  updateDocumentExtraction,
  validateDocument,
  rejectDocument,
  createDraftEntryFromDocument,
  deleteDocument,
} from "./services/tenant-service.js";
import { defaultDocumentStorage } from "./services/file-security.js";
import {
  listAuditLogsForOrganization,
  verifyAuditChainIntegrity,
} from "./audit/audit-service.js";
import { runDeterministicSimulation } from "./rules/deterministic-engine.js";
import { renderAppHtml } from "./ui/app-view.js";
import { DossierStatus, OrganizationType, SystemRole, DocumentCategory } from "./domain/types.js";
import { CurrencyCode } from "./domain/money.js";

/**
 * Serveur HTTP et API RESTful sécurisée (Étape 0.4, 0.6, 0.7 & Extension Internationale).
 * - Limitation de débit (Rate Limiting) en mémoire par adresse IP avec purge des clés expirées et quota strict sur `/api/auth/login`.
 * - En-têtes de sécurité HTTP (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Content-Security-Policy).
 * - Support de la langue demandée (`?lang=ar|en|fr` ou `Accept-Language`) et des paramètres multi-juridictions.
 */

const DEFAULT_CSP_HEADER =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'";

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimitBucketsForTests(): void {
  rateLimitBuckets.clear();
}

export function getRateLimitBucketCountForTests(): number {
  return rateLimitBuckets.size;
}

export function evictExpiredRateLimitBuckets(now: number = Date.now()): void {
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (now > bucket.resetAt) {
      rateLimitBuckets.delete(key);
    }
  }
}

function checkRateLimit(
  key: string,
  maxRequestsPerWindow: number = 180,
  windowMs: number = 60_000
): boolean {
  const now = Date.now();
  evictExpiredRateLimitBuckets(now);
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxRequestsPerWindow;
}

export function resolveClientIp(
  req: http.IncomingMessage,
  trustProxy: boolean = appConfig.trustProxy
): string {
  const socketIp = req.socket?.remoteAddress || "127.0.0.1";
  if (!trustProxy) {
    return socketIp;
  }
  const xff = req.headers["x-forwarded-for"];
  const rawXff = Array.isArray(xff) ? xff[0] : xff;
  if (typeof rawXff === "string" && rawXff.trim().length > 0) {
    const firstIp = rawXff.split(",")[0]?.trim();
    if (firstIp && /^[0-9a-fA-F:.]{3,45}$/.test(firstIp)) {
      return firstIp;
    }
  }
  return socketIp;
}

async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes: number = 25 * 1024 * 1024
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        reject(
          new Error(
            `Corps de requête trop volumineux (max ${(maxBytes / (1024 * 1024)).toFixed(0)} Mo).`
          )
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8").trim();
        if (!raw) {
          resolve({});
          return;
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          reject(new Error("Le corps JSON doit être un objet."));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error("JSON invalide."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": DEFAULT_CSP_HEADER,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function extractBearerToken(req: http.IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

export interface AppServerOptions {
  maxRequestsPerMinute?: number;
  maxLoginRequestsPerMinute?: number;
  rateLimitWindowMs?: number;
  trustProxy?: boolean;
}

export function createAppServer(
  db: DatabaseSync = getDatabase(),
  options: AppServerOptions = {}
): http.Server {
  const maxRequestsPerMinute = options.maxRequestsPerMinute ?? 180;
  const maxLoginRequestsPerMinute = options.maxLoginRequestsPerMinute ?? 10;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? 60_000;
  const trustProxy = options.trustProxy ?? appConfig.trustProxy;

  return http.createServer(async (req, res) => {
    const ip = resolveClientIp(req, trustProxy);
    if (!checkRateLimit(`global:${ip}`, maxRequestsPerMinute, rateLimitWindowMs)) {
      sendJson(res, 429, { error: "Trop de requêtes. Veuillez réessayer dans une minute." });
      return;
    }

    const method = req.method || "GET";
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. Interface Web initiale avec prise en charge de la langue et de la direction RTL/LTR
      if (method === "GET" && pathname === "/") {
        const langParam =
          parsedUrl.searchParams.get("lang") ||
          req.headers["accept-language"]?.split(",")[0] ||
          "fr";
        const html = renderAppHtml(langParam);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Content-Security-Policy": DEFAULT_CSP_HEADER,
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }

      // 2. Endpoint de santé et configuration publique non sensible
      if (method === "GET" && pathname === "/api/health") {
        const integrity = verifyAuditChainIntegrity(db);
        sendJson(res, 200, {
          status: "ok",
          productName: appConfig.appName,
          tagline: appConfig.appTagline,
          environment: appConfig.nodeEnv,
          defaultCountry: appConfig.defaultCountryCode,
          auditChainIntact: integrity.valid,
          regulatoryDisclaimer: appConfig.regulatoryDisclaimer,
        });
        return;
      }

      // 3. Authentification : Connexion (avec limitation de débit spécifique anti-brute-force)
      if (method === "POST" && pathname === "/api/auth/login") {
        if (!checkRateLimit(`login:${ip}`, maxLoginRequestsPerMinute, rateLimitWindowMs)) {
          sendJson(res, 429, {
            error: "Trop de tentatives de connexion. Veuillez patienter une minute.",
          });
          return;
        }
        const body = await readJsonBody(req);
        const email = String(body.email || "");
        const password = String(body.password || "");
        const { rawToken, context } = authenticateUser(
          email,
          password,
          ip,
          req.headers["user-agent"] || null,
          db
        );
        sendJson(res, 200, {
          token: rawToken,
          session: context,
        });
        return;
      }

      const token = extractBearerToken(req);
      const session = resolveSessionByToken(token, db);
      const platformAdminJustification =
        (req.headers["x-platform-admin-justification"] as string | undefined) ?? null;

      if (method === "POST" && pathname === "/api/auth/logout") {
        if (token) {
          revokeSession(token, db);
        }
        sendJson(res, 200, { loggedOut: true });
        return;
      }

      if (method === "GET" && pathname === "/api/auth/me") {
        if (!session) {
          throw new AuthorizationError("Non authentifié.", 401);
        }
        const organizations = listAccessibleOrganizations(session, db);
        sendJson(res, 200, {
          session,
          organizations,
        });
        return;
      }

      // 4. Socle Multi-Pays & Multi-Juridictions
      if (method === "GET" && pathname === "/api/countries") {
        if (!session) {
          throw new AuthorizationError("Non authentifié.", 401);
        }
        const includeHistorical =
          parsedUrl.searchParams.get("includeHistorical") === "true";
        const countries = listCountryConfigurations(db, {
          includeHistoricalVersions: includeHistorical,
        });
        sendJson(res, 200, { countries });
        return;
      }

      // 5. Organisations (Tenants)
      if (method === "GET" && pathname === "/api/organizations") {
        const organizations = listAccessibleOrganizations(session, db);
        sendJson(res, 200, { organizations });
        return;
      }

      if (method === "POST" && pathname === "/api/organizations") {
        const body = await readJsonBody(req);
        const organization = createOrganization({
          session,
          name: String(body.name || ""),
          slug: String(body.slug || ""),
          organizationType: String(body.organizationType || "COMPANY") as OrganizationType,
          countryCode: String(body.countryCode || appConfig.defaultCountryCode),
          primaryTaxJurisdictionCode: body.primaryTaxJurisdictionCode
            ? String(body.primaryTaxJurisdictionCode)
            : undefined,
          operatingCountryCodes: Array.isArray(body.operatingCountryCodes)
            ? body.operatingCountryCodes.map(String)
            : undefined,
          defaultCurrency: body.defaultCurrency
            ? (String(body.defaultCurrency) as CurrencyCode)
            : undefined,
          defaultTimezone: body.defaultTimezone
            ? String(body.defaultTimezone)
            : undefined,
          defaultLocale: body.defaultLocale
            ? String(body.defaultLocale)
            : undefined,
          db,
        });
        sendJson(res, 201, { organization });
        return;
      }

      // Routes scopées par organisation : /api/organizations/:orgId/...
      const orgMatch = pathname.match(/^\/api\/organizations\/([^/]+)\/(.+)$/);
      if (orgMatch) {
        const orgId = decodeURIComponent(orgMatch[1]!);
        const subRoute = orgMatch[2]!;

        if (method === "GET" && subRoute === "dashboard") {
          const metrics = getOrganizationDashboardMetrics({
            session,
            organizationId: orgId,
            platformAdminJustification,
            db,
          });
          sendJson(res, 200, metrics);
          return;
        }

        if (method === "GET" && subRoute === "members") {
          const members = listOrganizationMembers({
            session,
            organizationId: orgId,
            platformAdminJustification,
            db,
          });
          sendJson(res, 200, { members });
          return;
        }

        if (method === "POST" && subRoute === "members") {
          const body = await readJsonBody(req);
          const created = addMemberToOrganization({
            session,
            organizationId: orgId,
            email: String(body.email || ""),
            fullName: String(body.fullName || ""),
            plainPassword: String(body.password || ""),
            role: String(body.role || "ACCOUNTANT_COLLABORATOR") as SystemRole,
            db,
          });
          sendJson(res, 201, created);
          return;
        }

        if (method === "GET" && subRoute === "dossiers") {
          const dossiers = listDossiersForOrganization({
            session,
            organizationId: orgId,
            platformAdminJustification,
            db,
          });
          sendJson(res, 200, { dossiers });
          return;
        }

        if (method === "POST" && subRoute === "dossiers") {
          const body = await readJsonBody(req);
          const establishCountry = String(
            body.countryCode || appConfig.defaultCountryCode
          );
          const taxJurisdiction = String(
            body.taxJurisdictionCode || establishCountry
          );
          const targetCountryCfg = getCountryConfigurationByCode(
            taxJurisdiction,
            db,
            body.effectiveDate ? String(body.effectiveDate) : undefined
          );
          const defaultRegime =
            targetCountryCfg.taxRegimes[0]?.code ??
            `${taxJurisdiction.toUpperCase()}_STANDARD_DRAFT`;

          const dossier = createClientDossier({
            session,
            organizationId: orgId,
            name: String(body.name || ""),
            code: String(body.code || ""),
            legalForm: body.legalForm ? String(body.legalForm) : undefined,
            legalRegistrationNumber: body.legalRegistrationNumber
              ? String(body.legalRegistrationNumber)
              : null,
            vatIntracommunityNumber: body.vatIntracommunityNumber
              ? String(body.vatIntracommunityNumber)
              : null,
            addressLine: body.addressLine ? String(body.addressLine) : null,
            postalCode: body.postalCode ? String(body.postalCode) : null,
            city: body.city ? String(body.city) : null,
            countryCode: establishCountry,
            taxJurisdictionCode: taxJurisdiction,
            taxResidenceCountryCode: body.taxResidenceCountryCode
              ? String(body.taxResidenceCountryCode)
              : undefined,
            operatingCountryCodes: Array.isArray(body.operatingCountryCodes)
              ? body.operatingCountryCodes.map(String)
              : undefined,
            currency: body.currency
              ? (String(body.currency) as CurrencyCode)
              : undefined,
            taxRegimeCode: body.taxRegimeCode
              ? String(body.taxRegimeCode)
              : defaultRegime,
            vatRegimeCode: body.vatRegimeCode
              ? String(body.vatRegimeCode)
              : undefined,
            fiscalYearStartMonth:
              body.fiscalYearStartMonth !== undefined
                ? Number(body.fiscalYearStartMonth)
                : undefined,
            fiscalYearStartDate: body.fiscalYearStartDate
              ? String(body.fiscalYearStartDate)
              : null,
            fiscalYearEndDate: body.fiscalYearEndDate
              ? String(body.fiscalYearEndDate)
              : null,
            dossierStatus: body.dossierStatus
              ? (String(body.dossierStatus) as DossierStatus)
              : undefined,
            activitySector: body.activitySector
              ? String(body.activitySector)
              : null,
            contactName: body.contactName ? String(body.contactName) : null,
            contactEmail: body.contactEmail ? String(body.contactEmail) : null,
            contactPhone: body.contactPhone ? String(body.contactPhone) : null,
            internalNotes: body.internalNotes
              ? String(body.internalNotes)
              : null,
            effectiveDate: body.effectiveDate
              ? String(body.effectiveDate)
              : undefined,
            platformAdminJustification,
            db,
          });
          sendJson(res, 201, { dossier });
          return;
        }

        // Routes scopées par dossier : /api/organizations/:orgId/dossiers/:dossierId(/...)
        const dossierSubMatch = subRoute.match(/^dossiers\/([^/]+)(?:\/(.+))?$/);
        if (dossierSubMatch) {
          const dossierId = decodeURIComponent(dossierSubMatch[1]!);
          const dossierAction = dossierSubMatch[2] || "";

          if (method === "GET" && dossierAction === "") {
            const details = getClientDossierDetails({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, details);
            return;
          }

          if (method === "PATCH" && dossierAction === "") {
            const body = await readJsonBody(req);
            const dossier = updateClientDossier({
              session,
              organizationId: orgId,
              dossierId,
              name: body.name !== undefined ? String(body.name) : undefined,
              legalForm:
                body.legalForm !== undefined ? String(body.legalForm) : undefined,
              legalRegistrationNumber:
                body.legalRegistrationNumber !== undefined
                  ? body.legalRegistrationNumber
                    ? String(body.legalRegistrationNumber)
                    : null
                  : undefined,
              vatIntracommunityNumber:
                body.vatIntracommunityNumber !== undefined
                  ? body.vatIntracommunityNumber
                    ? String(body.vatIntracommunityNumber)
                    : null
                  : undefined,
              addressLine:
                body.addressLine !== undefined
                  ? body.addressLine
                    ? String(body.addressLine)
                    : null
                  : undefined,
              postalCode:
                body.postalCode !== undefined
                  ? body.postalCode
                    ? String(body.postalCode)
                    : null
                  : undefined,
              city:
                body.city !== undefined
                  ? body.city
                    ? String(body.city)
                    : null
                  : undefined,
              taxRegimeCode:
                body.taxRegimeCode !== undefined
                  ? String(body.taxRegimeCode)
                  : undefined,
              vatRegimeCode:
                body.vatRegimeCode !== undefined
                  ? String(body.vatRegimeCode)
                  : undefined,
              fiscalYearStartMonth:
                body.fiscalYearStartMonth !== undefined
                  ? Number(body.fiscalYearStartMonth)
                  : undefined,
              fiscalYearStartDate:
                body.fiscalYearStartDate !== undefined
                  ? body.fiscalYearStartDate
                    ? String(body.fiscalYearStartDate)
                    : null
                  : undefined,
              fiscalYearEndDate:
                body.fiscalYearEndDate !== undefined
                  ? body.fiscalYearEndDate
                    ? String(body.fiscalYearEndDate)
                    : null
                  : undefined,
              dossierStatus:
                body.dossierStatus !== undefined
                  ? (String(body.dossierStatus) as Exclude<DossierStatus, "ARCHIVED">)
                  : undefined,
              activitySector:
                body.activitySector !== undefined
                  ? body.activitySector
                    ? String(body.activitySector)
                    : null
                  : undefined,
              contactName:
                body.contactName !== undefined
                  ? body.contactName
                    ? String(body.contactName)
                    : null
                  : undefined,
              contactEmail:
                body.contactEmail !== undefined
                  ? body.contactEmail
                    ? String(body.contactEmail)
                    : null
                  : undefined,
              contactPhone:
                body.contactPhone !== undefined
                  ? body.contactPhone
                    ? String(body.contactPhone)
                    : null
                  : undefined,
              internalNotes:
                body.internalNotes !== undefined
                  ? body.internalNotes
                    ? String(body.internalNotes)
                    : null
                  : undefined,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { dossier });
            return;
          }

          if (method === "POST" && dossierAction === "archive") {
            const body = await readJsonBody(req);
            const archive = body.archive !== undefined ? Boolean(body.archive) : true;
            const reason = String(body.reason || "");
            const dossier = archiveOrRestoreClientDossier({
              session,
              organizationId: orgId,
              dossierId,
              archive,
              reason,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { dossier });
            return;
          }

          if (method === "GET" && dossierAction === "assignments") {
            const assignments = listDossierAssignments({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { assignments });
            return;
          }

          if (method === "POST" && dossierAction === "assignments") {
            const body = await readJsonBody(req);
            assignUserToDossier({
              session,
              organizationId: orgId,
              dossierId,
              targetUserId: String(body.targetUserId || ""),
              canView: body.canView !== undefined ? Boolean(body.canView) : true,
              canUpload: Boolean(body.canUpload),
              canEditExtraction: Boolean(body.canEditExtraction),
              canValidateAccounting: Boolean(body.canValidateAccounting),
              canExport: Boolean(body.canExport),
              platformAdminJustification,
              db,
            });
            const assignments = listDossierAssignments({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { assignments });
            return;
          }

          if (method === "POST" && dossierAction === "init-referential") {
            assertDossierAccess({
              session,
              organizationId: orgId,
              dossierId,
              permission: "VALIDATE_ACCOUNTING",
              platformAdminJustification,
              db,
            });
            const result = initializeDossierAccountingReferential({
              organizationId: orgId,
              dossierId,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // --- Module 3 : Collecte et Gestion Documentaire (Lot 1.2) ---
          if (method === "GET" && dossierAction === "documents") {
            const category = parsedUrl.searchParams.get("category") || undefined;
            const status = parsedUrl.searchParams.get("status") || undefined;
            const search = parsedUrl.searchParams.get("q") || undefined;
            const limit = parsedUrl.searchParams.get("limit")
              ? Number(parsedUrl.searchParams.get("limit"))
              : undefined;
            const offset = parsedUrl.searchParams.get("offset")
              ? Number(parsedUrl.searchParams.get("offset"))
              : undefined;

            const result = listDossierDocuments({
              session,
              organizationId: orgId,
              dossierId,
              category,
              workflowStatus: status,
              searchQuery: search,
              limit,
              offset,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          if (method === "POST" && dossierAction === "documents") {
            const body = await readJsonBody(req, 25 * 1024 * 1024);
            const filename = String(body.filename || "document.pdf");
            const mimeType = String(body.mimeType || "application/pdf");
            let buffer: Buffer;

            if (typeof body.contentBase64 === "string") {
              buffer = Buffer.from(body.contentBase64, "base64");
            } else if (typeof body.contentUtf8 === "string") {
              buffer = Buffer.from(body.contentUtf8, "utf-8");
            } else {
              throw new Error(
                "Contenu du document manquant (attendu: contentBase64 ou contentUtf8)."
              );
            }

            const allowOverride = Boolean(body.allowDuplicateOverride);
            const overrideReason = body.overrideReason
              ? String(body.overrideReason)
              : undefined;
            const category = body.category
              ? (String(body.category) as DocumentCategory)
              : undefined;

            const result = await ingestDocumentIntoDossier({
              session,
              organizationId: orgId,
              dossierId,
              originalFilename: filename,
              mimeType,
              contentBuffer: buffer,
              category,
              allowDuplicateOverride: allowOverride,
              overrideReason,
              db,
            });

            sendJson(res, 201, result as unknown as Record<string, unknown>);
            return;
          }

          // Téléchargement sécurisé : GET /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/download
          const docDownloadMatch = dossierAction.match(/^documents\/([^/]+)\/download$/);
          if (method === "GET" && docDownloadMatch) {
            const docId = decodeURIComponent(docDownloadMatch[1]!);
            const token = parsedUrl.searchParams.get("token");

            let authorized = false;
            if (token) {
              const verified = verifySignedDocumentDownloadToken(token);
              if (
                verified.valid &&
                verified.organizationId === orgId &&
                verified.dossierId === dossierId &&
                verified.documentId === docId
              ) {
                authorized = true;
              }
            }

            if (!authorized) {
              assertDossierAccess({
                session,
                organizationId: orgId,
                dossierId,
                permission: "VIEW",
                db,
              });
            }

            const docRow = db
              .prepare(
                "SELECT * FROM documents WHERE id = ? AND organization_id = ? AND dossier_id = ?"
              )
              .get(docId, orgId, dossierId) as any;

            if (!docRow) {
              sendJson(res, 404, { error: "Document introuvable." });
              return;
            }

            const fileBuffer = await defaultDocumentStorage.readFile(docRow.storage_key);

            res.writeHead(200, {
              "Content-Type": docRow.mime_type,
              "Content-Length": fileBuffer.byteLength,
              "Content-Disposition": `attachment; filename="${encodeURIComponent(docRow.original_filename)}"`,
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": "private, no-cache, no-store",
            });
            res.end(fileBuffer);
            return;
          }

          // Correction d'extraction : PATCH /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/extraction
          const docExtractionMatch = dossierAction.match(/^documents\/([^/]+)\/extraction$/);
          if (method === "PATCH" && docExtractionMatch) {
            const docId = decodeURIComponent(docExtractionMatch[1]!);
            const body = await readJsonBody(req);
            const fields = (body.fields as any) || body;
            const updated = updateDocumentExtraction({
              session,
              organizationId: orgId,
              dossierId,
              documentId: docId,
              fields,
              db,
            });
            sendJson(res, 200, { document: updated });
            return;
          }

          // Validation humaine : POST /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/validate
          const docValidateMatch = dossierAction.match(/^documents\/([^/]+)\/validate$/);
          if (method === "POST" && docValidateMatch) {
            const docId = decodeURIComponent(docValidateMatch[1]!);
            const validated = validateDocument({
              session,
              organizationId: orgId,
              dossierId,
              documentId: docId,
              db,
            });
            sendJson(res, 200, { document: validated });
            return;
          }

          // Rejet humain avec motif obligatoire : POST /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/reject
          const docRejectMatch = dossierAction.match(/^documents\/([^/]+)\/reject$/);
          if (method === "POST" && docRejectMatch) {
            const docId = decodeURIComponent(docRejectMatch[1]!);
            const body = await readJsonBody(req);
            const rejectionReason = String(body.reason || body.rejectionReason || "");
            const rejected = rejectDocument({
              session,
              organizationId: orgId,
              dossierId,
              documentId: docId,
              rejectionReason,
              db,
            });
            sendJson(res, 200, { document: rejected });
            return;
          }

          // Génération d'écriture comptable brouillon : POST /api/organizations/:orgId/dossiers/:dossierId/documents/:docId/create-draft-entry
          const docDraftEntryMatch = dossierAction.match(
            /^documents\/([^/]+)\/create-draft-entry$/
          );
          if (method === "POST" && docDraftEntryMatch) {
            const docId = decodeURIComponent(docDraftEntryMatch[1]!);
            const created = createDraftEntryFromDocument({
              session,
              organizationId: orgId,
              dossierId,
              documentId: docId,
              db,
            });
            sendJson(res, 201, created);
            return;
          }

          // Détail d'un document : GET /api/organizations/:orgId/dossiers/:dossierId/documents/:docId
          const docDetailMatch = dossierAction.match(/^documents\/([^/]+)$/);
          if (method === "GET" && docDetailMatch) {
            const docId = decodeURIComponent(docDetailMatch[1]!);
            const details = getDocumentDetails({
              session,
              organizationId: orgId,
              dossierId,
              documentId: docId,
              db,
            });
            sendJson(res, 200, details);
            return;
          }

          // Suppression d'un document : DELETE /api/organizations/:orgId/dossiers/:dossierId/documents/:docId
          if (method === "DELETE" && docDetailMatch) {
            const docId = decodeURIComponent(docDetailMatch[1]!);
            const deleted = await deleteDocument({
              session,
              organizationId: orgId,
              dossierId,
              documentId: docId,
              db,
            });
            sendJson(res, 200, deleted);
            return;
          }
        }

        if (method === "GET" && subRoute === "audit-logs") {
          assertOrganizationAccess({
            session,
            organizationId: orgId,
            allowedRoles: ["FIRM_ADMIN", "CLIENT_DIRECTOR"],
            platformAdminJustification,
            db,
          });
          const logs = listAuditLogsForOrganization(orgId, 50, db);
          const chainIntegrity = verifyAuditChainIntegrity(db);
          sendJson(res, 200, { logs, chainIntegrity });
          return;
        }

        if (method === "POST" && subRoute === "simulate") {
          getOrganizationDashboardMetrics({
            session,
            organizationId: orgId,
            platformAdminJustification,
            db,
          });
          const body = await readJsonBody(req);
          const effectiveDate = body.effectiveDate
            ? String(body.effectiveDate)
            : undefined;
          const countryCfg = body.ruleVersionId
            ? getCountryConfigurationByVersionId(String(body.ruleVersionId), db)
            : getCountryConfigurationByCode(
                String(body.countryCode || appConfig.defaultCountryCode),
                db,
                effectiveDate
              );
          const simulation = runDeterministicSimulation({
            simulationType:
              body.simulationType === "SOCIAL_CONTRIBUTIONS"
                ? "SOCIAL_CONTRIBUTIONS"
                : "VAT_SUMMARY",
            countryConfig: countryCfg,
            revenueNetMinor: Number(body.revenueNetMinor || 0),
            expensesNetMinor: Number(body.expensesNetMinor || 0),
            vatRateBps:
              body.vatRateBps !== undefined ? Number(body.vatRateBps) : undefined,
            taxRegimeCode: body.taxRegimeCode
              ? String(body.taxRegimeCode)
              : undefined,
            effectiveDate,
          });
          sendJson(res, 200, { simulation });
          return;
        }
      }

      sendJson(res, 404, { error: `Route introuvable : ${method} ${pathname}` });
    } catch (err) {
      if (err instanceof AuthorizationError) {
        sendJson(res, err.statusCode, { error: err.message });
        return;
      }
      const rawMessage =
        err instanceof Error ? err.message : "Erreur interne du serveur.";
      const isInternalDbError =
        /SQLITE_|syntax error|near "|constraint failed|no such table|no such column|has no column|database is locked/i.test(
          rawMessage
        );
      if (isInternalDbError) {
        sendJson(res, 400, {
          error: "Requête invalide ou contrainte d'intégrité non respectée.",
        });
        return;
      }
      const isNotFound = /introuvable/i.test(rawMessage);
      sendJson(res, isNotFound ? 404 : 400, { error: rawMessage });
    }
  });
}

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server.ts"));

if (isMainModule) {
  const db = getDatabase();
  runMigrations(db);
  seedDemoData(db);
  const server = createAppServer(db);
  server.listen(appConfig.port, appConfig.host, () => {
    console.log(
      `[${appConfig.appName}] Serveur démarré sur http://${appConfig.host}:${appConfig.port} (env=${appConfig.nodeEnv}, pays_defaut=${appConfig.defaultCountryCode})`
    );
  });
}
