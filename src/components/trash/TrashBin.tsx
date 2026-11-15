"use client";

import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/i18n";
import { useTrashFx } from "./TrashFx";

/** Bin drawing: the lid pivots on its left hinge when `open` is true. */
function BinSvg({ open }: { open: boolean }) {
  return (
    <svg width="56" height="64" viewBox="0 0 56 64" fill="none" aria-hidden="true" className="overflow-visible drop-shadow-[0_10px_14px_rgba(28,47,38,0.2)]">
      <path d="M9 22h38l-3.2 34.2a4 4 0 0 1-4 3.8H16.2a4 4 0 0 1-4-3.8z" fill="var(--color-surface)" stroke="var(--color-forest-700)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 30v22M28 30v22M35 30v22" stroke="var(--color-sage-200)" strokeWidth="2" strokeLinecap="round" />
      <motion.g
        style={{ transformOrigin: "8px 19px" }}
        animate={{ rotate: open ? -42 : 0, y: open ? -2 : 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 17 }}
      >
        <rect x="6" y="16.5" width="44" height="5.5" rx="2.75" fill="var(--color-sage-100)" stroke="var(--color-forest-700)" strokeWidth="2" />
        <path d="M22 16.5v-2.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2.5" stroke="var(--color-forest-700)" strokeWidth="2" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

/** Floating trash bin. It is the landing target for deleted items and opens the trash panel. */
export function TrashBin({ count, onOpen, hidden = false }: { count: number; onOpen: () => void; hidden?: boolean }) {
  const { t } = useI18n();
  const fx = useTrashFx();
  return (
    <motion.button
      ref={fx.registerBin}
      type="button"
      onClick={onOpen}
      aria-label={t("trash.open")}
      tabIndex={hidden ? -1 : 0}
      initial={false}
      animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.8 : 1 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className={`fixed right-5 z-[55] grid h-[72px] w-16 place-items-center bottom-[calc(var(--bottom-nav,0px)+var(--footer-h,0px)+1.25rem)] md:right-8 ${hidden ? "pointer-events-none" : ""}`}
    >
      <motion.span key={fx.pulse} animate={fx.pulse ? { scale: [1, 1.1, 1] } : undefined} transition={{ duration: 0.4 }} className="block">
        <BinSvg open={fx.lidOpen} />
      </motion.span>
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
            className="absolute -right-1 top-1 grid min-w-5 place-items-center rounded-full bg-forest-700 px-1.5 text-xs font-medium text-white"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
