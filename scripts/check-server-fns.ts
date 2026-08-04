/**
 * Guardrail: every state-changing server function declares POST, and every
 * server function that accepts input validates it.
 *
 *   bun run check:server-fns   (also chained into `bun run check`)
 *
 * `createServerFn()` defaults to GET, which puts the payload in the URL (logs,
 * history, caches), makes the call replayable, and lets a same-origin prefetch
 * or an XSS-driven fetch perform the write. The CSRF middleware in
 * `src/start.ts` blocks cross-site and non-browser callers — not those. Pure
 * reads stay on GET so loaders keep prefetching and caching.
 *
 * This class of rule regresses silently: the codebase drifted to 74 default-GET
 * server functions without anyone deciding to. So it is checked in CI, and a
 * test asserts zero violations.
 *
 * Analysis is name-based rather than type-directed: a set of writing symbols is
 * seeded from anything containing a drizzle `.insert(`/`.update(`/`.delete(` or
 * a mutating `auth.api.*` call, then grown transitively through callers. A false
 * positive costs one `method: "POST"`, which is never wrong for a writer — so
 * the analysis errs toward flagging.
 *
 * Escape hatch: annotate the `createServerFn(` line with `server-fn-ok` and a
 * reason (e.g. a read that lazily backfills a row) so it is auditable in review.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ALLOW = "server-fn-ok";

/**
 * Drizzle writes, raw-SQL writes, and the Better Auth api calls that write.
 *
 * The verb is matched anywhere in the method name, not just at the start:
 * `adminCreateOAuthClient` is a write, and anchoring on the prefix missed it.
 */
const DIRECT_WRITE_RE = new RegExp(
	[
		// drizzle
		/\.(insert|update|delete)\(/.source,
		// raw SQL
		/sql`\s*(insert|update|delete)\s/.source,
		// Better Auth's api. `check`/`verify` are in the list because they are
		// writes the name hides: the OTP endpoints burn an attempt on a wrong code
		// and delete the row on the last one, so a replayed GET consumes the
		// victim's attempts. `send`/`request` are here for the same reason:
		// `sendVerificationOTP` matches none of the other verbs ("Verification"
		// does not contain "verify") yet it writes a verification row and sends an
		// email — replayable, exactly what this rule forces onto POST. Nothing
		// read-only in the auth surface we call (getSession, userHasPermission,
		// list*, get*) contains either verb.
		/auth\.api\.\w*(create|set|update|delete|ban|unban|revoke|remove|sign|send|request|approve|reject|mark|check|verify|consume)\w*\(/
			.source,
		// Better Auth's adapters, which several services write through directly
		/(internalAdapter|adapter)\.\w*(create|update|delete)\w*\(/.source,
	].join("|"),
	"i",
);

/**
 * A refusal returned from guard middleware, rather than thrown.
 *
 * TanStack Start treats a `Response` returned from server-fn middleware as a
 * deliberate raw success: it stamps the response and hands the object to the
 * client as the resolved query value, so a 401 arrives as *data* and TanStack
 * Query caches it. The failure is silent by construction — the component
 * either crashes on a shape it never expected or renders a confident zero to a
 * user whose session just died. Throwing an `HttpError` makes it a rejected
 * query instead.
 *
 * `throw new APIError(...)` (Better Auth's class, used inside plugin hooks) is
 * a different symbol and deliberately does not match.
 */
const RETURNED_REFUSAL_RE = /\breturn\s+APIError\s*\(/;

/**
 * The annotation, on the line itself or in the comment block above it.
 *
 * Above it, because Biome relocates a trailing comment out of a multi-line
 * argument list — a same-line-only hatch would stop applying the first time
 * anyone ran the formatter, and the rule would fire on a decision that had
 * already been made.
 */
function isAnnotated(lines: string[], at: number): boolean {
	if (lines[at]?.includes(ALLOW)) return true;
	for (let i = at - 1; i >= 0 && /^\s*(\/\/|\/\*|\*)/.test(lines[i]); i--) {
		if (lines[i].includes(ALLOW)) return true;
	}
	return false;
}

export type Violation = {
	file: string;
	line: number;
	symbol: string;
	kind:
		| "missing-post"
		| "missing-validator"
		| "bare-validator"
		| "returned-refusal";
	detail: string;
};

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "__tests__") continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(path));
		else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
	}
	return out;
}

/**
 * Every top-level declaration body, by name — `function NAME`, `const NAME =`,
 * exported or not.
 *
 * Non-exported helpers count: a server fn that writes through a module-local
 * function is still a writer, and indexing only exports both hid those helpers
 * and threw away everything before the first `export` (which is exactly where
 * they live).
 */
function topLevelFunctions(source: string): Map<string, string> {
	const out = new Map<string, string>();
	const pattern =
		/^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm;
	const starts: Array<{ name: string; at: number }> = [];
	for (const m of source.matchAll(pattern)) {
		starts.push({ name: m[1] ?? m[2], at: m.index ?? 0 });
	}
	starts.forEach((s, i) => {
		out.set(s.name, source.slice(s.at, starts[i + 1]?.at ?? source.length));
	});
	return out;
}

type Declaration = {
	name: string;
	body: string;
	file: string;
	source: string;
};

/**
 * Every declared name that writes, or reaches something that does. Grown to a
 * fixpoint so a server fn three hops from the write is still caught. Matching
 * is by bare name across files, which is what makes an alias import
 * (`applyForProvider as applyForProviderSvc`) still resolve.
 */
function collectWriterNames(declarations: Declaration[]): Set<string> {
	const writers = new Set<string>();
	for (const d of declarations) {
		if (DIRECT_WRITE_RE.test(d.body)) writers.add(d.name);
	}
	for (let changed = true; changed; ) {
		changed = false;
		for (const d of declarations) {
			if (writers.has(d.name)) continue;
			for (const writer of writers) {
				// The declaration's own name never counts as a call to itself.
				if (writer === d.name) continue;
				if (new RegExp(`\\b${writer}\\w*\\s*\\(`).test(d.body)) {
					writers.add(d.name);
					changed = true;
					break;
				}
			}
		}
	}
	return writers;
}

export function findServerFnViolations(root: string = ROOT): Violation[] {
	const declarations: Declaration[] = [];
	for (const file of walk(root)) {
		const source = readFileSync(file, "utf8");
		for (const [name, body] of topLevelFunctions(source)) {
			declarations.push({ name, body, file, source });
		}
	}
	const writers = collectWriterNames(declarations);

	const violations: Violation[] = [];
	for (const home of declarations) {
		const { name, body } = home;

		// Guards only. Route handlers and the raw-HTTP OAuth surface both answer
		// with a `Response` by contract, and neither lives here.
		if (/[\\/]middlewares[\\/]/.test(home.file)) {
			const bodyStart = home.source
				.slice(0, home.source.indexOf(body))
				.split("\n").length;
			const lines = body.split("\n");
			lines.forEach((text, i) => {
				if (!RETURNED_REFUSAL_RE.test(text) || isAnnotated(lines, i)) return;
				violations.push({
					file: home.file,
					line: bodyStart + i,
					symbol: name,
					kind: "returned-refusal",
					detail:
						"returns an APIError Response from middleware — throw an HttpError so the refusal is not delivered as data",
				});
			});
		}

		if (!body.includes("createServerFn")) continue;
		const declaration = body.slice(body.indexOf("createServerFn"));
		const line = home.source.slice(0, home.source.indexOf(body)).split("\n")
			.length;
		const declLine =
			home.source
				.split("\n")
				.findIndex((l, i) => i >= line - 1 && l.includes("createServerFn")) + 1;
		if (home.source.split("\n")[declLine - 1]?.includes(ALLOW)) continue;

		const declaresPost = /createServerFn\(\s*\{[^}]*method:\s*"POST"/.test(
			declaration,
		);
		const declaresValidator = /\.validator\(/.test(declaration);
		// A schema handed straight to `.validator()` leaves the framework's
		// `execValidator` to throw — an `Error` whose message is a JSON dump of
		// zod's issues, carrying no `.status`. `validated()` turns that into a
		// 400 like every other refusal, so it is the only accepted form.
		// Matched by walking each occurrence rather than one lookahead: `\s*`
		// backtracks, so `.validator(\n\tvalidated(` would satisfy a negative
		// lookahead placed after it and report every wrapped call as bare.
		const bareValidator = [...declaration.matchAll(/\.validator\(\s*/g)].some(
			(hit) =>
				!declaration
					.slice((hit.index ?? 0) + hit[0].length)
					.startsWith("validated("),
		);
		// The handler destructures `data` only when it takes input.
		const acceptsInput = /\.handler\(\s*(?:async\s*)?\(\s*\{[^}]*\bdata\b/.test(
			declaration,
		);

		if (!declaresPost && writers.has(name)) {
			violations.push({
				file: home.file,
				line: declLine,
				symbol: name,
				kind: "missing-post",
				detail: "reaches a write but does not declare method: \"POST\"",
			});
		}
		if (acceptsInput && !declaresValidator) {
			violations.push({
				file: home.file,
				line: declLine,
				symbol: name,
				kind: "missing-validator",
				detail: "accepts input but declares no .validator()",
			});
		}
		if (bareValidator) {
			violations.push({
				file: home.file,
				line: declLine,
				symbol: name,
				kind: "bare-validator",
				detail:
					"passes a schema straight to .validator() — wrap it in validated() so a bad field is a 400, not a zod dump",
			});
		}
	}

	return violations.sort(
		(a, b) => a.file.localeCompare(b.file) || a.line - b.line,
	);
}

if (import.meta.main) {
	const violations = findServerFnViolations();
	if (violations.length > 0) {
		console.error("Server function contract violations:");
		for (const v of violations) {
			console.error(`  ${v.file}:${v.line} ${v.symbol} — ${v.detail}`);
		}
		console.error(
			`\nA handler that writes must declare createServerFn({ method: "POST" }), one that takes input must declare .validator(), and a guard middleware must throw an HttpError rather than return an APIError Response. If a case is genuinely fine, annotate the offending line with '${ALLOW}: <reason>'.`,
		);
		process.exit(1);
	}
	console.log("check:server-fns ok (writes are POST, inputs are validated)");
}
