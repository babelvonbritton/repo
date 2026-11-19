/** Custom SVG icon set (24px grid, stroke based). Paths are separated by "|". */
const PATHS = {
  plus: "M12 5v14|M5 12h14",
  search: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z|m20 20-4.2-4.2",
  close: "M6 6l12 12|M18 6 6 18",
  check: "m5 12.5 4.5 4.5L19 7.5",
  chevron: "m6 9 6 6 6-6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronRight: "m9 6 6 6-6 6",
  board: "M5 4h5v16H5z|M14 4h5v9h-5z",
  list: "M9 7h11|M9 12h11|M9 17h11|M4.5 7h.01|M4.5 12h.01|M4.5 17h.01",
  trash: "M5 7h14|M10 7V5h4v2|M7 7l1 12h8l1-12",
  calendar: "M5 7h14v12H5z|M5 11h14|M9 4v4|M15 4v4",
  filter: "M4 6h16|M7 12h10|M10 18h4",
  sparkle: "M12 4l1.8 4.7 4.7 1.8-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8z",
  grip: "M9 6h.01|M15 6h.01|M9 12h.01|M15 12h.01|M9 18h.01|M15 18h.01",
  restore: "M4 12a8 8 0 1 0 2.6-5.9|M4 4v5h5",
  note: "M6 4h9l3 3v13H6z|M9 11h6|M9 15h6",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z|M12 8v4l3 2",
  arrowLeft: "M10 6l-6 6 6 6|M4 12h16",
  arrowUp: "M12 19V6|m6 11 6-6 6 6",
  arrowDown: "M12 5v13|m6 13 6 6 6-6",
  sliders: "M4 8h9|M17 8h3|M4 16h3|M11 16h9|M15 6v4|M9 14v4",
  pencil: "M5 19h4L19.5 8.5l-4-4L5 15z|M13.5 6.5l4 4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M12 3v2.5|M12 18.5V21|M3 12h2.5|M18.5 12H21|m5.6 5.6 1.8 1.8|m16.6 16.6 1.8 1.8|m18.4 5.6-1.8 1.8|m7.4 16.6-1.8 1.8",
  globe: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z|M4 12h16|M12 4c2.5 2.3 2.5 13.7 0 16|M12 4c-2.5 2.3-2.5 13.7 0 16",
  /** Question mark in a circle, for the field help buttons and the section guide. */
  help: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z|M9.5 9a2.6 2.6 0 1 1 3.8 2.3c-.9.4-1.3 1-1.3 1.9|M12 17h.01",
  archive: "M4 6h16v4H4z|M6 10v9h12v-9|M10 14h4",
  download: "M12 4v10|m8 11 4 4 4-4|M5 19h14",
  alert: "M12 4 3 20h18z|M12 10v4|M12 17h.01",
  shield: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z|m9 12 2 2 4-4",
  copy: "M9 9h10v11H9z|M5 15V4h10",
  file: "M7 3h7l4 4v14H7z|M14 3v4h4",
  upload: "M12 15V5|m8 8 4-4 4 4|M5 19h14",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className, strokeWidth = 1.7 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name].split("|").map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
