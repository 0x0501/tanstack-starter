import { readFile } from "node:fs/promises";
import { parse } from "dotenv";

/**
 * Platform-required secrets for production deploy. Optional rails (GitHub,
 * Turnstile, payments) are not listed — clones add them when enabled.
 */
const REQUIRED_PRODUCTION_ENV = [
	"APP_ORIGIN",
	"BETTER_AUTH_URL",
	"BETTER_AUTH_SECRET",
	"EMAIL_FROM",
	"EMAIL_FROM_NAME",
] as const;

export async function validateProductionEnv(file = ".env.prod") {
	const values = parse(await readFile(file, "utf8"));
	const missing = REQUIRED_PRODUCTION_ENV.filter(
		(key) => !values[key]?.trim(),
	).sort();

	if (missing.length) {
		throw new Error(
			`Production deployment input is missing required values: ${missing.join(", ")}`,
		);
	}

	return values;
}

if (import.meta.main) {
	await validateProductionEnv();
	console.log("Production deployment input is complete.");
}
