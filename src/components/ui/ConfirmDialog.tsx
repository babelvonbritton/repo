"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./Button";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Animated confirmation prompt that sits above every other layer. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel }: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="anim-overlay fixed inset-0 z-[70] grid place-items-center bg-forest-900/40 p-6 backdrop-blur-[2px]">
          <AlertDialog.Content className="anim-dialog w-full max-w-sm rounded-card bg-surface p-6 shadow-[0_30px_70px_-24px_rgba(28,47,38,0.5)] outline-none max-md:max-w-[22rem]">
            <AlertDialog.Title className="text-base font-semibold text-forest-900">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-sm text-muted">{body}</AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">{cancelLabel}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
