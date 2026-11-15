import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { NOTE_MAX_LENGTH, TRASH_RETENTION_MS, ValidationError } from "@/lib/storage";
import { RepoDatabase } from "@/lib/storage/RepoDatabase";
import { StorageService } from "@/lib/storage";

let counter = 0;
/** Builds an isolated storage service with a controllable clock. */
function make(start = 1_000_000) {
  const time = { now: start };
  const service = new StorageService(new RepoDatabase(`test-${counter++}`), () => time.now);
  return { service, time };
}

describe("storage layer", () => {
  it("seeds once and passes the integrity check", async () => {
    const { service } = make();
    const first = await service.init();
    expect(first.seeded).toBe(true);
    expect(first.counts).toMatchObject({ boards: 1, columns: 4, items: 4, notes: 0, trash: 0 });
    expect(first.integrity.ok).toBe(true);
    expect((await service.init()).seeded).toBe(true); // memoized, no second seed
    expect(await service.boards.count()).toBe(1);
  });

  it("enforces the 4000 character note limit", async () => {
    const { service } = make();
    await service.init();
    const item = (await service.items.all())[0];
    await service.notes.save(item.id, "a".repeat(NOTE_MAX_LENGTH));
    await expect(service.notes.save(item.id, "a".repeat(NOTE_MAX_LENGTH + 1))).rejects.toBeInstanceOf(ValidationError);
  });

  it("moves items to trash with their note and restores them", async () => {
    const { service } = make();
    await service.init();
    const item = (await service.items.all())[0];
    await service.notes.save(item.id, "keep me");
    const entry = await service.trashService.trashItem(item.id);
    expect(entry?.expiresAt).toBe(entry!.deletedAt + TRASH_RETENTION_MS);
    expect(await service.items.get(item.id)).toBeUndefined();
    expect(await service.notes.get(item.id)).toBeUndefined();
    const restored = await service.trashService.restore(entry!.id);
    expect(restored?.id).toBe(item.id);
    expect((await service.notes.get(item.id))?.text).toBe("keep me");
    expect(await service.trash.count()).toBe(0);
  });

  it("purges trash after 7 days only", async () => {
    const { service, time } = make();
    await service.init();
    const item = (await service.items.all())[0];
    await service.trashService.trashItem(item.id);
    time.now += TRASH_RETENTION_MS - 1;
    expect(await service.trashService.purgeExpired()).toBe(0);
    time.now += 1;
    expect(await service.trashService.purgeExpired()).toBe(1);
  });

  it("detects orphaned records", async () => {
    const { service } = make();
    await service.init();
    const [column] = await service.columns.all();
    await service.columns.remove(column.id);
    const report = await service.integrity.run();
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "ORPHAN_ITEM")).toBe(true);
  });
});
