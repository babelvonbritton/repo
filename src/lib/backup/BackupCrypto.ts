import { AppError } from "@/lib/errors/AppError";
import type { BackupEncryption } from "./types";

const ITERATIONS = 310_000;
const PASSPHRASE_MIN_LENGTH = 8;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));

function cryptoApi(): Crypto {
  const api = globalThis.crypto;
  if (!api?.subtle || !api.getRandomValues) throw new AppError("BACKUP_CRYPTO_UNAVAILABLE");
  return api;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const api = cryptoApi();
  const material = await api.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return api.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts backup data with AES-256-GCM and a PBKDF2-derived passphrase key. */
export class BackupCrypto {
  static async encrypt(data: Uint8Array, passphrase: string): Promise<{ data: Uint8Array; metadata: BackupEncryption }> {
    if (passphrase.length < PASSPHRASE_MIN_LENGTH) throw new AppError("BACKUP_PASSWORD_TOO_SHORT");
    const api = cryptoApi();
    const salt = api.getRandomValues(new Uint8Array(16));
    const iv = api.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const encrypted = await api.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
    return {
      data: new Uint8Array(encrypted),
      metadata: { algorithm: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations: ITERATIONS, salt: toHex(salt), iv: toHex(iv) },
    };
  }

  static async decrypt(data: Uint8Array, metadata: BackupEncryption, passphrase?: string): Promise<Uint8Array> {
    if (!passphrase) throw new AppError("BACKUP_PASSWORD_REQUIRED");
    try {
      const api = cryptoApi();
      const key = await deriveKey(passphrase, fromHex(metadata.salt));
      const decrypted = await api.subtle.decrypt({ name: "AES-GCM", iv: fromHex(metadata.iv) }, key, data as BufferSource);
      return new Uint8Array(decrypted);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("BACKUP_DECRYPT_FAILED", { cause: error });
    }
  }
}
