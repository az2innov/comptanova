import { CurrencyCode } from "./money.js";

/**
 * Types fondamentaux du cœur métier international (Niveau A — Section 2 & 5).
 * Aucune valeur fiscale nationale, aucun taux ni plan comptable n'est codé en dur ici.
 */

export type SystemRole =
  | "PLATFORM_ADMIN"
  | "FIRM_ADMIN"
  | "ACCOUNTANT_COLLABORATOR"
  | "CLIENT_DIRECTOR";

export type OrganizationType = "ACCOUNTING_FIRM" | "COMPANY" | "SOLE_PROPRIETOR";

export type ValidationStatus =
  | "PROPOSED_BY_AI"
  | "NEEDS_HUMAN_REVIEW"
  | "RULE_CHECKED"
  | "VALIDATED_BY_HUMAN"
  | "REJECTED";

/**
 * États explicites de cycle de vie et validation d'une configuration réglementaire (Section 5) :
 * - DRAFT ( alias rétrocompatible : DRAFT_INCOMPLETE )
 * - IN_REVIEW ( alias rétrocompatible : PENDING_LEGAL_VALIDATION )
 * - VALIDATED
 * - ACTIVE ( alias rétrocompatible : VALIDATED_FOR_PRODUCTION )
 * - SUSPENDED
 * - OBSOLETE ( alias rétrocompatible : DEPRECATED )
 */
export type CountryConfigValidationState =
  | "DRAFT"
  | "DRAFT_INCOMPLETE"
  | "IN_REVIEW"
  | "PENDING_LEGAL_VALIDATION"
  | "VALIDATED"
  | "ACTIVE"
  | "VALIDATED_FOR_PRODUCTION"
  | "SUSPENDED"
  | "OBSOLETE"
  | "DEPRECATED";

export type DocumentCategory =
  | "SUPPLIER_INVOICE"
  | "CUSTOMER_INVOICE"
  | "CREDIT_NOTE"
  | "RECEIPT_EXPENSE"
  | "BANK_STATEMENT"
  | "PAYMENT_PROOF"
  | "OTHER";

export type DocumentWorkflowStatus =
  | "RECEIVED"
  | "STORED"
  | "EXTRACTED"
  | "CHECKED"
  | "SUGGESTED"
  | "PENDING_REVIEW"
  | "CORRECTED"
  | "VALIDATED"
  | "REJECTED"
  | "EXPORTED";

export type AccountingEntryStatus =
  | "DRAFT"
  | "AI_SUGGESTION"
  | "VALIDATED"
  | "EXPORTED"
  | "REVERSED";

export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL_CERTAIN" | "SUSPICION_TO_VERIFY";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  organizationType: OrganizationType;
  /** Pays d'établissement principal de l'organisation */
  countryCode: string;
  /** Juridiction fiscale principale de l'organisation */
  primaryTaxJurisdictionCode?: string;
  /** Pays/juridictions dans lesquels l'organisation exerce ses activités */
  operatingCountryCodes?: string[];
  /** Devise de référence de l'organisation */
  defaultCurrency: CurrencyCode;
  /** Fuseau horaire IANA de référence (ex: "Europe/Paris", "Africa/Casablanca", "Asia/Dubai") */
  defaultTimezone?: string;
  /** Locale d'affichage préférée (ex: "fr-FR", "en-US", "ar-AE") */
  defaultLocale?: string;
  /** Quotas du modèle économique SaaS */
  quotaMaxDossiers: number;
  quotaMaxUsers: number;
  quotaMaxDocumentsPerMonth: number;
  quotaMaxAiCallsPerMonth: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  isPlatformAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: SystemRole;
  createdAt: string;
}

/**
 * Dossier client distinguant explicitement (Section 5) :
 * - le pays d'établissement (`countryCode` / `establishmentCountryCode`),
 * - la juridiction fiscale applicable (`taxJurisdictionCode`),
 * - la résidence fiscale (`taxResidenceCountryCode`),
 * - les pays d'activité (`operatingCountryCodes`),
 * - la devise de tenue/présentation comptable (`currency`),
 * - les devises de transaction autorisées (`allowedTransactionCurrencies`).
 */
export type DossierStatus = "ACTIVE" | "TO_COMPLETE" | "SUSPENDED" | "ARCHIVED";

export interface ClientDossier {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  legalForm?: string;
  legalRegistrationNumber: string | null;
  vatIntracommunityNumber?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  /** Pays d'établissement juridique de l'entité */
  countryCode: string;
  /** Juridiction fiscale applicable (peut différer du pays ISO, ex: zone franche ou sous-juridiction) */
  taxJurisdictionCode?: string;
  /** Pays de résidence fiscale */
  taxResidenceCountryCode?: string;
  /** Pays dans lesquels le dossier exerce ses activités */
  operatingCountryCodes?: string[];
  /** Identifiant de la version de configuration réglementaire initialement rattachée */
  countryConfigVersionId: string;
  /** Devise de présentation comptable du dossier */
  currency: CurrencyCode;
  /** Devises autorisées pour les transactions et comptes bancaires */
  allowedTransactionCurrencies?: CurrencyCode[];
  taxRegimeCode: string;
  vatRegimeCode?: string;
  fiscalYearStartMonth: number;
  fiscalYearStartDate?: string | null;
  fiscalYearEndDate?: string | null;
  dossierStatus?: DossierStatus;
  activitySector?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  internalNotes?: string | null;
  archivedAt?: string | null;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tiers (Client / Fournisseur) distinguant son pays d'établissement et sa juridiction fiscale (Section 5).
 */
export interface CounterpartyThirdParty {
  id: string;
  organizationId: string;
  dossierId: string;
  name: string;
  role: "CUSTOMER" | "SUPPLIER" | "BOTH";
  establishmentCountryCode: string;
  taxJurisdictionCode: string;
  taxIdentificationNumber: string | null;
  defaultCurrency: CurrencyCode;
}

export interface DossierAssignment {
  id: string;
  organizationId: string;
  dossierId: string;
  userId: string;
  canView: boolean;
  canUpload: boolean;
  canEditExtraction: boolean;
  canValidateAccounting: boolean;
  canExport: boolean;
  createdAt: string;
}

export interface ExtractedFieldValue<T = string | number> {
  value: T;
  source: "AI_EXTRACTION" | "DETERMINISTIC_PARSER" | "HUMAN_ENTRY";
  confidenceScore: number; // 0.0 à 1.0
  validationStatus: ValidationStatus;
  validatedByUserId?: string | null;
  validatedAt?: string | null;
}

export interface StoredDocument {
  id: string;
  organizationId: string;
  dossierId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Checksum: string;
  storageKey: string;
  category: DocumentCategory;
  workflowStatus: DocumentWorkflowStatus;
  extractedDataJson: string;
  aiModelVersion: string | null;
  ruleVersionId: string | null;
  uploadedByUserId: string;
  validatedByUserId: string | null;
  validatedAt: string | null;
  rejectionReason?: string | null;
  rejectedByUserId?: string | null;
  rejectedAt?: string | null;
  overrideDuplicateReason?: string | null;
  heuristicDuplicateOfId?: string | null;
  quarantineStatus?: "CLEAN" | "QUARANTINED" | "SCANNING";
  retentionUntilDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
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
  ipAddress: string | null;
  integrityHash: string;
  previousHash: string | null;
  createdAt: string;
}

// --- Module 4 : Facturation, Devis & Règlements (Lot 1.3) ---

export type QuoteStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED";

export type InvoiceWorkflowStatus =
  | "DRAFT"
  | "FINALIZED"
  | "PAID"
  | "PARTIALLY_PAID"
  | "CANCELLED";

export type PaymentMethod =
  | "BANK_TRANSFER"
  | "CHECK"
  | "CARD"
  | "DIRECT_DEBIT"
  | "CASH"
  | "OTHER";

export interface LegalMentionsPayload {
  sellerLegalForm?: string;
  sellerSirenSiret?: string;
  sellerRcsRmCity?: string;
  sellerVatNumber?: string;
  sellerAddress?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerVatNumber?: string;
  buyerSiren?: string;
  isB2B?: boolean;
  vatExemptionMention?: string; // ex: "TVA non applicable, art. 293 B du CGI"
  latePaymentPenaltiesMention?: string;
  recoveryIndemnityMention?: string; // 40 EUR pour B2B
  earlyPaymentDiscountMention?: string;
  paymentDueDate?: string;
  applicableLawAndJurisdiction?: string;
  provisionalNotice?: string;
}

export interface QuoteLine {
  id: string;
  quoteId: string;
  lineNumber: number;
  description: string;
  quantityMinor: number; // 100 = 1.00
  unitPriceNetMinor: number;
  discountRateBps: number; // 500 = 5%
  vatRateBps: number; // 2000 = 20%
  totalNetMinor: number;
  totalVatMinor: number;
  totalGrossMinor: number;
  generalAccountCode: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  organizationId: string;
  dossierId: string;
  quoteNumber: string;
  quoteStatus: QuoteStatus;
  thirdPartyId?: string | null;
  thirdPartyName: string;
  thirdPartyAddress?: string | null;
  thirdPartyTaxNumber?: string | null;
  issueDate: string;
  validityDate: string;
  currency: CurrencyCode;
  currencyMinorUnitExponent: number;
  totalNetMinor: number;
  totalVatMinor: number;
  totalGrossMinor: number;
  notes?: string | null;
  termsConditions?: string | null;
  convertedToInvoiceId?: string | null;
  convertedAt?: string | null;
  createdByUserId: string;
  lines?: QuoteLine[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  lineNumber: number;
  description: string;
  quantityMinor: number;
  unitPriceNetMinor: number;
  discountRateBps: number;
  vatRateBps: number;
  totalNetMinor: number;
  totalVatMinor: number;
  totalGrossMinor: number;
  generalAccountCode: string;
  createdAt: string;
}

export interface InvoicePayment {
  id: string;
  organizationId: string;
  dossierId: string;
  invoiceId: string;
  paymentDate: string;
  amountMinor: number;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  transactionReference?: string | null;
  notes?: string | null;
  recordedByUserId: string;
  createdAt: string;
}

export interface SalesInvoice {
  id: string;
  organizationId: string;
  dossierId: string;
  documentId?: string | null;
  direction: "ISSUED" | "RECEIVED" | "CREDIT_NOTE";
  invoiceNumber: string;
  thirdPartyName: string;
  thirdPartyId?: string | null;
  thirdPartyAddress?: string | null;
  thirdPartySirenOrVat?: string | null;
  isB2B: boolean;
  issueDate: string;
  dueDate?: string | null;
  netAmountMinor: number;
  vatAmountMinor: number;
  grossAmountMinor: number;
  paidAmountMinor: number;
  remainingAmountMinor: number;
  currency: CurrencyCode;
  currencyMinorUnitExponent: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  invoiceStatus: InvoiceWorkflowStatus;
  originQuoteId?: string | null;
  creditNoteForInvoiceId?: string | null;
  cancelledByCreditNoteId?: string | null;
  legalMentions: LegalMentionsPayload;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
  finalizedAt?: string | null;
  finalizedByUserId?: string | null;
  ruleVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export type FacturXProfile = "MINIMUM" | "BASIC" | "EN16931";

