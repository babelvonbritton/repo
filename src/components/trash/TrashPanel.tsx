"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/i18n";
import { TRASH_NEVER, type TrashEntry } from "@/lib/storage";
import { daysLeft, formatDate } from "@/lib/workspace/ordering";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TrashEntry[];
  /** Keep-time setting in days; 0 means items are never deleted automatically. */
  retentionDays: number;
  onRestore: (id: string) => Promise<"ok" | "no-stage" | "error">;
  onDeleteForever: (id: string) => Promise<void>;
  onEmpty: () => Promise<void>;
  /** Opens the section guide for this panel. */
  onHelp: () => void;
}

/** Side panel (bottom sheet on phones) listing trashed items; selecting one shows its full details. */
export function TrashPanel({ open, onOpenChange, entries, retentionDays, onRestore, onDeleteForever, onEmpty, onHelp }: Props) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"one" | "all" | null>(null);
  const [failed, setFailed] = useState(false);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const remaining = (e: TrashEntry) => {
    if (e.expiresAt >= TRASH_NEVER) return t("trash.keptUntilDeleted");
    const d = daysLeft(e.expiresAt);
    return d <= 1 ? t("trash.lastDay") : t("trash.daysLeft", { count: d });
  };

  async function restore(entry: TrashEntry) {
    const result = await onRestore(entry.id);
    if (result === "ok") setSelectedId(null);
    setFailed(result === "no-stage"); // other failures already showed an error notification
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSelectedId(null); setFailed(false); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-40 bg-forest-900/30" />
          <Dialog.Content
            aria-describedby={undefined}
            className="anim-sheet fixed z-50 flex flex-col bg-surface shadow-[0_30px_70px_-24px_rgba(28,47,38,0.5)] outline-none max-md:inset-x-0 max-md:bottom-0 max-md:h-[85dvh] max-md:rounded-t-[22px] md:right-0 md:top-0 md:h-dvh md:w-[26rem]"
          >
            <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-forest-900">{t("trash.title")}</Dialog.Title>
                <p className="mt-0.5 text-sm text-muted">{retentionDays === 0 ? t("trash.retentionNever") : t("trash.retention", { days: retentionDays })}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={onHelp} aria-label={t("guide.open")} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink">
                  <Icon name="help" size={16} />
                </button>
                <Dialog.Close aria-label={t("action.close")} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink">
                  <Icon name="close" size={16} />
                </Dialog.Close>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <AnimatePresence mode="wait" initial={false}>
                {selected ? (
                  <motion.div key="detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} className="flex flex-col gap-4">
                    <button type="button" onClick={() => { setSelectedId(null); setFailed(false); }} className="-ml-1 flex w-fit items-center gap-1.5 rounded-control px-1 py-1 text-sm text-muted transition-colors hover:text-ink">
                      <Icon name="arrowLeft" size={15} />
                      {t("action.back")}
                    </button>
                    <div>
                      {selected.item.label && <span className="mb-2 inline-block rounded-md bg-sage-100 px-1.5 py-0.5 text-xs text-forest-700">{selected.item.label}</span>}
                      <h3 className="text-xl font-semibold text-forest-900">{selected.item.title}</h3>
                      {selected.item.summary && <p className="mt-1.5 text-sm text-muted">{selected.item.summary}</p>}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-control bg-sage-50 p-3"><dt className="text-xs text-muted">{t("item.priority")}</dt><dd className="mt-0.5 font-medium">{t(`priority.${selected.item.priority}`)}</dd></div>
                      <div className="rounded-control bg-sage-50 p-3"><dt className="text-xs text-muted">{t("item.dueDate")}</dt><dd className="mt-0.5 font-medium">{selected.item.dueDate ? formatDate(selected.item.dueDate, locale) : t("item.noDue")}</dd></div>
                    </dl>
                    <div>
                      <h4 className="mb-1.5 text-sm font-medium">{t("item.note")}</h4>
                      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-control border border-line p-3 text-sm text-ink">
                        {selected.note ?? <span className="text-muted">{t("trash.noNote")}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      {t("trash.deletedOn", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(selected.deletedAt) })} · {remaining(selected)}
                    </p>
                    <AnimatePresence>
                      {failed && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="text-sm text-danger">{t("trash.restoreFailed")}</motion.p>}
                    </AnimatePresence>
                    <div className="flex gap-2">
                      <Button icon="restore" onClick={() => restore(selected)}>{t("action.restore")}</Button>
                      <Button variant="dangerSoft" onClick={() => setConfirm("one")}>{t("action.deleteForever")}</Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                    {entries.length === 0 ? (
                      <div className="grid place-items-center gap-2 py-16 text-center text-sm text-muted">
                        <Icon name="trash" size={28} className="text-sage-200" />
                        {t("trash.empty")}
                      </div>
                    ) : (
                      <>
                        <ul className="flex flex-col gap-2">
                          <AnimatePresence initial={false}>
                            {entries.map((e) => (
                              <motion.li key={e.id} layout exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}>
                                <button type="button" onClick={() => setSelectedId(e.id)} className="flex w-full flex-col gap-1 rounded-card border border-line p-3.5 text-left transition-[background-color,border-color,transform] duration-200 hover:border-sage-200 hover:bg-sage-50 active:scale-[0.99]">
                                  <span className="truncate text-sm font-medium text-ink">{e.item.title}</span>
                                  {e.item.summary && <span className="line-clamp-1 text-xs text-muted">{e.item.summary}</span>}
                                  <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                                    {e.item.label && <span className="rounded-md bg-sage-100 px-1.5 py-0.5 text-forest-700">{e.item.label}</span>}
                                    <span>{remaining(e)}</span>
                                  </span>
                                </button>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                        </ul>
                        <Button variant="dangerSoft" className="mt-4" onClick={() => setConfirm("all")}>{t("action.emptyTrash")}</Button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirm !== null}
        danger
        title={confirm === "all" ? t("confirm.emptyTitle") : t("confirm.foreverTitle")}
        body={confirm === "all" ? t("confirm.emptyBody", { count: entries.length }) : t("confirm.foreverBody")}
        confirmLabel={confirm === "all" ? t("action.emptyTrash") : t("action.deleteForever")}
        cancelLabel={t("action.cancel")}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const mode = confirm;
          setConfirm(null);
          if (mode === "all") await onEmpty();
          else if (selected) {
            setSelectedId(null);
            await onDeleteForever(selected.id);
          }
        }}
      />
    </>
  );
}
