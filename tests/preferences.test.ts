import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { StorageService, TRASH_NEVER } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";

const DAY = 86_400_000;
let n = 0;
async function make(start = 1_000_000_000_000) {
  const time = { now: start };
  const storage = new StorageService(new RepoDatabase(`prefs-${n++}`), () => time.now);
  const report = await storage.init();
  return { storage, time, report };
}

describe("preferences", () => {
  it("starts with defaults, saves changes, and keeps them after reopening", async () => {
    const { storage } = await make();
    expect(storage.preferences.get()).toEqual({ trashRetentionDays: 7, showTrashBin: true, deleteAnimation: true, navOrder: ["board", "trash", "backup", "settings"] });
    await storage.preferences.set("showTrashBin", false);
    await storage.preferences.set("navOrder", ["settings", "board", "backup", "trash"]);
    const { preferences } = await storage.preferences.load();
    expect(preferences.showTrashBin).toBe(false);
    expect(preferences.navOrder).toEqual(["settings", "board", "backup", "trash"]);
    expect(storage.schemaVersion).toBe(1);
  });

  it("repairs values that a hand-edited or restored backup made invalid, and reports them", async () => {
    const { storage } = await make();
    await storage.settings.write("pref.trashRetentionDays", 99999);
    await storage.settings.write("pref.showTrashBin", "yes");
    await storage.settings.write("pref.navOrder", "settings,evil,settings,board");
    const { preferences, repaired } = await storage.preferences.load();
    expect(repaired.sort()).toEqual(["pref.showTrashBin", "pref.trashRetentionDays"]);
    expect(preferences.trashRetentionDays).toBe(7);
    expect(preferences.showTrashBin).toBe(true);
    expect(preferences.navOrder).toEqual(["settings", "board", "trash", "backup"]);
    await expect(storage.preferences.set("trashRetentionDays", 12 as never)).rejects.toThrow();
  });
});

describe("trash retention setting", () => {
  it("uses 7 days, 30 days or never for new deletions", async () => {
    for (const [days, expected] of [[7, 7 * DAY], [30, 30 * DAY], [0, null]] as const) {
      const { storage, time } = await make();
      await storage.preferences.set("trashRetentionDays", days);
      const item = (await storage.items.all())[0];
      const entry = (await storage.trashService.trashItem(item.id))!;
      expect(entry.expiresAt).toBe(expected === null ? TRASH_NEVER : time.now + expected);
    }
  });

  it("applies a new setting to items already in the trash", async () => {
    const { storage, time } = await make();
    const [a, b] = await storage.items.all();
    await storage.trashService.trashItem(a.id);
    time.now += 10 * DAY;
    await storage.trashService.trashItem(b.id);

    // shortening is previewed first: the item deleted 10 days ago would go right away at 7 days
    expect(await storage.trashService.countExpiredWith(7 * DAY)).toBe(1);
    await storage.preferences.set("trashRetentionDays", 30);
    expect(await storage.trashService.reschedule()).toEqual({ purged: 0 });
    expect(await storage.trash.count()).toBe(2);

    await storage.preferences.set("trashRetentionDays", 7);
    expect((await storage.trashService.reschedule()).purged).toBe(1);
    expect(await storage.trash.count()).toBe(1);

    await storage.preferences.set("trashRetentionDays", 0);
    await storage.trashService.reschedule();
    time.now += 400 * DAY;
    expect(await storage.trashService.purgeExpired()).toBe(0);
    expect((await storage.trash.all())[0].expiresAt).toBe(TRASH_NEVER);
  });
});
