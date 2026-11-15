"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  width?: string;
}

/** Animated dialog: centered card on desktop, bottom sheet on phones. */
export function Modal({ open, onOpenChange, title, children, width = "md:max-w-lg" }: Props) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-40 grid place-items-end bg-forest-900/35 backdrop-blur-[2px] md:place-items-center md:p-6">
          <Dialog.Content
            aria-describedby={undefined}
            className={`anim-dialog flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-surface shadow-[0_30px_70px_-24px_rgba(28,47,38,0.45)] outline-none md:rounded-card ${width}`}
          >
            <div className="flex items-center justify-between gap-4 px-6 pb-3 pt-5">
              <Dialog.Title className="text-lg font-semibold text-forest-900">{title}</Dialog.Title>
              <Dialog.Close aria-label={t("action.close")} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink">
                <Icon name="close" size={16} />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
