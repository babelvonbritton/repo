"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { Decision, DiffValue, DisplayName, EntityKind, MergeEntry } from "@/lib/backup/MergePlanner";
import type { RestorePlan } from "@/lib/backup/types";
import { formatDate } from "@/lib/workspace/ordering";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

const KINDS: EntityKind[] = ["board", "column", "item", "note", "trash", "setting"];
const NEW_PREVIEW = 8;
const DIFF_PREVIEW = 25;
const NOTE_PREVIEW = 140;

interface Props {
  plan: RestorePlan;
  decisions: ReadonlyMap<string, Decision>;
  onDecide: (key: string, decision: Decision) => void;
  onDecideAll: (decision: Decision) => void;
  safety: boolean;
  onSafety: (value: boolean) => void;
  onApply: () => void;
  onBack: () => void;
}

/** Shows what a backup would add, leave alone and change, and lets the user decide each difference. */
export function RestoreReview({ plan, decisions, onDecide, onDecideAll, safety, onSafety, onApply, onBack }: Props) {
  const { t, locale, has } = useI18n();
  const [showAllNew, setShowAllNew] = useState(false);
  const [showAllDiffs, setShowAllDiffs] = useState(false);
  const { totals, byKind, entries } = plan.merge;
  const added = entries.filter((e) => e.status === "new");
  const differs = entries.filter((e) => e.status === "differs");
  const replaced = differs.filter((e) => decisions.get(e.key) === "replace").length;
  const kept = differs.length - replaced;
  const nothing = totals.new === 0 && totals.differs === 0;

  /** Default names (sample board, stages and items) appear in the active language. */
  const nameOf = (n: DisplayName): string => {
    if (!n.seed || !n.seedKey) return n.text;
    const key = n.seed === "item" ? `seed.item.${n.seedKey}.title` : `seed.${n.seed}.${n.seedKey}`;
    return has(key) ? t(key as MessageKey) : n.text;
  };

  const show = (v: DiffValue): string => {
    switch (v.kind) {
      case "name": return nameOf({ text: v.value, seedKey: v.seedKey, seed: v.seed });
      case "priority": return t(`priority.${v.value}` as MessageKey);
      case "tone": return t(`tone.${v.value}` as MessageKey);
      case "date": return v.value ? formatDate(v.value, locale) : t("diff.none");
      case "place": return t(v.value === "trash" ? "diff.inTrash" : "diff.onBoard");
      case "long": {
        if (!v.value) return t("diff.none");
        const chars = Array.from(v.value);
        const preview = chars.length > NOTE_PREVIEW ? `${chars.slice(0, NOTE_PREVIEW).join("")}...` : v.value;
        return `${preview} (${t("diff.chars", { count: chars.length })})`;
      }
      default: return v.value === "" ? t("diff.none") : v.value;
    }
  };

  const badge = "rounded-md bg-sage-100 px-1.5 py-0.5 text-[11px] text-forest-700";
  const newList = showAllNew ? added : added.slice(0, NEW_PREVIEW);
  const diffList = showAllDiffs ? differs : differs.slice(0, DIFF_PREVIEW);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-forest-900">{t("restore.review")}</h3>
      <p className="text-sm text-muted">{t("merge.intro")}</p>

      {nothing ? (
        <div className="flex items-start gap-3 rounded-card border border-sage-100 bg-sage-50 p-4 text-sm">
          <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-forest-600" />
          {t("merge.nothing")}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1.5 font-normal">{t("restore.records")}</th>
              <th className="pb-1.5 text-right font-normal">{t("merge.new")}</th>
              <th className="pb-1.5 text-right font-normal">{t("merge.same")}</th>
              <th className="pb-1.5 text-right font-normal">{t("merge.differs")}</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.filter((k) => byKind[k].new + byKind[k].same + byKind[k].differs > 0).map((k) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5">{t(`kind.${k}`)}</td>
                <td className={`py-1.5 text-right tabular-nums ${byKind[k].new ? "font-medium text-forest-700" : "text-muted"}`}>{byKind[k].new}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{byKind[k].same}</td>
                <td className={`py-1.5 text-right tabular-nums ${byKind[k].differs ? "font-medium text-amber-tone" : "text-muted"}`}>{byKind[k].differs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totals.same > 0 && !nothing && <p className="text-xs text-muted">{t("merge.sameInfo", { count: totals.same })}</p>}

      {added.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-sm font-medium text-ink">{t("merge.newTitle", { count: added.length })}</h4>
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {newList.map((e) => (
              <li key={e.key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className={badge}>{t(`kind.${e.kind}`)}</span>
                <span className="min-w-0 truncate">{nameOf(e.name)}</span>
              </li>
            ))}
          </ul>
          {added.length > NEW_PREVIEW && (
            <button type="button" onClick={() => setShowAllNew((s) => !s)} className="mt-1.5 text-xs text-forest-700 hover:underline">
              {showAllNew ? t("merge.showLess") : `${t("merge.showAll")} (${t("merge.andMore", { count: added.length - NEW_PREVIEW })})`}
            </button>
          )}
        </section>
      )}

      {differs.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-ink">{t("merge.differsTitle", { count: differs.length })}</h4>
            <div className="flex gap-1.5">
              <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => onDecideAll("skip")}>{t("merge.keepAll")}</Button>
              <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => onDecideAll("replace")}>{t("merge.replaceAll")}</Button>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {diffList.map((e) => (
              <DiffCard key={e.key} entry={e} name={nameOf(e.name)} decision={decisions.get(e.key) ?? "skip"} onDecide={(d) => onDecide(e.key, d)} show={show} />
            ))}
          </ul>
          {differs.length > DIFF_PREVIEW && (
            <button type="button" onClick={() => setShowAllDiffs((s) => !s)} className="mt-1.5 text-xs text-forest-700 hover:underline">
              {showAllDiffs ? t("merge.showLess") : `${t("merge.showAll")} (${t("merge.andMore", { count: differs.length - DIFF_PREVIEW })})`}
            </button>
          )}
        </section>
      )}

      {plan.warnings.length > 0 && (
        <div className="rounded-control border border-amber-tone/40 bg-amber-tone/10 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-ink"><Icon name="alert" size={15} className="text-amber-tone" />{t("restore.notices")}</p>
          <ul className="list-disc pl-5 text-xs text-ink/80">{plan.warnings.map((w) => <li key={w.key}>{t(w.key, w.vars)}</li>)}</ul>
        </div>
      )}

      {!nothing && (
        <>
          <p className="rounded-control bg-sage-50 px-3 py-2 text-sm text-forest-900" aria-live="polite">{t("merge.outcome", { added: totals.new, replaced, kept })}</p>
          <button type="button" role="checkbox" aria-checked={safety} onClick={() => onSafety(!safety)} className="flex items-start gap-3 rounded-control border border-line p-3 text-left text-sm transition-colors hover:bg-sage-50">
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-200 ${safety ? "border-forest-700 bg-forest-700 text-white" : "border-sage-200 bg-surface text-transparent"}`}><Icon name="check" size={13} strokeWidth={2.6} /></span>
            {t("restore.safety")}
          </button>
          <p className="text-xs text-muted">{t("restore.replaceNote")}</p>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {!nothing && <Button icon="restore" onClick={onApply} disabled={totals.new + replaced === 0}>{t("restore.apply")}</Button>}
        <Button variant="ghost" onClick={onBack}>{t("restore.chooseOther")}</Button>
      </div>
    </motion.div>
  );
}

interface CardProps {
  entry: MergeEntry;
  name: string;
  decision: Decision;
  onDecide: (decision: Decision) => void;
  show: (value: DiffValue) => string;
}

/** One record that exists on both sides with different content: what differs, and the keep/replace choice. */
function DiffCard({ entry, name, decision, onDecide, show }: CardProps) {
  const { t } = useI18n();
  const options: Array<{ id: Decision; label: string }> = [
    { id: "skip", label: t("merge.keep") },
    { id: "replace", label: t("merge.replace") },
  ];
  return (
    <li className="rounded-card border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="rounded-md bg-sage-100 px-1.5 py-0.5 text-[11px] text-forest-700">{t(`kind.${entry.kind}`)}</span>
          <p className="mt-1 truncate text-sm font-medium text-ink">{name}</p>
          {entry.hint && <p className="mt-0.5 text-xs text-amber-tone">{t(entry.hint === "trashedNow" ? "merge.trashedNow" : "merge.liveNow")}</p>}
        </div>
        <div role="radiogroup" aria-label={name} className="relative flex rounded-control bg-sage-100 p-0.5">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={decision === o.id} onClick={() => onDecide(o.id)} className={`relative h-8 rounded-[8px] px-3 text-xs transition-colors duration-200 ${decision === o.id ? "font-medium text-forest-900" : "text-muted hover:text-ink"}`}>
              {decision === o.id && <motion.span layoutId={`decision-${entry.key}`} className={`absolute inset-0 rounded-[8px] shadow-sm ${o.id === "replace" ? "bg-amber-tone/25" : "bg-surface"}`} transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      <dl className="mt-2.5 flex flex-col gap-2 border-t border-line pt-2.5">
        {entry.diffs.map((d) => (
          <div key={d.field} className="grid gap-1 text-sm sm:grid-cols-[6.5rem_1fr_1fr] sm:gap-3">
            <dt className="text-xs text-muted sm:pt-0.5">{t(`diff.${d.field}`)}</dt>
            <dd className={`min-w-0 break-words rounded-md px-2 py-1 transition-colors ${decision === "skip" ? "bg-sage-50" : "text-muted line-through decoration-muted/50"}`}>
              <span className="block text-[11px] text-muted no-underline">{t("merge.current")}</span>{show(d.current)}
            </dd>
            <dd className={`min-w-0 break-words rounded-md px-2 py-1 transition-colors ${decision === "replace" ? "bg-amber-tone/15" : "text-muted"}`}>
              <span className="block text-[11px] text-muted">{t("merge.backup")}</span>{show(d.incoming)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
