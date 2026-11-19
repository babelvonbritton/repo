import { ValidationError } from "./Guard";
import type { SettingsRepository } from "./repositories";

/** Menu entries that can be reordered. */
export const NAV_IDS = ["board", "trash", "backup", "settings"] as const;
export type NavId = (typeof NAV_IDS)[number];
/** Allowed trash keep-times in days; 0 means never delete automatically. */
export const RETENTION_OPTIONS = [7, 30, 0] as const;
export type RetentionDays = (typeof RETENTION_OPTIONS)[number];

export interface Preferences {
  trashRetentionDays: RetentionDays;
  showTrashBin: boolean;
  deleteAnimation: boolean;
  navOrder: NavId[];
}

export const DEFAULT_PREFERENCES: Preferences = { trashRetentionDays: 7, showTrashBin: true, deleteAnimation: true, navOrder: [...NAV_IDS] };

const KEYS: Record<keyof Preferences, string> = {
  trashRetentionDays: "pref.trashRetentionDays",
  showTrashBin: "pref.showTrashBin",
  deleteAnimation: "pref.deleteAnimation",
  navOrder: "pref.navOrder",
};

type Stored = string | number | boolean | null | undefined;

/** Keeps listed ids in order, drops unknown or repeated ones, and appends any that are missing. */
function normalizeNav(ids: readonly string[]): NavId[] {
  const seen = new Set<NavId>();
  for (const id of ids) if ((NAV_IDS as readonly string[]).includes(id)) seen.add(id as NavId);
  for (const id of NAV_IDS) seen.add(id);
  return [...seen];
}

/** Reads one stored value; returns null when it is missing or not an allowed value. */
const READERS: { [K in keyof Preferences]: (v: Stored) => Preferences[K] | null } = {
  trashRetentionDays: (v) => ((RETENTION_OPTIONS as readonly unknown[]).includes(v) ? (v as RetentionDays) : null),
  showTrashBin: (v) => (typeof v === "boolean" ? v : null),
  deleteAnimation: (v) => (typeof v === "boolean" ? v : null),
  navOrder: (v) => (typeof v === "string" && v.length <= 100 ? normalizeNav(v.split(",")) : null),
};

/**
 * Typed user preferences stored in the settings store. Values read back from the database (which a restored backup
 * can change) are validated; anything not allowed falls back to the default and is reported.
 */
export class PreferenceService {
  private current: Preferences = structuredClone(DEFAULT_PREFERENCES);

  constructor(private readonly settings: SettingsRepository) {}

  /** Loads preferences. `repaired` lists keys whose stored value was not allowed and was reset. */
  async load(): Promise<{ preferences: Preferences; repaired: string[] }> {
    const rows = new Map((await this.settings.all()).map((r) => [r.key, r.value] as const));
    const next = structuredClone(DEFAULT_PREFERENCES) as unknown as Record<string, unknown>;
    const repaired: string[] = [];
    for (const name of Object.keys(KEYS) as Array<keyof Preferences>) {
      if (!rows.has(KEYS[name])) continue;
      const value = READERS[name](rows.get(KEYS[name]));
      if (value === null) {
        repaired.push(KEYS[name]);
        // Write the default back so the repair sticks instead of being reported on every boot.
        await this.set(name, DEFAULT_PREFERENCES[name]);
      } else next[name] = value;
    }
    this.current = next as unknown as Preferences;
    return { preferences: this.get(), repaired };
  }

  get(): Preferences {
    return { ...this.current, navOrder: [...this.current.navOrder] };
  }

  /** Validates and saves one preference. */
  async set<K extends keyof Preferences>(name: K, value: Preferences[K]): Promise<Preferences> {
    const stored = name === "navOrder" ? (value as NavId[]).join(",") : (value as Stored);
    if (READERS[name](stored) === null) throw new ValidationError(`preference ${name}`, `${name} is not an allowed value`, "invalid");
    await this.settings.write(KEYS[name], stored as string | number | boolean);
    this.current = { ...this.current, [name]: READERS[name](stored) } as Preferences;
    return this.get();
  }

  /** Trash keep-time in milliseconds, or Infinity for "never delete automatically". */
  retentionMs(): number {
    const days = this.current.trashRetentionDays;
    return days === 0 ? Infinity : days * 24 * 60 * 60 * 1000;
  }
}
