import type { AppError } from "@/lib/errors/AppError";
import type { Msg } from "@/i18n/types";
import type { BackupData } from "@/lib/storage";
import type { StoreName } from "./constants";
import type { MergePlan } from "./MergePlanner";

export type BackupKind = "backup" | "safety";

export interface BackupEncryption {
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
}

/** manifest.json: describes the archive so it can be verified before any data is read. */
export interface BackupManifest {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  kind: BackupKind;
  app: { name: string; version: string };
  createdAt: string;
  createdAtMs: number;
  stores: Record<StoreName, { count: number; sha256: string }>;
  files: Array<{ name: string; bytes: number; sha256: string }>;
  encryption?: BackupEncryption;
}

export type StepStatus = "pending" | "running" | "done" | "warning" | "error" | "skipped";

/** What the UI shows for one step. */
export interface StepState {
  id: string;
  titleKey: Msg["key"];
  status: StepStatus;
  detail?: Msg;
  error?: AppError;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface BackupResult {
  fileName: string;
  bytes: number;
  zip: Uint8Array;
  manifest: BackupManifest;
  total: number;
}

/** A backup file that passed every check, with its data validated and cleaned. */
export interface VerifiedArchive {
  manifest: BackupManifest;
  data: BackupData;
  warnings: Msg[];
  total: number;
  counts: Record<StoreName, number>;
}

/** A verified backup compared with the current data, ready for the user's decisions. */
export interface RestorePlan extends VerifiedArchive {
  fileName: string;
  /** The data as it was when the comparison was made. */
  current: BackupData;
  merge: MergePlan;
  /** SHA-256 of `current`; if the data changes before applying, the plan is stale and nothing is written. */
  fingerprint: string;
}
