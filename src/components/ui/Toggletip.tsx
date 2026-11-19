"use client";

import * as Popover from "@radix-ui/react-popover";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Small "?" button that explains the field next to it.
 * Opens on hover, focus, or tap; closes on Escape, outside click, or when
 * the pointer and the focus have both left the button and the hint.
 * Focus never moves into the hint: it is plain text, not a control.
 * Portaled so a dialog's scroll container cannot clip it.
 */
export function Toggletip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const hovering = useRef(false);
  const focused = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const maybeClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!hovering.current && !focused.current) setOpen(false);
    }, 120);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onMouseEnter={() => {
            hovering.current = true;
            show();
          }}
          onMouseLeave={() => {
            hovering.current = false;
            maybeClose();
          }}
          onFocus={() => {
            focused.current = true;
            show();
          }}
          onBlur={() => {
            focused.current = false;
            maybeClose();
          }}
          onClick={show}
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sage-50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-600"
        >
          <Icon name="help" size={14} />
        </button>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          role="tooltip"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={() => {
            hovering.current = true;
            clearTimeout(closeTimer.current);
          }}
          onMouseLeave={() => {
            hovering.current = false;
            maybeClose();
          }}
          className="z-50 max-w-64 rounded-control border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink shadow-[0_12px_28px_-12px_rgba(28,47,38,0.4)]"
        >
          {text}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
