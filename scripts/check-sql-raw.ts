/**
 * Guardrail: forbid drizzle `sql.raw(...)` in app source.
 *
 *   bun run check:sql-raw   (also chained into `bun run check`)
 *
 * `sql.raw` interpolates its argument into SQL verbatim. With user input it is a
 * SQL-injection vector, and an injection on the app connection can `SET`/`set_config`
 * the USERSET `app.service` GUC to self-escalate past RLS (see is_admin() and
 * src/db/helper.ts). The real fix — a dedicated BYPASSRLS service role — is deferred
 * with H1. Until then this keeps the "no sql.raw + user input" precondition true.
 *
 * There are currently zero `sql.raw` uses. If you must add a *static, constant* one,
 * annotate the line with `sql-raw-ok` (e.g. `sql.raw(FOO) // sql-raw-ok: constant`)
 * so the guard skips it and the escape is auditable in review.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ALLOW = "sql-raw-ok";

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(path));
		else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
	}
	return out;
}

const hits: string[] = [];
for (const file of walk(SRC)) {
	const lines = readFileSync(file, "utf8").split("\n");
	lines.forEach((line, i) => {
		if (line.includes("sql.raw(") && !line.includes(ALLOW)) {
			hits.push(`${file}:${i + 1}: ${line.trim()}`);
		}
	});
}

if (hits.length > 0) {
	console.error("Forbidden sql.raw( usage (SQLi / RLS self-escalation vector):");
	for (const h of hits) console.error(`  ${h}`);
	console.error(`\nUse parameterized drizzle sql\`...\`. If truly static, annotate with '${ALLOW}'.`);
	process.exit(1);
}

console.log("check:sql-raw ok (no unguarded sql.raw)");
