"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { AppError } from "@/lib/errors/AppError";
import { describeError } from "@/lib/errors/describe";
import { LIMITS, type Column, type ColumnTone, type Item, type StageDeletion } from "@/lib/storage";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { inputClass } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";

const TONES: ColumnTone[] = ["neutral", "amber", "violet", "green"];
const SWATCH: Record<ColumnTone, string> = { neutral: "bg-sage-200", amber: "bg-amber-tone", violet: "bg-violet-tone", green: "bg-forest-600" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stages with display names already localized. */
  columns: Column[];
  items: Item[];
  onCreate: (name: string, tone: ColumnTone) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onTone: (id: string, tone: ColumnTone) => Promise<void>;
  onMove: (id: string, index: number) => Promise<void>;
  onDelete: (id: string, strategy: StageDeletion) => Promise<void>;
}

/** Add, rename, recolor, reorder and delete the stages (columns) of the current board. */
export function StagesDialog({ open, onOpenChange, columns, items, onCreate, onRename, onTone, onMove, onDelete }: Props) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<{ title: string; hint: string } | null>(null);
  const [name, setName] = useState("");
  const [tone, setTone] = useState<ColumnTone>("neutral");
  const [deleting, setDeleting] = useState<Column | null>(null);
  const [choice, setChoice] = useState<"move" | "trash">("move");
  const [target, setTarget] = useState("");

  const toneOptions = TONES.map((v) => ({ value: v, label: t(`tone.${v}`), swatch: SWATCH[v] }));
  const countIn = (id: string) => items.filter((i) => i.columnId === id).length;

  /** Runs a change and shows any failure inline, in the active language. */
  async function run(fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn();
      setProblem(null);
      return true;
    } catch (e) {
      setProblem(describeError(AppError.from(e), t));
      return false;
    }
  }

  async function add() {
    if (!name.trim()) return;
    if (await run(() => onCreate(name, tone))) setName("");
  }

  function askDelete(column: Column) {
    setChoice("move");
    setTarget(columns.find((c) => c.id !== column.id)?.id ?? "");
    setDeleting(column);
  }

  const deletingCount = deleting ? countIn(deleting.id) : 0;

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={t("stages.title")} width="md:max-w-xl">
        <p className="mb-4 text-sm text-muted">{t("stages.intro")}</p>
        <ul className="flex flex-col gap-2">
          {columns.map((c, i) => (
            <StageRow key={c.id} column={c} first={i === 0} last={i === columns.length - 1} canDelete={columns.length > 1} toneOptions={toneOptions} onRename={(v) => run(() => onRename(c.id, v))} onTone={(v) => run(() => onTone(c.id, v))} onMove={(d) => run(() => onMove(c.id, i + d))} onDelete={() => askDelete(c)} />
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-2 rounded-card border border-dashed border-line p-3 sm:flex-row sm:items-center">
          <input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setProblem(null); }} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder={t("stages.addPlaceholder")} aria-label={t("stages.name")} disabled={columns.length >= LIMITS.stagesPerBoard} className={`${inputClass} h-10 flex-1`} />
          <Select value={tone} onChange={setTone} options={toneOptions} ariaLabel={t("stages.color")} className="sm:w-36" />
          <Button icon="plus" onClick={() => void add()} disabled={!name.trim() || columns.length >= LIMITS.stagesPerBoard}>{t("stages.add")}</Button>
        </div>
        <p className="mt-2 text-xs text-muted">{t("stages.limit", { max: LIMITS.stagesPerBoard })} {t("stages.doneHint")}</p>
        <AnimatePresence>
          {problem && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-2 text-sm text-danger">{problem.title} {problem.hint}</motion.p>}
        </AnimatePresence>
      </Modal>

      <ConfirmDialog
        open={deleting !== null && deletingCount === 0}
        danger
        title={t("stages.deleteTitle", { name: deleting?.name ?? "" })}
        body={t("stages.deleteEmpty")}
        confirmLabel={t("stages.deleteAction")}
        cancelLabel={t("action.cancel")}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting?.id;
          setDeleting(null);
          if (id) void run(() => onDelete(id, { kind: "trash" }));
        }}
      />

      <Modal open={deleting !== null && deletingCount > 0} onOpenChange={(o) => !o && setDeleting(null)} title={t("stages.deleteTitle", { name: deleting?.name ?? "" })} width="md:max-w-md">
        <p className="mb-3 text-sm text-muted">{t("stages.deleteBody", { count: deletingCount })}</p>
        <div role="radiogroup" className="flex flex-col gap-2">
          {(["move", "trash"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={choice === c} onClick={() => setChoice(c)} className={`flex items-center gap-3 rounded-control border p-3 text-left text-sm transition-colors ${choice === c ? "border-forest-600 bg-sage-50" : "border-line hover:bg-sage-50/60"}`}>
              <span className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors ${choice === c ? "border-forest-700" : "border-sage-200"}`}>
                <motion.span initial={false} animate={{ scale: choice === c ? 1 : 0 }} className="size-2 rounded-full bg-forest-700" />
              </span>
              {c === "move" ? t("stages.optionMove") : t("stages.optionTrash")}
            </button>
          ))}
        </div>
        {choice === "move" && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-muted">{t("stages.moveTarget")}</label>
            <Select value={target} onChange={setTarget} ariaLabel={t("stages.moveTarget")} className="w-full" options={columns.filter((c) => c.id !== deleting?.id).map((c) => ({ value: c.id, label: c.name }))} />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>{t("action.cancel")}</Button>
          <Button
            variant="danger"
            onClick={() => {
              const id = deleting?.id;
              const strategy: StageDeletion = choice === "move" ? { kind: "move", toColumnId: target } : { kind: "trash" };
              setDeleting(null);
              if (id) void run(() => onDelete(id, strategy));
            }}
          >
            {t("stages.deleteAction")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

interface RowProps {
  column: Column;
  first: boolean;
  last: boolean;
  canDelete: boolean;
  toneOptions: Array<{ value: ColumnTone; label: string; swatch: string }>;
  onRename: (name: string) => Promise<boolean>;
  onTone: (tone: ColumnTone) => Promise<boolean>;
  onMove: (delta: number) => Promise<boolean>;
  onDelete: () => void;
}

/** One editable stage. The name is saved when the field loses focus or Enter is pressed. */
function StageRow({ column, first, last, canDelete, toneOptions, onRename, onTone, onMove, onDelete }: RowProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(column.name);
  useEffect(() => setValue(column.name), [column.name]);

  async function commit() {
    const next = value.trim();
    if (next === column.name) return;
    if (!next || !(await onRename(next))) setValue(column.name);
  }

  const icon = "grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink disabled:pointer-events-none disabled:opacity-30";
  return (
    <motion.li layout transition={{ type: "spring", stiffness: 420, damping: 34 }} className="flex flex-col gap-2 rounded-control border border-line bg-surface p-2 sm:flex-row sm:items-center">
      <input value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={t("stages.name")} className={`${inputClass} order-1 h-10 w-full min-w-0 sm:order-2 sm:flex-1`} />
      <div className="order-2 flex items-center justify-between gap-2 sm:order-1 sm:justify-start">
        <Select value={column.tone} onChange={(v) => void onTone(v)} options={toneOptions} ariaLabel={t("stages.color")} className="w-[7.5rem] shrink-0" />
        <div className="flex items-center gap-1">
          <button type="button" disabled={first} onClick={() => void onMove(-1)} aria-label={t("stages.moveUp", { name: column.name })} className={icon}><Icon name="arrowUp" size={15} /></button>
          <button type="button" disabled={last} onClick={() => void onMove(1)} aria-label={t("stages.moveDown", { name: column.name })} className={icon}><Icon name="arrowDown" size={15} /></button>
          <button type="button" disabled={!canDelete} title={canDelete ? undefined : t("err.LAST_STAGE.title")} onClick={onDelete} aria-label={t("stages.delete", { name: column.name })} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-40"><Icon name="trash" size={15} /></button>
        </div>
      </div>
    </motion.li>
  );
}
