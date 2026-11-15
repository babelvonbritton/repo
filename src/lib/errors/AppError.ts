import { ValidationError } from "@/lib/storage/Guard";

/** Every failure the app can show. Each code has a title and hint in the message files (`err.<CODE>.title|hint`). */
export const ERROR_CODES = [
  "UNEXPECTED",
  "STORAGE_UNAVAILABLE",
  "STORAGE_QUOTA",
  "STORAGE_CLOSED",
  "STORAGE_FAILED",
  "VALIDATION",
  "LAST_STAGE",
  "LAST_BOARD",
  "LIMIT_REACHED",
  "DATA_INTEGRITY",
  "PREFS_UNAVAILABLE",
  "RENDER_CRASH",
  "BACKUP_COLLECT_FAILED",
  "BACKUP_SELFCHECK_FAILED",
  "BACKUP_PACKAGE_FAILED",
  "BACKUP_ARCHIVE_INVALID",
  "BACKUP_DOWNLOAD_FAILED",
  "BACKUP_CRYPTO_UNAVAILABLE",
  "BACKUP_PASSWORD_REQUIRED",
  "BACKUP_PASSWORD_TOO_SHORT",
  "BACKUP_DECRYPT_FAILED",
  "BACKUP_FILE_TOO_LARGE",
  "BACKUP_FILE_READ_FAILED",
  "BACKUP_NOT_ZIP",
  "BACKUP_UNEXPECTED_CONTENT",
  "BACKUP_MANIFEST_INVALID",
  "BACKUP_UNSUPPORTED_VERSION",
  "BACKUP_SIZE_MISMATCH",
  "BACKUP_CHECKSUM_MISMATCH",
  "BACKUP_STRUCTURE_INVALID",
  "BACKUP_APPLY_FAILED",
  "BACKUP_VERIFY_FAILED",
  "BACKUP_ROLLBACK_FAILED",
  "BACKUP_STALE",
  "BACKUP_MERGE_INVALID",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type Severity = "error" | "warning";

interface Options {
  details?: string;
  cause?: unknown;
  severity?: Severity;
  context?: Record<string, string | number>;
}

/** Names raised by IndexedDB and Dexie, grouped by what the user can do about them. */
const STORAGE_UNAVAILABLE = new Set(["OpenFailedError", "InvalidStateError", "SecurityError", "MissingAPIError", "UnknownError"]);
const STORAGE_CLOSED = new Set(["DatabaseClosedError", "VersionError"]);
const STORAGE_FAILED = new Set(["AbortError", "ConstraintError", "DataError", "TransactionInactiveError", "ReadOnlyError", "BulkError", "DataCloneError", "NoSuchDatabaseError", "SchemaError", "NotFoundError"]);

/** The one error type used across the app: a stable code, a severity, and technical details for diagnostics. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly severity: Severity;
  readonly details?: string;
  readonly context: Record<string, string | number>;

  constructor(code: ErrorCode, options: Options = {}) {
    super(code, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.severity = options.severity ?? "error";
    this.details = options.details;
    this.context = options.context ?? {};
  }

  /** Turns anything thrown (Dexie, DOM, validation, plain errors) into an AppError with the right code. */
  static from(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof ValidationError) return new AppError("VALIDATION", { details: error.message, severity: "warning", cause: error });
    const e = error as { name?: string; message?: string; inner?: { name?: string } } | null;
    const name = e?.inner?.name ?? e?.name ?? "";
    const details = e?.message ?? String(error);
    if (name === "QuotaExceededError") return new AppError("STORAGE_QUOTA", { details, cause: error });
    if (STORAGE_CLOSED.has(name)) return new AppError("STORAGE_CLOSED", { details, cause: error });
    if (STORAGE_UNAVAILABLE.has(name)) return new AppError("STORAGE_UNAVAILABLE", { details, cause: error });
    if (STORAGE_FAILED.has(name)) return new AppError("STORAGE_FAILED", { details, cause: error });
    return new AppError("UNEXPECTED", { details: name ? `${name}: ${details}` : details, cause: error });
  }
}
