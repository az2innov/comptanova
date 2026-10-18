import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../db/database.js";
import {
  Quote,
  QuoteLine,
  QuoteStatus,
  SalesInvoice,
  InvoiceLine,
  InvoicePayment,
  InvoiceWorkflowStatus,
  PaymentMethod,
  LegalMentionsPayload,
  FacturXProfile,
  ClientDossier,
  CounterpartyThirdParty,
} from "../domain/types.js";
import { CurrencyCode } from "../domain/money.js";
import {
  AuthenticatedSessionContext,
  assertDossierAccess,
  AuthorizationError,
} from "../auth/auth-service.js";
import { recordAuditLog } from "../audit/audit-service.js";

/**
 * Service de Facturation, Devis, Transformation et Règlements (Module 4 — Phase 1, Lot 1.3).
 *
 * Implémente :
 * 1. Séquenceur de numérotation chronologique continue sans trou (devis DEV-YYYY-XXXX, factures FAC-YYYY-XXXX, avoirs AV-YYYY-XXXX).
 * 2. Arithmétique monétaire exacte en unités mineures sans flottants IEEE-754.
 * 3. Mentions légales obligatoires conformes au Livre des Procédures Fiscales et au Code de commerce.
 * 4. Transformation contrôlée et atomique Devis -> Facture avec protection anti-duplication.
 * 5. Verrouillage strict des factures finalisées et procédure d'annulation traçable par Avoir (CREDIT_NOTE).
 * 6. Gestion des règlements avec calcul du solde restant dû.
 * 7. Aperçu imprimable HTML (format A4 @media print).
 * 8. Génération du flux XML Factur-X / ZUGFeRD (Niveau 2) et spécification de l'interface PDP (Niveau 3).
 */

// --- 1. SÉQUENCEUR DE NUMÉROTATION CONTINUE SANS TROU ---

export function getNextSequenceNumber(params: {
  organizationId: string;
  dossierId: string;
  sequenceType: "QUOTE" | "INVOICE" | "CREDIT_NOTE";
  fiscalYear: number;
  db?: DatabaseSync;
}): string {
  const db = params.db ?? getDatabase();
  const prefixMap = {
    QUOTE: "DEV",
    INVOICE: "FAC",
    CREDIT_NOTE: "AV",
  };
  const prefix = prefixMap[params.sequenceType];
  const now = new Date().toISOString();

  // Insertion ou mise à jour atomique de la séquence
  db.prepare(
    `INSERT INTO dossier_numbering_sequences (
      id, organization_id, dossier_id, sequence_type, prefix, fiscal_year, last_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(dossier_id, sequence_type, fiscal_year) DO NOTHING`
  ).run(
    crypto.randomUUID(),
    params.organizationId,
    params.dossierId,
    params.sequenceType,
    prefix,
    params.fiscalYear,
    now,
    now
  );

  db.prepare(
    `UPDATE dossier_numbering_sequences
     SET last_number = last_number + 1, updated_at = ?
     WHERE dossier_id = ? AND sequence_type = ? AND fiscal_year = ?`
  ).run(now, params.dossierId, params.sequenceType, params.fiscalYear);

  const row = db
    .prepare(
      `SELECT last_number FROM dossier_numbering_sequences
       WHERE dossier_id = ? AND sequence_type = ? AND fiscal_year = ?`
    )
    .get(params.dossierId, params.sequenceType, params.fiscalYear) as {
    last_number: number;
  };

  const seqNumber = row?.last_number ?? 1;
  return `${prefix}-${params.fiscalYear}-${String(seqNumber).padStart(4, "0")}`;
}

// --- 2. CALCULS ARITHMÉTIQUES DES LIGNES & MENTIONS LÉGALES ---

export interface LineComputationInput {
  description: string;
  quantityMinor?: number; // 100 = 1.00
  unitPriceNetMinor: number;
  discountRateBps?: number; // 500 = 5%
  vatRateBps: number; // 2000 = 20%
  generalAccountCode?: string;
}

export interface ComputedLineResult {
  description: string;
  quantityMinor: number;
  unitPriceNetMinor: number;
  discountRateBps: number;
  vatRateBps: number;
  totalNetMinor: number;
  totalVatMinor: number;
  totalGrossMinor: number;
  generalAccountCode: string;
}

export function computeDocumentLines(
  lines: LineComputationInput[],
  isVatExempt: boolean = false
): {
  computedLines: ComputedLineResult[];
  totalNetMinor: number;
  totalVatMinor: number;
  totalGrossMinor: number;
  vatBreakdown: Array<{
    vatRateBps: number;
    baseNetMinor: number;
    vatAmountMinor: number;
  }>;
} {
  let totalNetMinor = 0;
  let totalVatMinor = 0;

  const vatMap = new Map<number, { baseNet: number; vat: number }>();
  const computedLines: ComputedLineResult[] = [];

  for (const line of lines) {
    const qty = line.quantityMinor !== undefined && line.quantityMinor > 0 ? line.quantityMinor : 100;
    const pu = line.unitPriceNetMinor;
    const discount = line.discountRateBps || 0;
    const rawVatRate = isVatExempt ? 0 : line.vatRateBps || 0;

    // Calcul brut HT : (pu * qty) / 100
    const rawNet = Math.round((pu * qty) / 100);
    // Remise
    const discountAmount = Math.round((rawNet * discount) / 10000);
    const lineNet = Math.max(0, rawNet - discountAmount);
    // TVA
    const lineVat = Math.round((lineNet * rawVatRate) / 10000);
    const lineGross = lineNet + lineVat;

    computedLines.push({
      description: line.description.trim(),
      quantityMinor: qty,
      unitPriceNetMinor: pu,
      discountRateBps: discount,
      vatRateBps: rawVatRate,
      totalNetMinor: lineNet,
      totalVatMinor: lineVat,
      totalGrossMinor: lineGross,
      generalAccountCode: line.generalAccountCode || "706000",
    });

    totalNetMinor += lineNet;
    totalVatMinor += lineVat;

    const existingVat = vatMap.get(rawVatRate) || { baseNet: 0, vat: 0 };
    existingVat.baseNet += lineNet;
    existingVat.vat += lineVat;
    vatMap.set(rawVatRate, existingVat);
  }

  const totalGrossMinor = totalNetMinor + totalVatMinor;

  const vatBreakdown = Array.from(vatMap.entries()).map(([rate, vals]) => ({
    vatRateBps: rate,
    baseNetMinor: vals.baseNet,
    vatAmountMinor: vals.vat,
  }));

  return {
    computedLines,
    totalNetMinor,
    totalVatMinor,
    totalGrossMinor,
    vatBreakdown,
  };
}

export function computeLegalMentions(params: {
  dossier: any;
  thirdPartyName: string;
  thirdPartyAddress?: string | null;
  thirdPartyTaxNumber?: string | null;
  isB2B: boolean;
  dueDate?: string | null;
}): LegalMentionsPayload {
  const d = params.dossier;
  const isFranchise =
    d.vat_regime_code === "FR_TVA_FRANCHISE_BASE" ||
    (d.tax_regime_code && d.tax_regime_code.includes("MICRO"));

  return {
    sellerLegalForm: d.legal_form || "SAS",
    sellerSirenSiret: d.legal_registration_number || undefined,
    sellerRcsRmCity: d.city ? `RCS ${d.city}` : undefined,
    sellerVatNumber: d.vat_intracommunity_number || undefined,
    sellerAddress: [d.address_line, d.postal_code, d.city, d.country_code]
      .filter(Boolean)
      .join(", "),
    buyerName: params.thirdPartyName,
    buyerAddress: params.thirdPartyAddress || undefined,
    buyerVatNumber: params.thirdPartyTaxNumber || undefined,
    buyerSiren: params.isB2B && params.thirdPartyTaxNumber ? params.thirdPartyTaxNumber.slice(0, 9) : undefined,
    isB2B: params.isB2B,
    vatExemptionMention: isFranchise
      ? "TVA non applicable, art. 293 B du Code Général des Impôts (CGI)"
      : undefined,
    latePaymentPenaltiesMention:
      "En cas de retard de paiement, pénalités de retard calculées sur la base de trois fois le taux d'intérêt légal (taux BCE majoré de 10 points) exigibles de plein droit sans rappel préalable.",
    recoveryIndemnityMention: params.isB2B
      ? "Pour les professionnels : indemnité forfaitaire légale pour frais de recouvrement de 40 € en cas de retard de paiement (articles L. 441-10 et D. 441-5 du Code de commerce)."
      : undefined,
    earlyPaymentDiscountMention: "Aucun escompte consenti pour paiement anticipé.",
    paymentDueDate: params.dueDate || undefined,
    applicableLawAndJurisdiction:
      "Droit applicable : Droit français. En cas de litige, compétence exclusive des tribunaux du siège de l'émetteur.",
    provisionalNotice:
      "Mention légale indicative générée par ComptaNova. Ne dispense pas d'un audit de conformité par un professionnel habilité.",
  };
}

// --- 3. MODULE DEVIS (QUOTES) ---

export function createQuote(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  thirdPartyName: string;
  thirdPartyId?: string | null;
  thirdPartyAddress?: string | null;
  thirdPartyTaxNumber?: string | null;
  issueDate: string;
  validityDate: string;
  currency?: CurrencyCode;
  notes?: string | null;
  termsConditions?: string | null;
  lines: LineComputationInput[];
  db?: DatabaseSync;
}): Quote {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "UPLOAD", // ou création
    db,
  });

  const dossier = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as any;

  if (!dossier) {
    throw new Error(`Dossier introuvable : ${params.dossierId}`);
  }

  const isVatExempt =
    dossier.vat_regime_code === "FR_TVA_FRANCHISE_BASE" ||
    (dossier.tax_regime_code && dossier.tax_regime_code.includes("MICRO"));

  const { computedLines, totalNetMinor, totalVatMinor, totalGrossMinor } =
    computeDocumentLines(params.lines, isVatExempt);

  const fiscalYear = Number.parseInt(params.issueDate.slice(0, 4), 10) || new Date().getUTCFullYear();
  const quoteNumber = getNextSequenceNumber({
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    sequenceType: "QUOTE",
    fiscalYear,
    db,
  });

  const quoteId = crypto.randomUUID();
  const now = new Date().toISOString();
  const currency = params.currency || (dossier.currency as CurrencyCode) || "EUR";

  db.prepare(
    `INSERT INTO quotes (
      id, organization_id, dossier_id, quote_number, quote_status,
      third_party_id, third_party_name, third_party_address, third_party_tax_number,
      issue_date, validity_date, currency, currency_minor_unit_exponent,
      total_net_minor, total_vat_minor, total_gross_minor, notes, terms_conditions,
      converted_to_invoice_id, converted_at, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`
  ).run(
    quoteId,
    params.organizationId,
    params.dossierId,
    quoteNumber,
    params.thirdPartyId || null,
    params.thirdPartyName.trim(),
    params.thirdPartyAddress || null,
    params.thirdPartyTaxNumber || null,
    params.issueDate,
    params.validityDate,
    currency,
    totalNetMinor,
    totalVatMinor,
    totalGrossMinor,
    params.notes || null,
    params.termsConditions || null,
    params.session!.user.id,
    now,
    now
  );

  const insertLine = db.prepare(
    `INSERT INTO quote_lines (
      id, quote_id, line_number, description, quantity_minor,
      unit_price_net_minor, discount_rate_bps, vat_rate_bps,
      total_net_minor, total_vat_minor, total_gross_minor, general_account_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const linesResult: QuoteLine[] = [];
  computedLines.forEach((l, idx) => {
    const lineId = crypto.randomUUID();
    insertLine.run(
      lineId,
      quoteId,
      idx + 1,
      l.description,
      l.quantityMinor,
      l.unitPriceNetMinor,
      l.discountRateBps,
      l.vatRateBps,
      l.totalNetMinor,
      l.totalVatMinor,
      l.totalGrossMinor,
      l.generalAccountCode,
      now
    );
    linesResult.push({
      id: lineId,
      quoteId,
      lineNumber: idx + 1,
      description: l.description,
      quantityMinor: l.quantityMinor,
      unitPriceNetMinor: l.unitPriceNetMinor,
      discountRateBps: l.discountRateBps,
      vatRateBps: l.vatRateBps,
      totalNetMinor: l.totalNetMinor,
      totalVatMinor: l.totalVatMinor,
      totalGrossMinor: l.totalGrossMinor,
      generalAccountCode: l.generalAccountCode,
      createdAt: now,
    });
  });

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: "AUTHENTICATED_USER",
      action: "QUOTE_CREATED",
      targetEntityType: "QUOTE",
      targetEntityId: quoteId,
      metadata: {
        quoteNumber,
        thirdPartyName: params.thirdPartyName,
        totalGrossMinor,
        linesCount: computedLines.length,
      },
    },
    db
  );

  return {
    id: quoteId,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    quoteNumber,
    quoteStatus: "DRAFT",
    thirdPartyId: params.thirdPartyId,
    thirdPartyName: params.thirdPartyName.trim(),
    thirdPartyAddress: params.thirdPartyAddress,
    thirdPartyTaxNumber: params.thirdPartyTaxNumber,
    issueDate: params.issueDate,
    validityDate: params.validityDate,
    currency,
    currencyMinorUnitExponent: 2,
    totalNetMinor,
    totalVatMinor,
    totalGrossMinor,
    notes: params.notes,
    termsConditions: params.termsConditions,
    convertedToInvoiceId: null,
    convertedAt: null,
    createdByUserId: params.session!.user.id,
    lines: linesResult,
    createdAt: now,
    updatedAt: now,
  };
}

export function getQuoteDetails(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  quoteId: string;
  db?: DatabaseSync;
}): Quote {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  const row = db
    .prepare("SELECT * FROM quotes WHERE id = ? AND organization_id = ? AND dossier_id = ?")
    .get(params.quoteId, params.organizationId, params.dossierId) as any;

  if (!row) {
    throw new Error(`Devis introuvable : ${params.quoteId}`);
  }

  const lines = db
    .prepare("SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY line_number ASC")
    .all(row.id) as any[];

  return {
    id: row.id,
    organizationId: row.organization_id,
    dossierId: row.dossier_id,
    quoteNumber: row.quote_number,
    quoteStatus: row.quote_status,
    thirdPartyId: row.third_party_id,
    thirdPartyName: row.third_party_name,
    thirdPartyAddress: row.third_party_address,
    thirdPartyTaxNumber: row.third_party_tax_number,
    issueDate: row.issue_date,
    validityDate: row.validity_date,
    currency: row.currency,
    currencyMinorUnitExponent: Number(row.currency_minor_unit_exponent),
    totalNetMinor: Number(row.total_net_minor),
    totalVatMinor: Number(row.total_vat_minor),
    totalGrossMinor: Number(row.total_gross_minor),
    notes: row.notes,
    termsConditions: row.terms_conditions,
    convertedToInvoiceId: row.converted_to_invoice_id,
    convertedAt: row.converted_at,
    createdByUserId: row.created_by_user_id,
    lines: lines.map((l) => ({
      id: l.id,
      quoteId: l.quote_id,
      lineNumber: Number(l.line_number),
      description: l.description,
      quantityMinor: Number(l.quantity_minor),
      unitPriceNetMinor: Number(l.unit_price_net_minor),
      discountRateBps: Number(l.discount_rate_bps),
      vatRateBps: Number(l.vat_rate_bps),
      totalNetMinor: Number(l.total_net_minor),
      totalVatMinor: Number(l.total_vat_minor),
      totalGrossMinor: Number(l.total_gross_minor),
      generalAccountCode: l.general_account_code,
      createdAt: l.created_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listQuotesForDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  status?: QuoteStatus;
  db?: DatabaseSync;
}): Quote[] {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  let sql = "SELECT * FROM quotes WHERE organization_id = ? AND dossier_id = ?";
  const queryParams: any[] = [params.organizationId, params.dossierId];

  if (params.status) {
    sql += " AND quote_status = ?";
    queryParams.push(params.status);
  }

  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...queryParams) as any[];

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    dossierId: row.dossier_id,
    quoteNumber: row.quote_number,
    quoteStatus: row.quote_status,
    thirdPartyId: row.third_party_id,
    thirdPartyName: row.third_party_name,
    thirdPartyAddress: row.third_party_address,
    thirdPartyTaxNumber: row.third_party_tax_number,
    issueDate: row.issue_date,
    validityDate: row.validity_date,
    currency: row.currency,
    currencyMinorUnitExponent: Number(row.currency_minor_unit_exponent),
    totalNetMinor: Number(row.total_net_minor),
    totalVatMinor: Number(row.total_vat_minor),
    totalGrossMinor: Number(row.total_gross_minor),
    notes: row.notes,
    termsConditions: row.terms_conditions,
    convertedToInvoiceId: row.converted_to_invoice_id,
    convertedAt: row.converted_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// --- 4. TRANSFORMATION CONTRÔLÉE DEVIS -> FACTURE ---

export function convertQuoteToInvoice(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  quoteId: string;
  dueDate?: string;
  isB2B?: boolean;
  db?: DatabaseSync;
}): SalesInvoice {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "UPLOAD",
    db,
  });

  const quote = getQuoteDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    quoteId: params.quoteId,
    db,
  });

  // Protection anti-duplication : rejet si déjà converti
  if (quote.quoteStatus === "CONVERTED" || quote.convertedToInvoiceId) {
    throw new Error(
      `Le devis ${quote.quoteNumber} a déjà été transformé en facture (${quote.convertedToInvoiceId}) le ${quote.convertedAt}. Re-transformation interdite.`
    );
  }

  if (quote.quoteStatus === "REJECTED" || quote.quoteStatus === "EXPIRED") {
    throw new Error(
      `Impossible de transformer un devis au statut ${quote.quoteStatus}.`
    );
  }

  const lines = quote.lines || [];
  if (lines.length === 0) {
    throw new Error("Impossible de transformer un devis ne comportant aucune ligne.");
  }

  const now = new Date().toISOString();
  const issueDate = now.slice(0, 10);
  const dueDate =
    params.dueDate ||
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Création directe de la facture de vente issue du devis
  const invoice = createSalesInvoice({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    thirdPartyName: quote.thirdPartyName,
    thirdPartyId: quote.thirdPartyId,
    thirdPartyAddress: quote.thirdPartyAddress,
    thirdPartyTaxNumber: quote.thirdPartyTaxNumber,
    isB2B: params.isB2B !== undefined ? params.isB2B : true,
    issueDate,
    dueDate,
    currency: quote.currency,
    originQuoteId: quote.id,
    lines: lines.map((l) => ({
      description: l.description,
      quantityMinor: l.quantityMinor,
      unitPriceNetMinor: l.unitPriceNetMinor,
      discountRateBps: l.discountRateBps,
      vatRateBps: l.vatRateBps,
      generalAccountCode: l.generalAccountCode,
    })),
    db,
  });

  // Mise à jour atomique du statut du devis
  db.prepare(
    `UPDATE quotes
     SET quote_status = 'CONVERTED', converted_to_invoice_id = ?, converted_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(invoice.id, now, now, quote.id);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: "AUTHENTICATED_USER",
      action: "QUOTE_CONVERTED_TO_INVOICE",
      targetEntityType: "QUOTE",
      targetEntityId: quote.id,
      metadata: {
        quoteNumber: quote.quoteNumber,
        generatedInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      },
    },
    db
  );

  return invoice;
}

// --- 5. MODULE FACTURES DE VENTE & AVOIRS ---

export function createSalesInvoice(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  thirdPartyName: string;
  thirdPartyId?: string | null;
  thirdPartyAddress?: string | null;
  thirdPartyTaxNumber?: string | null;
  isB2B?: boolean;
  issueDate: string;
  dueDate?: string | null;
  currency?: CurrencyCode;
  originQuoteId?: string | null;
  lines: LineComputationInput[];
  db?: DatabaseSync;
}): SalesInvoice {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "UPLOAD",
    db,
  });

  const dossier = db
    .prepare("SELECT * FROM client_dossiers WHERE id = ? AND organization_id = ?")
    .get(params.dossierId, params.organizationId) as any;

  if (!dossier) {
    throw new Error(`Dossier introuvable : ${params.dossierId}`);
  }

  const isVatExempt =
    dossier.vat_regime_code === "FR_TVA_FRANCHISE_BASE" ||
    (dossier.tax_regime_code && dossier.tax_regime_code.includes("MICRO"));

  const { computedLines, totalNetMinor, totalVatMinor, totalGrossMinor } =
    computeDocumentLines(params.lines, isVatExempt);

  const invoiceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const currency = params.currency || (dossier.currency as CurrencyCode) || "EUR";
  const isB2B = params.isB2B !== undefined ? params.isB2B : true;

  // Numérotation provisoire en DRAFT
  const draftNumber = `BROUILLON-${invoiceId.slice(0, 8).toUpperCase()}`;

  const legalMentions = computeLegalMentions({
    dossier,
    thirdPartyName: params.thirdPartyName.trim(),
    thirdPartyAddress: params.thirdPartyAddress,
    thirdPartyTaxNumber: params.thirdPartyTaxNumber,
    isB2B,
    dueDate: params.dueDate,
  });

  db.prepare(
    `INSERT INTO invoices (
      id, organization_id, dossier_id, document_id, direction, invoice_number,
      third_party_name, third_party_country_code, third_party_tax_jurisdiction_code,
      issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
      paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
      validation_status, rule_version_id, origin_quote_id, legal_mentions_json,
      third_party_id, third_party_address, third_party_siren_or_vat, is_b2b,
      invoice_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, NULL, 'ISSUED', ?, ?, 'FR', 'FR', ?, ?, ?, ?, ?,
      0, ?, 2, 'UNPAID', 'VALIDATED_BY_HUMAN', ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?
    )`
  ).run(
    invoiceId,
    params.organizationId,
    params.dossierId,
    draftNumber,
    params.thirdPartyName.trim(),
    params.issueDate,
    params.dueDate || null,
    totalNetMinor,
    totalVatMinor,
    totalGrossMinor,
    currency,
    dossier.country_config_version_id,
    params.originQuoteId || null,
    JSON.stringify(legalMentions),
    params.thirdPartyId || null,
    params.thirdPartyAddress || null,
    params.thirdPartyTaxNumber || null,
    isB2B ? 1 : 0,
    now,
    now
  );

  const insertLine = db.prepare(
    `INSERT INTO invoice_lines (
      id, invoice_id, line_number, description, quantity_minor,
      unit_price_net_minor, discount_rate_bps, vat_rate_bps,
      total_net_minor, total_vat_minor, total_gross_minor, general_account_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const linesResult: InvoiceLine[] = [];
  computedLines.forEach((l, idx) => {
    const lineId = crypto.randomUUID();
    insertLine.run(
      lineId,
      invoiceId,
      idx + 1,
      l.description,
      l.quantityMinor,
      l.unitPriceNetMinor,
      l.discountRateBps,
      l.vatRateBps,
      l.totalNetMinor,
      l.totalVatMinor,
      l.totalGrossMinor,
      l.generalAccountCode,
      now
    );
    linesResult.push({
      id: lineId,
      invoiceId,
      lineNumber: idx + 1,
      description: l.description,
      quantityMinor: l.quantityMinor,
      unitPriceNetMinor: l.unitPriceNetMinor,
      discountRateBps: l.discountRateBps,
      vatRateBps: l.vatRateBps,
      totalNetMinor: l.totalNetMinor,
      totalVatMinor: l.totalVatMinor,
      totalGrossMinor: l.totalGrossMinor,
      generalAccountCode: l.generalAccountCode,
      createdAt: now,
    });
  });

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: params.session!.user.id,
      actorRole: "AUTHENTICATED_USER",
      action: "INVOICE_CREATED_DRAFT",
      targetEntityType: "INVOICE",
      targetEntityId: invoiceId,
      metadata: {
        draftNumber,
        thirdPartyName: params.thirdPartyName,
        totalGrossMinor,
        linesCount: computedLines.length,
      },
    },
    db
  );

  return {
    id: invoiceId,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    direction: "ISSUED",
    invoiceNumber: draftNumber,
    thirdPartyName: params.thirdPartyName.trim(),
    thirdPartyId: params.thirdPartyId,
    thirdPartyAddress: params.thirdPartyAddress,
    thirdPartySirenOrVat: params.thirdPartyTaxNumber,
    isB2B,
    issueDate: params.issueDate,
    dueDate: params.dueDate,
    netAmountMinor: totalNetMinor,
    vatAmountMinor: totalVatMinor,
    grossAmountMinor: totalGrossMinor,
    paidAmountMinor: 0,
    remainingAmountMinor: totalGrossMinor,
    currency,
    currencyMinorUnitExponent: 2,
    paymentStatus: "UNPAID",
    invoiceStatus: "DRAFT",
    originQuoteId: params.originQuoteId,
    legalMentions,
    lines: linesResult,
    payments: [],
    finalizedAt: null,
    finalizedByUserId: null,
    ruleVersionId: dossier.country_config_version_id,
    createdAt: now,
    updatedAt: now,
  };
}

export function finalizeSalesInvoice(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  invoiceId: string;
  db?: DatabaseSync;
}): SalesInvoice {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    db,
  });

  const row = db
    .prepare("SELECT * FROM invoices WHERE id = ? AND organization_id = ? AND dossier_id = ?")
    .get(params.invoiceId, params.organizationId, params.dossierId) as any;

  if (!row) {
    throw new Error(`Facture introuvable : ${params.invoiceId}`);
  }

  if (row.invoice_status !== "DRAFT") {
    throw new Error(
      `La facture (${row.invoice_number}) est déjà finalisée au statut ${row.invoice_status}.`
    );
  }

  const fiscalYear = Number.parseInt(row.issue_date.slice(0, 4), 10) || new Date().getUTCFullYear();
  const officialInvoiceNumber = getNextSequenceNumber({
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    sequenceType: "INVOICE",
    fiscalYear,
    db,
  });

  const now = new Date().toISOString();
  const userId = params.session!.user.id;

  db.prepare(
    `UPDATE invoices
     SET invoice_number = ?, invoice_status = 'FINALIZED', finalized_at = ?, finalized_by_user_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(officialInvoiceNumber, now, userId, now, params.invoiceId);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: "INVOICE_FINALIZED",
      targetEntityType: "INVOICE",
      targetEntityId: params.invoiceId,
      metadata: {
        previousNumber: row.invoice_number,
        officialInvoiceNumber,
        totalGrossMinor: Number(row.gross_amount_minor),
      },
    },
    db
  );

  return getSalesInvoiceDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    invoiceId: params.invoiceId,
    db,
  });
}

export function createCreditNoteForInvoice(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  invoiceId: string;
  reason: string;
  partialGrossAmountMinor?: number;
  db?: DatabaseSync;
}): {
  creditNote: SalesInvoice;
  originalInvoice: SalesInvoice;
  isPartial: boolean;
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    db,
  });

  if (!params.reason || params.reason.trim().length < 5) {
    throw new Error("Le motif d'émission d'un avoir est obligatoire (au moins 5 caractères).");
  }

  const original = getSalesInvoiceDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    invoiceId: params.invoiceId,
    db,
  });

  if (original.invoiceStatus === "DRAFT") {
    throw new Error(
      "Impossible d'émettre un avoir sur une facture brouillon (supprimez ou modifiez directement le brouillon)."
    );
  }

  if (original.invoiceStatus === "CANCELLED" || original.cancelledByCreditNoteId) {
    throw new Error(
      `Cette facture a déjà été annulée par l'avoir ${original.cancelledByCreditNoteId}.`
    );
  }

  if (original.direction === "CREDIT_NOTE") {
    throw new Error("Impossible d'émettre un avoir pour annuler un avoir.");
  }

  const isPartial =
    params.partialGrossAmountMinor !== undefined &&
    params.partialGrossAmountMinor !== null &&
    params.partialGrossAmountMinor < original.grossAmountMinor;

  if (params.partialGrossAmountMinor !== undefined && params.partialGrossAmountMinor !== null) {
    if (!Number.isSafeInteger(params.partialGrossAmountMinor) || params.partialGrossAmountMinor <= 0) {
      throw new Error("Le montant d'un avoir partiel doit être un entier strictement positif.");
    }
    if (params.partialGrossAmountMinor > original.grossAmountMinor) {
      throw new Error("Le montant d'un avoir partiel ne peut pas excéder le montant total TTC de la facture d'origine.");
    }
  }

  const grossAmountMinor = isPartial ? params.partialGrossAmountMinor! : original.grossAmountMinor;
  const ratio = grossAmountMinor / original.grossAmountMinor;
  const netAmountMinor = isPartial ? Math.round(original.netAmountMinor * ratio) : original.netAmountMinor;
  const vatAmountMinor = isPartial ? grossAmountMinor - netAmountMinor : original.vatAmountMinor;

  const fiscalYear = Number.parseInt(original.issueDate.slice(0, 4), 10) || new Date().getUTCFullYear();
  const creditNoteNumber = getNextSequenceNumber({
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    sequenceType: "CREDIT_NOTE",
    fiscalYear,
    db,
  });

  const creditNoteId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = params.session!.user.id;

  // Création de l'avoir lié
  db.prepare(
    `INSERT INTO invoices (
      id, organization_id, dossier_id, document_id, direction, invoice_number,
      third_party_name, third_party_country_code, third_party_tax_jurisdiction_code,
      issue_date, due_date, net_amount_minor, vat_amount_minor, gross_amount_minor,
      paid_amount_minor, currency, currency_minor_unit_exponent, payment_status,
      validation_status, rule_version_id, credit_note_for_invoice_id, legal_mentions_json,
      third_party_id, third_party_address, third_party_siren_or_vat, is_b2b,
      invoice_status, finalized_at, finalized_by_user_id, created_at, updated_at
    ) VALUES (
      ?, ?, ?, NULL, 'CREDIT_NOTE', ?, ?, 'FR', 'FR', ?, ?, ?, ?, ?,
      ?, ?, 2, 'PAID', 'VALIDATED_BY_HUMAN', ?, ?, ?, ?, ?, ?, ?, 'FINALIZED', ?, ?, ?, ?
    )`
  ).run(
    creditNoteId,
    params.organizationId,
    params.dossierId,
    creditNoteNumber,
    original.thirdPartyName,
    now.slice(0, 10),
    now.slice(0, 10),
    -Math.abs(netAmountMinor),
    -Math.abs(vatAmountMinor),
    -Math.abs(grossAmountMinor),
    -Math.abs(grossAmountMinor),
    original.currency,
    original.ruleVersionId,
    original.id,
    JSON.stringify({
      ...original.legalMentions,
      cancellationReason: params.reason.trim(),
      originalInvoiceNumber: original.invoiceNumber,
      isPartialCreditNote: isPartial,
      partialAmountMinor: isPartial ? grossAmountMinor : undefined,
    }),
    original.thirdPartyId || null,
    original.thirdPartyAddress || null,
    original.thirdPartySirenOrVat || null,
    original.isB2B ? 1 : 0,
    now,
    userId,
    now,
    now
  );

  const insertLine = db.prepare(
    `INSERT INTO invoice_lines (
      id, invoice_id, line_number, description, quantity_minor,
      unit_price_net_minor, discount_rate_bps, vat_rate_bps,
      total_net_minor, total_vat_minor, total_gross_minor, general_account_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  if (isPartial) {
    insertLine.run(
      crypto.randomUUID(),
      creditNoteId,
      1,
      `Avoir partiel sur facture ${original.invoiceNumber} : ${params.reason.trim()}`,
      100,
      netAmountMinor,
      0,
      Math.round((vatAmountMinor / (netAmountMinor || 1)) * 10000) || 2000,
      -Math.abs(netAmountMinor),
      -Math.abs(vatAmountMinor),
      -Math.abs(grossAmountMinor),
      "706000",
      now
    );
  } else {
    (original.lines || []).forEach((l) => {
      insertLine.run(
        crypto.randomUUID(),
        creditNoteId,
        l.lineNumber,
        `Annulation : ${l.description}`,
        l.quantityMinor,
        l.unitPriceNetMinor,
        l.discountRateBps,
        l.vatRateBps,
        -Math.abs(l.totalNetMinor),
        -Math.abs(l.totalVatMinor),
        -Math.abs(l.totalGrossMinor),
        l.generalAccountCode,
        now
      );
    });
  }

  // Si avoir total : facture d'origine marquée CANCELLED
  // Si avoir partiel : facture d'origine NON annulée, enregistrement de l'avoir partiel dans l'historique
  if (!isPartial) {
    db.prepare(
      `UPDATE invoices
       SET invoice_status = 'CANCELLED', cancelled_by_credit_note_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(creditNoteId, now, original.id);
  } else {
    const currentMentions = (original.legalMentions || {}) as any;
    const partialCreditNotes = Array.isArray(currentMentions.partialCreditNotes)
      ? currentMentions.partialCreditNotes
      : [];
    partialCreditNotes.push({
      id: creditNoteId,
      creditNoteNumber,
      amountMinor: grossAmountMinor,
      reason: params.reason.trim(),
      issuedAt: now,
    });
    db.prepare(
      `UPDATE invoices
       SET legal_mentions_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify({
        ...currentMentions,
        partialCreditNotes,
      }),
      now,
      original.id
    );
  }

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: isPartial ? "PARTIAL_CREDIT_NOTE_ISSUED" : "CREDIT_NOTE_ISSUED",
      targetEntityType: "INVOICE",
      targetEntityId: creditNoteId,
      justification: params.reason.trim(),
      metadata: {
        creditNoteNumber,
        originalInvoiceId: original.id,
        originalInvoiceNumber: original.invoiceNumber,
        isPartial,
        grossAmountMinor,
      },
    },
    db
  );

  return {
    creditNote: getSalesInvoiceDetails({
      session: params.session,
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      invoiceId: creditNoteId,
      db,
    }),
    originalInvoice: getSalesInvoiceDetails({
      session: params.session,
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      invoiceId: original.id,
      db,
    }),
    isPartial,
  };
}

export function recordInvoicePayment(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  transactionReference?: string | null;
  notes?: string | null;
  db?: DatabaseSync;
}): {
  payment: InvoicePayment;
  invoice: SalesInvoice;
} {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VALIDATE_ACCOUNTING",
    db,
  });

  if (!Number.isSafeInteger(params.amountMinor) || params.amountMinor <= 0) {
    throw new Error("Le montant du règlement doit être un entier positif en centimes.");
  }

  const invoice = getSalesInvoiceDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    invoiceId: params.invoiceId,
    db,
  });

  if (invoice.invoiceStatus === "DRAFT") {
    throw new Error("Impossible d'enregistrer un règlement sur une facture encore au statut brouillon.");
  }

  if (invoice.invoiceStatus === "CANCELLED") {
    throw new Error("Impossible d'enregistrer un règlement sur une facture annulée par avoir.");
  }

  const remaining = invoice.remainingAmountMinor;
  if (params.amountMinor > remaining) {
    throw new Error(
      `Le montant réglé (${(params.amountMinor / 100).toFixed(2)} €) dépasse le solde restant dû (${(remaining / 100).toFixed(2)} €).`
    );
  }

  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = params.session!.user.id;

  db.prepare(
    `INSERT INTO invoice_payments (
      id, organization_id, dossier_id, invoice_id, payment_date,
      amount_minor, currency, payment_method, transaction_reference,
      notes, recorded_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    paymentId,
    params.organizationId,
    params.dossierId,
    params.invoiceId,
    params.paymentDate,
    params.amountMinor,
    invoice.currency,
    params.paymentMethod,
    params.transactionReference || null,
    params.notes || null,
    userId,
    now
  );

  const newPaidAmount = invoice.paidAmountMinor + params.amountMinor;
  const newPaymentStatus = newPaidAmount >= invoice.grossAmountMinor ? "PAID" : "PARTIALLY_PAID";
  const newInvoiceStatus = newPaymentStatus === "PAID" ? "PAID" : "PARTIALLY_PAID";

  db.prepare(
    `UPDATE invoices
     SET paid_amount_minor = ?, payment_status = ?, invoice_status = ?, updated_at = ?
     WHERE id = ?`
  ).run(newPaidAmount, newPaymentStatus, newInvoiceStatus, now, invoice.id);

  recordAuditLog(
    {
      organizationId: params.organizationId,
      dossierId: params.dossierId,
      actorUserId: userId,
      actorRole: "AUTHENTICATED_USER",
      action: "INVOICE_PAYMENT_RECORDED",
      targetEntityType: "INVOICE",
      targetEntityId: invoice.id,
      metadata: {
        paymentId,
        amountMinor: params.amountMinor,
        paymentMethod: params.paymentMethod,
        newPaidAmount,
        newPaymentStatus,
      },
    },
    db
  );

  const payment: InvoicePayment = {
    id: paymentId,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    invoiceId: invoice.id,
    paymentDate: params.paymentDate,
    amountMinor: params.amountMinor,
    currency: invoice.currency,
    paymentMethod: params.paymentMethod,
    transactionReference: params.transactionReference,
    notes: params.notes,
    recordedByUserId: userId,
    createdAt: now,
  };

  const updatedInvoice = getSalesInvoiceDetails({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    invoiceId: invoice.id,
    db,
  });

  return { payment, invoice: updatedInvoice };
}

export function getSalesInvoiceDetails(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  invoiceId: string;
  db?: DatabaseSync;
}): SalesInvoice {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  const row = db
    .prepare("SELECT * FROM invoices WHERE id = ? AND organization_id = ? AND dossier_id = ?")
    .get(params.invoiceId, params.organizationId, params.dossierId) as any;

  if (!row) {
    throw new Error(`Facture introuvable : ${params.invoiceId}`);
  }

  const lines = db
    .prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_number ASC")
    .all(row.id) as any[];

  const payments = db
    .prepare("SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date ASC")
    .all(row.id) as any[];

  let legalMentions: LegalMentionsPayload = {};
  try {
    legalMentions = JSON.parse(row.legal_mentions_json || "{}");
  } catch {
    legalMentions = {};
  }

  const gross = Number(row.gross_amount_minor);
  const paid = Number(row.paid_amount_minor || 0);
  const remaining = Math.max(0, gross - paid);

  return {
    id: row.id,
    organizationId: row.organization_id,
    dossierId: row.dossier_id,
    documentId: row.document_id,
    direction: row.direction,
    invoiceNumber: row.invoice_number,
    thirdPartyName: row.third_party_name,
    thirdPartyId: row.third_party_id,
    thirdPartyAddress: row.third_party_address,
    thirdPartySirenOrVat: row.third_party_siren_or_vat,
    isB2B: Number(row.is_b2b ?? 1) === 1,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    netAmountMinor: Number(row.net_amount_minor),
    vatAmountMinor: Number(row.vat_amount_minor),
    grossAmountMinor: gross,
    paidAmountMinor: paid,
    remainingAmountMinor: remaining,
    currency: row.currency,
    currencyMinorUnitExponent: Number(row.currency_minor_unit_exponent || 2),
    paymentStatus: row.payment_status,
    invoiceStatus: row.invoice_status || "DRAFT",
    originQuoteId: row.origin_quote_id,
    creditNoteForInvoiceId: row.credit_note_for_invoice_id,
    cancelledByCreditNoteId: row.cancelled_by_credit_note_id,
    legalMentions,
    lines: lines.map((l) => ({
      id: l.id,
      invoiceId: l.invoice_id,
      lineNumber: Number(l.line_number),
      description: l.description,
      quantityMinor: Number(l.quantity_minor),
      unitPriceNetMinor: Number(l.unit_price_net_minor),
      discountRateBps: Number(l.discount_rate_bps),
      vatRateBps: Number(l.vat_rate_bps),
      totalNetMinor: Number(l.total_net_minor),
      totalVatMinor: Number(l.total_vat_minor),
      totalGrossMinor: Number(l.total_gross_minor),
      generalAccountCode: l.general_account_code,
      createdAt: l.created_at,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      dossierId: p.dossier_id,
      invoiceId: p.invoice_id,
      paymentDate: p.payment_date,
      amountMinor: Number(p.amount_minor),
      currency: p.currency,
      paymentMethod: p.payment_method,
      transactionReference: p.transaction_reference,
      notes: p.notes,
      recordedByUserId: p.recorded_by_user_id,
      createdAt: p.created_at,
    })),
    finalizedAt: row.finalized_at,
    finalizedByUserId: row.finalized_by_user_id,
    ruleVersionId: row.rule_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSalesInvoicesForDossier(params: {
  session: AuthenticatedSessionContext | null;
  organizationId: string;
  dossierId: string;
  status?: InvoiceWorkflowStatus;
  direction?: "ISSUED" | "RECEIVED" | "CREDIT_NOTE";
  db?: DatabaseSync;
}): SalesInvoice[] {
  const db = params.db ?? getDatabase();
  assertDossierAccess({
    session: params.session,
    organizationId: params.organizationId,
    dossierId: params.dossierId,
    permission: "VIEW",
    db,
  });

  let sql = "SELECT * FROM invoices WHERE organization_id = ? AND dossier_id = ?";
  const queryParams: any[] = [params.organizationId, params.dossierId];

  if (params.direction) {
    sql += " AND direction = ?";
    queryParams.push(params.direction);
  }

  if (params.status) {
    sql += " AND invoice_status = ?";
    queryParams.push(params.status);
  }

  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...queryParams) as any[];

  return rows.map((row) => {
    let legalMentions: LegalMentionsPayload = {};
    try {
      legalMentions = JSON.parse(row.legal_mentions_json || "{}");
    } catch {
      legalMentions = {};
    }
    const gross = Number(row.gross_amount_minor);
    const paid = Number(row.paid_amount_minor || 0);

    return {
      id: row.id,
      organizationId: row.organization_id,
      dossierId: row.dossier_id,
      documentId: row.document_id,
      direction: row.direction,
      invoiceNumber: row.invoice_number,
      thirdPartyName: row.third_party_name,
      thirdPartyId: row.third_party_id,
      thirdPartyAddress: row.third_party_address,
      thirdPartySirenOrVat: row.third_party_siren_or_vat,
      isB2B: Number(row.is_b2b ?? 1) === 1,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      netAmountMinor: Number(row.net_amount_minor),
      vatAmountMinor: Number(row.vat_amount_minor),
      grossAmountMinor: gross,
      paidAmountMinor: paid,
      remainingAmountMinor: Math.max(0, gross - paid),
      currency: row.currency,
      currencyMinorUnitExponent: Number(row.currency_minor_unit_exponent || 2),
      paymentStatus: row.payment_status,
      invoiceStatus: row.invoice_status || "DRAFT",
      originQuoteId: row.origin_quote_id,
      creditNoteForInvoiceId: row.credit_note_for_invoice_id,
      cancelledByCreditNoteId: row.cancelled_by_credit_note_id,
      legalMentions,
      finalizedAt: row.finalized_at,
      finalizedByUserId: row.finalized_by_user_id,
      ruleVersionId: row.rule_version_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

// --- 6. APERÇU IMPRIMABLE HTML (FORMAT A4) ---

export function generatePrintableInvoiceHtml(params: {
  invoice: SalesInvoice;
  dossier: ClientDossier;
}): string {
  const inv = params.invoice;
  const d = params.dossier;
  const lines = inv.lines || [];
  const m = inv.legalMentions;
  const isCreditNote = inv.direction === "CREDIT_NOTE";

  const formatEuro = (minor: number) => {
    return (minor / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €";
  };

  const rowsHtml = lines
    .map(
      (l) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid var(--border-default, #e2e8f0);">${escapeHtml(l.description)}</td>
      <td style="padding: 10px; border-bottom: 1px solid var(--border-default, #e2e8f0); text-align: right;">${(l.quantityMinor / 100).toFixed(2)}</td>
      <td style="padding: 10px; border-bottom: 1px solid var(--border-default, #e2e8f0); text-align: right;">${formatEuro(l.unitPriceNetMinor)}</td>
      <td style="padding: 10px; border-bottom: 1px solid var(--border-default, #e2e8f0); text-align: right;">${l.discountRateBps > 0 ? (l.discountRateBps / 100).toFixed(1) + "%" : "-"}</td>
      <td style="padding: 10px; border-bottom: 1px solid var(--border-default, #e2e8f0); text-align: right;">${(l.vatRateBps / 100).toFixed(1)}%</td>
      <td style="padding: 10px; border-bottom: 1px solid var(--border-default, #e2e8f0); text-align: right; font-weight: 600;">${formatEuro(l.totalNetMinor)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${isCreditNote ? "Avoir" : "Facture"} ${escapeHtml(inv.invoiceNumber)}</title>
  <style>
    :root {
      --brand-primary: #153D35;
      --brand-action: #237D68;
      --bg-surface: #ffffff;
      --text-primary: #17212B;
      --text-secondary: #64748B;
      --border-default: #E2E8F0;
    }
    @page { size: A4; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--text-primary);
      background: #f8fafc;
      margin: 0;
      padding: 20px;
    }
    .invoice-card {
      background: #ffffff;
      max-width: 800px;
      margin: 0 auto;
      padding: 35px;
      border: 1px solid var(--border-default);
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 800px; margin: 0 auto 15px; display: flex; justify-content: space-between; align-items: center;">
    <a href="javascript:window.history.back()" style="color: var(--brand-action); text-decoration: none; font-weight: 500;">&larr; Retour à l'application</a>
    <button onclick="window.print()" style="background: var(--brand-primary); color: #fff; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600;">Imprimer / PDF</button>
  </div>

  <div class="invoice-card">
    <!-- En-tête -->
    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--brand-primary); padding-bottom: 20px; margin-bottom: 25px;">
      <div>
        <h1 style="color: var(--brand-primary); margin: 0 0 6px; font-size: 24px;">${escapeHtml(d.name)}</h1>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
          ${escapeHtml(m.sellerLegalForm || "")} &bull; SIREN: ${escapeHtml(m.sellerSirenSiret || "-")}<br>
          ${escapeHtml(m.sellerAddress || "")}<br>
          ${m.sellerVatNumber ? `N° TVA : ${escapeHtml(m.sellerVatNumber)}<br>` : ""}
          ${m.sellerRcsRmCity ? `${escapeHtml(m.sellerRcsRmCity)}<br>` : ""}
        </div>
      </div>
      <div style="text-align: right;">
        <span style="display: inline-block; padding: 4px 10px; background: ${isCreditNote ? "#FEE2E2" : "#DCFCE7"}; color: ${isCreditNote ? "#991B1B" : "#166534"}; font-weight: 700; border-radius: 4px; font-size: 13px; margin-bottom: 8px;">
          ${isCreditNote ? "AVOIR" : inv.invoiceStatus === "DRAFT" ? "BROUILLON" : "FACTURE"}
        </span>
        <div style="font-size: 20px; font-weight: 800; color: var(--brand-primary); margin-bottom: 4px;">${escapeHtml(inv.invoiceNumber)}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">
          Date d'émission : <strong>${escapeHtml(inv.issueDate)}</strong><br>
          ${inv.dueDate ? `Échéance : <strong>${escapeHtml(inv.dueDate)}</strong><br>` : ""}
          ${inv.originQuoteId ? `Réf. Devis : <em>${escapeHtml(inv.originQuoteId)}</em>` : ""}
        </div>
      </div>
    </div>

    <!-- Destinataire -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 25px;">
      <div style="background: #F8FAFC; border: 1px solid var(--border-default); border-radius: 6px; padding: 15px; width: 45%;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); margin-bottom: 5px; font-weight: 600;">Destinataire</div>
        <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">${escapeHtml(inv.thirdPartyName)}</div>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.4;">
          ${inv.thirdPartyAddress ? escapeHtml(inv.thirdPartyAddress) + "<br>" : ""}
          ${inv.thirdPartySirenOrVat ? `N° TVA / SIREN : ${escapeHtml(inv.thirdPartySirenOrVat)}` : ""}
        </div>
      </div>
    </div>

    <!-- Tableau des lignes -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 25px;">
      <thead>
        <tr style="background: #F1F5F9; color: var(--text-primary); text-align: left;">
          <th style="padding: 10px; border-bottom: 2px solid var(--border-default);">Description</th>
          <th style="padding: 10px; border-bottom: 2px solid var(--border-default); text-align: right;">Qté</th>
          <th style="padding: 10px; border-bottom: 2px solid var(--border-default); text-align: right;">Prix unit. HT</th>
          <th style="padding: 10px; border-bottom: 2px solid var(--border-default); text-align: right;">Remise</th>
          <th style="padding: 10px; border-bottom: 2px solid var(--border-default); text-align: right;">TVA</th>
          <th style="padding: 10px; border-bottom: 2px solid var(--border-default); text-align: right;">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Totaux -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
      <div style="width: 45%;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--border-default);">
          <span style="color: var(--text-secondary);">Total Hors Taxes (HT) :</span>
          <span style="font-weight: 600;">${formatEuro(inv.netAmountMinor)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--border-default);">
          <span style="color: var(--text-secondary);">Total TVA :</span>
          <span style="font-weight: 600;">${formatEuro(inv.vatAmountMinor)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 17px; font-weight: 800; color: var(--brand-primary); border-bottom: 2px solid var(--brand-primary);">
          <span>Total TTC à régler :</span>
          <span>${formatEuro(inv.grossAmountMinor)}</span>
        </div>
        ${inv.paidAmountMinor > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #166534;">
          <span>Acomptes / Règlements reçus :</span>
          <span>- ${formatEuro(inv.paidAmountMinor)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; font-weight: 700; color: #991B1B;">
          <span>Reste à payer :</span>
          <span>${formatEuro(inv.remainingAmountMinor)}</span>
        </div>` : ""}
      </div>
    </div>

    <!-- Mentions obligatoires légales LPF -->
    <div style="border-top: 1px dashed var(--border-default); padding-top: 15px; font-size: 11px; color: var(--text-secondary); line-height: 1.5;">
      ${m.vatExemptionMention ? `<div style="font-weight: 600; color: var(--brand-primary); margin-bottom: 4px;">&bull; ${escapeHtml(m.vatExemptionMention)}</div>` : ""}
      ${m.latePaymentPenaltiesMention ? `<div>&bull; ${escapeHtml(m.latePaymentPenaltiesMention)}</div>` : ""}
      ${m.recoveryIndemnityMention ? `<div>&bull; ${escapeHtml(m.recoveryIndemnityMention)}</div>` : ""}
      ${m.earlyPaymentDiscountMention ? `<div>&bull; ${escapeHtml(m.earlyPaymentDiscountMention)}</div>` : ""}
      <div style="margin-top: 6px; font-style: italic; color: #94A3B8;">&bull; ${escapeHtml(m.provisionalNotice || "")}</div>
    </div>
  </div>
</body>
</html>`;
}

// --- 7. FACTURATION ÉLECTRONIQUE (FACTUR-X XML NIVEAU 2) & SPÉCIFICATION PDP (NIVEAU 3) ---

/**
 * Génération préliminaire du flux XML selon la norme Factur-X / ZUGFeRD 2.2 / EN 16931 (Niveau 2).
 * Profils supportés : MINIMUM, BASIC, EN16931.
 *
 * NOTE RÉGLEMENTAIRE ET TECHNIQUE :
 * Cette fonction génère la structure syntaxique XML normalisée. Conformément aux réserves d'audit
 * et jusqu'à validation par validateurs externes certifiés (VeraPDF, Schematron FNFE-MPE)
 * et incorporation dans un conteneur binaire certifié PDF/A-3, cette fonctionnalité constitue une
 * "GÉNÉRATION XML PRÉLIMINAIRE" et ne remplace pas une certification Factur-X complète en production.
 */
export function generateFacturXXml(params: {
  invoice: SalesInvoice;
  dossier: ClientDossier;
  profile?: FacturXProfile;
}): string {
  const inv = params.invoice;
  const d = params.dossier;
  const profile = params.profile || "MINIMUM";

  const profileUrnMap: Record<FacturXProfile, string> = {
    MINIMUM: "urn:factur-x.eu:1p0:minimum",
    BASIC: "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
    EN16931: "urn:cen.eu:en16931:2017",
  };

  const profileUrn = profileUrnMap[profile];
  const docType = inv.direction === "CREDIT_NOTE" ? "381" : "380"; // 380 = Invoice, 381 = Credit note
  const issueDateCompact = inv.issueDate.replace(/-/g, "");

  const escapeXml = (s?: string | null) =>
    (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const netDecimal = (inv.netAmountMinor / 100).toFixed(2);
  const vatDecimal = (inv.vatAmountMinor / 100).toFixed(2);
  const grossDecimal = (inv.grossAmountMinor / 100).toFixed(2);
  const dueDecimal = (inv.remainingAmountMinor / 100).toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${profileUrn}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(inv.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${docType}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDateCompact}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <!-- Accord commercial Vendeur & Acheteur -->
    <ram:ApplicableHeaderTradeAgreement>
      <!-- Vendeur (Seller) -->
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(d.name)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(d.legalRegistrationNumber || "000000000")}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(d.postalCode || "75001")}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(d.addressLine || "1 rue de la Paix")}</ram:LineOne>
          <ram:CityName>${escapeXml(d.city || "Paris")}</ram:CityName>
          <ram:CountryID>${escapeXml(d.countryCode || "FR")}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${d.vatIntracommunityNumber ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(d.vatIntracommunityNumber)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>

      <!-- Acheteur (Buyer) -->
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(inv.thirdPartyName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escapeXml(inv.thirdPartyAddress || "Adresse client")}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${inv.thirdPartySirenOrVat ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(inv.thirdPartySirenOrVat)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <!-- Livraison -->
    <ram:ApplicableHeaderTradeDelivery />

    <!-- Règlement et ventilation monétaire -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${inv.currency}</ram:InvoiceCurrencyCode>

      <!-- Ventilation globale de TVA -->
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${vatDecimal}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${netDecimal}</ram:BasisAmount>
        <ram:CategoryCode>${inv.vatAmountMinor === 0 ? "E" : "S"}</ram:CategoryCode>
      </ram:ApplicableTradeTax>

      <!-- Totaux monétaires monnaie de facturation -->
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${netDecimal}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${netDecimal}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${inv.currency}">${vatDecimal}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${grossDecimal}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${dueDecimal}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/**
 * Interface pour la connectivité PDP (Plateforme de Dématérialisation Partenaire) / PPF (Niveau 3).
 *
 * NOTE DE CONFORMITÉ RÉGLEMENTAIRE (Section D) :
 * ComptaNova n'est PAS une plateforme agréée. La transmission électronique PDP/PPF et le cycle
 * de vie des statuts réglementaires (DÉPOSÉE, REÇUE, APPROUVÉE, REJETÉE) ainsi que l'e-reporting
 * font l'objet d'un connecteur d'intégration tiers à qualifier dans un périmètre ultérieur.
 */
export interface PdpPartnerConnector {
  transmitInvoice(facturxXmlPayload: string, metadata: { invoiceNumber: string; sellerSiren: string; buyerSiren: string }): Promise<{ transmissionId: string; status: "SUBMITTED" | "REJECTED"; receiptTimestamp: string }>;
  queryInvoiceTransmissionStatus(transmissionId: string): Promise<{ transmissionId: string; status: string; history: any[] }>;
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
