"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "@/lib/errors/AppError";
import { errorCenter } from "@/lib/errors/ErrorCenter";
import { DEFAULT_PREFERENCES, getStorage, type Board, type BoardStats, type Column, type ColumnTone, type IntegrityReport, type Item, type ItemPatch, type NewItemInput, type Preferences, type RetentionDays, type StageDeletion, type TrashEntry } from "@/lib/storage";
import { applyMove } from "./ordering";
import { WorkspaceController } from "./WorkspaceController";

const PURGE_INTERVAL_MS = 10 * 60 * 1000;
export type RestoreResult = "ok" | "no-stage" | "error";

/** Short, content-free summary of integrity issues for diagnostics. */
function summarize(report: IntegrityReport): string {
  return report.issues.slice(0, 10).map((i) => `${i.code} ${i.id}`).join("\n");
}

/**
 * React state around WorkspaceController. Every action is wrapped: failures are reported through the error center
 * (toast), or thrown as AppError when the calling form shows them inline. Nothing fails silently.
 */
export function useWorkspace() {
  const ctl = useRef<WorkspaceController | null>(null);
  const getCtl = useCallback(() => (ctl.current ??= new WorkspaceController(getStorage())), []);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState<AppError | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  /** Runs an action; on failure shows a toast and returns the fallback. */
  const guard = useCallback(async <T,>(action: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errorCenter.report(e, { action });
      return fallback;
    }
  }, []);

  /** Runs an action; on failure logs it and throws the AppError so the form can show it inline. */
  const inline = useCallback(async <T,>(action: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw errorCenter.report(e, { action, surface: "inline" });
    }
  }, []);

  const loadBoard = useCallback(
    async (id: string) => {
      const snap = await getCtl().loadBoard(id);
      if (!snap) return;
      setColumns(snap.columns);
      setItems(snap.items);
    },
    [getCtl],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const boot = await getCtl().boot();
        const snap = await getCtl().loadBoard(boot.activeId);
        if (!alive || !snap) return;
        if (!boot.integrity.ok) {
          errorCenter.report(new AppError("DATA_INTEGRITY", { severity: "warning", details: summarize(boot.integrity), context: { issues: boot.integrity.issues.length } }), { action: "boot.integrity" });
        }
        setBoards(boot.boards);
        setBoardId(boot.activeId);
        setTrash(boot.trash);
        setPrefs(boot.preferences);
        if (boot.repairedPreferences.length > 0) {
          errorCenter.report(new AppError("DATA_INTEGRITY", { severity: "warning", details: `Reset to default: ${boot.repairedPreferences.join(", ")}` }), { action: "boot.preferences" });
        }
        setColumns(snap.columns);
        setItems(snap.items);
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setBootError(errorCenter.report(e, { action: "boot", surface: "inline" }));
        setPhase("error");
      }
    })();
    // Expired trash is also purged while the app stays open.
    const timer = setInterval(() => {
      void guard("trash.purge", async () => {
        if ((await getCtl().purgeExpired()) > 0) setTrash(await getCtl().listTrash());
      }, undefined);
    }, PURGE_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [getCtl, guard]);

  const selectBoard = useCallback(
    async (id: string) => {
      setBoardId(id);
      await guard("board.load", () => loadBoard(id), undefined);
    },
    [guard, loadBoard],
  );

  /** Reloads everything from storage, for example after a restore. Throws so the restore flow can show the failure. */
  const refreshAll = useCallback(async () => {
    const data = await getCtl().load();
    const snap = await getCtl().loadBoard(data.activeId);
    if (!snap) throw new AppError("STORAGE_FAILED", { details: "Active board could not be loaded" });
    setBoards(data.boards);
    setBoardId(data.activeId);
    setTrash(data.trash);
    setPrefs(data.preferences);
    setColumns(snap.columns);
    setItems(snap.items);
  }, [getCtl]);

  const createBoard = useCallback(
    async (name: string) => {
      const board = await inline("board.create", () => getCtl().createBoard(name));
      setBoards((prev) => [...prev, board]);
      await selectBoard(board.id);
    },
    [getCtl, inline, selectBoard],
  );

  const createItem = useCallback(
    async (input: NewItemInput, note: string) => {
      const item = await inline("item.create", () => getCtl().createItem(input, note));
      setItems((prev) => [...prev, item]);
    },
    [getCtl, inline],
  );

  const saveItem = useCallback(
    async (id: string, patch: ItemPatch, note: string, columnId: string) => {
      await inline("item.save", () => getCtl().saveItem(id, patch, note, columnId));
      if (boardId) await guard("board.reload", () => loadBoard(boardId), undefined);
    },
    [getCtl, inline, guard, boardId, loadBoard],
  );

  /** Optimistic move: the UI updates first, storage follows, and a failure reloads the true state. */
  const moveItem = useCallback(
    async (id: string, columnId: string, index: number) => {
      setItems((prev) => applyMove(prev, id, columnId, index));
      try {
        await getCtl().moveItem(id, columnId, index);
      } catch (e) {
        errorCenter.report(e, { action: "item.move" });
        if (boardId) await guard("board.reload", () => loadBoard(boardId), undefined);
      }
    },
    [getCtl, guard, boardId, loadBoard],
  );

  const trashItem = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await getCtl().trashItem(id);
        setTrash(await getCtl().listTrash());
      } catch (e) {
        errorCenter.report(e, { action: "item.trash" });
        if (boardId) await guard("board.reload", () => loadBoard(boardId), undefined);
      }
    },
    [getCtl, guard, boardId, loadBoard],
  );

  const restore = useCallback(
    async (entryId: string): Promise<RestoreResult> => {
      try {
        const item = await getCtl().restore(entryId);
        setTrash(await getCtl().listTrash());
        if (!item) return "no-stage";
        if (item.boardId === boardId) await loadBoard(boardId);
        errorCenter.notify({ key: "toast.itemRestored" });
        return "ok";
      } catch (e) {
        errorCenter.report(e, { action: "trash.restore" });
        return "error";
      }
    },
    [getCtl, boardId, loadBoard],
  );

  const deleteForever = useCallback(
    (entryId: string) =>
      guard("trash.delete", async () => {
        await getCtl().deleteForever(entryId);
        setTrash(await getCtl().listTrash());
      }, undefined),
    [getCtl, guard],
  );

  const emptyTrash = useCallback(
    () =>
      guard("trash.empty", async () => {
        await getCtl().emptyTrash();
        setTrash(await getCtl().listTrash());
      }, undefined),
    [getCtl, guard],
  );

  /** Loads an item's note. Throws (inline) so the dialog can lock editing instead of risking an overwrite. */
  const loadNote = useCallback((itemId: string) => inline("note.load", () => getCtl().loadNote(itemId)), [getCtl, inline]);

  /** Saves one preference. The screen updates first; if saving fails the saved value is shown again and an error appears. */
  const setPref = useCallback(
    async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      const previous = prefs;
      setPrefs((p) => ({ ...p, [key]: value }));
      try {
        await getCtl().setPreference(key, value);
      } catch (e) {
        errorCenter.report(e, { action: "prefs.save" });
        setPrefs(previous);
      }
    },
    [getCtl, prefs],
  );

  const retentionImpact = useCallback((days: RetentionDays) => guard("trash.retentionImpact", () => getCtl().retentionImpact(days), 0), [getCtl, guard]);

  const setRetention = useCallback(
    (days: RetentionDays) =>
      guard("trash.retention", async () => {
        await getCtl().setRetention(days);
        setPrefs((p) => ({ ...p, trashRetentionDays: days }));
        setTrash(await getCtl().listTrash());
      }, undefined),
    [getCtl, guard],
  );

  const renameBoard = useCallback(
    async (id: string, name: string) => {
      const board = await inline("board.rename", () => getCtl().renameBoard(id, name));
      if (board) setBoards((prev) => prev.map((b) => (b.id === id ? board : b)));
    },
    [getCtl, inline],
  );

  const boardStats = useCallback((id: string): Promise<BoardStats> => inline("board.stats", () => getCtl().boardStats(id)), [getCtl, inline]);

  const deleteBoard = useCallback(
    async (id: string) => {
      await inline("board.delete", () => getCtl().deleteBoard(id));
      await refreshAll();
    },
    [getCtl, inline, refreshAll],
  );

  const reloadBoard = useCallback(async () => {
    if (boardId) await loadBoard(boardId);
  }, [boardId, loadBoard]);

  const createStage = useCallback(
    async (name: string, tone: ColumnTone) => {
      if (!boardId) return;
      await inline("stage.create", () => getCtl().createStage(boardId, name, tone));
      await reloadBoard();
    },
    [getCtl, inline, boardId, reloadBoard],
  );

  const updateStage = useCallback(
    async (id: string, patch: { name?: string; tone?: ColumnTone }) => {
      await inline("stage.update", () => getCtl().updateStage(id, patch));
      await reloadBoard();
    },
    [getCtl, inline, reloadBoard],
  );

  const moveStage = useCallback(
    async (id: string, index: number) => {
      await inline("stage.move", () => getCtl().moveStage(id, index));
      await reloadBoard();
    },
    [getCtl, inline, reloadBoard],
  );

  const deleteStage = useCallback(
    async (id: string, strategy: StageDeletion) => {
      await inline("stage.delete", () => getCtl().deleteStage(id, strategy));
      await reloadBoard();
      setTrash(await getCtl().listTrash());
    },
    [getCtl, inline, reloadBoard],
  );

  return { phase, bootError, prefs, setPref, retentionImpact, setRetention, renameBoard, boardStats, deleteBoard, createStage, updateStage, moveStage, deleteStage, schemaVersion: () => getCtl().schemaVersion, boards, boardId, columns, items, trash, selectBoard, refreshAll, createBoard, createItem, saveItem, moveItem, trashItem, restore, deleteForever, emptyTrash, loadNote };
}
