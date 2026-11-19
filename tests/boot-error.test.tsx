// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/storage/PreferenceService";
import { useWorkspace } from "@/lib/workspace/useWorkspace";

const behavior = vi.hoisted(() => ({
  boot: vi.fn(async () => ({
    boards: [],
    activeId: "missing",
    trash: [],
    preferences: DEFAULT_PREFERENCES,
    integrity: { ok: true, issues: [] },
    repairedPreferences: [],
  })),
  loadBoard: vi.fn(async () => null),
  purgeExpired: vi.fn(async () => 0),
  listTrash: vi.fn(async () => []),
}));

vi.mock("@/lib/workspace/WorkspaceController", () => ({
  WorkspaceController: class {
    boot = behavior.boot;
    loadBoard = behavior.loadBoard;
    purgeExpired = behavior.purgeExpired;
    listTrash = behavior.listTrash;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  behavior.boot.mockClear();
  behavior.loadBoard.mockClear();
  behavior.purgeExpired.mockClear();
  behavior.listTrash.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("boot failure", () => {
  it("shows the error state instead of loading forever when the active board cannot be loaded", async () => {
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.phase).toBe("loading");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(behavior.loadBoard).toHaveBeenCalledWith("missing");
    expect(result.current.phase).toBe("error");
    expect(result.current.bootError).not.toBeNull();
  });

  it("does not run the trash purge timer when boot fails", async () => {
    behavior.boot.mockRejectedValueOnce(new Error("boot failed"));
    const { result } = renderHook(() => useWorkspace());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.phase).toBe("error");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    });
    expect(behavior.purgeExpired).not.toHaveBeenCalled();
  });
});
