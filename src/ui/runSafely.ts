/**
 * Führt eine Datenbank-Aktion aus und zeigt bei Fehlern eine verständliche Meldung –
 * ohne technische Details (siehe CLAUDE.md: keine internen Infos in Fehlermeldungen).
 */
export function runSafely(task: () => Promise<unknown>): void {
  task().catch(() => {
    window.alert("Das hat leider nicht geklappt. Bitte versuche es noch einmal.");
  });
}
