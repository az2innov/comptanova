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
import {
  createQuote,
  getQuoteDetails,
  listQuotesForDossier,
  convertQuoteToInvoice,
  createSalesInvoice,
  finalizeSalesInvoice,
  createCreditNoteForInvoice,
  recordInvoicePayment,
  getSalesInvoiceDetails,
  listSalesInvoicesForDossier,
  generatePrintableInvoiceHtml,
  generateFacturXXml,
} from "./services/invoicing-service.js";
import {
  getDossierDashboardMetrics,
  getFirmDashboardMetrics,
} from "./services/dashboard-service.js";
import { defaultDocumentStorage } from "./services/file-security.js";
import {
  getDossierAccounts,
  getDossierJournals,
  createAccountingEntry,
  updateDraftAccountingEntry,
  validateAccountingEntry,
  reverseAccountingEntry,
  deleteDraftAccountingEntry,
  getAccountingEntryDetails,
  listAccountingEntries,
} from "./services/accounting-service.js";
import {
  importBankStatement,
  listBankTransactions,
  reconcileBankTransaction,
  rejectReconciliationSuggestion,
  flagBankTransactionNoReceipt,
} from "./services/bank-service.js";
import {
  scanDossierAnomalies,
  listDossierAnomalies,
  resolveDossierAnomaly,
} from "./services/anomaly-service.js";
import { SimulationService } from "./services/simulation-service.js";
import { ExportService } from "./services/export-service.js";
import {
  listAuditLogsForOrganization,
  verifyAuditChainIntegrity,
} from "./audit/audit-service.js";
import { runDeterministicSimulation } from "./rules/deterministic-engine.js";
import { renderAppHtml } from "./ui/app-view.js";
import { DossierStatus, OrganizationType, SystemRole, DocumentCategory, FacturXProfile } from "./domain/types.js";
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
  payload: unknown
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
  const simulationService = new SimulationService(db);
  const exportService = new ExportService(db);

  return http.createServer(async (req, res) => {
    const ip = resolveClientIp(req, trustProxy);
    if (!checkRateLimit(`global:${ip}`, maxRequestsPerMinute, rateLimitWindowMs)) {
      sendJson(res, 429, { error: "Trop de requêtes. Veuillez réessayer dans une minute." });
      return;
    }

    const method = req.method || "GET";
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    if (process.env.NODE_ENV !== "test") {
      console.log(`[HTTP] ${new Date().toISOString().substring(11, 19)} ${method} ${pathname}`);
    }

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
          const metrics = getFirmDashboardMetrics({
            session,
            organizationId: orgId,
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

          // Tableau de bord dossier (Vue Entreprise) : GET /api/organizations/:orgId/dossiers/:dossierId/dashboard
          if (method === "GET" && dossierAction === "dashboard") {
            const periodType = (parsedUrl.searchParams.get("periodType") || undefined) as any;
            const year = parsedUrl.searchParams.get("year") ? Number(parsedUrl.searchParams.get("year")) : undefined;
            const month = parsedUrl.searchParams.get("month") ? Number(parsedUrl.searchParams.get("month")) : undefined;
            const quarter = parsedUrl.searchParams.get("quarter") ? (Number(parsedUrl.searchParams.get("quarter")) as any) : undefined;
            const startDate = parsedUrl.searchParams.get("startDate") || undefined;
            const endDate = parsedUrl.searchParams.get("endDate") || undefined;

            const metrics = getDossierDashboardMetrics({
              session,
              organizationId: orgId,
              dossierId,
              filter: {
                periodType,
                year,
                month,
                quarter,
                startDate,
                endDate,
              },
              db,
            });
            sendJson(res, 200, metrics);
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

          // --- Module 4 : Facturation, Devis, Règlements & Factur-X (Lot 1.3) ---

          // Liste et création des devis : /api/organizations/:orgId/dossiers/:dossierId/quotes
          if (method === "GET" && dossierAction === "quotes") {
            const status = parsedUrl.searchParams.get("status") as any;
            const quotes = listQuotesForDossier({
              session,
              organizationId: orgId,
              dossierId,
              status,
              db,
            });
            sendJson(res, 200, { quotes });
            return;
          }

          if (method === "POST" && dossierAction === "quotes") {
            const body = await readJsonBody(req);
            const quote = createQuote({
              session,
              organizationId: orgId,
              dossierId,
              thirdPartyName: String(body.thirdPartyName || ""),
              thirdPartyId: body.thirdPartyId ? String(body.thirdPartyId) : undefined,
              thirdPartyAddress: body.thirdPartyAddress ? String(body.thirdPartyAddress) : undefined,
              thirdPartyTaxNumber: body.thirdPartyTaxNumber ? String(body.thirdPartyTaxNumber) : undefined,
              issueDate: String(body.issueDate || new Date().toISOString().slice(0, 10)),
              validityDate: String(body.validityDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
              currency: body.currency as CurrencyCode | undefined,
              notes: body.notes ? String(body.notes) : undefined,
              termsConditions: body.termsConditions ? String(body.termsConditions) : undefined,
              lines: Array.isArray(body.lines) ? body.lines : [],
              db,
            });
            sendJson(res, 201, { quote });
            return;
          }

          // Détail d'un devis : GET /api/organizations/:orgId/dossiers/:dossierId/quotes/:quoteId
          const quoteDetailMatch = dossierAction.match(/^quotes\/([^/]+)$/);
          if (method === "GET" && quoteDetailMatch) {
            const quoteId = decodeURIComponent(quoteDetailMatch[1]!);
            const quote = getQuoteDetails({
              session,
              organizationId: orgId,
              dossierId,
              quoteId,
              db,
            });
            sendJson(res, 200, { quote });
            return;
          }

          // Transformation Devis -> Facture : POST /api/organizations/:orgId/dossiers/:dossierId/quotes/:quoteId/convert-to-invoice
          const quoteConvertMatch = dossierAction.match(/^quotes\/([^/]+)\/convert-to-invoice$/);
          if (method === "POST" && quoteConvertMatch) {
            const quoteId = decodeURIComponent(quoteConvertMatch[1]!);
            const body = await readJsonBody(req);
            const invoice = convertQuoteToInvoice({
              session,
              organizationId: orgId,
              dossierId,
              quoteId,
              dueDate: body.dueDate ? String(body.dueDate) : undefined,
              isB2B: body.isB2B !== undefined ? Boolean(body.isB2B) : true,
              db,
            });
            sendJson(res, 201, { invoice });
            return;
          }

          // Liste et création des factures de vente : /api/organizations/:orgId/dossiers/:dossierId/sales-invoices
          if (method === "GET" && dossierAction === "sales-invoices") {
            const status = parsedUrl.searchParams.get("status") as any;
            const direction = parsedUrl.searchParams.get("direction") as any;
            const invoices = listSalesInvoicesForDossier({
              session,
              organizationId: orgId,
              dossierId,
              status,
              direction,
              db,
            });
            sendJson(res, 200, { invoices });
            return;
          }

          if (method === "POST" && dossierAction === "sales-invoices") {
            const body = await readJsonBody(req);
            const invoice = createSalesInvoice({
              session,
              organizationId: orgId,
              dossierId,
              thirdPartyName: String(body.thirdPartyName || ""),
              thirdPartyId: body.thirdPartyId ? String(body.thirdPartyId) : undefined,
              thirdPartyAddress: body.thirdPartyAddress ? String(body.thirdPartyAddress) : undefined,
              thirdPartyTaxNumber: body.thirdPartyTaxNumber ? String(body.thirdPartyTaxNumber) : undefined,
              isB2B: body.isB2B !== undefined ? Boolean(body.isB2B) : true,
              issueDate: String(body.issueDate || new Date().toISOString().slice(0, 10)),
              dueDate: body.dueDate ? String(body.dueDate) : undefined,
              currency: body.currency as CurrencyCode | undefined,
              lines: Array.isArray(body.lines) ? body.lines : [],
              db,
            });
            sendJson(res, 201, { invoice });
            return;
          }

          // Détail d'une facture de vente : GET /api/organizations/:orgId/dossiers/:dossierId/sales-invoices/:invId
          const invoiceDetailMatch = dossierAction.match(/^sales-invoices\/([^/]+)$/);
          if (method === "GET" && invoiceDetailMatch) {
            const invoiceId = decodeURIComponent(invoiceDetailMatch[1]!);
            const invoice = getSalesInvoiceDetails({
              session,
              organizationId: orgId,
              dossierId,
              invoiceId,
              db,
            });
            sendJson(res, 200, { invoice });
            return;
          }

          // Finalisation d'une facture de vente : POST /api/organizations/:orgId/dossiers/:dossierId/sales-invoices/:invId/finalize
          const invoiceFinalizeMatch = dossierAction.match(/^sales-invoices\/([^/]+)\/finalize$/);
          if (method === "POST" && invoiceFinalizeMatch) {
            const invoiceId = decodeURIComponent(invoiceFinalizeMatch[1]!);
            const invoice = finalizeSalesInvoice({
              session,
              organizationId: orgId,
              dossierId,
              invoiceId,
              db,
            });
            sendJson(res, 200, { invoice });
            return;
          }

          // Émission d'un Avoir (CREDIT_NOTE) : POST /api/organizations/:orgId/dossiers/:dossierId/sales-invoices/:invId/credit-note
          const invoiceCreditNoteMatch = dossierAction.match(/^sales-invoices\/([^/]+)\/credit-note$/);
          if (method === "POST" && invoiceCreditNoteMatch) {
            const invoiceId = decodeURIComponent(invoiceCreditNoteMatch[1]!);
            const body = await readJsonBody(req);
            const reason = String(body.reason || "");
            const partialGrossAmountMinor = body.partialGrossAmountMinor ? Number(body.partialGrossAmountMinor) : undefined;
            const result = createCreditNoteForInvoice({
              session,
              organizationId: orgId,
              dossierId,
              invoiceId,
              reason,
              partialGrossAmountMinor,
              db,
            });
            sendJson(res, 201, result);
            return;
          }

          // Enregistrement d'un règlement : POST /api/organizations/:orgId/dossiers/:dossierId/sales-invoices/:invId/payments
          const invoicePaymentMatch = dossierAction.match(/^sales-invoices\/([^/]+)\/payments$/);
          if (method === "POST" && invoicePaymentMatch) {
            const invoiceId = decodeURIComponent(invoicePaymentMatch[1]!);
            const body = await readJsonBody(req);
            const result = recordInvoicePayment({
              session,
              organizationId: orgId,
              dossierId,
              invoiceId,
              amountMinor: Number(body.amountMinor),
              paymentDate: String(body.paymentDate || new Date().toISOString().slice(0, 10)),
              paymentMethod: (body.paymentMethod || "BANK_TRANSFER") as any,
              transactionReference: body.transactionReference ? String(body.transactionReference) : undefined,
              notes: body.notes ? String(body.notes) : undefined,
              db,
            });
            sendJson(res, 201, result);
            return;
          }

          // Aperçu imprimable HTML (A4) : GET /api/organizations/:orgId/dossiers/:dossierId/sales-invoices/:invId/printable
          const invoicePrintableMatch = dossierAction.match(/^sales-invoices\/([^/]+)\/printable$/);
          if (method === "GET" && invoicePrintableMatch) {
            const invoiceId = decodeURIComponent(invoicePrintableMatch[1]!);
            const invoice = getSalesInvoiceDetails({
              session,
              organizationId: orgId,
              dossierId,
              invoiceId,
              db,
            });
            const dossier = getClientDossierDetails({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            }).dossier;

            const html = generatePrintableInvoiceHtml({ invoice, dossier });
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(html);
            return;
          }

          // Flux XML Factur-X (Niveau 2) : GET /api/organizations/:orgId/dossiers/:dossierId/sales-invoices/:invId/facturx-xml
          const invoiceFacturXMatch = dossierAction.match(/^sales-invoices\/([^/]+)\/facturx-xml$/);
          if (method === "GET" && invoiceFacturXMatch) {
            const invoiceId = decodeURIComponent(invoiceFacturXMatch[1]!);
            const profile = (parsedUrl.searchParams.get("profile") || "MINIMUM") as FacturXProfile;
            const invoice = getSalesInvoiceDetails({
              session,
              organizationId: orgId,
              dossierId,
              invoiceId,
              db,
            });
            const dossier = getClientDossierDetails({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            }).dossier;

            const xml = generateFacturXXml({ invoice, dossier, profile });
            res.writeHead(200, {
              "Content-Type": "application/xml; charset=utf-8",
              "Content-Disposition": `attachment; filename="factur-x-${invoice.invoiceNumber}.xml"`,
              "X-Content-Type-Options": "nosniff",
            });
            res.end(xml);
            return;
          }

          // Module 5 : Saisie comptable et journaux
          // 1. Récupération des comptes du plan comptable (PCG) : GET /api/organizations/:orgId/dossiers/:dossierId/accounting/accounts
          if (method === "GET" && dossierAction === "accounting/accounts") {
            const accountClass = parsedUrl.searchParams.get("class")
              ? Number(parsedUrl.searchParams.get("class"))
              : undefined;
            const search = parsedUrl.searchParams.get("search") || undefined;
            const accounts = getDossierAccounts({
              session,
              organizationId: orgId,
              dossierId,
              accountClass,
              search,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { accounts });
            return;
          }

          // 2. Récupération des journaux autorisés : GET /api/organizations/:orgId/dossiers/:dossierId/accounting/journals
          if (method === "GET" && dossierAction === "accounting/journals") {
            const journals = getDossierJournals({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { journals });
            return;
          }

          // 3. Liste des écritures comptables : GET /api/organizations/:orgId/dossiers/:dossierId/accounting/entries
          if (method === "GET" && dossierAction === "accounting/entries") {
            const journalCode = parsedUrl.searchParams.get("journalCode") || undefined;
            const status = parsedUrl.searchParams.get("status") || undefined;
            const accountCode = parsedUrl.searchParams.get("accountCode") || undefined;
            const startDate = parsedUrl.searchParams.get("startDate") || undefined;
            const endDate = parsedUrl.searchParams.get("endDate") || undefined;
            const search = parsedUrl.searchParams.get("search") || undefined;
            const limit = parsedUrl.searchParams.get("limit")
              ? Number(parsedUrl.searchParams.get("limit"))
              : undefined;
            const offset = parsedUrl.searchParams.get("offset")
              ? Number(parsedUrl.searchParams.get("offset"))
              : undefined;

            const result = listAccountingEntries({
              session,
              organizationId: orgId,
              dossierId,
              journalCode,
              status,
              accountCode,
              startDate,
              endDate,
              search,
              limit,
              offset,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // 4. Création d'une écriture comptable : POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries
          if (method === "POST" && dossierAction === "accounting/entries") {
            const body = await readJsonBody(req);
            const entry = createAccountingEntry({
              session,
              organizationId: orgId,
              dossierId,
              journalCode: String(body.journalCode || ""),
              entryDate: String(body.entryDate || ""),
              pieceNumber: String(body.pieceNumber || ""),
              label: String(body.label || ""),
              status: body.status === "AI_SUGGESTION" ? "AI_SUGGESTION" : "DRAFT",
              currency: body.currency ? String(body.currency) : undefined,
              lines: Array.isArray(body.lines) ? body.lines : [],
              documentId: body.documentId ? String(body.documentId) : undefined,
              platformAdminJustification,
              db,
            });
            sendJson(res, 201, { entry });
            return;
          }

          // 5. Validation formelle d'une écriture : POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId/validate
          const entryValidateMatch = dossierAction.match(/^accounting\/entries\/([^/]+)\/validate$/);
          if (method === "POST" && entryValidateMatch) {
            const entryId = decodeURIComponent(entryValidateMatch[1]!);
            const entry = validateAccountingEntry({
              session,
              organizationId: orgId,
              dossierId,
              entryId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { entry });
            return;
          }

          // 6. Extourne comptable : POST /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId/reverse
          const entryReverseMatch = dossierAction.match(/^accounting\/entries\/([^/]+)\/reverse$/);
          if (method === "POST" && entryReverseMatch) {
            const entryId = decodeURIComponent(entryReverseMatch[1]!);
            const body = await readJsonBody(req);
            const entry = reverseAccountingEntry({
              session,
              organizationId: orgId,
              dossierId,
              entryId,
              reversalDate: body.reversalDate ? String(body.reversalDate) : undefined,
              reversalReason: body.reversalReason ? String(body.reversalReason) : undefined,
              platformAdminJustification,
              db,
            });
            sendJson(res, 201, { entry });
            return;
          }

          // 7. Détail d'une écriture comptable : GET /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId
          const entryDetailMatch = dossierAction.match(/^accounting\/entries\/([^/]+)$/);
          if (method === "GET" && entryDetailMatch) {
            const entryId = decodeURIComponent(entryDetailMatch[1]!);
            const entry = getAccountingEntryDetails({
              session,
              organizationId: orgId,
              dossierId,
              entryId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { entry });
            return;
          }

          // 8. Mise à jour d'un brouillon : PATCH ou PUT /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId
          if ((method === "PATCH" || method === "PUT") && entryDetailMatch) {
            const entryId = decodeURIComponent(entryDetailMatch[1]!);
            const body = await readJsonBody(req);
            const entry = updateDraftAccountingEntry({
              session,
              organizationId: orgId,
              dossierId,
              entryId,
              journalCode: body.journalCode ? String(body.journalCode) : undefined,
              entryDate: body.entryDate ? String(body.entryDate) : undefined,
              pieceNumber: body.pieceNumber ? String(body.pieceNumber) : undefined,
              label: body.label ? String(body.label) : undefined,
              currency: body.currency ? String(body.currency) : undefined,
              lines: Array.isArray(body.lines) ? body.lines : [],
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { entry });
            return;
          }

          // 9. Suppression d'un brouillon : DELETE /api/organizations/:orgId/dossiers/:dossierId/accounting/entries/:entryId
          if (method === "DELETE" && entryDetailMatch) {
            const entryId = decodeURIComponent(entryDetailMatch[1]!);
            const result = deleteDraftAccountingEntry({
              session,
              organizationId: orgId,
              dossierId,
              entryId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // =================================================================
          // MODULE 5 : IMPORT BANCAIRE ET RAPPROCHEMENT (§17)
          // =================================================================
          // 1. Import de relevé : POST /api/organizations/:orgId/dossiers/:dossierId/bank/import
          if (method === "POST" && dossierAction === "bank/import") {
            const body = await readJsonBody(req);
            let fileBuffer: Buffer;
            if (body.fileBase64) {
              fileBuffer = Buffer.from(String(body.fileBase64), "base64");
            } else if (body.content) {
              fileBuffer = Buffer.from(String(body.content), "utf8");
            } else {
              throw new Error("Le fichier de relevé bancaire est requis (base64 ou content).");
            }

            const filename = (body.filename ? String(body.filename) : "releve.csv").trim();
            const importType = body.importType === "BANK_STATEMENT_OFX" ? "BANK_STATEMENT_OFX" : "BANK_STATEMENT_CSV";

            const result = importBankStatement({
              session,
              organizationId: orgId,
              dossierId,
              fileBuffer,
              filename,
              importType,
              platformAdminJustification,
              db,
            });
            sendJson(res, 201, { batch: result });
            return;
          }

          // 2. Consultation des transactions : GET /api/organizations/:orgId/dossiers/:dossierId/bank/transactions
          if (method === "GET" && dossierAction === "bank/transactions") {
            const status = parsedUrl.searchParams.get("status") || undefined;
            const startDate = parsedUrl.searchParams.get("startDate") || undefined;
            const endDate = parsedUrl.searchParams.get("endDate") || undefined;
            const search = parsedUrl.searchParams.get("search") || undefined;
            const limit = parsedUrl.searchParams.get("limit") ? parseInt(parsedUrl.searchParams.get("limit")!, 10) : undefined;
            const offset = parsedUrl.searchParams.get("offset") ? parseInt(parsedUrl.searchParams.get("offset")!, 10) : undefined;

            const result = listBankTransactions({
              session,
              organizationId: orgId,
              dossierId,
              status,
              startDate,
              endDate,
              search,
              limit,
              offset,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // 3. Rapprochement bancaire : POST /api/organizations/:orgId/dossiers/:dossierId/bank/reconcile
          if (method === "POST" && dossierAction === "bank/reconcile") {
            const body = await readJsonBody(req);
            const rawMatchOrigin = body.matchOrigin;
            const matchOrigin = (rawMatchOrigin === "AI_SUGGESTION" || rawMatchOrigin === "DETERMINISTIC_RULE" || rawMatchOrigin === "MANUAL_USER")
              ? rawMatchOrigin
              : "MANUAL_USER";
            const result = reconcileBankTransaction({
              session,
              organizationId: orgId,
              dossierId,
              transactionId: String(body.transactionId),
              invoiceId: String(body.invoiceId),
              allocatedAmountMinor: body.allocatedAmountMinor !== undefined ? Number(body.allocatedAmountMinor) : undefined,
              matchOrigin,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // 4. Rejet de suggestion : POST /api/organizations/:orgId/dossiers/:dossierId/bank/transactions/:txId/reject-suggestion
          const rejectSuggestionMatch = dossierAction.match(/^bank\/transactions\/([^/]+)\/reject-suggestion$/);
          if (method === "POST" && rejectSuggestionMatch) {
            const transactionId = decodeURIComponent(rejectSuggestionMatch[1]!);
            const body = await readJsonBody(req).catch(() => ({} as Record<string, unknown>));
            const result = rejectReconciliationSuggestion({
              session,
              organizationId: orgId,
              dossierId,
              transactionId,
              reason: body.reason ? String(body.reason) : undefined,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // 5. Marquage sans justificatif : POST /api/organizations/:orgId/dossiers/:dossierId/bank/transactions/:txId/flag-no-receipt
          const flagNoReceiptMatch = dossierAction.match(/^bank\/transactions\/([^/]+)\/flag-no-receipt$/);
          if (method === "POST" && flagNoReceiptMatch) {
            const transactionId = decodeURIComponent(flagNoReceiptMatch[1]!);
            const result = flagBankTransactionNoReceipt({
              session,
              organizationId: orgId,
              dossierId,
              transactionId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // =================================================================
          // MODULE 6 : CONTRÔLES COMPTABLES ET ANOMALIES (§18)
          // =================================================================
          // 6. Scan des 10 règles : POST /api/organizations/:orgId/dossiers/:dossierId/anomalies/scan
          if (method === "POST" && dossierAction === "anomalies/scan") {
            const result = scanDossierAnomalies({
              session,
              organizationId: orgId,
              dossierId,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // 7. Liste des anomalies : GET /api/organizations/:orgId/dossiers/:dossierId/anomalies
          if (method === "GET" && dossierAction === "anomalies") {
            const status = parsedUrl.searchParams.get("status") || undefined;
            const severity = parsedUrl.searchParams.get("severity") || undefined;
            const category = parsedUrl.searchParams.get("category") || undefined;
            const isCertainParam = parsedUrl.searchParams.get("isCertainError");
            const isCertainError = isCertainParam !== null ? isCertainParam === "true" || isCertainParam === "1" : undefined;

            const result = listDossierAnomalies({
              session,
              organizationId: orgId,
              dossierId,
              status,
              severity,
              isCertainError,
              category,
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, result);
            return;
          }

          // 8. Résolution / Classement anomalie : POST /api/organizations/:orgId/dossiers/:dossierId/anomalies/:anomalyId/resolve
          const resolveAnomalyMatch = dossierAction.match(/^anomalies\/([^/]+)\/resolve$/);
          if (method === "POST" && resolveAnomalyMatch) {
            const anomalyId = decodeURIComponent(resolveAnomalyMatch[1]!);
            const body = await readJsonBody(req);
            const result = resolveDossierAnomaly({
              session,
              organizationId: orgId,
              dossierId,
              anomalyId,
              resolutionStatus: body.resolutionStatus === "DISMISSED_WITH_JUSTIFICATION" ? "DISMISSED_WITH_JUSTIFICATION" : "RESOLVED_BY_CORRECTION",
              resolutionJustification: String(body.resolutionJustification || ""),
              platformAdminJustification,
              db,
            });
            sendJson(res, 200, { anomaly: result });
            return;
          }

          // =================================================================
          // MODULE 7 : SIMULATIONS INDICATIVES VERSIONNÉES (§19)
          // =================================================================
          // 9. Création d'une simulation : POST /api/organizations/:orgId/dossiers/:dossierId/simulations
          if (method === "POST" && dossierAction === "simulations") {
            const body = await readJsonBody(req);
            const p = (body.parameters && typeof body.parameters === "object") ? { ...body, ...body.parameters } : body;
            const simulation = simulationService.createSimulation(session, orgId, dossierId, {
              simulationType: p.simulationType as any,
              effectiveDate: p.effectiveDate ? String(p.effectiveDate) : undefined,
              ruleVersionId: p.ruleVersionId ? String(p.ruleVersionId) : undefined,
              revenueNetMinor: p.revenueNetMinor !== undefined ? Number(p.revenueNetMinor) : (p.collectedVatMinor !== undefined ? Number(p.collectedVatMinor) * 5 : undefined),
              expensesNetMinor: p.expensesNetMinor !== undefined ? Number(p.expensesNetMinor) : (p.deductibleVatMinor !== undefined ? Number(p.deductibleVatMinor) * 5 : undefined),
              vatRateBps: p.vatRateBps !== undefined ? Number(p.vatRateBps) : undefined,
              useActualDossierInvoices: p.useActualDossierInvoices !== undefined ? Boolean(p.useActualDossierInvoices) : undefined,
              taxRegimeCode: p.taxRegimeCode ? String(p.taxRegimeCode) : undefined,
              basisRevenueMinor: p.basisRevenueMinor !== undefined ? Number(p.basisRevenueMinor) : (p.annualNetRevenueMinor !== undefined ? Number(p.annualNetRevenueMinor) : undefined),
              basisProfitMinor: p.basisProfitMinor !== undefined ? Number(p.basisProfitMinor) : undefined,
              customContributionRateBps: p.customContributionRateBps !== undefined ? Number(p.customContributionRateBps) : undefined,
              taxableProfitMinor: p.taxableProfitMinor !== undefined ? Number(p.taxableProfitMinor) : undefined,
              taxRegimeType: (p.taxRegimeType as any) || (p.isEligiblePmeReducedRate ? "IS_PME" : (p.isEligiblePmeReducedRate === false ? "IS_NORMAL" : undefined)),
              customTaxRateBps: p.customTaxRateBps !== undefined ? Number(p.customTaxRateBps) : undefined,
              expenseNetMinor: p.expenseNetMinor !== undefined ? Number(p.expenseNetMinor) : undefined,
              expenseVatRateBps: p.expenseVatRateBps !== undefined ? Number(p.expenseVatRateBps) : undefined,
              isDeductibleVat: p.isDeductibleVat !== undefined ? Boolean(p.isDeductibleVat) : undefined,
              corporateTaxRateBps: p.corporateTaxRateBps !== undefined ? Number(p.corporateTaxRateBps) : undefined,
            });
            sendJson(res, 201, { simulation });
            return;
          }

          // 10. Liste des simulations du dossier : GET /api/organizations/:orgId/dossiers/:dossierId/simulations
          if (method === "GET" && dossierAction === "simulations") {
            const simulations = simulationService.listSimulations(session, orgId, dossierId);
            sendJson(res, 200, { simulations });
            return;
          }

          // 11. Détail d'une simulation : GET /api/organizations/:orgId/dossiers/:dossierId/simulations/:simId
          const simulationDetailMatch = dossierAction.match(/^simulations\/([^/]+)$/);
          if (method === "GET" && simulationDetailMatch) {
            const simId = decodeURIComponent(simulationDetailMatch[1]!);
            const simulation = simulationService.getSimulationDetails(session, orgId, dossierId, simId);
            sendJson(res, 200, { simulation });
            return;
          }

          // =================================================================
          // MODULE 9 : EXPORTS SÉCURISÉS (CSV & FEC) (§21)
          // =================================================================
          // 12. Export CSV sécurisé : GET /api/organizations/:orgId/dossiers/:dossierId/exports/csv/:exportType
          const exportCsvMatch = dossierAction.match(/^exports\/csv\/([^/]+)$/);
          if (method === "GET" && exportCsvMatch) {
            const exportType = decodeURIComponent(exportCsvMatch[1]!);
            const delimiter = parsedUrl.searchParams.get("delimiter") === ";" ? ";" : ",";
            let exportResult;
            if (exportType === "invoices") {
              exportResult = exportService.exportInvoicesCsv(session, orgId, dossierId, { delimiter });
            } else if (exportType === "bank") {
              exportResult = exportService.exportBankTransactionsCsv(session, orgId, dossierId, { delimiter });
            } else if (exportType === "entries") {
              exportResult = exportService.exportAccountingEntriesCsv(session, orgId, dossierId, { delimiter });
            } else if (exportType === "anomalies") {
              exportResult = exportService.exportAnomaliesCsv(session, orgId, dossierId, { delimiter });
            } else if (exportType === "audit") {
              exportResult = exportService.exportAuditLogsCsv(session, orgId, dossierId, { delimiter });
            } else {
              throw new Error(`Type d'export CSV non supporté : ${exportType}`);
            }

            res.writeHead(200, {
              "Content-Type": exportResult.mimeType,
              "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
              "X-Row-Count": String(exportResult.rowCount),
            });
            res.end(exportResult.content);
            return;
          }

          // 13. Export FEC préliminaire : GET /api/organizations/:orgId/dossiers/:dossierId/exports/fec
          if (method === "GET" && dossierAction === "exports/fec") {
            const startDate = parsedUrl.searchParams.get("startDate") || undefined;
            const endDate = parsedUrl.searchParams.get("endDate") || undefined;
            const decimalSeparator = parsedUrl.searchParams.get("decimalSeparator") === "." ? "." : ",";

            const exportResult = exportService.exportFecTxt(session, orgId, dossierId, {
              startDate,
              endDate,
              decimalSeparator,
            });

            res.writeHead(200, {
              "Content-Type": exportResult.mimeType,
              "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
              "X-FEC-Preliminary": "true",
              "X-FEC-Disclaimer": encodeURIComponent(exportResult.disclaimer || ""),
              "X-Row-Count": String(exportResult.rowCount),
            });
            res.end(exportResult.content);
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
