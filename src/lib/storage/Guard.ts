import { countChars, isRealDate, stripControlChars } from "./utils";

/** Thrown when input fails validation; `field` names the offending value. */
export type ValidationKind = "required" | "tooLong" | "invalid";

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
    public readonly kind: ValidationKind = "invalid",
    public readonly limit?: number,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

interface TextRules {
  required?: boolean;
  trim?: boolean;
}

/** Central input validation so limits are enforced in storage, not only in forms. */
export class Guard {
  /** Validates a text value: type, null bytes, optional trim, required, max length. */
  static text(value: unknown, field: string, max: number, rules: TextRules = {}): string {
    if (typeof value !== "string") throw new ValidationError(field, `${field} must be text`, "invalid");
    let clean = stripControlChars(value);
    if (rules.trim) clean = clean.trim();
    if (rules.required && clean.length === 0) throw new ValidationError(field, `${field} is required`, "required");
    if (countChars(clean) > max) throw new ValidationError(field, `${field} exceeds ${max} characters`, "tooLong", max);
    return clean;
  }

  /** Validates that a value belongs to a fixed list of options. */
  static oneOf<T extends string>(value: unknown, field: string, options: readonly T[]): T {
    if (typeof value !== "string" || !options.includes(value as T)) {
      throw new ValidationError(field, `${field} is not a valid option`);
    }
    return value as T;
  }

  /** Validates an optional ISO date string (YYYY-MM-DD). */
  static dateOrNull(value: unknown, field: string): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealDate(value)) {
      throw new ValidationError(field, `${field} must be a date`);
    }
    return value;
  }
}
