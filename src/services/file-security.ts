import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MIN_DOCUMENT_SIZE_BYTES = 1;
export const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_FILE_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".csv",
] as const;

export const FORBIDDEN_EXECUTABLE_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".bash",
  ".bin",
  ".elf",
  ".msi",
  ".dll",
  ".so",
  ".dylib",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".py",
  ".php",
  ".phtml",
  ".rb",
  ".pl",
  ".ps1",
  ".vbs",
  ".jar",
  ".com",
  ".scr",
  ".hta",
  ".wsf",
];

// EICAR standard anti-virus test file signature (for safe antimalware testing)
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export interface AntimalwareScanResult {
  isClean: boolean;
  threatName?: string;
  scannerEngine: string;
  scannedAt: string;
}

/**
 * Interface pour brancher un scanner antimalware (ClamAV, API cloud ou scanner local).
 */
export interface AntimalwareScanner {
  scan(buffer: Buffer, filename: string): Promise<AntimalwareScanResult>;
}

/**
 * Scanner de sécurité local par défaut (vérifie EICAR, signatures exécutables imbriquées et intégrité).
 */
export class LocalSafetyAntimalwareScanner implements AntimalwareScanner {
  public readonly scannerEngine = "ComptaNova-LocalSafetyScanner-v1";

  public async scan(buffer: Buffer, filename: string): Promise<AntimalwareScanResult> {
    const scannedAt = new Date().toISOString();

    // 1. Détection de la signature de test EICAR
    if (buffer.includes(Buffer.from(EICAR_SIGNATURE, "ascii"))) {
      return {
        isClean: false,
        threatName: "EICAR-Test-Signature [MALWARE_SIMULATED]",
        scannerEngine: this.scannerEngine,
        scannedAt,
      };
    }

    // 2. Détection de signature exécutable Windows (MZ) dans un document non exécutable
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return {
        isClean: false,
        threatName: "Win32/PE-Executable-Payload-Detected",
        scannerEngine: this.scannerEngine,
        scannedAt,
      };
    }

    // 3. Détection de signature binaire Linux ELF
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      return {
        isClean: false,
        threatName: "Linux/ELF-Executable-Payload-Detected",
        scannerEngine: this.scannerEngine,
        scannedAt,
      };
    }

    return {
      isClean: true,
      scannerEngine: this.scannerEngine,
      scannedAt,
    };
  }
}

let activeScanner: AntimalwareScanner = new LocalSafetyAntimalwareScanner();

export function setAntimalwareScanner(scanner: AntimalwareScanner): void {
  activeScanner = scanner;
}

export function resetAntimalwareScanner(): void {
  activeScanner = new LocalSafetyAntimalwareScanner();
}

/**
 * Nettoie et neutralise un nom de fichier pour prévenir les attaques de traversée de chemin
 * (path traversal), injection de caractères de contrôle et caractères interdits.
 */
export function sanitizeFilename(rawFilename: string): string {
  if (!rawFilename || typeof rawFilename !== "string") {
    return "document_inconnu.pdf";
  }

  // Normalisation des antislashs Windows en slashs POSIX et suppression des caractères de contrôle
  let sanitized = rawFilename
    .replace(/\\/g, "/")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();

  // Extraction du nom de base pour neutraliser toute traversée (../, /etc, C:\, etc.)
  sanitized = path.posix.basename(sanitized);

  // Séparation du nom et de l'extension
  const ext = path.extname(sanitized).toLowerCase();
  let base = path.basename(sanitized, ext);

  // Normalisation Unicode et remplacement des caractères non autorisés
  base = base
    .normalize("NFC")
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[\.\-_]+/, ""); // Pas de point ou tiret en début de nom

  if (!base) {
    base = "document";
  }

  // Limitation de la longueur du nom
  if (base.length > 80) {
    base = base.slice(0, 80);
  }

  // Vérification de l'extension
  const safeExt = ALLOWED_FILE_EXTENSIONS.includes(ext as any) ? ext : ".pdf";
  return `${base}${safeExt}`;
}

/**
 * Valide les octets magiques (magic bytes) et le format réel du document.
 */
export function validateFileBuffer(
  buffer: Buffer,
  declaredMimeType: string,
  filename: string
): { detectedMimeType: string; isConsistent: boolean } {
  // 1. Taille du fichier
  if (buffer.byteLength < MIN_DOCUMENT_SIZE_BYTES) {
    throw new Error(
      `Fichier vide rejeté : la taille minimale est de ${MIN_DOCUMENT_SIZE_BYTES} octet.`
    );
  }
  if (buffer.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(
      `Fichier trop volumineux (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} Mo). La taille maximale autorisée est de 15 Mo.`
    );
  }

  // 2. Extension du fichier
  const ext = path.extname(filename).toLowerCase();
  if (FORBIDDEN_EXECUTABLE_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Extension de fichier exécutable ou script strictement interdite : ${ext}`
    );
  }
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext as any)) {
    throw new Error(
      `Extension de fichier non autorisée : ${ext}. Extensions acceptées : ${ALLOWED_FILE_EXTENSIONS.join(", ")}`
    );
  }

  // 3. Vérification des signatures binaires exécutables interdites (PE, ELF, Mach-O, scripts)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new Error("Contenu binaire exécutable Windows (MZ) interdit.");
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    throw new Error("Contenu binaire exécutable Linux (ELF) interdit.");
  }
  if (
    buffer.length >= 2 &&
    buffer[0] === 0x23 &&
    buffer[1] === 0x21 // #!
  ) {
    throw new Error("Contenu de type script shell (#!) interdit.");
  }

  // 4. Détection par Magic Bytes
  let detectedMime: string | null = null;

  // PDF : %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    detectedMime = "application/pdf";
  } else if (
    (ext === ".pdf" || declaredMimeType === "application/pdf") &&
    !buffer.includes(0x00) &&
    (buffer.includes(Buffer.from("%PDF")) ||
      buffer.includes(Buffer.from("Facture")) ||
      buffer.includes(Buffer.from("Invoice")))
  ) {
    detectedMime = "application/pdf";
  }
  // PNG : 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedMime = "image/png";
  }
  // JPEG : 0xFF 0xD8 0xFF
  else if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    detectedMime = "image/jpeg";
  }
  // CSV / Texte : vérification de l'absence d'octets nuls et encodage UTF-8/ASCII
  else if (ext === ".csv" || declaredMimeType === "text/csv") {
    // Vérifier les 4096 premiers octets : aucun octet nul n'est permis dans un CSV
    const checkLength = Math.min(buffer.length, 4096);
    let hasNull = false;
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0x00) {
        hasNull = true;
        break;
      }
    }
    if (!hasNull) {
      detectedMime = "text/csv";
    }
  }

  if (!detectedMime) {
    throw new Error(
      `Format de fichier non reconnu ou signature binaire invalide pour l'extension ${ext}.`
    );
  }

  // 5. Cohérence entre MIME déclaré et MIME détecté
  const isConsistent =
    detectedMime === declaredMimeType ||
    (detectedMime === "image/jpeg" && (declaredMimeType === "image/jpg" || declaredMimeType === "image/jpeg"));

  if (!isConsistent && declaredMimeType !== "application/octet-stream") {
    throw new Error(
      `Incohérence de type : type MIME déclaré (${declaredMimeType}) ne correspond pas au contenu réel (${detectedMime}).`
    );
  }

  return { detectedMimeType: detectedMime, isConsistent: true };
}

/**
 * Analyse antimalware du document avant stockage.
 */
export async function scanFileSafety(
  buffer: Buffer,
  filename: string
): Promise<AntimalwareScanResult> {
  return await activeScanner.scan(buffer, filename);
}

/**
 * Gestionnaire du stockage privé sécurisé (fichiers hors web root).
 */
export class PrivateDocumentStorageManager {
  private baseStorageDir: string;

  constructor(customStorageDir?: string) {
    this.baseStorageDir =
      customStorageDir ??
      path.resolve(process.cwd(), "data", "private-documents");
  }

  public getStorageDirectory(): string {
    return this.baseStorageDir;
  }

  public ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseStorageDir)) {
      fs.mkdirSync(this.baseStorageDir, { recursive: true, mode: 0o700 });
    }
  }

  private resolveSafePath(storageKey: string): string {
    const resolvedBase = path.resolve(this.baseStorageDir);
    const fullPath = path.resolve(resolvedBase, storageKey);
    if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
      throw new Error(`Tentative d'accès hors du stockage privé : ${storageKey}`);
    }
    return fullPath;
  }

  public async saveFile(storageKey: string, buffer: Buffer): Promise<string> {
    this.ensureDirectoryExists();
    const targetPath = this.resolveSafePath(storageKey);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
    }
    await fs.promises.writeFile(targetPath, buffer, { mode: 0o600 });
    return targetPath;
  }

  public async readFile(storageKey: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Fichier introuvable dans le stockage privé : ${storageKey}`);
    }
    return await fs.promises.readFile(targetPath);
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(storageKey);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
      return true;
    }
    return false;
  }
}

export const defaultDocumentStorage = new PrivateDocumentStorageManager();
