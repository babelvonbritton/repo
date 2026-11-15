/** Backup format limits and names. Bump BACKUP_FORMAT_VERSION when the file layout changes. */
export const BACKUP_FORMAT = "repo-backup";
export const BACKUP_FORMAT_VERSION = 2;
export const BACKUP_LEGACY_FORMAT_VERSION = 1;
/** Must equal the IndexedDB schema version in RepoDatabase. */
export const DB_SCHEMA_VERSION = 1;

export const MANIFEST_NAME = "manifest.json";
export const DATA_NAME = "data.json";

export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
export const MAX_RECORDS_PER_STORE = 200_000;

export const STORE_NAMES = ["boards", "columns", "items", "notes", "trash", "settings"] as const;
export type StoreName = (typeof STORE_NAMES)[number];
