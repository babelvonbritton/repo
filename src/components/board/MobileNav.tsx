"use client";

import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/i18n";
import type { NavId } from "@/lib/storage";
import { Icon, type IconName } from "../ui/Icon";

export interface NavEntry {
  id: NavId;
  icon: IconName;
  label: string;
  count?: number;
  onClick: () => void;
}

/** Floating bottom bar for phones. The highlight slides to whichever menu is active. */
export function MobileNav({ items, activeId }: { items: NavEntry[]; activeId: NavId }) {
  const { t } = useI18n();
  return (
    <motion.nav
      aria-label={t("nav.mainMenu")}
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden"
    >
      <ul className="pointer-events-auto flex w-full max-w-md items-center rounded-[22px] border border-line bg-surface/90 p-1 shadow-[0_18px_40px_-18px_rgba(28,47,38,0.5)] backdrop-blur-xl">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="flex-1">
              <button type="button" onClick={item.onClick} aria-current={active ? "page" : undefined} className="relative flex w-full flex-col items-center gap-0.5 rounded-[18px] px-1 py-1.5 outline-none">
                {active && <motion.span layoutId="mobile-nav-pill" className="absolute inset-0 rounded-[18px] bg-sage-100" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <motion.span className={`relative ${active ? "text-forest-700" : "text-muted"}`} animate={{ scale: active ? 1.06 : 1, y: active ? -0.5 : 0 }} transition={{ type: "spring", stiffness: 420, damping: 26 }} whileTap={{ scale: 0.88 }}>
                  <Icon name={item.icon} size={19} />
                  <AnimatePresence>
                    {item.count ? (
                      <motion.span key="count" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-forest-700 px-1 text-[10px] font-medium leading-4 text-white">
                        {item.count}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </motion.span>
                <span className={`relative text-[10px] leading-tight transition-colors duration-200 ${active ? "font-medium text-forest-900" : "text-muted"}`}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
