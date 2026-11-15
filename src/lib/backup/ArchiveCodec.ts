import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { AppError } from "@/lib/errors/AppError";
import type { BackupData } from "@/lib/storage";
import { APP_NAME, APP_VERSION } from "@/lib/appInfo";
import { BACKUP_FORMAT, BACKUP_LEGACY_FORMAT_VERSION, DATA_NAME, DB_SCHEMA_VERSION, MANIFEST_NAME, MAX_ARCHIVE_BYTES, MAX_ENTRY_BYTES, STORE_NAMES } from "./constants";
import { sha256Hex } from "./hash";
import type { BackupKind, BackupManifest } from "./types";

const ALLOWED = new Set([MANIFEST_NAME, DATA_NAME]);

/** Builds and opens backup ZIP files. Opening enforces size limits and an exact file allowlist before inflating. */
export class ArchiveCodec {
  /** Serializes the data and describes it: file size, overall checksum, and a checksum plus count per store. */
  static async describe(data: BackupData, now: number, kind: BackupKind): Promise<{ dataBytes: Uint8Array; manifest: BackupManifest }> {
    const ordered = Object.fromEntries(STORE_NAMES.map((n) => [n, data[n]]));
    const dataBytes = strToU8(JSON.stringify(ordered));
    const stores = {} as BackupManifest["stores"];
    for (const name of STORE_NAMES) stores[name] = { count: data[name].length, sha256: await sha256Hex(strToU8(JSON.stringify(data[name]))) };
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_LEGACY_FORMAT_VERSION,
      schemaVersion: DB_SCHEMA_VERSION,
      kind,
      app: { name: APP_NAME, version: APP_VERSION },
      createdAt: new Date(now).toISOString(),
      createdAtMs: now,
      stores,
      files: [{ name: DATA_NAME, bytes: dataBytes.length, sha256: await sha256Hex(dataBytes) }],
    };
    return { dataBytes, manifest };
  }

  /** Compresses manifest.json and data.json into one ZIP. */
  static pack(manifest: BackupManifest, dataBytes: Uint8Array): Uint8Array {
    const mtime = new Date(manifest.createdAtMs);
    return zipSync(
      {
        [MANIFEST_NAME]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime }],
        [DATA_NAME]: [dataBytes, { level: 9, mtime }],
      },
      { level: 6 },
    );
  }

  /** Opens a ZIP: checks the signature, allows only the two expected files, and bounds their size before inflating. */
  static unpack(zip: Uint8Array): { manifestBytes: Uint8Array; dataBytes: Uint8Array } {
    if (zip.length > MAX_ARCHIVE_BYTES) throw new AppError("BACKUP_FILE_TOO_LARGE");
    if (zip.length < 22 || zip[0] !== 0x50 || zip[1] !== 0x4b) throw new AppError("BACKUP_NOT_ZIP", { details: "Missing ZIP signature" });
    const seen: string[] = [];
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(zip, {
        filter: (info) => {
          seen.push(info.name);
          if (!ALLOWED.has(info.name)) throw new AppError("BACKUP_UNEXPECTED_CONTENT", { details: `Unexpected entry: ${info.name.slice(0, 80)}` });
          if (info.originalSize > MAX_ENTRY_BYTES) throw new AppError("BACKUP_FILE_TOO_LARGE", { details: `${info.name} expands to ${info.originalSize} bytes` });
          return true;
        },
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("BACKUP_NOT_ZIP", { cause: e, details: e instanceof Error ? e.message : String(e) });
    }
    if (new Set(seen).size !== seen.length) throw new AppError("BACKUP_UNEXPECTED_CONTENT", { details: "Duplicate entries" });
    const manifestBytes = files[MANIFEST_NAME];
    const dataBytes = files[DATA_NAME];
    if (!manifestBytes || !dataBytes) throw new AppError("BACKUP_UNEXPECTED_CONTENT", { details: `Both ${MANIFEST_NAME} and ${DATA_NAME} are required` });
    return { manifestBytes, dataBytes };
  }

  /** Strict UTF-8 JSON parse with a clear error code. */
  static parseJson(bytes: Uint8Array, code: "BACKUP_MANIFEST_INVALID" | "BACKUP_STRUCTURE_INVALID", what: string): unknown {
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (e) {
      throw new AppError(code, { cause: e, details: `${what} is not valid JSON: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  static text(bytes: Uint8Array): string {
    return strFromU8(bytes);
  }
}
