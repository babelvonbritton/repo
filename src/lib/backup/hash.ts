import { AppError } from "@/lib/errors/AppError";

/** SHA-256 of bytes as lowercase hex. Needs a secure context (HTTPS or localhost). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new AppError("BACKUP_CRYPTO_UNAVAILABLE");
  const digest = await subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
