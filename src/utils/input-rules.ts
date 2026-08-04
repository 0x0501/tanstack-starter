/**
 * Server-side field rules. A route's zod schema runs in the browser only —
 * Better Auth endpoints accept whatever is posted — so rules that matter live
 * here. Free-form text is hardened, not sanitized.
 */
import { HttpError } from "@/utils/api-error";

export const MAX_DISPLAY_NAME_LENGTH = 32;
export const MAX_PASSKEY_NAME_LENGTH = 64;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_EMAIL_LOCAL_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 32;

function isControl(cp: number, allowNewlines: boolean): boolean {
	if (allowNewlines && (cp === 0x0a || cp === 0x0d || cp === 0x09))
		return false;
	return (cp >= 0x00 && cp <= 0x1f) || (cp >= 0x7f && cp <= 0x9f);
}

function isBidiOverride(cp: number): boolean {
	return (
		(cp >= 0x202a && cp <= 0x202e) ||
		(cp >= 0x2066 && cp <= 0x2069) ||
		cp === 0x200e ||
		cp === 0x200f ||
		cp === 0x061c
	);
}

function isZeroWidth(cp: number): boolean {
	return (cp >= 0x200b && cp <= 0x200d) || cp === 0xfeff;
}

function hasControl(value: string, allowNewlines: boolean): boolean {
	for (const ch of value) {
		if (isControl(ch.codePointAt(0) ?? 0, allowNewlines)) return true;
	}
	return false;
}

function has(value: string, predicate: (cp: number) => boolean): boolean {
	for (const ch of value) {
		if (predicate(ch.codePointAt(0) ?? 0)) return true;
	}
	return false;
}

/**
 * A broken field rule, as a 400 rather than a bare `Error`.
 *
 * Extending `HttpError` is what carries `.status` across the wire (via the
 * adapter in `src/start.ts`) and what lets `userFacingMessage` show the rule to
 * the person who broke it. A plain `Error` here would reach the client with its
 * message stripped, so a refused display name would read as a server fault.
 */
export class InvalidFieldError extends HttpError {
	constructor(message: string) {
		super({ status: 400, error: "invalid_param", message });
		this.name = "InvalidFieldError";
	}
}

function assertNoInvisibles(value: string, field: string): void {
	if (has(value, isBidiOverride)) {
		throw new InvalidFieldError(
			`${field} cannot contain text-direction overrides.`,
		);
	}
	if (has(value, isZeroWidth)) {
		throw new InvalidFieldError(
			`${field} cannot contain invisible characters.`,
		);
	}
}

export function normalizeDisplayName(raw: string): string {
	const value = raw.normalize("NFKC").trim();
	if (!value) throw new InvalidFieldError("Name is required.");
	if (value.length > MAX_DISPLAY_NAME_LENGTH) {
		throw new InvalidFieldError(
			`Name is too long (maximum ${MAX_DISPLAY_NAME_LENGTH} characters).`,
		);
	}
	if (hasControl(value, false)) {
		throw new InvalidFieldError("Name cannot contain control characters.");
	}
	assertNoInvisibles(value, "Name");
	return value;
}

export function sanitizeDerivedDisplayName(raw: string): string {
	const value = [...raw.normalize("NFKC")]
		.filter((ch) => {
			const cp = ch.codePointAt(0) ?? 0;
			return !isControl(cp, false) && !isBidiOverride(cp) && !isZeroWidth(cp);
		})
		.join("")
		.trim()
		.slice(0, MAX_DISPLAY_NAME_LENGTH);
	return value || "User";
}

export function normalizeFreeformText(
	raw: string,
	field: string,
	maxLength: number,
): string {
	const value = raw.normalize("NFKC").trim();
	if (!value) throw new InvalidFieldError(`${field} is required.`);
	if (value.length > maxLength) {
		throw new InvalidFieldError(
			`${field} is too long (maximum ${maxLength} characters).`,
		);
	}
	if (hasControl(value, true)) {
		throw new InvalidFieldError(`${field} cannot contain control characters.`);
	}
	assertNoInvisibles(value, field);
	return value;
}

export function assertPasswordRules(password: string): void {
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new InvalidFieldError(
			`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
		);
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		throw new InvalidFieldError(
			`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
		);
	}
	if (!/\p{L}/u.test(password)) {
		throw new InvalidFieldError("Password must contain a letter.");
	}
	if (!/\p{Nd}/u.test(password)) {
		throw new InvalidFieldError("Password must contain a digit.");
	}
	if (!/[^\p{L}\p{Nd}]/u.test(password)) {
		throw new InvalidFieldError("Password must contain a symbol.");
	}
}

export function assertEmailLimits(email: string): void {
	if (email.length > MAX_EMAIL_LENGTH) {
		throw new InvalidFieldError(
			`Email must be at most ${MAX_EMAIL_LENGTH} characters.`,
		);
	}
	const at = email.lastIndexOf("@");
	const local = at === -1 ? email : email.slice(0, at);
	if (local.length > MAX_EMAIL_LOCAL_LENGTH) {
		throw new InvalidFieldError(
			`The part of the email before @ must be at most ${MAX_EMAIL_LOCAL_LENGTH} characters.`,
		);
	}
}

export function assertPasskeyName(name: string): void {
	normalizeFreeformText(name, "Passkey name", MAX_PASSKEY_NAME_LENGTH);
}

export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function assertLocale(locale: string): SupportedLocale {
	if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
		return locale as SupportedLocale;
	}
	throw new InvalidFieldError("That locale isn't supported.");
}
