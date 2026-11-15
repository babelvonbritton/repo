"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useI18n } from "@/i18n";
import { BackupService } from "@/lib/backup/BackupService";
import type { Decision, MergeResult } from "@/lib/backup/MergePlanner";
import { FileSaver } from "@/lib/backup/FileSaver";
import type { BackupResult, Outcome, RestorePlan, StepState } from "@/lib/backup/types";
import type { AppError } from "@/lib/errors/AppError";
import { errorCenter } from "@/lib/errors/ErrorCenter";
import { getStorage } from "@/lib/storage";
import { ErrorPanel } from "../ErrorPanel";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { RestoreReview } from "./RestoreReview";
import { Stepper } from "./Stepper";

type Phase = "idle" | "running" | "done" | "error";

/** Tracks one step-by-step process: its steps, phase, result and error. Never throws. */
function useFlow<T>() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const run = useCallback(async (job: (onChange: (s: StepState[]) => void) => Promise<Outcome<T>>) => {
    setSteps([]);
    setResult(null);
    setError(null);
    setPhase("running");
    let out: Outcome<T>;
    try {
      out = await job(setSteps);
    } catch (e) {
      out = { ok: false, error: errorCenter.report(e, { action: "backup.flow", surface: "inline" }) };
    }
    if (out.ok) {
      setResult(out.value);
      setPhase("done");
    } else {
      setError(out.error);
      setPhase("error");
    }
    return out;
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    setError(null);
    setPhase("idle");
  }, []);

  return { steps, phase, result, error, run, reset };
}

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reloads workspace state after a restore replaced the data. */
  onRestored: () => Promise<void>;
}

/** Backup and restore wizard: every stage is shown, verified and reported, and every failure explained. */
export function BackupDialog({ open, onOpenChange, onRestored }: Props) {
  const { t, locale } = useI18n();
  const service = useMemo(() => new BackupService(getStorage(), errorCenter, { minStepMs: process.env.NODE_ENV === "test" ? 0 : 260 }), []);
  const [tab, setTab] = useState<"backup" | "restore">("backup");
  const backup = useFlow<BackupResult>();
  const inspect = useFlow<RestorePlan>();
  const apply = useFlow<MergeResult>();
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [safety, setSafety] = useState(true);
  const [encryptBackup, setEncryptBackup] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState("");
  const [backupPassphraseError, setBackupPassphraseError] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [downloadError, setDownloadError] = useState<AppError | null>(null);
  const busy = backup.phase === "running" || inspect.phase === "running" || apply.phase === "running";
  const plan = inspect.result;

  function resetAll() {
    backup.reset();
    inspect.reset();
    apply.reset();
    setConfirm(false);
    setShowChecks(false);
    setDecisions(new Map());
    setDownloadError(null);
    setBackupPassphrase("");
    setBackupPassphraseConfirm("");
    setRestorePassphrase("");
    setBackupPassphraseError(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return; // the notice "Keep this window open" is shown while a process runs
    onOpenChange(next);
    if (!next) setTimeout(resetAll, 250);
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    apply.reset();
    setDecisions(new Map());
    setShowChecks(false);
    void inspect.run((cb) => service.inspect(file, cb, restorePassphrase));
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    chooseFile(e.dataTransfer.files[0]);
  }

  async function startRestore() {
    if (!plan) return;
    setConfirm(false);
    const out = await apply.run((cb) => service.restore(plan, {
      safetyBackup: safety,
      safetyPassphrase: plan.manifest.encryption ? restorePassphrase : undefined,
      decisions,
      onRestored,
    }, cb));
    if (out.ok) errorCenter.notify({ key: "toast.restored" });
  }

  function startBackup() {
    if (encryptBackup && backupPassphrase !== backupPassphraseConfirm) {
      setBackupPassphraseError(true);
      return;
    }
    setBackupPassphraseError(false);
    void backup.run((cb) => service.createBackup(cb, "backup", encryptBackup ? backupPassphrase : undefined));
  }

  function downloadAgain() {
    if (!backup.result) return;
    try {
      FileSaver.download(backup.result.zip, backup.result.fileName);
      setDownloadError(null);
    } catch (e) {
      setDownloadError(errorCenter.report(e, { action: "backup.download", surface: "inline" }));
    }
  }

  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const replacedCount = plan ? plan.merge.entries.filter((e) => e.status === "differs" && decisions.get(e.key) === "replace").length : 0;

  return (
    <>
      <Modal open={open} onOpenChange={handleOpenChange} title={t("backup.title")} width="md:max-w-2xl">
        <div role="tablist" className="relative mb-5 flex w-fit rounded-control bg-sage-100 p-1">
          {(["backup", "restore"] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} disabled={busy} onClick={() => setTab(id)} className={`relative flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm transition-colors duration-200 disabled:cursor-not-allowed ${tab === id ? "font-medium text-forest-900" : "text-muted hover:text-ink"}`}>
              {tab === id && <motion.span layoutId="backup-tab" className="absolute inset-0 rounded-[8px] bg-surface shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon name={id === "backup" ? "download" : "upload"} size={15} className="relative" />
              <span className="relative">{id === "backup" ? t("backup.tabBackup") : t("backup.tabRestore")}</span>
            </button>
          ))}
        </div>

        {busy && <p className="mb-4 rounded-control bg-sage-50 px-3 py-2 text-xs text-muted">{t("backup.keepOpen")}</p>}

        <AnimatePresence mode="wait" initial={false}>
          {tab === "backup" ? (
            <motion.div key="backup" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="flex flex-col gap-4">
              {backup.phase === "idle" && (
                <>
                  <p className="text-sm text-muted">{t("backup.intro")}</p>
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" checked={encryptBackup} onChange={(e) => setEncryptBackup(e.target.checked)} className="mt-1 accent-forest-700" />
                    <span>{t("backup.encrypt")}</span>
                  </label>
                  {encryptBackup && (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-muted">{t("backup.encryptionHint")}</p>
                      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                        {t("backup.passphrase")}
                        <input type="password" autoComplete="new-password" value={backupPassphrase} onChange={(e) => setBackupPassphrase(e.target.value)} className="h-10 rounded-control border border-line bg-surface px-3 font-normal" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                        {t("backup.confirmPassphrase")}
                        <input type="password" autoComplete="new-password" value={backupPassphraseConfirm} onChange={(e) => setBackupPassphraseConfirm(e.target.value)} className="h-10 rounded-control border border-line bg-surface px-3 font-normal" />
                      </label>
                      {backupPassphraseError && <p role="alert" className="text-sm text-red-700">{t("backup.passphraseMismatch")}</p>}
                    </div>
                  )}
                  <Button icon="download" className="w-fit" onClick={startBackup}>{t("backup.start")}</Button>
                </>
              )}
              {backup.phase !== "idle" && <Stepper steps={backup.steps} />}
              {backup.error && <ErrorPanel error={backup.error} onRetry={startBackup} />}
              {backup.result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-card border border-sage-100 bg-sage-50 p-4">
                  <div className="flex items-center gap-2 font-medium text-forest-900"><Icon name="shield" size={18} className="text-forest-600" />{t("backup.doneTitle")}</div>
                  <p className="mt-1 break-words text-sm text-muted">{t("backup.doneBody", { name: backup.result.fileName, size: formatSize(backup.result.bytes), hash: backup.result.manifest.files[0].sha256.slice(0, 16) })}</p>
                  {downloadError && <ErrorPanel error={downloadError} className="mt-3" />}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="soft" icon="download" onClick={downloadAgain}>{t("backup.downloadAgain")}</Button>
                    <Button variant="ghost" onClick={() => backup.reset()}>{t("backup.another")}</Button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div key="restore" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="flex flex-col gap-4">
              {inspect.phase === "idle" && (
                <>
                  <p className="text-sm text-muted">{t("restore.intro")}</p>
                  <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                    {t("restore.passphrase")}
                    <input type="password" autoComplete="current-password" value={restorePassphrase} onChange={(e) => setRestorePassphrase(e.target.value)} className="h-10 rounded-control border border-line bg-surface px-3 font-normal" />
                  </label>
                  <p className="text-xs text-muted">{t("restore.passphraseHint")}</p>
                  <label onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 ${dragging ? "border-forest-600 bg-sage-50" : "border-line hover:border-sage-200 hover:bg-sage-50/60"}`}>
                    <motion.span animate={{ y: dragging ? -4 : 0 }} className="grid size-11 place-items-center rounded-full bg-sage-100 text-forest-700"><Icon name="upload" size={20} /></motion.span>
                    <span className="text-sm font-medium text-ink">{t("restore.drop")}</span>
                    <span className="text-xs text-muted">{t("restore.hint")}</span>
                    <input type="file" accept=".zip,application/zip,application/x-zip-compressed" className="sr-only" aria-label={t("restore.drop")} onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </>
              )}

              {inspect.phase !== "idle" && apply.phase === "idle" && (inspect.phase !== "done" || showChecks) && <Stepper steps={inspect.steps} />}
              {inspect.error && (
                <>
                  <ErrorPanel error={inspect.error} />
                  <Button variant="ghost" className="w-fit" onClick={() => inspect.reset()}>{t("restore.chooseOther")}</Button>
                </>
              )}

              {plan && apply.phase === "idle" && (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-control bg-sage-50 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-forest-900"><Icon name="shield" size={16} className="shrink-0 text-forest-600" /><span className="truncate">{t("restore.verified")}: {plan.fileName}</span></span>
                    <button type="button" onClick={() => setShowChecks((s) => !s)} className="shrink-0 text-xs text-forest-700 hover:underline">{showChecks ? t("restore.hideChecks") : t("restore.checks")}</button>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-control border border-line p-3"><dt className="text-xs text-muted">{t("restore.created")}</dt><dd className="mt-0.5 font-medium">{date(plan.manifest.createdAt)}</dd></div>
                    <div className="rounded-control border border-line p-3"><dt className="text-xs text-muted">{t("restore.createdBy")}</dt><dd className="mt-0.5 font-medium">{plan.manifest.app.name} {plan.manifest.app.version}</dd></div>
                  </dl>
                  <RestoreReview
                    plan={plan}
                    decisions={decisions}
                    onDecide={(key, d) => setDecisions((m) => new Map(m).set(key, d))}
                    onDecideAll={(d) => setDecisions(new Map(plan.merge.entries.filter((e) => e.status === "differs").map((e) => [e.key, d] as const)))}
                    safety={safety}
                    onSafety={setSafety}
                    onApply={() => setConfirm(true)}
                    onBack={() => inspect.reset()}
                  />
                </>
              )}

              {apply.phase !== "idle" && <Stepper steps={apply.steps} />}
              {apply.error && (
                <>
                  <ErrorPanel error={apply.error} />
                  <Button variant="ghost" className="w-fit" onClick={() => apply.reset()}>{t("action.back")}</Button>
                </>
              )}
              {apply.result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-card border border-sage-100 bg-sage-50 p-4">
                  <div className="flex items-center gap-2 font-medium text-forest-900"><Icon name="shield" size={18} className="text-forest-600" />{t("restore.doneTitle")}</div>
                  <p className="mt-1 text-sm text-muted">{t("restore.doneBody")}</p>
                  <p className="mt-1 text-sm text-forest-900">{t("merge.outcome", { added: apply.result.added, replaced: apply.result.replaced, kept: apply.result.kept })}</p>
                  <Button className="mt-3" onClick={() => handleOpenChange(false)}>{t("action.done")}</Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Modal>

      <ConfirmDialog open={confirm} danger title={t("restore.confirmTitle")} body={t("restore.confirmBody", { name: plan?.fileName ?? "", added: plan?.merge.totals.new ?? 0, replaced: replacedCount })} confirmLabel={t("restore.confirmAction")} cancelLabel={t("action.cancel")} onCancel={() => setConfirm(false)} onConfirm={() => void startRestore()} />
    </>
  );
}
