// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardApp } from "@/components/BoardApp";
import { SectionGuide } from "@/components/board/SectionGuide";
import { resetStorage } from "@/lib/storage";
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

beforeEach(async () => {
  await resetStorage();
  localStorage.clear();
});
afterEach(cleanup);

async function openApp() {
  render(<Providers><BoardApp /></Providers>);
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
}

async function openNewItem() {
  fireEvent.click(screen.getByRole("button", { name: "New item" }));
  const d = await screen.findByRole("dialog");
  await within(d).findByLabelText("Title");
  return d;
}

describe("note copy button", () => {
  it("is hidden while the note is empty, then copies the note and shows Copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openApp();
    const d = await openNewItem();
    expect(within(d).queryByRole("button", { name: "Copy note" })).toBeNull();
    fireEvent.change(within(d).getByLabelText("Note"), { target: { value: "Call the venue before Friday." } });
    const copy = within(d).getByRole("button", { name: "Copy note" });
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Call the venue before Friday."));
    expect(within(d).getByRole("status").textContent).toContain("Copied");
    // The button stays enabled while the feedback shows.
    expect((copy as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows Copy failed when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openApp();
    const d = await openNewItem();
    fireEvent.change(within(d).getByLabelText("Note"), { target: { value: "Something to copy." } });
    fireEvent.click(within(d).getByRole("button", { name: "Copy note" }));
    await waitFor(() => expect(within(d).getByRole("status").textContent).toContain("Copy failed"));
  });
});

describe("field tooltips", () => {
  it("opens the title hint on click and closes it with Escape", async () => {
    await openApp();
    const d = await openNewItem();
    fireEvent.click(within(d).getByRole("button", { name: "More about Title" }));
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Required. This is the name shown on the card and in the list view.");
    fireEvent.keyDown(tip, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("explains the stage fields in the stage editor", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    const d = await screen.findByRole("dialog");
    const helps = within(d).getAllByRole("button", { name: /More about/ });
    expect(helps.length).toBeGreaterThanOrEqual(5);
    fireEvent.click(within(d).getAllByRole("button", { name: "More about Stage name" })[0]);
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Rename the stage. The new name saves when you press Enter or click outside the field.");
  });
});

describe("section guide", () => {
  it("opens the board guide from the header help button", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "How to use this section" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).queryByText("What you can do on a board")).not.toBeNull();
    expect(within(d).queryByText("Add an item")).not.toBeNull();
    expect(within(d).queryByText("Move items")).not.toBeNull();
  });

  it("shows the trash guide for the trash section", async () => {
    render(<Providers><SectionGuide open onOpenChange={() => {}} section="trash" /></Providers>);
    const d = await screen.findByRole("dialog");
    expect(within(d).queryByText("What you can do in the trash")).not.toBeNull();
    expect(within(d).queryByText("Restore an item")).not.toBeNull();
    expect(within(d).queryByText("Delete forever")).not.toBeNull();
  });

  it("opens the trash guide from the help button inside the trash panel", async () => {
    await openApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Trash" })[0]);
    const panel = await screen.findByRole("dialog");
    fireEvent.click(within(panel).getByRole("button", { name: "How to use this section" }));
    expect(await screen.findByText("What you can do in the trash")).not.toBeNull();
  });

  it("opens the settings guide from the help button inside the settings dialog", async () => {
    await openApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const d = await screen.findByRole("dialog");
    fireEvent.click(within(d).getByRole("button", { name: "How to use this section" }));
    expect(await screen.findByText("What you can do in settings")).not.toBeNull();
  });

  it("opens the backup guide from the help button inside the backup dialog", async () => {
    await openApp();
    fireEvent.click(screen.getAllByRole("button", { name: "Backup" })[0]);
    const d = await screen.findByRole("dialog");
    fireEvent.click(within(d).getByRole("button", { name: "How to use this section" }));
    expect(await screen.findByText("What you can do with backups")).not.toBeNull();
  });

  it("shows the backup and settings guides for their sections", async () => {
    const { unmount } = render(<Providers><SectionGuide open onOpenChange={() => {}} section="backup" /></Providers>);
    let d = await screen.findByRole("dialog");
    expect(within(d).queryByText("What you can do with backups")).not.toBeNull();
    expect(within(d).queryByText("Save a safety backup")).not.toBeNull();
    unmount();
    render(<Providers><SectionGuide open onOpenChange={() => {}} section="settings" /></Providers>);
    d = await screen.findByRole("dialog");
    expect(within(d).queryByText("What you can do in settings")).not.toBeNull();
    expect(within(d).queryByText("Trash behavior")).not.toBeNull();
  });
});
