import { DocumentCategory, ExtractedFieldValue, ValidationStatus } from "../domain/types.js";
import { appConfig } from "../config/app-config.js";

/**
 * Couche d'abstraction IA hybride (Section 6 du prompt maître & Section D de l'Audit Complémentaire).
 * - Multi-fournisseurs (OpenAI, Anthropic, Mock déterministe de test).
 * - Identification explicite et non ambiguë du mode simulé (`isSimulatedTestAdapter: true` pour `mock-deterministic`).
 * - Garde de sécurité serveur (`assertAiProviderAllowedForEnvironment`) empêchant que `mock-deterministic`
 *   puisse être confondu avec une véritable analyse IA en production (`NODE_ENV === "production"`).
 * - Séparation stricte entre instructions système et données documentaires non fiables (défense anti-prompt injection).
 * - Aucune donnée ni suggestion IA ne peut jamais être créée avec le statut `VALIDATED_BY_HUMAN`.
 */

export type AiTaskType =
  | "DOCUMENT_CLASSIFICATION"
  | "INVOICE_EXTRACTION"
  | "ACCOUNT_SUGGESTION"
  | "ANOMALY_EXPLANATION";

export interface UntrustedDocumentPayload {
  organizationId: string;
  dossierId: string;
  filename: string;
  mimeType: string;
  rawTextContent: string;
}

export interface InvoiceExtractionSchema {
  category: ExtractedFieldValue<DocumentCategory>;
  issuerName: ExtractedFieldValue<string>;
  recipientName: ExtractedFieldValue<string>;
  invoiceNumber: ExtractedFieldValue<string>;
  invoiceDate: ExtractedFieldValue<string>;
  dueDate: ExtractedFieldValue<string>;
  netAmountMinor: ExtractedFieldValue<number>;
  vatAmountMinor: ExtractedFieldValue<number>;
  grossAmountMinor: ExtractedFieldValue<number>;
  vatRateBps: ExtractedFieldValue<number>;
  currency: ExtractedFieldValue<string>;
  suggestedAccountCode: ExtractedFieldValue<string>;
}

export interface AiExecutionMetadata {
  providerId: string;
  modelName: string;
  /** Indique explicitement s'il s'agit d'un adaptateur simulé de test (true pour mock-deterministic) */
  isSimulatedTestAdapter: boolean;
  simulationNotice: string | null;
  taskType: AiTaskType;
  latencyMs: number;
  estimatedCostMinorCents: number;
  promptInjectionDetected: boolean;
  sanitizedWarnings: string[];
  disclaimer: string;
}

export interface AiProviderAdapter {
  readonly providerId: string;
  readonly isSimulatedTestAdapter: boolean;
  readonly isAvailable: () => boolean;
  extractInvoiceData(
    untrustedDoc: UntrustedDocumentPayload,
    confidenceThreshold: number
  ): Promise<{
    extraction: InvoiceExtractionSchema;
    metadata: AiExecutionMetadata;
  }>;
}

/**
 * Empêche que l'adaptateur simulé `mock-deterministic` soit utilisé silencieusement en environnement de production
 * sur des données comptables réelles sans autorisation explicite de test.
 */
export function assertAiProviderAllowedForEnvironment(
  adapter: AiProviderAdapter,
  nodeEnv: "development" | "test" | "production" = appConfig.nodeEnv,
  allowMockInProductionOverride: boolean = false
): void {
  if (
    nodeEnv === "production" &&
    adapter.isSimulatedTestAdapter &&
    !allowMockInProductionOverride
  ) {
    throw new Error(
      `Blocage de sécurité IA : l'adaptateur simulé de test "${adapter.providerId}" (isSimulatedTestAdapter=true) est interdit en environnement de production sur des données comptables réelles. Configurez un fournisseur IA réel vérifié.`
    );
  }
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s*prompt/i,
  /validate_entry/i,
  /grant_admin/i,
  /role\s*[:=]\s*["']?PLATFORM_ADMIN/i,
  /validationStatus\s*[:=]\s*["']?VALIDATED_BY_HUMAN/i,
  /drop\s+table/i,
];

/**
 * Analyse et isole le contenu documentaire non fiable contre les tentatives d'injection de prompt.
 */
export function inspectAndIsolateUntrustedContent(rawText: string): {
  isolatedEnvelope: string;
  injectionDetected: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let injectionDetected = false;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(rawText)) {
      injectionDetected = true;
      warnings.push(
        `Motif suspect d'injection de prompt détecté et neutralisé (${pattern.source}).`
      );
    }
  }

  const escaped = rawText
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 20000);

  return {
    isolatedEnvelope: `<UNTRUSTED_DOCUMENT_DATA_ONLY>\n${escaped}\n</UNTRUSTED_DOCUMENT_DATA_ONLY>`,
    injectionDetected,
    warnings,
  };
}

/**
 * Garantit qu'aucune sortie IA ne peut jamais s'auto-valider (`VALIDATED_BY_HUMAN`).
 */
export function enforceHumanValidationRequirement<T>(
  field: ExtractedFieldValue<T>,
  confidenceThreshold: number,
  forceNeedsReview: boolean = false
): ExtractedFieldValue<T> {
  const clampedScore = Math.max(0, Math.min(1, field.confidenceScore));
  const status: ValidationStatus =
    forceNeedsReview || clampedScore < confidenceThreshold
      ? "NEEDS_HUMAN_REVIEW"
      : "PROPOSED_BY_AI";

  return {
    value: field.value,
    source: "AI_EXTRACTION",
    confidenceScore: clampedScore,
    validationStatus: status,
    validatedByUserId: null,
    validatedAt: null,
  };
}

/**
 * Adaptateur déterministe local de test (`mock-deterministic`).
 * Clairement identifié comme un simulateur de test (`isSimulatedTestAdapter = true`) et non une analyse LLM réelle.
 */
export class DeterministicMockAiAdapter implements AiProviderAdapter {
  public readonly providerId = "mock-deterministic";
  public readonly isSimulatedTestAdapter = true;

  public isAvailable(): boolean {
    return appConfig.aiEnabled;
  }

  public async extractInvoiceData(
    untrustedDoc: UntrustedDocumentPayload,
    confidenceThreshold: number = 0.85
  ): Promise<{
    extraction: InvoiceExtractionSchema;
    metadata: AiExecutionMetadata;
  }> {
    const startTime = Date.now();
    if (!this.isAvailable()) {
      throw new Error("Les traitements IA sont désactivés dans la configuration.");
    }

    assertAiProviderAllowedForEnvironment(this, appConfig.nodeEnv);

    const inspection = inspectAndIsolateUntrustedContent(
      untrustedDoc.rawTextContent
    );

    const forceReview = inspection.injectionDetected;

    const rawExtraction: InvoiceExtractionSchema = {
      category: enforceHumanValidationRequirement(
        {
          value: "SUPPLIER_INVOICE",
          source: "AI_EXTRACTION",
          confidenceScore: 0.92,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      issuerName: enforceHumanValidationRequirement(
        {
          value: "Fournisseur Exemple SAS [SIMULATION TEST]",
          source: "AI_EXTRACTION",
          confidenceScore: 0.89,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      recipientName: enforceHumanValidationRequirement(
        {
          value: "Client Dossier [SIMULATION TEST]",
          source: "AI_EXTRACTION",
          confidenceScore: 0.9,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      invoiceNumber: enforceHumanValidationRequirement(
        {
          value: "FAC-2026-001",
          source: "AI_EXTRACTION",
          confidenceScore: 0.94,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      invoiceDate: enforceHumanValidationRequirement(
        {
          value: "2026-10-01",
          source: "AI_EXTRACTION",
          confidenceScore: 0.91,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      dueDate: enforceHumanValidationRequirement(
        {
          value: "2026-10-31",
          source: "AI_EXTRACTION",
          confidenceScore: 0.82,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      netAmountMinor: enforceHumanValidationRequirement(
        {
          value: 100000,
          source: "AI_EXTRACTION",
          confidenceScore: 0.95,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      vatAmountMinor: enforceHumanValidationRequirement(
        {
          value: 20000,
          source: "AI_EXTRACTION",
          confidenceScore: 0.95,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      grossAmountMinor: enforceHumanValidationRequirement(
        {
          value: 120000,
          source: "AI_EXTRACTION",
          confidenceScore: 0.95,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      vatRateBps: enforceHumanValidationRequirement(
        {
          value: 2000,
          source: "AI_EXTRACTION",
          confidenceScore: 0.93,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      currency: enforceHumanValidationRequirement(
        {
          value: "EUR",
          source: "AI_EXTRACTION",
          confidenceScore: 0.98,
          validationStatus: "PROPOSED_BY_AI",
        },
        confidenceThreshold,
        forceReview
      ),
      suggestedAccountCode: enforceHumanValidationRequirement(
        {
          value: "606000",
          source: "AI_EXTRACTION",
          confidenceScore: 0.78,
          validationStatus: "NEEDS_HUMAN_REVIEW",
        },
        confidenceThreshold,
        true
      ),
    };

    return {
      extraction: rawExtraction,
      metadata: {
        providerId: this.providerId,
        modelName: "deterministic-extractor-v1-test-only",
        isSimulatedTestAdapter: true,
        simulationNotice:
          "MODE SIMULÉ DE TEST (mock-deterministic) : ces valeurs sont générées par un bouchon déterministe local et non par une analyse OCR/LLM réelle.",
        taskType: "INVOICE_EXTRACTION",
        latencyMs: Math.max(1, Date.now() - startTime),
        estimatedCostMinorCents: 0,
        promptInjectionDetected: inspection.injectionDetected,
        sanitizedWarnings: inspection.warnings,
        disclaimer: appConfig.aiSuggestionWarning,
      },
    };
  }
}
