import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { catalog, incompatibilities, isPostgres } from "../src/catalog.mjs";
import { createProject } from "../src/generate.mjs";
const run = promisify(execFile);
const templateRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cases = [];
for (const db of catalog.database) for (const runtime of catalog.deployment) for (const mail of catalog.email) {
	const selection = { database: db.id, deployment: runtime.id, email: mail.id, payments: catalog.payments.map((option) => option.id) };
	if (!incompatibilities(selection).length) cases.push(selection);
}
const filters = process.argv.slice(2);
const selected = filters.length ? cases.filter((entry) => [entry.database, entry.deployment, entry.email].join(" ") === filters.join(" ")) : cases;
if (!selected.length) throw new Error("Choose a compatible database, deployment and email tuple.");
const cwd = await mkdtemp(join(tmpdir(), "mystack-matrix-"));
let succeeded = false;
try {
	for (const selection of selected) {
		const name = `${selection.database}-${selection.deployment}-${selection.email}`;
		console.log(`[${name}] generating and validating`);
		const target = await createProject({ name, selection, templateRoot, cwd });
		await writeFile(join(target, ".env"), await readFile(join(target, ".env.example")));
		for (const args of [["install"], ["run", "check"], ["run", "typecheck"], ["run", isPostgres(selection.database) ? "test" : "test:unit"], ["run", "build"], ["run", "check:client-bundle"]]) {
			try { await run("bun", args, { cwd: target, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true" } }); }
			catch (error) { console.error((error.stdout ?? "").slice(-6000), (error.stderr ?? "").slice(-6000)); throw error; }
			console.log(`[${name}] bun ${args.join(" ")} passed`);
		}
	}
	succeeded = true;
} finally {
	if (succeeded) await rm(cwd, { recursive: true, force: true });
	else console.error(`Failed projects retained for inspection: ${cwd}`);
}
