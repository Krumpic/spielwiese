// Startet Vitest mit einheitlich großgeschriebenem Laufwerksbuchstaben.
//
// Hintergrund: Unter Windows lädt Vitest seine eigenen Module doppelt, wenn das
// Arbeitsverzeichnis als "c:\..." statt "C:\..." übergeben wird (z. B. aus Git-Hooks
// oder Claude-Code-Hooks). Die Tests schlagen dann mit
// "Cannot read properties of undefined (reading 'config')" fehl.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const upperDrive = (path) => path.replace(/^[a-z]:/, (drive) => drive.toUpperCase());

const require = createRequire(import.meta.url);
const vitestBin = upperDrive(join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"));
const cwd = upperDrive(process.cwd());

const result = spawnSync(process.execPath, [vitestBin, "run", ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
