// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardApp } from "@/components/BoardApp";
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

afterEach(cleanup);

async function openBackup() {
  render(<Providers><BoardApp /></Providers>);
  await screen.findByRole("heading", { name: "Getting started" });
  fireEvent.click(screen.getAllByRole("button", { name: "Backup" })[0]);
  return screen.findByRole("dialog");
}

describe("backup dialog", () => {
  it("requires matching passphrases before starting an encrypted backup", async () => {
    const dialog = await openBackup();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Encrypt this backup with a passphrase" }));
    fireEvent.change(within(dialog).getByLabelText("Passphrase"), { target: { value: "private phrase" } });
    fireEvent.change(within(dialog).getByLabelText("Confirm passphrase"), { target: { value: "different phrase" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create backup" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("The passphrases do not match.");
    expect(within(dialog).queryByText("Read your data")).toBeNull();
  });

  it("runs every backup stage, verifies the archive and offers the saved file", async () => {
    const dialog = await openBackup();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create backup" }));
    expect(await within(dialog).findByText("Backup saved", {}, { timeout: 4000 })).toBeTruthy();
    for (const title of ["Read your data", "Check data consistency", "Build files and checksums", "Encrypt backup", "Compress to ZIP", "Verify the new archive", "Save the file"]) {
      expect(within(dialog).getByText(title)).toBeTruthy();
    }
    expect(within(dialog).getByText("7/7")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Download again" })).toBeTruthy();
  });

  it("explains a blocked download instead of failing silently, and lets the user retry", async () => {
    const spy = vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("blocked by browser");
    });
    const dialog = await openBackup();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create backup" }));
    expect(await within(dialog).findByText("The file could not be saved", {}, { timeout: 4000 })).toBeTruthy();
    expect(within(dialog).getByText("6/7")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Try again" })).toBeTruthy();
    spy.mockRestore();
  });

  it("explains why a file that is not a Repo backup was rejected", async () => {
    const dialog = await openBackup();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Restore" }));
    const input = (await within(dialog).findByLabelText("Drop a backup here or choose a file")) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["this is not a zip"], "notes.zip", { type: "application/zip" })] } });
    const alert = await within(dialog).findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toMatch(/not a valid ZIP|could not be read/);
    expect(within(dialog).getByRole("button", { name: "Choose another file" })).toBeTruthy();
  });
});
