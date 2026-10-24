import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Charge le fichier .env s'il existe sans dépendance externe.
 */
function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

export interface AppConfig {
  /** Nom du produit configurable en un seul point (ne jamais disperser dans le code) */
  appName: string;
  appTagline: string;
  appSupportEmail: string;
  appLegalEntity: string;
  regulatoryDisclaimer: string;
  aiSuggestionWarning: string;

  /** Paramètres serveur */
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;

  /** Base de données */
  databaseEngine: "sqlite" | "postgresql";
  databasePath: string;
  databaseUrl: string;

  /** Sécurité & Sessions */
  sessionSecret: string;
  sessionTtlHours: number;
  signedUrlSecret: string;
  signedUrlTtlSeconds: number;

  /** Stockage documentaire privé */
  storageDriver: "local" | "s3";
  storageLocalDir: string;

  /** Fournisseurs IA */
  aiEnabled: boolean;
  aiDefaultProvider: string;
  aiMaxCostCentsPerOrgMonth: number;
  aiRequestTimeoutMs: number;

  /** Pays par défaut */
  defaultCountryCode: string;

  /** Confiance explicite envers l'en-tête X-Forwarded-For derrière un reverse proxy (SEC-OPEN-03) */
  trustProxy: boolean;

  /** Charte graphique centralisée — Phase 1 Section 5 (REQ-002) */
  brandColors: {
    primaryDeepEmerald: string;
    secondaryJade: string;
    accentWarmAmber: string;
    surfaceOffWhite: string;
    surfaceCard: string;
    textGraphite: string;
    textSecondary: string;
    borderSubtle: string;
    statusSuccess: string;
    statusSuccessBg: string;
    statusWarning: string;
    statusWarningBg: string;
    statusDanger: string;
    statusDangerBg: string;
    statusInfo: string;
    statusInfoBg: string;
  };
}

const defaultDevSecret = crypto
  .createHash("sha256")
  .update("dev-only-secret-change-in-production")
  .digest("hex");

function validateProductionSecret(name: string, secret: string | undefined): void {
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      `FATAL [SEC-OPEN-01] : La variable d'environnement ${name} est absente ou trop courte (< 32 caractères) en production.`
    );
  }
  const trimmed = secret.trim();
  const lower = trimmed.toLowerCase();
  if (
    trimmed === defaultDevSecret ||
    lower.includes("remplacer") ||
    lower.includes("change-in-production") ||
    lower.includes("dev-only")
  ) {
    throw new Error(
      `FATAL [SEC-OPEN-01] : La variable d'environnement ${name} utilise une valeur de démonstration interdite en production.`
    );
  }
  if (new Set(trimmed).size < 10) {
    throw new Error(
      `FATAL [SEC-OPEN-01] : La variable d'environnement ${name} a une entropie insuffisante (< 10 caractères distincts) en production.`
    );
  }
}

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV || "development") as
    | "development"
    | "test"
    | "production";

  if (nodeEnv === "production") {
    validateProductionSecret("SESSION_SECRET", env.SESSION_SECRET);
    validateProductionSecret("SIGNED_URL_SECRET", env.SIGNED_URL_SECRET);
    if (env.SESSION_SECRET!.trim() === env.SIGNED_URL_SECRET!.trim()) {
      throw new Error(
        "FATAL [SEC-OPEN-01] : SESSION_SECRET et SIGNED_URL_SECRET doivent être strictement distincts en production."
      );
    }
  }

  return {
    appName: env.APP_NAME || "ComptaNova",
    appTagline:
      env.APP_TAGLINE ||
      "ComptaNova — La comptabilité, plus claire.",
    appSupportEmail:
      env.APP_SUPPORT_EMAIL || "support@comptanova.example.com",
    appLegalEntity:
      env.APP_LEGAL_ENTITY || "ComptaNova SAS (Configuration Démo)",
    regulatoryDisclaimer:
      "Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable. Seul votre expert-comptable est habilité à valider vos choix fiscaux.",
    aiSuggestionWarning:
      "Suggestion générée par l'IA à titre d'assistance. Ne remplace pas le jugement professionnel et requiert une validation humaine explicite avant toute comptabilisation.",

    nodeEnv,
    port: Number.parseInt(env.PORT || "3000", 10),
    host: env.HOST || "127.0.0.1",

    databaseEngine: (env.DATABASE_ENGINE || "sqlite") as
      | "sqlite"
      | "postgresql",
    databasePath:
      env.DATABASE_PATH ||
      (nodeEnv === "test"
        ? ":memory:"
        : path.resolve(import.meta.dirname, "../../data/app.db")),
    databaseUrl:
      env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/comptanova",

    sessionSecret: env.SESSION_SECRET || defaultDevSecret,
    sessionTtlHours: Number.parseInt(env.SESSION_TTL_HOURS || "24", 10),
    signedUrlSecret: env.SIGNED_URL_SECRET || defaultDevSecret,
    signedUrlTtlSeconds: Number.parseInt(
      env.SIGNED_URL_TTL_SECONDS || "300",
      10
    ),

    storageDriver: (env.STORAGE_DRIVER || "local") as "local" | "s3",
    storageLocalDir:
      env.STORAGE_LOCAL_DIR || "./storage/private-documents",

    aiEnabled: (env.AI_ENABLED || "true").toLowerCase() === "true",
    aiDefaultProvider: env.AI_DEFAULT_PROVIDER || "mock-deterministic",
    aiMaxCostCentsPerOrgMonth: Number.parseInt(
      env.AI_MAX_COST_CENTS_PER_ORG_MONTH || "5000",
      10
    ),
    aiRequestTimeoutMs: Number.parseInt(
      env.AI_REQUEST_TIMEOUT_MS || "15000",
      10
    ),

    defaultCountryCode: env.DEFAULT_COUNTRY_CODE || "FR",
    trustProxy: (env.TRUST_PROXY || "false").toLowerCase() === "true",

    brandColors: {
      primaryDeepEmerald: env.BRAND_COLOR_PRIMARY || "#153D35",
      secondaryJade: env.BRAND_COLOR_SECONDARY || "#237D68",
      accentWarmAmber: env.BRAND_COLOR_ACCENT || "#D9A441",
      surfaceOffWhite: env.BRAND_COLOR_SURFACE || "#F7F8FA",
      surfaceCard: env.BRAND_COLOR_CARD || "#FFFFFF",
      textGraphite: env.BRAND_COLOR_TEXT || "#17212B",
      textSecondary: env.BRAND_COLOR_TEXT_SECONDARY || "#64748B",
      borderSubtle: env.BRAND_COLOR_BORDER || "#E2E8F0",
      statusSuccess: env.BRAND_COLOR_SUCCESS || "#16794B",
      statusSuccessBg: env.BRAND_COLOR_SUCCESS_BG || "#ECFDF3",
      statusWarning: env.BRAND_COLOR_WARNING || "#B45309",
      statusWarningBg: env.BRAND_COLOR_WARNING_BG || "#FFFBEB",
      statusDanger: env.BRAND_COLOR_DANGER || "#B42318",
      statusDangerBg: env.BRAND_COLOR_DANGER_BG || "#FEF3F2",
      statusInfo: env.BRAND_COLOR_INFO || "#1D4ED8",
      statusInfoBg: env.BRAND_COLOR_INFO_BG || "#EFF6FF",
    },
  };
}

export const appConfig = getAppConfig();

