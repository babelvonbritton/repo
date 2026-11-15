"use client";

import * as RSelect from "@radix-ui/react-select";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Tailwind background class for a small color dot shown before the label. */
  swatch?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  ariaLabel: string;
  className?: string;
  prefix?: ReactNode;
}

/** Fully themed dropdown (Radix Select, no native menu). */
export function Select<T extends string>({ value, onChange, options, ariaLabel, className = "", prefix }: Props<T>) {
  return (
    <RSelect.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={`group inline-flex h-10 items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] duration-200 hover:border-sage-200 data-[state=open]:border-forest-600 data-[state=open]:shadow-[0_0_0_3px_rgba(59,106,83,0.12)] ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {prefix}
          <RSelect.Value />
        </span>
        <RSelect.Icon>
          <Icon name="chevron" size={16} className="text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="anim-pop z-[80] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-line bg-surface p-1 shadow-[0_16px_36px_-14px_rgba(28,47,38,0.3)]"
        >
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-[8px] py-2 pl-3 pr-8 text-sm outline-none transition-colors data-[highlighted]:bg-sage-50 data-[state=checked]:font-medium"
              >
                <RSelect.ItemText>
                  {o.swatch && <span className={`mr-2 inline-block size-2.5 rounded-full align-middle ${o.swatch}`} />}
                  {o.label}
                </RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute right-2.5 text-forest-600">
                  <Icon name="check" size={14} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
