"use client";

import { motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface Flight {
  id: number;
  from: { left: number; top: number; width: number; height: number };
  to: { x: number; y: number };
  title: string;
  label: string;
}

interface TrashFxValue {
  /** Flies a copy of the card element into the bin. Call before the card leaves the DOM. */
  flyToTrash: (el: Element | null, card: { title: string; label: string }) => void;
  registerBin: (el: HTMLElement | null) => void;
  lidOpen: boolean;
  pulse: number;
}

const TrashFxContext = createContext<TrashFxValue | null>(null);
const FLIGHT_SECONDS = 0.72;

/** Owns the delete-to-trash choreography: lid opens, card arcs into the bin, lid closes, bin pulses. */
export function TrashFxProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const binRef = useRef<HTMLElement | null>(null);
  const seq = useRef(0);
  const inAir = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [lidOpen, setLidOpen] = useState(false);
  const [pulse, setPulse] = useState(0);

  const registerBin = useCallback((el: HTMLElement | null) => {
    binRef.current = el;
  }, []);

  const flyToTrash = useCallback<TrashFxValue["flyToTrash"]>(
    (el, card) => {
      const bin = binRef.current;
      if (!el || !bin || reduce) {
        setPulse((p) => p + 1);
        return;
      }
      const r = el.getBoundingClientRect();
      const b = bin.getBoundingClientRect();
      clearTimeout(closeTimer.current);
      inAir.current += 1;
      setLidOpen(true);
      setFlights((f) => [
        ...f,
        { id: ++seq.current, from: { left: r.left, top: r.top, width: r.width, height: r.height }, to: { x: b.left + b.width / 2, y: b.top + b.height * 0.36 }, ...card },
      ]);
    },
    [reduce],
  );

  const land = useCallback((id: number) => {
    setFlights((f) => f.filter((x) => x.id !== id));
    setPulse((p) => p + 1);
    inAir.current -= 1;
    if (inAir.current <= 0) closeTimer.current = setTimeout(() => setLidOpen(false), 280);
  }, []);

  const value = useMemo(() => ({ flyToTrash, registerBin, lidOpen, pulse }), [flyToTrash, registerBin, lidOpen, pulse]);

  return (
    <TrashFxContext.Provider value={value}>
      {children}
      {flights.map((f) => (
        <FlyingCard key={f.id} flight={f} onDone={() => land(f.id)} />
      ))}
    </TrashFxContext.Provider>
  );
}

/** A lightweight copy of the card that arcs into the bin and shrinks away behind its front edge. */
function FlyingCard({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const { from, to } = flight;
  const dx = to.x - (from.left + from.width / 2);
  const dy = to.y - (from.top + from.height / 2);
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed z-[54] overflow-hidden rounded-card border border-line bg-surface p-3.5 shadow-[0_18px_40px_-16px_rgba(28,47,38,0.45)]"
      style={{ left: from.left, top: from.top, width: from.width, height: from.height }}
      initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
      animate={{ x: dx, y: [0, -40, dy], scale: [1, 1.03, 0.14], rotate: [0, -2, 16], opacity: [1, 1, 0] }}
      transition={{
        x: { duration: FLIGHT_SECONDS, ease: [0.45, 0, 0.55, 1] },
        y: { duration: FLIGHT_SECONDS, times: [0, 0.3, 1], ease: ["easeOut", [0.55, 0, 0.9, 0.45]] },
        scale: { duration: FLIGHT_SECONDS, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"] },
        rotate: { duration: FLIGHT_SECONDS, times: [0, 0.3, 1], ease: "easeIn" },
        opacity: { duration: FLIGHT_SECONDS, times: [0, 0.85, 1] },
      }}
      onAnimationComplete={onDone}
    >
      {flight.label && <span className="mb-2 inline-block rounded-md bg-sage-100 px-1.5 py-0.5 text-[11px] text-forest-700">{flight.label}</span>}
      <p className="text-sm font-medium text-ink">{flight.title}</p>
    </motion.div>
  );
}

export function useTrashFx(): TrashFxValue {
  const ctx = useContext(TrashFxContext);
  if (!ctx) throw new Error("useTrashFx must be used inside TrashFxProvider");
  return ctx;
}
