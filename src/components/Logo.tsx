/** Repo brand mark: a leaf inside a rounded square, drawn as inline SVG. */
export function Logo({ className = "", small = false }: { className?: string; small?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={small ? 26 : 32} height={small ? 26 : 32} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="29" height="29" rx="9" stroke="var(--color-forest-700)" strokeWidth="2" />
        <path
          d="M9.5 21.5c0-6.5 4.2-10.5 12-10.5 0 7.8-4 12-10.2 12"
          stroke="var(--color-forest-700)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.5 21.5 15.5 15.5" stroke="var(--color-forest-700)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className={`${small ? "text-xl" : "text-3xl"} font-semibold tracking-tight text-forest-900`}>Repo</span>
    </div>
  );
}
