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
}

const defaultDevSecret = crypto
  .createHash("sha256")
  .update("dev-only-secret-change-in-production")
  .digest("hex");

export function getAppConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as
    | "development"
    | "test"
    | "production";

  return {
    appName: process.env.APP_NAME || "ComptaNova",
    appTagline:
      process.env.APP_TAGLINE ||
      "Plateforme d'assistance comptable intelligente, multi-tenant et multi-pays",
    appSupportEmail:
      process.env.APP_SUPPORT_EMAIL || "support@comptanova.example.com",
    appLegalEntity:
      process.env.APP_LEGAL_ENTITY || "ComptaNova SAS (Configuration Démo)",
    regulatoryDisclaimer:
      "Estimation à titre informatif uniquement. Ne constitue pas un conseil fiscal ou comptable. Seul votre expert-comptable est habilité à valider vos choix fiscaux.",
    aiSuggestionWarning:
      "Suggestion générée par l'IA à titre d'assistance. Ne remplace pas le jugement professionnel et requiert une validation humaine explicite avant toute comptabilisation.",

    nodeEnv,
    port: Number.parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "127.0.0.1",

    databaseEngine: (process.env.DATABASE_ENGINE || "sqlite") as
      | "sqlite"
      | "postgresql",
    databasePath:
      process.env.DATABASE_PATH ||
      (nodeEnv === "test" ? ":memory:" : "./data/app.db"),
    databaseUrl:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/comptanova",

    sessionSecret: process.env.SESSION_SECRET || defaultDevSecret,
    sessionTtlHours: Number.parseInt(process.env.SESSION_TTL_HOURS || "24", 10),
    signedUrlSecret: process.env.SIGNED_URL_SECRET || defaultDevSecret,
    signedUrlTtlSeconds: Number.parseInt(
      process.env.SIGNED_URL_TTL_SECONDS || "300",
      10
    ),

    storageDriver: (process.env.STORAGE_DRIVER || "local") as "local" | "s3",
    storageLocalDir:
      process.env.STORAGE_LOCAL_DIR || "./storage/private-documents",

    aiEnabled: (process.env.AI_ENABLED || "true").toLowerCase() === "true",
    aiDefaultProvider: process.env.AI_DEFAULT_PROVIDER || "mock-deterministic",
    aiMaxCostCentsPerOrgMonth: Number.parseInt(
      process.env.AI_MAX_COST_CENTS_PER_ORG_MONTH || "5000",
      10
    ),
    aiRequestTimeoutMs: Number.parseInt(
      process.env.AI_REQUEST_TIMEOUT_MS || "15000",
      10
    ),

    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "FR",
  };
}

export const appConfig = getAppConfig();
