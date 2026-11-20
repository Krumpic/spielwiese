// Sicherheits-Wächter für Claude Code (PreToolUse-Hook).
// Blockiert (Exit-Code 2):
//   1. Jeden Zugriff auf .env-Dateien (lesen, suchen, bearbeiten, Shell-Befehle)
//   2. git push (Pushen darf nur der Nutzer)
//   3. Umgehen der Prüfungen (--no-verify) und Änderungen an diesen Schutzdateien per Shell
//   4. git commit, wenn `npm run check` fehlschlägt (Security, Lint, Format, Typen, Migration)
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename, join } from "node:path";

const block = (msg) => {
  process.stderr.write(`[guard] BLOCKIERT: ${msg}\n`);
  process.exit(2);
};

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  block("Hook-Eingabe nicht lesbar – aus Sicherheitsgründen abgelehnt.");
}

const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

// .env, .env.local, .env.production … (nicht: env.example)
const ENV_FILE = /^\.env(\..+)?$/i;
const ENV_IN_CMD = /(^|[\s"'`/\\=:(,;|&<>*])\.env(\.[\w.*-]+)?(?=$|[\s"'`/\\;|&)<>,*])/i;

// ---- Datei-Werkzeuge ----
if (["Read", "Edit", "Write", "NotebookEdit", "Grep", "Glob"].includes(tool)) {
  const candidates = [ti.file_path, ti.notebook_path, ti.path, ti.pattern, ti.glob]
    .filter((v) => typeof v === "string");
  for (const c of candidates) {
    const parts = c.split(/[\\/]/);
    if (parts.some((p) => ENV_FILE.test(p)) || ENV_IN_CMD.test(c)) {
      block(`Zugriff auf .env-Dateien ist nur dem Nutzer erlaubt (${tool}).`);
    }
  }
  process.exit(0);
}

// ---- Shell-Werkzeuge ----
if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command ?? "");

  if (ENV_IN_CMD.test(cmd)) {
    block("Shell-Befehl berührt eine .env-Datei – nur der Nutzer darf das.");
  }
  if (/\bgit\b[^\n]*\bpush\b/i.test(cmd)) {
    block("git push ist verboten. Pushen darf nur der Nutzer.");
  }
  if (/--no-verify\b/i.test(cmd) || /\bcore\.hooksPath\b/i.test(cmd)) {
    block("Prüfungen dürfen nicht umgangen werden (--no-verify / hooksPath).");
  }
  if (/\.claude[\\/](settings\.json|hooks)/i.test(cmd)) {
    block("Schutzdateien unter .claude/ darf nur der Nutzer ändern.");
  }

  // Vor jedem Commit: npm run check muss grün sein
  if (/\bgit\b[^\n]*\bcommit\b/i.test(cmd)) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (!pkg.scripts?.check) {
        block("package.json hat kein \"check\"-Script – Commit ohne Prüfung nicht erlaubt.");
      }
      try {
        execSync("npm run check", { cwd: root, stdio: "pipe", timeout: 280_000 });
      } catch (e) {
        const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.slice(-3000);
        block(`npm run check ist fehlgeschlagen – Commit abgelehnt.\n${out}`);
      }
    }
  }
  process.exit(0);
}

process.exit(0);
// Datei: ${basename(import.meta.url)}
