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

describe("drag and drop", () => {
  it("drags a card to the middle of another column and stores the order the board shows", async () => {
    // Give "In progress" a second card so "the middle" is a real position.
    const storage = getStorage();
    await storage.init();
    const board = (await storage.boardService.listBoards())[0];
    const snap = (await storage.boardService.loadBoard(board.id))!;
    const inProgress = snap.columns[1];
    await storage.items.create({ boardId: board.id, columnId: inProgress.id, title: "Drag target" });

    // jsdom reports every element at (0, 0) with no size, so collision detection cannot tell cards
    // apart. Lay the board out on a grid: one column per 220px, one card per 90px. Install it before
    // the board renders, so the drag library measures the cards with these rects from the start.
    // Two things the naive grid gets wrong, both found while debugging this test:
    // - A real browser reports a rect with the element's own transform applied; jsdom does not, so
    //   the inline drag translate is added back here. Without it the library subtracts a translate
    //   the rect never had, the collision rect never moves, and `over` stays the source card.
    // - Each card's rect is cached on first measurement. When the live preview moves the dragged
    //   card into the target column, a fresh measurement would make the dragged card itself the
    //   closest droppable and flip `over` back to it. The cache keys are card ids (a card must
    //   never fall back to its column's key, or every card in a column shares one rect).
    const origRect = Element.prototype.getBoundingClientRect;
    const rectCache = new Map<string, { x: number; y: number; width: number; height: number; top: number; left: number; right: number; bottom: number }>();
    function gridRectFor(el: Element): { x: number; y: number; width: number; height: number; top: number; left: number; right: number; bottom: number } | null {
      const section = el.closest("section[aria-label]");
      if (!section) {
        // The drag overlay clone lives outside any section: use the original card's grid rect.
        const inner = el.querySelector("[data-item-id]");
        const id = inner?.getAttribute("data-item-id") ?? el.getAttribute("data-item-id");
        if (id) {
          const original = document.querySelector(`section[aria-label] [data-item-id="${id}"]`);
          if (original && original !== el) return gridRectFor(original);
        }
        return null;
      }
      const col = [...document.querySelectorAll("section[aria-label]")].indexOf(section);
      const cards = [...section.querySelectorAll("[data-item-id]")];
      const inner = el.querySelectorAll("[data-item-id]");
      const asCard = el.hasAttribute("data-item-id") ? el : inner.length === 1 ? inner[0] : null;
      const x = 10 + col * 220;
      if (asCard) {
        const y = 120 + cards.indexOf(asCard as Element) * 90;
        return { x, y, width: 200, height: 80, top: y, left: x, right: x + 200, bottom: y + 80 };
      }
      const height = Math.max(140, cards.length * 90 + 40);
      return { x, y: 100, width: 200, height, top: 100, left: x, right: x + 200, bottom: 100 + height };
    }
    function cacheKey(el: Element): string | null {
      if (el.tagName === "SECTION" && el.hasAttribute("aria-label")) return "col:" + el.getAttribute("aria-label");
      const id = el.getAttribute("data-item-id") ?? el.querySelector("[data-item-id]")?.getAttribute("data-item-id");
      return id ? "card:" + id : null;
    }
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const key = cacheKey(this);
      const inSection = !!this.closest("section[aria-label]");
      // The drag overlay clone lives outside any section: never cache it, its rect must follow
      // the pointer via its own inline transform.
      if (key && inSection && rectCache.has(key)) {
        const base = rectCache.get(key)!;
        const t = (this as HTMLElement).style?.transform ?? "";
        const m = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(t) ?? /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(t);
        const dx = m ? Number(m[1]) : 0;
        const dy = m ? Number(m[2]) : 0;
        return { ...base, x: base.x + dx, y: base.y + dy, top: base.top + dy, left: base.left + dx, right: base.right + dx, bottom: base.bottom + dy } as DOMRect;
      }
      const base = gridRectFor(this);
      if (!base) return origRect.call(this);
      if (key && inSection) rectCache.set(key, base);
      const t = (this as HTMLElement).style?.transform ?? "";
      const m = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(t) ?? /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(t);
      const dx = m ? Number(m[1]) : 0;
      const dy = m ? Number(m[2]) : 0;
      return { ...base, x: base.x + dx, y: base.y + dy, top: base.top + dy, left: base.left + dx, right: base.right + dx, bottom: base.bottom + dy } as DOMRect;
    };
    try {
      await openApp();
      const source = screen.getByText("Define your goal");
      // The board uses the mouse sensor, so this is a mouse drag, not a pointer drag: mousedown on the
      // card, a move past the 6px activation distance, a move over the target, then mouseup.
      // "Define your goal" sits at column 0, row 0 (x 10-210, y 120-200); "Drag target" is column 1,
      // row 1 (x 230-430, y 210-290), so (330, 230) is over its upper half: the middle of the column.
      fireEvent.mouseDown(source, { button: 0, clientX: 110, clientY: 160 });
      fireEvent.mouseMove(document, { clientX: 110, clientY: 170 });
      fireEvent.mouseMove(document, { clientX: 330, clientY: 230 });
      fireEvent.mouseUp(document, { clientX: 330, clientY: 230 });

      // The board shows the card in its new place right away (optimistic move).
      await waitFor(() => {
        const section = document.querySelector('section[aria-label="In progress"]')!;
        const titles = [...section.querySelectorAll("h3")].map((h) => h.textContent);
        expect(titles).toEqual(["Gather what you need", "Define your goal", "Drag target"]);
      });
      // And the database agrees with what the board shows.
      await waitFor(async () => {
        const stored = (await getStorage().boardService.loadBoard(board.id))!;
        const storedTitles = stored.items
          .filter((i) => i.columnId === inProgress.id)
          .sort((a, b) => a.order - b.order)
          .map((i) => i.title);
        expect(storedTitles).toEqual(["Gather what you need", "Define your goal", "Drag target"]);
      });
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });
});
