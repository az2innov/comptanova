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
  AuthorizationError,
} from "./auth/auth-service.js";
import {
  listAccessibleOrganizations,
  createOrganization,
  getOrganizationDashboardMetrics,
  listOrganizationMembers,
  addMemberToOrganization,
  listDossiersForOrganization,
  createClientDossier,
  listCountryConfigurations,
  getCountryConfigurationByCode,
  getCountryConfigurationByVersionId,
} from "./services/tenant-service.js";
import {
  listAuditLogsForOrganization,
  verifyAuditChainIntegrity,
} from "./audit/audit-service.js";
import { runDeterministicSimulation } from "./rules/deterministic-engine.js";
import { renderAppHtml } from "./ui/app-view.js";
import { OrganizationType, SystemRole } from "./domain/types.js";
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

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > 2 * 1024 * 1024) {
        reject(new Error("Corps de requête trop volumineux (max 2 Mo)."));
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
            legalRegistrationNumber: body.legalRegistrationNumber
              ? String(body.legalRegistrationNumber)
              : null,
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
            effectiveDate: body.effectiveDate
              ? String(body.effectiveDate)
              : undefined,
            db,
          });
          sendJson(res, 201, { dossier });
          return;
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
