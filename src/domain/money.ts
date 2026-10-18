/**
 * Modèle monétaire international (Section 4 — Extension du Scope International).
 *
 * Principes fondamentaux :
 * 1. Aucun montant financier ne repose sur des flottants binaires non maîtrisés.
 * 2. Ne suppose JAMAIS qu'une devise possède systématiquement 2 décimales :
 *    - 0 décimale (exponent = 0) : ex. JPY, XOF (Franc CFA BCEAO), XAF (Franc CFA BEAC), KMF, CLP, KRW
 *    - 2 décimales (exponent = 2) : ex. EUR, CHF, USD, GBP, MAD, DZD, AED, SAR, QAR, CAD, AUD, SGD
 *    - 3 décimales (exponent = 3) : ex. TND (Dinar tunisien - millimes), BHD (Dinar bahreïni - fils), OMR (Rial omanais - baisa), KWD (Dinar koweïtien - fils), JOD
 * 3. Représentation explicite de la précision (`minorUnitExponent`) dans chaque `MonetaryAmount`.
 * 4. Support de méthodes d'arrondi configurables par juridiction (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEILING`).
 * 5. Conversion multi-devises avec piste d'audit complète (taux représenté en entier mis à l'échelle, date, source, méthode d'arrondi) et calcul d'écart de change (FX gain/loss).
 * 6. Distinction explicite entre devise de transaction, devise du compte et devise de présentation comptable.
 */

export type CurrencyCode =
  | "EUR"
  | "CHF"
  | "USD"
  | "GBP"
  | "MAD"
  | "TND"
  | "DZD"
  | "AED"
  | "SAR"
  | "QAR"
  | "BHD"
  | "OMR"
  | "KWD"
  | "XOF"
  | "XAF"
  | "JPY"
  | "CAD"
  | "AUD"
  | "SGD"
  | (string & {});

export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "FLOOR" | "CEILING";

export interface CurrencyDefinition {
  code: CurrencyCode;
  name: string;
  symbol: string;
  /** Nombre explicite de décimales (0, 2, 3...) selon ISO 4217 */
  minorUnitExponent: 0 | 2 | 3 | 4;
}

const CURRENCY_CATALOG: Record<string, CurrencyDefinition> = {
  // Europe & Amériques & Asie-Pacifique (2 décimales)
  EUR: { code: "EUR", name: "Euro", symbol: "€", minorUnitExponent: 2 },
  CHF: { code: "CHF", name: "Franc suisse", symbol: "CHF", minorUnitExponent: 2 },
  USD: { code: "USD", name: "US Dollar", symbol: "$", minorUnitExponent: 2 },
  GBP: { code: "GBP", name: "Pound Sterling", symbol: "£", minorUnitExponent: 2 },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "CA$", minorUnitExponent: 2 },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", minorUnitExponent: 2 },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", minorUnitExponent: 2 },

  // Maghreb (2 et 3 décimales)
  MAD: { code: "MAD", name: "Dirham marocain", symbol: "MAD", minorUnitExponent: 2 },
  DZD: { code: "DZD", name: "Dinar algérien", symbol: "DZD", minorUnitExponent: 2 },
  TND: { code: "TND", name: "Dinar tunisien", symbol: "TND", minorUnitExponent: 3 },

  // Moyen-Orient / CCG (2 et 3 décimales)
  AED: { code: "AED", name: "Dirham des Émirats arabes unis", symbol: "AED", minorUnitExponent: 2 },
  SAR: { code: "SAR", name: "Riyal saoudien", symbol: "SAR", minorUnitExponent: 2 },
  QAR: { code: "QAR", name: "Riyal qatari", symbol: "QAR", minorUnitExponent: 2 },
  BHD: { code: "BHD", name: "Dinar bahreïni", symbol: "BHD", minorUnitExponent: 3 },
  OMR: { code: "OMR", name: "Rial omanais", symbol: "OMR", minorUnitExponent: 3 },
  KWD: { code: "KWD", name: "Dinar koweïtien", symbol: "KWD", minorUnitExponent: 3 },

  // Afrique subsaharienne & Asie (0 décimale)
  XOF: { code: "XOF", name: "Franc CFA (UEMOA)", symbol: "FCFA", minorUnitExponent: 0 },
  XAF: { code: "XAF", name: "Franc CFA (CEMAC)", symbol: "FCFA", minorUnitExponent: 0 },
  JPY: { code: "JPY", name: "Yen japonais", symbol: "¥", minorUnitExponent: 0 },

  // Unité de compte ISO 4217 à 4 décimales (Chili)
  CLF: { code: "CLF", name: "Unidad de Fomento (Chili)", symbol: "UF", minorUnitExponent: 4 },
};

/**
 * Permet d'enregistrer dynamiquement une devise supplémentaire au besoin sans modifier le cœur métier.
 */
export function registerCurrencyDefinition(def: CurrencyDefinition): void {
  const code = def.code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Code devise ISO 4217 invalide : "${def.code}"`);
  }
  CURRENCY_CATALOG[code] = { ...def, code };
}

export function getCurrencyDefinition(currency: CurrencyCode): CurrencyDefinition {
  const normalized = String(currency).trim().toUpperCase();
  const def = CURRENCY_CATALOG[normalized];
  if (!def) {
    throw new Error(
      `Devise non enregistrée dans le catalogue monétaire : "${currency}". Enregistrez sa précision explicite avant tout calcul.`
    );
  }
  return def;
}

export function getCurrencyExponent(currency: CurrencyCode): 0 | 2 | 3 | 4 {
  return getCurrencyDefinition(currency).minorUnitExponent;
}

export function listRegisteredCurrencies(): CurrencyDefinition[] {
  return Object.values(CURRENCY_CATALOG);
}

export interface MonetaryAmount {
  /** Nombre entier d'unités monétaires mineures (ex: yen pour JPY, centimes pour EUR/MAD, millimes/fils pour TND/BHD/KWD) */
  amountMinor: number;
  /** Code devise ISO 4217 */
  currency: CurrencyCode;
  /** Précision monétaire explicite associée à la devise (0, 2, 3, 4) */
  minorUnitExponent?: number;
}

/**
 * Normalise et valide un `MonetaryAmount` en attachant toujours explicitement son `minorUnitExponent`.
 */
export function createMonetaryAmount(
  amountMinor: number,
  currency: CurrencyCode
): Required<MonetaryAmount> {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Le montant en unités mineures doit être un entier sûr : ${amountMinor}`);
  }
  const def = getCurrencyDefinition(currency);
  return {
    amountMinor,
    currency: def.code,
    minorUnitExponent: def.minorUnitExponent,
  };
}

/**
 * Division entière exacte avec mode d'arrondi configurable (sans passage par un float IEEE-754).
 * Calcule round(numerator / denominator) où denominator > 0.
 */
export function divideBigIntWithRounding(
  numerator: bigint,
  denominator: bigint,
  roundingMode: RoundingMode = "HALF_UP"
): bigint {
  if (denominator <= 0n) {
    throw new Error("Le dénominateur doit être strictement positif.");
  }
  if (numerator === 0n) return 0n;

  const isNegative = numerator < 0n;
  const absNum = isNegative ? -numerator : numerator;
  const quotient = absNum / denominator;
  const remainder = absNum % denominator;

  if (remainder === 0n) {
    return isNegative ? -quotient : quotient;
  }

  let roundedAbs = quotient;
  const twiceRemainder = remainder * 2n;

  switch (roundingMode) {
    case "HALF_UP": {
      if (twiceRemainder >= denominator) {
        roundedAbs = quotient + 1n;
      }
      break;
    }
    case "HALF_EVEN": {
      if (twiceRemainder > denominator) {
        roundedAbs = quotient + 1n;
      } else if (twiceRemainder === denominator) {
        if (quotient % 2n !== 0n) {
          roundedAbs = quotient + 1n;
        }
      }
      break;
    }
    case "FLOOR": {
      roundedAbs = isNegative ? quotient + 1n : quotient;
      break;
    }
    case "CEILING": {
      roundedAbs = isNegative ? quotient : quotient + 1n;
      break;
    }
  }

  return isNegative ? -roundedAbs : roundedAbs;
}

/**
 * Convertit une chaîne décimale (ex: "1250", "1250.50", "1250,455") en unités mineures entières exactes
 * selon la précision explicite de la devise (0, 2 ou 3 décimales).
 */
export function parseDecimalToMinor(
  input: string | number,
  currency: CurrencyCode = "EUR"
): Required<MonetaryAmount> {
  const def = getCurrencyDefinition(currency);
  const decimals = def.minorUnitExponent;
  const normalized = String(input).trim().replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Format monétaire invalide : "${input}"`);
  }

  const isNegative = normalized.startsWith("-");
  const clean = isNegative ? normalized.slice(1) : normalized;
  const parts = clean.split(".");
  const wholePart = parts[0] ?? "0";
  const fracPart = parts[1] ?? "";

  if (fracPart.length > decimals) {
    throw new Error(
      `Précision décimale excessive pour ${def.code} (max ${decimals} décimale(s)) : "${input}"`
    );
  }

  const paddedFrac = fracPart.padEnd(decimals, "0");
  const factor = Math.pow(10, decimals);
  const totalMinor =
    Number.parseInt(wholePart, 10) * factor +
    (decimals > 0 && paddedFrac ? Number.parseInt(paddedFrac, 10) : 0);

  if (!Number.isSafeInteger(totalMinor)) {
    throw new Error(`Dépassement de capacité entière pour le montant : "${input}"`);
  }

  return {
    amountMinor: isNegative && totalMinor !== 0 ? -totalMinor : totalMinor,
    currency: def.code,
    minorUnitExponent: decimals,
  };
}

/**
 * Formate un montant en unités mineures vers une chaîne décimale exacte respectant l'exposant de la devise.
 */
export function formatMinorToDecimal(
  amountMinor: number,
  currency: CurrencyCode = "EUR",
  decimalSeparator: "." | "," = "."
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Le montant en unités mineures doit être un entier sûr : ${amountMinor}`);
  }
  const decimals = getCurrencyExponent(currency);
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  if (decimals === 0) {
    return `${isNegative ? "-" : ""}${abs}`;
  }
  const factor = Math.pow(10, decimals);
  const whole = Math.trunc(abs / factor);
  const frac = abs % factor;
  const fracStr = String(frac).padStart(decimals, "0");
  return `${isNegative ? "-" : ""}${whole}${decimalSeparator}${fracStr}`;
}

/**
 * Formate un montant monétaire selon une locale internationale (ex: fr-FR, ar-AE, ar-MA, en-US, ja-JP)
 * tout en respectant strictement la précision ISO 4217 de la devise.
 */
export function formatMoneyLocalized(
  amount: MonetaryAmount,
  locale: string = "fr-FR"
): string {
  const def = getCurrencyDefinition(amount.currency);
  const factor = Math.pow(10, def.minorUnitExponent);
  const majorValue = amount.amountMinor / factor;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: def.code,
    minimumFractionDigits: def.minorUnitExponent,
    maximumFractionDigits: def.minorUnitExponent,
  }).format(majorValue);
}

/**
 * Additionne deux montants de même devise et vérifie la cohérence de leur précision.
 */
export function addMoney(
  a: MonetaryAmount,
  b: MonetaryAmount
): Required<MonetaryAmount> {
  if (a.currency !== b.currency) {
    throw new Error(
      `Impossible d'additionner directement deux devises différentes (${a.currency} et ${b.currency}) sans taux de change explicite.`
    );
  }
  const def = getCurrencyDefinition(a.currency);
  const sum = a.amountMinor + b.amountMinor;
  if (!Number.isSafeInteger(sum)) {
    throw new Error("Dépassement de capacité entière lors de l'addition monétaire.");
  }
  return {
    amountMinor: sum,
    currency: def.code,
    minorUnitExponent: def.minorUnitExponent,
  };
}

/**
 * Soustrait deux montants de même devise.
 */
export function subtractMoney(
  a: MonetaryAmount,
  b: MonetaryAmount
): Required<MonetaryAmount> {
  if (a.currency !== b.currency) {
    throw new Error(
      `Impossible de soustraire directement deux devises différentes (${a.currency} et ${b.currency}).`
    );
  }
  const def = getCurrencyDefinition(a.currency);
  const diff = a.amountMinor - b.amountMinor;
  if (!Number.isSafeInteger(diff)) {
    throw new Error("Dépassement de capacité entière lors de la soustraction monétaire.");
  }
  return {
    amountMinor: diff,
    currency: def.code,
    minorUnitExponent: def.minorUnitExponent,
  };
}

/**
 * Calcule une taxe (TVA, GST, Sales Tax, Retenue à la source) à partir d'un taux en points de base (10000 bps = 100%)
 * en utilisant l'arithmétique BigInt et la méthode d'arrondi spécifiée par la juridiction.
 */
export function computeTaxFromBasisPoints(
  netAmount: MonetaryAmount,
  rateBasisPoints: number,
  roundingMode: RoundingMode = "HALF_UP"
): Required<MonetaryAmount> {
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new Error(`Taux en points de base invalide : ${rateBasisPoints}`);
  }
  const def = getCurrencyDefinition(netAmount.currency);
  const numerator = BigInt(netAmount.amountMinor) * BigInt(rateBasisPoints);
  const taxMinorBig = divideBigIntWithRounding(numerator, 10000n, roundingMode);
  const taxMinor = Number(taxMinorBig);
  if (!Number.isSafeInteger(taxMinor)) {
    throw new Error("Dépassement de capacité entière lors du calcul de taxe.");
  }
  return {
    amountMinor: taxMinor,
    currency: def.code,
    minorUnitExponent: def.minorUnitExponent,
  };
}

/**
 * Structure d'audit obligatoire pour toute conversion de devise (Section 4).
 */
export interface ExchangeRateAuditRecord {
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  /** Taux décimal exact sous forme de chaîne (ex: "10.854200" pour 1 EUR = 10.8542 MAD) */
  rateDecimalString: string;
  /** Entier mis à l'échelle : rateScaledInteger / 10^rateScaleDecimals */
  rateScaledInteger: number;
  rateScaleDecimals: number;
  effectiveDate: string; // YYYY-MM-DD
  rateSource: string; // ex: "ECB", "BAM_MOROCCO", "BCT_TUNISIA", "CBUAE", "CONTRACTUAL"
  roundingMode: RoundingMode;
}

export interface CurrencyConversionResult {
  sourceAmount: Required<MonetaryAmount>;
  convertedAmount: Required<MonetaryAmount>;
  exchangeRateAudit: ExchangeRateAuditRecord;
}

/**
 * Convertit un montant d'une devise source vers une devise cible de manière déterministe et reproductible,
 * en tenant compte de la différence d'exposant (`minorUnitExponent`) entre les deux devises
 * (ex: EUR [2 décimales] -> TND [3 décimales] ou EUR [2 décimales] -> XOF [0 décimale]).
 */
export function convertCurrencyWithAudit(params: {
  amount: MonetaryAmount;
  targetCurrency: CurrencyCode;
  rateDecimalString: string;
  effectiveDate: string;
  rateSource: string;
  roundingMode?: RoundingMode;
}): CurrencyConversionResult {
  const sourceDef = getCurrencyDefinition(params.amount.currency);
  const targetDef = getCurrencyDefinition(params.targetCurrency);
  const roundingMode = params.roundingMode ?? "HALF_UP";

  const normalizedRate = params.rateDecimalString.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalizedRate)) {
    throw new Error(`Taux de change invalide : "${params.rateDecimalString}"`);
  }

  const parts = normalizedRate.split(".");
  const wholeStr = parts[0] ?? "0";
  const fracStr = parts[1] ?? "";
  const rateScaleDecimals = fracStr.length;
  const rateScaledBig = BigInt(wholeStr + fracStr);

  if (rateScaledBig <= 0n) {
    throw new Error("Le taux de change doit être strictement positif.");
  }

  // Formule exacte :
  // convertedMinor = amountMinor * rate * 10^(targetExp - sourceExp)
  //                = (amountMinor * rateScaledBig * 10^targetExp) / (10^sourceExp * 10^rateScaleDecimals)
  const targetFactor = 10n ** BigInt(targetDef.minorUnitExponent);
  const sourceFactor = 10n ** BigInt(sourceDef.minorUnitExponent);
  const rateScaleFactor = 10n ** BigInt(rateScaleDecimals);

  const numerator =
    BigInt(params.amount.amountMinor) * rateScaledBig * targetFactor;
  const denominator = sourceFactor * rateScaleFactor;

  const convertedMinorBig = divideBigIntWithRounding(
    numerator,
    denominator,
    roundingMode
  );
  const convertedMinor = Number(convertedMinorBig);

  if (!Number.isSafeInteger(convertedMinor)) {
    throw new Error("Dépassement de capacité entière lors de la conversion de devise.");
  }

  return {
    sourceAmount: createMonetaryAmount(params.amount.amountMinor, sourceDef.code),
    convertedAmount: createMonetaryAmount(convertedMinor, targetDef.code),
    exchangeRateAudit: {
      sourceCurrency: sourceDef.code,
      targetCurrency: targetDef.code,
      rateDecimalString: normalizedRate,
      rateScaledInteger: Number(rateScaledBig),
      rateScaleDecimals,
      effectiveDate: params.effectiveDate,
      rateSource: params.rateSource,
      roundingMode,
    },
  };
}

/**
 * Calcule l'écart de change (gain ou perte de change en devise de présentation comptable)
 * entre le montant comptabilisé à la date de facture et le montant réglé à la date de paiement.
 */
export function computeRealizedExchangeDifference(params: {
  bookedPresentationAmount: MonetaryAmount;
  settledPresentationAmount: MonetaryAmount;
}): {
  differenceAmount: Required<MonetaryAmount>;
  nature: "NONE" | "FX_GAIN" | "FX_LOSS";
  direction: "RECEIVABLE" | "PAYABLE";
} & { forReceivableNature: "NONE" | "FX_GAIN" | "FX_LOSS"; forPayableNature: "NONE" | "FX_GAIN" | "FX_LOSS" } {
  const diff = subtractMoney(
    params.settledPresentationAmount,
    params.bookedPresentationAmount
  );

  const forReceivableNature =
    diff.amountMinor === 0
      ? "NONE"
      : diff.amountMinor > 0
      ? "FX_GAIN"
      : "FX_LOSS";

  const forPayableNature =
    diff.amountMinor === 0
      ? "NONE"
      : diff.amountMinor < 0
      ? "FX_GAIN"
      : "FX_LOSS";

  return {
    differenceAmount: diff,
    nature: forReceivableNature,
    direction: "RECEIVABLE",
    forReceivableNature,
    forPayableNature,
  };
}

/**
 * Représentation tri-devise pour une opération comptable internationale (Section 4) :
 * - Devise de transaction (pièce originale / facture)
 * - Devise du compte bancaire ou auxiliaire
 * - Devise de présentation / tenue comptable du dossier
 */
export interface MultiCurrencyMonetaryContext {
  transactionAmount: Required<MonetaryAmount>;
  accountAmount: Required<MonetaryAmount>;
  presentationAmount: Required<MonetaryAmount>;
  transactionToPresentationRateAudit: ExchangeRateAuditRecord | null;
}

/**
 * Vérifie l'équilibre Débit / Crédit d'un ensemble de lignes d'écriture comptable.
 */
export function verifyDebitCreditBalance(
  lines: ReadonlyArray<{ debitMinor: number; creditMinor: number }>
): { balanced: boolean; totalDebitMinor: number; totalCreditMinor: number; diffMinor: number } {
  if (lines.length === 0) {
    return { balanced: false, totalDebitMinor: 0, totalCreditMinor: 0, diffMinor: 0 };
  }
  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.debitMinor) ||
      !Number.isSafeInteger(line.creditMinor) ||
      line.debitMinor < 0 ||
      line.creditMinor < 0
    ) {
      throw new Error("Les montants débit et crédit doivent être des entiers positifs ou nuls.");
    }
    if (line.debitMinor > 0 && line.creditMinor > 0) {
      throw new Error("Une ligne d'écriture ne peut pas porter simultanément un débit et un crédit non nuls.");
    }
    totalDebitMinor += line.debitMinor;
    totalCreditMinor += line.creditMinor;
  }
  const diffMinor = totalDebitMinor - totalCreditMinor;
  return {
    balanced: totalDebitMinor > 0 && diffMinor === 0,
    totalDebitMinor,
    totalCreditMinor,
    diffMinor,
  };
}
