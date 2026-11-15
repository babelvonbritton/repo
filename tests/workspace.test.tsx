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
Object.assign(globalThis, { ResizeObserver: NoopObserver });
Object.assign(globalThis, { CSS: { escape: (s: string) => s } });
Object.assign(window, { matchMedia: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });
Object.assign(Element.prototype, { scrollIntoView() {}, hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {} });

afterEach(cleanup);

describe("workspace smoke test", () => {
  it("opens an item, enforces the note limit with counter, and moves the item to the trash", async () => {
    render(<Providers><BoardApp /></Providers>);
    expect(await screen.findByRole("heading", { name: "Getting started" })).toBeTruthy();

    fireEvent.click(screen.getByText("Define your goal"));
    const note = (await screen.findByLabelText("Note")) as HTMLTextAreaElement;
    await waitFor(() => expect(note.disabled).toBe(false));
    fireEvent.change(note, { target: { value: "x".repeat(4100) } });
    expect(note.value.length).toBe(4000);
    expect(screen.getByText("4000 / 4000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    const bin = screen.getByRole("button", { name: "Open trash" });
    await waitFor(() => expect(within(bin).getByText("1")).toBeTruthy());
  });
});
