"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/routing";
import { AppError } from "@/lib/errors/AppError";
import { describeError } from "@/lib/errors/describe";
import type { Column, Item, ItemPatch, NavId } from "@/lib/storage";
import { applyFilters, DEFAULT_FILTERS, filtersActive, type ViewFilters } from "@/lib/workspace/ordering";
import { useLanguage } from "@/lib/workspace/useLanguage";
import { useLocalized } from "@/lib/workspace/useLocalized";
import { usePresenceState } from "@/lib/workspace/usePresenceState";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { BackupDialog } from "../backup/BackupDialog";
import { ErrorPanel } from "../ErrorPanel";
import { LegalFooter } from "../legal/LegalFooter";
import { Logo } from "../Logo";
import { SettingsDialog } from "../settings/SettingsDialog";
import { TrashBin } from "../trash/TrashBin";
import { useTrashFx } from "../trash/TrashFx";
import { TrashPanel } from "../trash/TrashPanel";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { BoardToolbar } from "./BoardToolbar";
import { ItemDialog, type DialogMode, type FormValues } from "./ItemDialog";
import { KanbanBoard } from "./KanbanBoard";
import { ListView } from "./ListView";
import { MobileNav, type NavEntry } from "./MobileNav";
import { SectionGuide } from "./SectionGuide";
import { Sidebar } from "./Sidebar";
import { StagesDialog } from "./StagesDialog";
import type { ViewMode } from "./types";

/** Application shell: wires navigation, filters, board and list views, dialogs, settings and the trash. */
export function Workspace() {
  const { t } = useI18n();
  const loc = useLocalized();
  const { language, setLanguage } = useLanguage();
  const ws = useWorkspace();
  const fx = useTrashFx();
  const [view, setView] = useState<ViewMode>("board");
  const [filters, setFilters] = useState<ViewFilters>(DEFAULT_FILTERS);
  const [trashOpen, setTrashOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardError, setBoardError] = useState<{ title: string; hint: string } | null>(null);
  const itemDialog = usePresenceState<DialogMode>();

  // Everything shown to the user goes through localization once, here.
  const boards = useMemo(() => loc.boards(ws.boards), [loc, ws.boards]);
  const columns = useMemo(() => loc.columns(ws.columns), [loc, ws.columns]);
  const items = useMemo(() => loc.items(ws.items), [loc, ws.items]);
  const trash = useMemo(() => loc.trash(ws.trash), [loc, ws.trash]);
  const board = boards.find((b) => b.id === ws.boardId);
  const visible = useMemo(() => applyFilters(items, filters, columns), [items, columns, filters]);
  const locked = filtersActive(filters);
  const doneIds = useMemo(() => new Set(columns.filter((c) => c.tone === "green").map((c) => c.id)), [columns]);
  const done = items.filter((i) => doneIds.has(i.columnId)).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  const activeNav: NavId = trashOpen ? "trash" : backupOpen ? "backup" : settingsOpen ? "settings" : "board";
  const navConfig: Record<NavId, Omit<NavEntry, "id" | "label">> = {
    board: { icon: "board", onClick: () => setView("board") },
    trash: { icon: "trash", count: ws.trash.length, onClick: () => setTrashOpen(true) },
    backup: { icon: "archive", onClick: () => setBackupOpen(true) },
    settings: { icon: "gear", onClick: () => setSettingsOpen(true) },
  };
  const navItems: NavEntry[] = ws.prefs.navOrder.map((id) => ({ id, label: t(`nav.${id}`), ...navConfig[id] }));

  if (ws.phase !== "ready") {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        {ws.phase === "error" ? (
          <div className="flex w-full max-w-md flex-col gap-4">
            <Logo />
            {ws.bootError && <ErrorPanel error={ws.bootError} onRetry={() => window.location.reload()} retryLabel={t("error.reload")} />}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4"><Logo /><p className="text-sm text-muted">{t("state.loading")}</p></div>
        )}
      </div>
    );
  }

  /** Flies the card into the bin first (needs its on-screen position), then removes it. */
  function trashItem(item: Item) {
    const animate = ws.prefs.showTrashBin && ws.prefs.deleteAnimation;
    fx.flyToTrash(animate ? document.querySelector(`[data-item-id="${CSS.escape(item.id)}"]`) : null, { title: item.title, label: item.label });
    itemDialog.hide();
    void ws.trashItem(item.id);
  }

  async function submit(mode: DialogMode, values: FormValues, note: string) {
    if (mode.kind === "create") {
      await ws.createItem({ boardId: ws.boardId!, columnId: values.columnId, title: values.title, summary: values.summary, label: values.label, priority: values.priority, dueDate: values.dueDate }, note);
    } else {
      // Sample items stay localized until the user edits their text; then the text becomes theirs.
      const item = mode.item;
      const textKept = Boolean(item.seedKey) && values.title === item.title && values.summary === item.summary && values.label === item.label;
      const patch: ItemPatch = { priority: values.priority, dueDate: values.dueDate };
      if (!textKept) Object.assign(patch, { title: values.title, summary: values.summary, label: values.label }, item.seedKey ? { seedKey: null } : {});
      await ws.saveItem(item.id, patch, note, values.columnId);
    }
    itemDialog.hide();
  }

  async function createBoard(e: FormEvent) {
    e.preventDefault();
    if (!boardName.trim()) return;
    try {
      await ws.createBoard(boardName);
      setNewBoardOpen(false);
      setBoardName("");
      setBoardError(null);
    } catch (err) {
      setBoardError(describeError(AppError.from(err), t));
    }
  }

  const openCreate = (columnId?: string) => columns[0] && itemDialog.show({ kind: "create", columnId: columnId ?? columns[0].id });
  const openEdit = (item: Item) => itemDialog.show({ kind: "edit", item });
  const overlayOpen = trashOpen || backupOpen || settingsOpen || stagesOpen;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar items={navItems} activeId={activeNav} boards={boards} boardId={ws.boardId} onSelectBoard={ws.selectBoard} onNewBoard={() => setNewBoardOpen(true)} />

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:bg-transparent md:px-10">
          <Logo small className="md:hidden" />
          <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-xs text-muted md:flex">
            <span>{t("nav.workspace")}</span><Icon name="chevronRight" size={12} /><span className="text-ink">{board?.name}</span>
          </nav>
          <div className="flex items-center gap-3">
            <Select value={ws.boardId ?? ""} onChange={ws.selectBoard} options={boards.map((b) => ({ value: b.id, label: b.name }))} ariaLabel={t("nav.switchBoard")} className="h-9 w-40 md:hidden" />
            <span className="hidden items-center gap-1.5 text-xs text-muted lg:flex"><span className="size-1.5 rounded-full bg-forest-600" />{t("nav.saved")}</span>
            <Select value={language} onChange={(v) => setLanguage(v as Locale)} ariaLabel={t("nav.language")} className="max-md:!hidden h-9 w-44 md:inline-flex" prefix={<Icon name="globe" size={15} className="text-muted" />} options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))} />
            <Button variant="ghost" icon="help" onClick={() => setGuideOpen(true)} aria-label={t("guide.open")} />
          </div>
        </header>

        <main className="flex-1 px-4 pb-40 pt-6 md:px-10 md:pb-24 md:pt-8">
          <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold tracking-tight text-forest-900 md:text-4xl">{board?.name}</h1>
              <p className="mt-1.5 text-sm text-muted">{t("app.tagline")}</p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button variant="ghost" icon="sliders" onClick={() => setStagesOpen(true)} aria-label={t("stages.open")}><span className="max-md:sr-only">{t("stages.open")}</span></Button>
              <Button icon="plus" onClick={() => openCreate()}>{t("board.newItem")}</Button>
            </div>
          </div>

          <section className="mb-5 flex items-center gap-4 rounded-card border border-sage-100 bg-sage-50 px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface text-forest-700"><Icon name="board" size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t("board.glance")}</p>
              <p className="text-xs text-muted">{t("board.completed", { done, total: items.length })}</p>
            </div>
            <div className="w-28 md:w-64" role="progressbar" aria-label={t("board.progress")} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="mb-1 flex justify-between text-xs text-muted"><span className="hidden md:inline">{t("board.progress")}</span><span className="ml-auto tabular-nums">{percent}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sage-200/70">
                <motion.div className="h-full rounded-full bg-forest-600" initial={false} animate={{ width: `${percent}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
              </div>
            </div>
          </section>

          <div className="mb-5"><BoardToolbar view={view} onView={setView} filters={filters} onFilters={setFilters} /></div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {view === "board" ? (
                <KanbanBoard columns={columns} items={visible} dragEnabled={!locked} onMove={ws.moveItem} onOpen={openEdit} onAdd={openCreate} />
              ) : (
                <ListView items={visible} columns={columns} onOpen={openEdit} />
              )}
              {locked && visible.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("board.noMatches")}</p>}
            </motion.div>
          </AnimatePresence>
          <p className="mt-4 text-xs text-muted">{locked ? t("board.hintLocked") : t("board.hintDrag")}</p>
        </main>

        <LegalFooter className="mb-[var(--bottom-nav,0px)] bg-canvas/90 md:sticky md:bottom-0 md:z-20 md:mb-0" />
      </div>

      <MobileNav items={navItems} activeId={activeNav} />
      {ws.prefs.showTrashBin && <TrashBin count={ws.trash.length} onOpen={() => setTrashOpen(true)} hidden={overlayOpen} />}
      <TrashPanel open={trashOpen} onOpenChange={setTrashOpen} entries={trash} retentionDays={ws.prefs.trashRetentionDays} onRestore={ws.restore} onDeleteForever={ws.deleteForever} onEmpty={ws.emptyTrash} onHelp={() => setGuideOpen(true)} />

      {itemDialog.value && (
        <ItemDialog
          key={itemDialog.value.kind === "edit" ? itemDialog.value.item.id : `new-${itemDialog.value.columnId}`}
          mode={itemDialog.value}
          open={itemDialog.open}
          columns={columns}
          loadNote={ws.loadNote}
          onSubmit={(values, note) => submit(itemDialog.value!, values, note)}
          onTrash={trashItem}
          onClose={itemDialog.hide}
        />
      )}

      <StagesDialogHost open={stagesOpen} onOpenChange={setStagesOpen} ws={ws} columns={columns} items={items} />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        boards={boards}
        prefs={ws.prefs}
        onPref={ws.setPref}
        onRetentionImpact={ws.retentionImpact}
        onRetention={async (days) => void (await ws.setRetention(days))}
        onRename={ws.renameBoard}
        onBoardStats={ws.boardStats}
        onDeleteBoard={ws.deleteBoard}
        onNewBoard={() => setNewBoardOpen(true)}
        schemaVersion={ws.schemaVersion()}
        onHelp={() => setGuideOpen(true)}
      />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} onRestored={ws.refreshAll} onHelp={() => setGuideOpen(true)} />
      <SectionGuide open={guideOpen} onOpenChange={setGuideOpen} section={activeNav} />

      <Modal open={newBoardOpen} onOpenChange={setNewBoardOpen} title={t("board.createTitle")} width="md:max-w-md">
        <form onSubmit={createBoard} className="flex flex-col gap-4">
          <Field label={t("board.nameLabel")} htmlFor="board-name" hint={t("hint.boardName")}>
            <input id="board-name" autoFocus value={boardName} onChange={(e) => { setBoardName(e.target.value); setBoardError(null); }} placeholder={t("board.namePlaceholder")} maxLength={60} className={`${inputClass} h-10`} />
            <AnimatePresence>
              {boardError && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="text-xs text-danger">{boardError.title} {boardError.hint}</motion.p>}
            </AnimatePresence>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewBoardOpen(false)}>{t("action.cancel")}</Button>
            <Button type="submit" disabled={!boardName.trim()}>{t("board.create")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Connects the stage editor to the workspace actions. */
function StagesDialogHost({ open, onOpenChange, ws, columns, items }: { open: boolean; onOpenChange: (o: boolean) => void; ws: ReturnType<typeof useWorkspace>; columns: Column[]; items: Item[] }) {
  return (
    <StagesDialog
      open={open}
      onOpenChange={onOpenChange}
      columns={columns}
      items={items}
      onCreate={(name, tone) => ws.createStage(name, tone)}
      onRename={(id, name) => ws.updateStage(id, { name })}
      onTone={(id, tone) => ws.updateStage(id, { tone })}
      onMove={(id, index) => ws.moveStage(id, index)}
      onDelete={(id, strategy) => ws.deleteStage(id, strategy)}
    />
  );
}
