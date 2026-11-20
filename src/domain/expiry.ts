import { z } from "zod";

/**
 * Ablaufdaten werden als reines Datum "JJJJ-MM-TT" gespeichert (ohne Uhrzeit),
 * damit Zeitzonen und Sommerzeit keine Rolle spielen.
 */
export const ExpiryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein gültiges Datum wählen.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    if (y === undefined || m === undefined || d === undefined) return false;
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      y >= 2000 &&
      y <= 2200 &&
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, "Bitte ein gültiges Datum wählen.");

/** Ab so vielen Tagen vorher gilt ein Artikel als „läuft bald ab" */
export const EXPIRY_WARNING_DAYS = 3;

/** Heutiges Datum (lokale Zeit) als "JJJJ-MM-TT" */
export function todayString(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const toDayNumber = (date: string) => {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Tage bis zum Ablauf: 0 = heute, 1 = morgen, negativ = abgelaufen */
export function daysUntil(date: string, today: string): number {
  return toDayNumber(date) - toDayNumber(today);
}

export type ExpiryState = "expired" | "soon" | "ok";

export function expiryState(date: string | null, today: string): ExpiryState | null {
  if (date === null) return null;
  const days = daysUntil(date, today);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "soon";
  return "ok";
}

/** z. B. „läuft heute ab", „läuft in 3 Tagen ab", „seit 2 Tagen abgelaufen" */
export function expiryText(date: string, today: string): string {
  const days = daysUntil(date, today);
  if (days < -1) return `seit ${String(-days)} Tagen abgelaufen`;
  if (days === -1) return "seit gestern abgelaufen";
  if (days === 0) return "läuft heute ab";
  if (days === 1) return "läuft morgen ab";
  if (days <= 7) return `läuft in ${String(days)} Tagen ab`;
  const [y, m, d] = date.split("-");
  return `haltbar bis ${String(d)}.${String(m)}.${String(y)}`;
}
