/** Small helpers shared by the storage layer and the UI. */

/** Counts user-visible characters (code points), so UI counters match storage validation. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/** Creates a collision-safe unique id. */
export function createId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for non-secure contexts where randomUUID is unavailable.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
