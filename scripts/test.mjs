// Runs Vitest from the folder's real path.
// On Windows, VS Code can open the folder as "c:\..." while Node resolves files as "C:\...".
// Vitest then loads itself twice and every test fails with "reading 'config'".
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";

const cwd = realpathSync.native(process.cwd());
const vitest = join(cwd, "node_modules", "vitest", "vitest.mjs");
const { status } = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(status ?? 1);
