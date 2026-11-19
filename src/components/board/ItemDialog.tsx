"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { AppError } from "@/lib/errors/AppError";
import { describeError } from "@/lib/errors/describe";
import { countChars, NOTE_MAX_LENGTH, type Column, type Item, type Priority } from "@/lib/storage";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CopyButton } from "../ui/CopyButton";
import { DatePicker } from "../ui/DatePicker";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";

export type DialogMode = { kind: "create"; columnId: string } | { kind: "edit"; item: Item };

export interface FormValues {
  title: string;
  summary: string;
  label: string;
  priority: Priority;
  dueDate: string | null;
  columnId: string;
}

interface Props {
  mode: DialogMode;
  open: boolean;
  columns: Column[];
  loadNote: (itemId: string) => Promise<string>;
  onSubmit: (values: FormValues, note: string) => Promise<void>;
  onTrash: (item: Item) => void;
  onClose: () => void;
}

/** Create or edit an item. The note (max 4000 characters, live counter) only exists inside this detail view. */
export function ItemDialog({ mode, open, columns, loadNote, onSubmit, onTrash, onClose }: Props) {
  const { t } = useI18n();
  const initial = useMemo<FormValues>(
    () =>
      mode.kind === "edit"
        ? { title: mode.item.title, summary: mode.item.summary, label: mode.item.label, priority: mode.item.priority, dueDate: mode.item.dueDate, columnId: mode.item.columnId }
        : { title: "", summary: "", label: "", priority: "medium", dueDate: null, columnId: mode.columnId },
    [mode],
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [noteReady, setNoteReady] = useState(mode.kind === "create");
  const [error, setError] = useState<{ title: string; hint: string } | null>(null);
  const [noteError, setNoteError] = useState<AppError | null>(null);
  const [noteTry, setNoteTry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);

  useEffect(() => {
    if (mode.kind !== "edit") return;
    let alive = true;
    setNoteError(null);
    loadNote(mode.item.id)
      .then((text) => {
        if (!alive) return;
        setNote(text);
        setSavedNote(text);
        setNoteReady(true);
      })
      .catch((e) => {
        // Editing stays locked: saving an empty box over a note that failed to load would destroy it.
        if (alive) setNoteError(AppError.from(e));
      });
    return () => {
      alive = false;
    };
  }, [mode, loadNote, noteTry]);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || (noteReady && note !== savedNote);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const count = countChars(note);

  function requestClose() {
    if (dirty && !busy) setAskDiscard(true);
    else onClose();
  }

  function changeNote(text: string) {
    setNote(countChars(text) > NOTE_MAX_LENGTH ? Array.from(text).slice(0, NOTE_MAX_LENGTH).join("") : text);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      setError({ title: t("error.required"), hint: "" });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(values, note);
    } catch (err) {
      setError(describeError(AppError.from(err), t));
      setBusy(false);
    }
  }

  const priorities = (["low", "medium", "high"] as const).map((p) => ({ value: p, label: t(`priority.${p}`) }));
  const stages = columns.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <Modal open={open} onOpenChange={(o) => !o && requestClose()} title={mode.kind === "create" ? t("item.new") : t("item.details")} width="md:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t("item.title")} htmlFor="item-title" hint={t("hint.itemTitle")}>
            <input id="item-title" autoFocus={mode.kind === "create"} value={values.title} onChange={(e) => { set("title", e.target.value); setError(null); }} placeholder={t("item.titlePlaceholder")} maxLength={120} className={`${inputClass} h-10`} />
            <AnimatePresence>
              {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="text-xs text-danger">{error.hint ? `${error.title} ${error.hint}` : error.title}</motion.p>}
            </AnimatePresence>
          </Field>
          <Field label={t("item.summary")} htmlFor="item-summary" hint={t("hint.itemSummary")}>
            <input id="item-summary" value={values.summary} onChange={(e) => set("summary", e.target.value)} placeholder={t("item.summaryPlaceholder")} maxLength={500} className={`${inputClass} h-10`} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("item.label")} htmlFor="item-label" hint={t("hint.itemLabel")}>
              <input id="item-label" value={values.label} onChange={(e) => set("label", e.target.value)} placeholder={t("item.labelPlaceholder")} maxLength={40} className={`${inputClass} h-10`} />
            </Field>
            <Field label={t("item.stage")} hint={t("hint.itemStage")}>
              <Select value={values.columnId} onChange={(v) => set("columnId", v)} options={stages} ariaLabel={t("item.stage")} className="w-full" />
            </Field>
            <Field label={t("item.priority")} hint={t("hint.itemPriority")}>
              <Select value={values.priority} onChange={(v) => set("priority", v)} options={priorities} ariaLabel={t("item.priority")} className="w-full" />
            </Field>
            <Field label={t("item.dueDate")} htmlFor="item-due" hint={t("hint.itemDueDate")}>
              <DatePicker id="item-due" value={values.dueDate} onChange={(v) => set("dueDate", v)} />
            </Field>
          </div>
          <Field
            label={t("item.note")}
            htmlFor="item-note"
            hint={t("hint.itemNote")}
            aside={
              <span className="flex items-center gap-2">
                {note && <CopyButton text={note} label={t("item.copyNote")} />}
                <span className={`text-xs tabular-nums transition-colors duration-200 ${count >= NOTE_MAX_LENGTH ? "text-danger" : count >= 3800 ? "text-amber-tone" : "text-muted"}`}>{t("item.noteCount", { count, max: NOTE_MAX_LENGTH })}</span>
              </span>
            }
          >
            <textarea
              id="item-note"
              value={note}
              disabled={!noteReady}
              onChange={(e) => changeNote(e.target.value)}
              placeholder={noteReady ? t("item.notePlaceholder") : t("item.noteLoading")}
              className={`${inputClass} min-h-40 max-h-72 resize-none py-2.5 leading-relaxed [field-sizing:content] disabled:opacity-60`}
            />
            {noteError && (
              <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-danger">
                {t("error.noteLoad")}
                <button type="button" className="underline" onClick={() => setNoteTry((n) => n + 1)}>{t("error.retry")}</button>
              </p>
            )}
          </Field>
          <div className="mt-1 flex items-center justify-between gap-2">
            {mode.kind === "edit" ? <Button variant="dangerSoft" icon="trash" onClick={() => onTrash(mode.item)}>{t("action.trash")}</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={requestClose}>{t("action.cancel")}</Button>
              <Button type="submit" disabled={busy || !noteReady || (mode.kind === "edit" && !dirty)}>{mode.kind === "create" ? t("action.create") : t("action.save")}</Button>
            </div>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={askDiscard}
        title={t("confirm.discardTitle")}
        body={t("confirm.discardBody")}
        confirmLabel={t("action.discard")}
        cancelLabel={t("action.keepEditing")}
        danger
        onCancel={() => setAskDiscard(false)}
        onConfirm={() => { setAskDiscard(false); onClose(); }}
      />
    </>
  );
}
