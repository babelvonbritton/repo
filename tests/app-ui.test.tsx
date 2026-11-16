// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { strToU8, zipSync } from "fflate";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardApp } from "@/components/BoardApp";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { APP_VERSION } from "@/lib/appInfo";
import { ArchiveCodec } from "@/lib/backup/ArchiveCodec";
import { getStorage, resetStorage } from "@/lib/storage";
import { Providers } from "./support";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace() {}, push() {}, prefetch() {}, back() {} }),
  usePathname: () => "/en/",
}));

// jsdom lacks a few browser APIs that Radix and the app rely on.
class NoopObserver { observe() {} unobserve() {} disconnect() {} }
Object.assign(globalThis, { ResizeObserver: NoopObserver, CSS: { escape: (s: string) => s } });
Object.assign(window, { matchMedia: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });
Object.assign(Element.prototype, { scrollIntoView() {}, hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {} });
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function (this: File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

beforeEach(async () => {
  await resetStorage();
  localStorage.clear();
});
afterEach(cleanup);

async function openApp(locale: "en" | "id" | "ja" = "en") {
  render(<Providers locale={locale}><BoardApp /></Providers>);
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
}
/** The menu buttons exist twice under jsdom (sidebar and phone bar); the first is the sidebar. */
const menu = (name: string) => screen.getAllByRole("button", { name })[0];
const dialog = () => screen.findByRole("dialog");

describe("navigation and footer", () => {
  it("has no All items entry, shows the menu in the saved order, and a footer with the policy link and version", async () => {
    await openApp();
    expect(screen.queryByText("All items")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Workspace", hidden: true });
    expect(within(nav).getAllByRole("button", { hidden: true }).map((b) => b.textContent?.trim())).toEqual(["Board", "Trash", "Backup", "Settings"]);
    expect(screen.getByRole("navigation", { name: "Main menu" })).toBeTruthy();

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("© 2026 Alzam A. All Rights Reserved.");
    expect(footer.textContent).toContain(`Version ${APP_VERSION}`);
    expect(within(footer).getByRole("link", { name: "Privacy & Policy" }).getAttribute("href")).toMatch(/^\/en\/privacy\/?$/); // the slash is added by the production build
    expect(footer.className).toContain("md:sticky");
  });
});

describe("settings", () => {
  it("lets the user rearrange the menu, hide the floating bin, and see the app and schema versions", async () => {
    await openApp();
    expect(screen.getByRole("button", { name: "Open trash", hidden: true })).toBeTruthy();
    fireEvent.click(menu("Settings"));
    const d = await dialog();

    expect(within(d).getByText(APP_VERSION)).toBeTruthy();
    expect(within(d).getByText("Database schema version").nextElementSibling?.textContent).toBe("1");
    expect(within(d).getByText("Privacy & Policy")).toBeTruthy();

    fireEvent.click(within(d).getByRole("button", { name: "Move Trash down" }));
    const nav = screen.getByRole("navigation", { name: "Workspace", hidden: true });
    await waitFor(() => expect(within(nav).getAllByRole("button", { hidden: true }).map((b) => b.textContent?.trim())).toEqual(["Board", "Backup", "Trash", "Settings"]));
    expect((await getStorage().settings.read("pref.navOrder"))).toBe("board,backup,trash,settings");

    const animation = within(d).getByRole("switch", { name: /Play the deletion animation/ });
    expect(animation.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(d).getByRole("switch", { name: /Show the floating trash bin/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open trash", hidden: true })).toBeNull());
    expect(within(d).getByRole("switch", { name: /Play the deletion animation/ }).hasAttribute("disabled")).toBe(true);
    expect(await getStorage().settings.read("pref.showTrashBin")).toBe(false);
  });

  it("renames a board, protects the last one, and shows what deleting a board removes", async () => {
    await openApp();
    fireEvent.click(menu("Settings"));
    const d = await dialog();
    expect((within(d).getByRole("button", { name: "Delete Getting started" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(d).getByRole("button", { name: "Rename Getting started" }));
    const input = within(d).getByRole("textbox", { name: "Rename Getting started" });
    fireEvent.change(input, { target: { value: "  Home  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByText("Home").length).toBeGreaterThan(0));

    await getStorage().boardService.createBoard("Second");
    cleanup();
    await openApp();
    fireEvent.click(menu("Settings"));
    const d2 = await dialog();
    fireEvent.click(within(d2).getByRole("button", { name: "Delete Home" }));
    expect(await screen.findByText(/permanently deletes 4 items, 0 notes and 0 items in the trash/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(async () => expect((await getStorage().boardService.listBoards()).map((b) => b.name)).toEqual(["Second"]));
  });
});

describe("stages", () => {
  it("adds a stage and deletes one, moving its items to another stage", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    const d = await dialog();
    fireEvent.change(within(d).getByPlaceholderText("New stage name"), { target: { value: "Blocked" } });
    fireEvent.click(within(d).getByRole("button", { name: "Add stage" }));
    await waitFor(() => expect(screen.getByText("Blocked")).toBeTruthy());

    fireEvent.click(within(d).getByRole("button", { name: "Delete Not started" }));
    expect(await screen.findByText(/1 item is in this stage/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete stage" }));
    await waitFor(() => expect(screen.queryByText("Not started")).toBeNull());
    const board = (await getStorage().boardService.listBoards())[0];
    const snap = (await getStorage().boardService.loadBoard(board.id))!;
    expect(snap.columns.map((c) => c.name)).toEqual(["In progress", "In review", "Completed", "Blocked"]);
    expect(snap.items).toHaveLength(4);
  });

  it("does not offer to delete the last stage", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    const d = await dialog();
    for (const name of ["Not started", "In progress", "In review"]) {
      fireEvent.click(within(d).getByRole("button", { name: `Delete ${name}` }));
      fireEvent.click(screen.getByRole("button", { name: "Delete stage" }));
      await waitFor(() => expect(screen.queryByText(name)).toBeNull());
    }
    const lastDelete = within(d).getByRole("button", { name: "Delete Completed" }) as HTMLButtonElement;
    expect(lastDelete.disabled).toBe(true);
  });
});

describe("languages", () => {
  it.each([
    ["ja", "はじめに", "未着手", "目標を決める", "プライバシーとポリシー"],
    ["id", "Mulai di sini", "Belum dimulai", "Tentukan tujuan Anda", "Privasi & Kebijakan"],
  ] as const)("shows default content and the footer naturally in %s", async (locale, board, stage, item, policy) => {
    await openApp(locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(board);
    expect(screen.getByText(stage)).toBeTruthy();
    expect(screen.getByText(item)).toBeTruthy();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: policy })).toBeTruthy();
  });

  it("shows the privacy and policy page with every section in each language", async () => {
    for (const [locale, title] of [["en", "Privacy & Policy"], ["id", "Privasi & Kebijakan"], ["ja", "プライバシーとポリシー"]] as const) {
      const { unmount } = render(<Providers locale={locale}><PrivacyContent /></Providers>);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(8);
      unmount();
    }
  });
});

describe("restore review", () => {
  it("shows new, identical and differing records, and applies only the replacement the user picks", async () => {
    await openApp();
    const storage = getStorage();
    const original = await storage.snapshots.readAll();
    const backup = JSON.parse(JSON.stringify(original)) as typeof original;
    const [changed, other] = backup.items;
    changed.title = "Title from the backup";
    changed.seedKey = null; // an edited item no longer carries a default key
    other.title = "Other title from the backup";
    other.seedKey = null;
    backup.items.push({ ...changed, id: "brand-new-item", title: "Only in the backup", order: 9 });

    const { dataBytes, manifest } = await ArchiveCodec.describe(backup, Date.now(), "backup");
    const zip = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": dataBytes });

    fireEvent.click(menu("Backup"));
    const d = await dialog();
    fireEvent.click(within(d).getByRole("tab", { name: "Restore" }));
    const input = (await within(d).findByLabelText("Drop a backup here or choose a file")) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([zip], "backup.zip", { type: "application/zip" })] } });

    expect(await within(d).findByText("1 new record will be added", {}, { timeout: 5000 })).toBeTruthy();
    expect(within(d).getByText("2 records differ from your current data")).toBeTruthy();
    expect(within(d).getByText("Only in the backup")).toBeTruthy();
    expect(within(d).getAllByText("Title from the backup").length).toBeGreaterThan(0);
    expect(within(d).getByText("After restoring: 1 added, 0 replaced, 2 kept as they are.")).toBeTruthy();

    // nothing is replaced until it is chosen: pick only the first difference
    const choices = within(d).getAllByRole("radio", { name: "Replace" });
    fireEvent.click(choices[0]);
    expect(within(d).getByText("After restoring: 1 added, 1 replaced, 1 kept as they are.")).toBeTruthy();

    fireEvent.click(within(d).getByRole("checkbox", { name: /safety backup/ })); // skip the download in jsdom
    fireEvent.click(within(d).getByRole("button", { name: "Apply changes" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/1 added and 1 replaced/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "Apply changes" }));
    expect(await within(d).findByText("Backup restored", {}, { timeout: 6000 })).toBeTruthy();

    const after = await storage.snapshots.readAll();
    const titles = new Map(after.items.map((i) => [i.id, i.title]));
    expect(titles.get("brand-new-item")).toBe("Only in the backup");
    const replacedIds = backup.items.slice(0, 2).filter((i) => titles.get(i.id) === i.title).length;
    expect(replacedIds).toBe(1);
    expect(after.items).toHaveLength(5);
    expect((await storage.integrity.run()).ok).toBe(true);
  });

  it("does not split an emoji when it previews a long note", async () => {
    await openApp();
    const storage = getStorage();
    const item = (await storage.items.all())[0];
    await storage.notes.save(item.id, "current note");
    const original = await storage.snapshots.readAll();
    const backup = JSON.parse(JSON.stringify(original)) as typeof original;
    backup.notes[0].text = "a".repeat(139) + "😀" + "b".repeat(50);

    const { dataBytes, manifest } = await ArchiveCodec.describe(backup, Date.now(), "backup");
    const zip = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": dataBytes });

    fireEvent.click(menu("Backup"));
    const d = await dialog();
    fireEvent.click(within(d).getByRole("tab", { name: "Restore" }));
    const input = (await within(d).findByLabelText("Drop a backup here or choose a file")) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([zip], "backup.zip", { type: "application/zip" })] } });

    await waitFor(() => expect(d.textContent).toContain("😀"), { timeout: 5000 });
  });
});

describe("trash settings in the interface", () => {
  async function trashOneItem(title = "Define your goal") {
    fireEvent.click(await screen.findByText(title));
    const d = await dialog();
    fireEvent.click(await within(d).findByRole("button", { name: "Move to trash" }));
  }
  const flights = () => document.querySelectorAll(".z-\\[54\\]").length;

  it("plays the fly-to-bin animation by default and skips it when the setting is off", async () => {
    await openApp();
    await trashOneItem();
    await waitFor(() => expect(flights()).toBe(1));
    cleanup();

    const storage = getStorage();
    await storage.preferences.set("deleteAnimation", false);
    await openApp();
    await trashOneItem("Gather what you need");
    await waitFor(async () => expect(await storage.trash.count()).toBe(2));
    expect(flights()).toBe(0);
  });

  it("describes the expiry setting: days left, or kept until deleted when set to never", async () => {
    await openApp();
    const storage = getStorage();
    await storage.preferences.set("trashRetentionDays", 30);
    const item = (await storage.items.all())[0];
    await storage.trashService.trashItem(item.id);
    await storage.trashService.reschedule();
    cleanup();
    await openApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Open trash", hidden: true })[0]);
    const panel = await dialog();
    expect(within(panel).getByText("Items are deleted forever after 30 days.")).toBeTruthy();
    expect(within(panel).getByText("30 days left")).toBeTruthy();
    cleanup();

    await storage.preferences.set("trashRetentionDays", 0);
    await storage.trashService.reschedule();
    await openApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Open trash", hidden: true })[0]);
    const panel2 = await dialog();
    expect(within(panel2).getByText("Items stay in the trash until you delete them.")).toBeTruthy();
    expect(within(panel2).getByText("Kept until you delete it")).toBeTruthy();
  });
});

describe("restore review with nothing to do", () => {
  it("says so and offers no apply button when the backup matches the current data exactly", async () => {
    await openApp();
    const snapshot = await getStorage().snapshots.readAll();
    const { dataBytes, manifest } = await ArchiveCodec.describe(snapshot, Date.now(), "backup");
    const zip = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": dataBytes });
    fireEvent.click(menu("Backup"));
    const d = await dialog();
    fireEvent.click(within(d).getByRole("tab", { name: "Restore" }));
    const input = (await within(d).findByLabelText("Drop a backup here or choose a file")) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([zip], "same.zip", { type: "application/zip" })] } });
    expect(await within(d).findByText(/already here and identical/, {}, { timeout: 5000 })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "Apply changes" })).toBeNull();
  });
});
