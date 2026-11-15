import { AppError } from "@/lib/errors/AppError";

/** Hands a file to the browser's download flow. */
export class FileSaver {
  static download(bytes: Uint8Array, fileName: string): void {
    try {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      throw new AppError("BACKUP_DOWNLOAD_FAILED", { cause: e, details: e instanceof Error ? e.message : String(e) });
    }
  }
}
