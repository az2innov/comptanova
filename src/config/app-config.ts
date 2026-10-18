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

  /** Charte graphique centralisée (REQ-002) */
  brandColors: {
    primaryDeepEmerald: string;
    secondaryJade: string;
    accentWarmAmber: string;
    surfaceOffWhite: string;
    textGraphite: string;
  };
}

const defaultDevSecret = crypto
  .createHash("sha256")
  .update("dev-only-secret-change-in-production")
  .digest("hex");

function isInsecureOrMissingSecret(secret: string | undefined): boolean {
  if (!secret) return true;
  const trimmed = secret.trim();
  if (trimmed.length < 32) return true;
  if (trimmed === defaultDevSecret) return true;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("remplacer") ||
    lower.includes("change-in-production") ||
    lower.includes("dev-only")
  ) {
    return true;
  }
  return false;
}

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV || "development") as
    | "development"
    | "test"
    | "production";

  if (nodeEnv === "production") {
    if (
      isInsecureOrMissingSecret(env.SESSION_SECRET) ||
      isInsecureOrMissingSecret(env.SIGNED_URL_SECRET)
    ) {
      throw new Error(
        "FATAL [SEC-OPEN-01]: SESSION_SECRET et SIGNED_URL_SECRET doivent être explicitement définis avec au moins 32 caractères aléatoires lorsque NODE_ENV=production."
      );
    }
  }

  return {
    appName: env.APP_NAME || "ComptaNova",
    appTagline:
      env.APP_TAGLINE ||
      "Plateforme d'assistance comptable intelligente, multi-tenant et multi-pays",
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
      (nodeEnv === "test" ? ":memory:" : "./data/app.db"),
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

    brandColors: {
      primaryDeepEmerald: env.BRAND_COLOR_PRIMARY || "#153D35",
      secondaryJade: env.BRAND_COLOR_SECONDARY || "#237D68",
      accentWarmAmber: env.BRAND_COLOR_ACCENT || "#D9A441",
      surfaceOffWhite: env.BRAND_COLOR_SURFACE || "#F6F8F7",
      textGraphite: env.BRAND_COLOR_TEXT || "#111827",
    },
  };
}

export const appConfig = getAppConfig();

