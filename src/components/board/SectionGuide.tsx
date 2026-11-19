"use client";

import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { NavId } from "@/lib/storage";
import { Modal } from "../ui/Modal";

const CONTENT: Record<NavId, { title: MessageKey; intro: MessageKey; items: Array<{ title: MessageKey; body: MessageKey }> }> = {
  board: {
    title: "guide.board.title",
    intro: "guide.board.intro",
    items: [
      { title: "guide.board.add", body: "guide.board.addDesc" },
      { title: "guide.board.move", body: "guide.board.moveDesc" },
      { title: "guide.board.find", body: "guide.board.findDesc" },
      { title: "guide.board.views", body: "guide.board.viewsDesc" },
      { title: "guide.board.stages", body: "guide.board.stagesDesc" },
      { title: "guide.board.switch", body: "guide.board.switchDesc" },
    ],
  },
  trash: {
    title: "guide.trash.title",
    intro: "guide.trash.intro",
    items: [
      { title: "guide.trash.restore", body: "guide.trash.restoreDesc" },
      { title: "guide.trash.delete", body: "guide.trash.deleteDesc" },
      { title: "guide.trash.empty", body: "guide.trash.emptyDesc" },
      { title: "guide.trash.retention", body: "guide.trash.retentionDesc" },
    ],
  },
  backup: {
    title: "guide.backup.title",
    intro: "guide.backup.intro",
    items: [
      { title: "guide.backup.download", body: "guide.backup.downloadDesc" },
      { title: "guide.backup.restore", body: "guide.backup.restoreDesc" },
      { title: "guide.backup.safety", body: "guide.backup.safetyDesc" },
      { title: "guide.backup.verify", body: "guide.backup.verifyDesc" },
    ],
  },
  settings: {
    title: "guide.settings.title",
    intro: "guide.settings.intro",
    items: [
      { title: "guide.settings.language", body: "guide.settings.languageDesc" },
      { title: "guide.settings.boards", body: "guide.settings.boardsDesc" },
      { title: "guide.settings.menu", body: "guide.settings.menuDesc" },
      { title: "guide.settings.trash", body: "guide.settings.trashDesc" },
    ],
  },
};

/**
 * On-demand guide for the section the user currently has open.
 * It never shows itself: the help button in the header opens it.
 */
export function SectionGuide({ open, onOpenChange, section }: { open: boolean; onOpenChange: (o: boolean) => void; section: NavId }) {
  const { t } = useI18n();
  const content = CONTENT[section];
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t(content.title)} width="md:max-w-xl" topLayer>
      <p className="text-sm leading-relaxed text-muted">{t(content.intro)}</p>
      <ul className="mt-4 flex flex-col gap-4">
        {content.items.map((item) => (
          <li key={item.title}>
            <h3 className="text-sm font-semibold text-ink">{t(item.title)}</h3>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{t(item.body)}</p>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
