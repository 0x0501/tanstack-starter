import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "mystack-release-"));
try {
	const { stdout } = await run("npm", ["pack", fileURLToPath(new URL("../", import.meta.url)), "--pack-destination", temporary, "--json"]);
	const packed = JSON.parse(stdout)[0];
	if (packed.files.some((entry) => /(?:^|\/)\.env$|\.git\/|node_modules\/|\.lix\//.test(entry.path))) throw new Error("Unexpected private or local files in release.");
	await run("npm", ["install", "--prefix", temporary, join(temporary, packed.filename)], { maxBuffer: 2 * 1024 * 1024 });
	const cli = join(temporary, "node_modules/@mystack/cli/src/cli.mjs");
	await run(process.execPath, [cli, "create", "packed-app", "--yes", "--database", "d1", "--email", "resend", "--payments", "none", "--no-install"], { cwd: temporary });
	const target = join(temporary, "packed-app");
	await readFile(join(target, ".gitignore"));
	const tree = await readFile(join(target, "src/routeTree.gen.ts"), "utf8");
	if (/webhooks\//.test(tree)) throw new Error("Unselected payment routes survived generation.");
	const selection = JSON.parse(await readFile(join(target, "mystack.json"), "utf8"));
	if (selection.database !== "d1" || selection.deployment !== "cloudflare") throw new Error("Wrong packed configuration.");
	console.log(`Packed CLI generated a project outside the checkout (${packed.files.length} packaged files).`);
} finally { await rm(temporary, { recursive: true, force: true }); }
