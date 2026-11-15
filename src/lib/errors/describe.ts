import type { Translate } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { ValidationError } from "@/lib/storage/Guard";
import type { AppError } from "./AppError";

/** Technical field names used by validation, mapped to their translated labels. */
const FIELD_KEYS: Record<string, MessageKey> = {
  title: "field.title",
  summary: "field.summary",
  label: "field.label",
  note: "field.note",
  "board name": "field.boardName",
  "column name": "field.columnName",
  priority: "field.priority",
  "due date": "field.dueDate",
  "column tone": "field.columnTone",
  column: "field.column",
};

/** User-facing title and hint for an error, in the active language. */
export function describeError(error: AppError, t: Translate): { title: string; hint: string } {
  const title = t(`err.${error.code}.title` as MessageKey);
  const cause = error.cause;
  if (error.code === "VALIDATION" && cause instanceof ValidationError) {
    const key = FIELD_KEYS[cause.field];
    return { title, hint: t(`validation.${cause.kind}`, { field: key ? t(key) : cause.field, limit: cause.limit ?? 0 }) };
  }
  return { title, hint: t(`err.${error.code}.hint` as MessageKey, error.context) };
}
