/**
 * Guardrail: nothing server-only may reach `dist/client`.
 * Run after `bun run build`: `bun run check:client-bundle`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIST = join(ROOT, "dist", "client");
const ENV_FILES = [join(ROOT, ".env"), join(ROOT, ".env.prod")];
const TEXT = /\.(js|mjs|css|html|json|txt|map)$/;

/**
 * A marker only earns its place if it can fire on a *bundled, minified*
 * artifact. Module specifiers (`drizzle-orm`) and local identifiers
 * (`betterAuth`) are erased by bundling, so a marker written against them
 * reports "ok" forever. The schema-shaped markers below are written against
 * strings that survive: `Symbol.for("drizzle:…")` keys, property names, and
 * SQL text baked into policy definitions.
 *
 * Verify a new marker by building a tree that genuinely leaks and watching it
 * fail — a green run against an artifact that never contained the thing proves
 * nothing.
 */
const MARKERS: [string, RegExp][] = [
	["cloudflare:workers import", /cloudflare:workers/],
	["node:async_hooks", /node:async_hooks|async_hooks/],
	["server function factory", /createServerFn/],
	["Hyperdrive binding", /HYPERDRIVE/],
	["drizzle ORM", /drizzle-orm/],
	// Drizzle brands every table object with these Symbol.for keys, so they
	// survive minification and are present whenever a table definition — and
	// with it every table and column name — reaches the browser.
	["drizzle table definitions", /drizzle:(?:entityKind|Name|Columns|Schema)/],
	["drizzle pg table class", /\bPgTable\b/],
	// Policy predicates ship as SQL string literals. Leaking them tells a reader
	// which GUC the RLS bypass trusts and what the predicate is.
	["RLS policy definition", /app_private\.|rls_(?:policy|user_read|service_write)/],
	["postgres driver", /node-postgres|pg-connection-string/],
	["postgres connection string", /postgres(?:ql)?:\/\//],
	["better-auth server factory", /betterAuth\(/],
	["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
	["stripe secret", /\b(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]{10,}/],
];

/**
 * Keys whose value may legitimately appear client-side, named one at a time.
 *
 * Everything else is treated as a secret, so a newly added key is secret by
 * default. The rule used to be the other way round — only keys *matching*
 * `SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|DATABASE` were checked — which silently
 * exempted anything named for what it is rather than what it holds
 * (`SENTRY_DSN`, `..._PROXY_URL`, `ADMIN_BOOTSTRAP`).
 */
const CLIENT_SAFE_KEYS = new Set([
	// The site's own public origin: canonical URLs, OG tags and the auth client
	// all need it in the browser.
	"APP_ORIGIN",
	"BETTER_AUTH_URL",
]);

export function secretValues(
	envFiles: string[] = ENV_FILES,
): [string, string][] {
	const pairs = envFiles
		.filter((file) => existsSync(file))
		.flatMap((file) => readFileSync(file, "utf8").split(/\r?\n/))
		.filter((line) => /^\s*[A-Z0-9_]+=/.test(line))
		.map((line) => {
			const eq = line.indexOf("=");
			const key = line.slice(0, eq).trim();
			const raw = line.slice(eq + 1).trim();
			const value = /^["']/.test(raw)
				? raw.replace(/^["']|["']$/g, "")
				: raw.replace(/(^|\s)#.*$/, "").trim();
			return [key, value] as [string, string];
		});

	// Published on purpose, so their *value* is public wherever it comes from.
	// A server-side key holding the same string as a `VITE_` one (e.g.
	// `APP_ORIGIN` and `VITE_APP_ORIGIN`) is not a leak when it shows up.
	const publicValues = new Set(
		pairs
			.filter(([key]) => /^(VITE_|PUBLIC_)/.test(key))
			.map(([, value]) => value)
			.filter((value) => value.length > 0),
	);

	return pairs.filter(
		([key, value]) =>
			value.length >= 8 &&
			!/^(VITE_|PUBLIC_)/.test(key) &&
			!CLIENT_SAFE_KEYS.has(key) &&
			!publicValues.has(value),
	);
}

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(path));
		else if (TEXT.test(entry.name)) out.push(path);
	}
	return out;
}

export function findClientBundleLeaks(
	clientDist: string = CLIENT_DIST,
	secrets: [string, string][] = secretValues(),
): string[] {
	const hits: string[] = [];
	for (const file of walk(clientDist)) {
		const source = readFileSync(file, "utf8");
		const name = relative(dirname(clientDist), file);
		for (const [label, pattern] of MARKERS) {
			if (pattern.test(source)) {
				hits.push(`${name}: server-only marker — ${label}`);
			}
		}
		for (const [key, value] of secrets) {
			if (source.includes(value)) hits.push(`${name}: literal value of ${key}`);
		}
	}
	return hits.sort();
}

if (import.meta.main) {
	if (!existsSync(CLIENT_DIST)) {
		console.error(
			`No client bundle at ${CLIENT_DIST} — run \`bun run build\` first.`,
		);
		process.exit(1);
	}
	const secrets = secretValues();
	const hits = findClientBundleLeaks(CLIENT_DIST, secrets);
	if (hits.length > 0) {
		console.error("Server-only code or secrets found in the client bundle:\n");
		console.error(hits.map((hit) => `  ${hit}`).join("\n"));
		console.error(
			"\nMove the offending code into a server-only module (import only from" +
				" server handlers / API routes).",
		);
		process.exit(1);
	}
	console.log(
		`check:client-bundle ok (${walk(CLIENT_DIST).length} files, ${secrets.length} secret values checked)`,
	);
}
