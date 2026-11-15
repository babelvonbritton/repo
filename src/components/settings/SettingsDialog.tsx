"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/routing";
import { AppError } from "@/lib/errors/AppError";
import { describeError } from "@/lib/errors/describe";
import { APP_VERSION } from "@/lib/appInfo";
import { BACKUP_FORMAT_VERSION } from "@/lib/backup/constants";
import type { Board, BoardStats, NavId, Preferences, RetentionDays } from "@/lib/storage";
import { useLanguage } from "@/lib/workspace/useLanguage";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";

type Problem = { title: string; hint: string } | null;

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Boards with display names already localized. */
  boards: Board[];
  prefs: Preferences;
  onPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<void>;
  onRetentionImpact: (days: RetentionDays) => Promise<number>;
  onRetention: (days: RetentionDays) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onBoardStats: (id: string) => Promise<BoardStats>;
  onDeleteBoard: (id: string) => Promise<void>;
  onNewBoard: () => void;
  schemaVersion: number;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line p-4">
      <h3 className="text-sm font-semibold text-forest-900">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProblemText({ problem }: { problem: Problem }) {
  return (
    <AnimatePresence>
      {problem && (
        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="mt-1 text-xs text-danger">
          {problem.title} {problem.hint}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** One board: rename in place, or delete after seeing what will be removed. */
function BoardRow({ board, canDelete, onRename, onBoardStats, onDelete }: { board: Board; canDelete: boolean; onRename: SettingsDialogProps["onRename"]; onBoardStats: SettingsDialogProps["onBoardStats"]; onDelete: SettingsDialogProps["onDeleteBoard"] }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(board.name);
  useEffect(() => setValue(board.name), [board.name]);
  const [problem, setProblem] = useState<Problem>(null);
  const [stats, setStats] = useState<BoardStats | null>(null);
  const show = (e: unknown) => setProblem(describeError(AppError.from(e), t));

  async function save() {
    const next = value.trim();
    if (next === board.name) return setEditing(false);
    try {
      await onRename(board.id, next);
      setProblem(null);
      setEditing(false);
    } catch (e) {
      show(e);
    }
  }

  async function askDelete() {
    try {
      setStats(await onBoardStats(board.id));
    } catch (e) {
      show(e);
    }
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input autoFocus value={value} maxLength={60} onChange={(e) => { setValue(e.target.value); setProblem(null); }} onKeyDown={(e) => e.key === "Enter" && void save()} aria-label={t("settings.rename", { name: board.name })} className={`${inputClass} h-9 flex-1`} />
            <button type="button" onClick={() => void save()} aria-label={t("settings.saveName")} className="grid size-9 place-items-center rounded-control bg-forest-700 text-white transition-colors hover:bg-forest-600"><Icon name="check" size={16} /></button>
            <button type="button" onClick={() => { setEditing(false); setValue(board.name); setProblem(null); }} aria-label={t("settings.cancelRename")} className="grid size-9 place-items-center rounded-control border border-line text-muted transition-colors hover:bg-sage-50"><Icon name="close" size={16} /></button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm">{board.name}</span>
            <button type="button" onClick={() => { setValue(board.name); setEditing(true); }} aria-label={t("settings.rename", { name: board.name })} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink"><Icon name="pencil" size={15} /></button>
            <button type="button" disabled={!canDelete} title={canDelete ? undefined : t("err.LAST_BOARD.title")} onClick={() => void askDelete()} aria-label={t("settings.delete", { name: board.name })} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-40"><Icon name="trash" size={15} /></button>
          </>
        )}
      </div>
      <ProblemText problem={problem} />
      <ConfirmDialog
        open={stats !== null}
        danger
        title={t("settings.deleteBoardTitle", { name: board.name })}
        body={stats ? t("settings.deleteBoardBody", { items: stats.items, notes: stats.notes, trash: stats.trash }) : ""}
        confirmLabel={t("settings.deleteBoardAction")}
        cancelLabel={t("action.cancel")}
        onCancel={() => setStats(null)}
        onConfirm={async () => {
          setStats(null);
          try {
            await onDelete(board.id);
          } catch (e) {
            show(e);
          }
        }}
      />
    </li>
  );
}

/** Application settings: language, boards, menu order, trash behavior, privacy and version information. */
export function SettingsDialog(props: SettingsDialogProps) {
  const { open, onOpenChange, boards, prefs, onPref, onRetentionImpact, onRetention, onNewBoard, schemaVersion } = props;
  const { t, localeCode } = useI18n();
  const { language, setLanguage } = useLanguage();
  const [pending, setPending] = useState<{ days: RetentionDays; count: number } | null>(null);

  const menuLabel: Record<NavId, string> = { board: t("nav.board"), trash: t("nav.trash"), backup: t("nav.backup"), settings: t("nav.settings") };
  const move = (index: number, delta: number) => {
    const next = [...prefs.navOrder];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    void onPref("navOrder", next);
  };

  async function changeRetention(value: "7" | "30" | "0") {
    const days = Number(value) as RetentionDays;
    if (days === prefs.trashRetentionDays) return;
    const count = await onRetentionImpact(days);
    if (count > 0) setPending({ days, count });
    else await onRetention(days);
  }

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={t("settings.title")} width="md:max-w-xl">
        <div className="flex flex-col gap-4">
          <Card title={t("settings.language")} hint={t("settings.languageHint")}>
            <Select value={language} onChange={(v) => setLanguage(v as Locale)} ariaLabel={t("nav.language")} className="w-full sm:w-64" prefix={<Icon name="globe" size={15} className="text-muted" />} options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))} />
          </Card>

          <Card title={t("settings.boards")} hint={t("settings.boardsHint")}>
            <ul className="divide-y divide-line">
              {boards.map((b) => <BoardRow key={b.id} board={b} canDelete={boards.length > 1} onRename={props.onRename} onBoardStats={props.onBoardStats} onDelete={props.onDeleteBoard} />)}
            </ul>
            <Button variant="soft" icon="plus" className="mt-3" onClick={onNewBoard}>{t("nav.newBoard")}</Button>
          </Card>

          <Card title={t("settings.menuOrder")} hint={t("settings.menuOrderHint")}>
            <ul className="flex flex-col gap-1.5">
              {prefs.navOrder.map((id, i) => (
                <motion.li key={id} layout transition={{ type: "spring", stiffness: 420, damping: 34 }} className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5">
                  <span className="flex-1 text-sm">{menuLabel[id]}</span>
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("settings.menuMoveUp", { name: menuLabel[id] })} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink disabled:opacity-30"><Icon name="arrowUp" size={15} /></button>
                  <button type="button" disabled={i === prefs.navOrder.length - 1} onClick={() => move(i, 1)} aria-label={t("settings.menuMoveDown", { name: menuLabel[id] })} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink disabled:opacity-30"><Icon name="arrowDown" size={15} /></button>
                </motion.li>
              ))}
            </ul>
            <button type="button" onClick={() => void onPref("navOrder", ["board", "trash", "backup", "settings"])} className="mt-2 text-xs text-forest-700 hover:underline">{t("settings.menuReset")}</button>
          </Card>

          <Card title={t("settings.trash")}>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink">{t("settings.retention")}</label>
              <Select value={String(prefs.trashRetentionDays) as "7" | "30" | "0"} onChange={(v) => void changeRetention(v)} ariaLabel={t("settings.retention")} className="w-full sm:w-72" options={[{ value: "7", label: t("settings.retention7") }, { value: "30", label: t("settings.retention30") }, { value: "0", label: t("settings.retentionNever") }]} />
              <p className="text-xs text-muted">{t("settings.retentionHint")}</p>
            </div>
            <div className="mt-3 divide-y divide-line border-t border-line pt-2">
              <Switch checked={prefs.showTrashBin} onChange={(v) => void onPref("showTrashBin", v)} label={t("settings.showBin")} description={t("settings.showBinHint")} />
              <Switch checked={prefs.deleteAnimation && prefs.showTrashBin} disabled={!prefs.showTrashBin} onChange={(v) => void onPref("deleteAnimation", v)} label={t("settings.deleteAnimation")} description={t("settings.deleteAnimationHint")} />
            </div>
          </Card>

          <section className="flex items-start gap-3 rounded-card border border-sage-100 bg-sage-50 p-4">
            <Icon name="shield" size={20} className="mt-0.5 shrink-0 text-forest-600" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-forest-900">{t("legal.privacy")}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t("privacy.card.summary")}</p>
              <Link href={`/${localeCode}/privacy/`} className="mt-2 inline-block text-xs font-medium text-forest-700 hover:underline">{t("privacy.card.read")}</Link>
            </div>
          </section>

          <Card title={t("settings.about")}>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">{t("settings.appVersion")}</dt><dd className="font-medium tabular-nums">{APP_VERSION}</dd>
              <dt className="text-muted">{t("settings.schemaVersion")}</dt><dd className="font-medium tabular-nums">{schemaVersion}</dd>
              <dt className="text-muted">{t("settings.backupFormat")}</dt><dd className="font-medium tabular-nums">{BACKUP_FORMAT_VERSION}</dd>
              <dt className="text-muted">{t("settings.license")}</dt><dd className="font-medium">{t("settings.licenseValue")}</dd>
            </dl>
          </Card>
        </div>
      </Modal>

      <ConfirmDialog
        open={pending !== null}
        danger
        title={t("settings.retentionConfirmTitle")}
        body={pending ? t("settings.retentionConfirmBody", { count: pending.count }) : ""}
        confirmLabel={t("settings.retentionConfirmAction")}
        cancelLabel={t("action.cancel")}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const days = pending?.days;
          setPending(null);
          if (days !== undefined) await onRetention(days);
        }}
      />
    </>
  );
}
