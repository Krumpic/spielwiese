import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  parseBackup,
  type BackupData,
  type ParseResult,
} from "../domain/backup.ts";
import { markBackupDone } from "../db/repository.ts";

export type ShareOutcome = "saved" | "cancelled";

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/**
 * Erstellt das Backup und gibt es weiter:
 * - iPhone: Teilen-Dialog → „In Dateien sichern" (iCloud Drive / Auf meinem iPhone)
 * - sonst oder wenn Teilen nicht klappt: normaler Download
 *
 * Wichtig: Die Datei wird SOFORT aus den bereits geladenen Daten gebaut (kein Warten auf
 * die Datenbank). Safari erlaubt das Teilen nur unmittelbar nach dem Antippen.
 */
export async function saveBackupFile(data: BackupData): Promise<ShareOutcome> {
  const backup = createBackup(data, Date.now());
  const name = backupFileName(backup.exportedAt);
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: "application/json" });

  let shared = false;
  if ("canShare" in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Kornspeicher-Backup" });
      shared = true;
    } catch (error) {
      // Abbrechen durch den Nutzer → nichts tun; jeder andere Fehler → Download als Ersatz
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  if (!shared) download(file);

  await markBackupDone();
  return "saved";
}

/** Liest eine ausgewählte Datei ein und prüft sie streng (Größe zuerst, ohne sie zu laden). */
export async function readBackupFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    return { ok: false, error: "Die Datei ist zu groß für ein Kornspeicher-Backup." };
  }
  return parseBackup(await file.text());
}

/** Bittet den Browser, die Daten nicht bei Speicherknappheit automatisch zu löschen. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!("storage" in navigator) || !("persist" in navigator.storage)) return false;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
