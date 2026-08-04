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

/**
 * Values `.env.example` ships so a fresh clone boots. Present is not the same as
 * set: copying the example forward would otherwise deploy a secret published in
 * this repository, and a presence check alone cannot tell the two apart.
 */
const DEV_PLACEHOLDERS: Partial<Record<string, string>> = {
	BETTER_AUTH_SECRET: "dev-only-insecure-secret-change-before-deploy",
};

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

	const placeholders = REQUIRED_PRODUCTION_ENV.filter(
		(key) => values[key]?.trim() === DEV_PLACEHOLDERS[key],
	).sort();

	if (placeholders.length) {
		throw new Error(
			`Production deployment input still carries .env.example dev placeholders: ${placeholders.join(", ")}`,
		);
	}

	return values;
}

if (import.meta.main) {
	await validateProductionEnv();
	console.log("Production deployment input is complete.");
}
