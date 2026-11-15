import { useCallback, useEffect, useRef, useState } from "react";

/** Keeps a value mounted while its dialog plays the exit animation, then clears it. */
export function usePresenceState<T>(exitMs = 260) {
  const [value, setValue] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((next: T) => {
    clearTimeout(timer.current);
    setValue(next);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setValue(null), exitMs);
  }, [exitMs]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { value, open, show, hide };
}
