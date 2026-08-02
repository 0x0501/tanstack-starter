/**
 * The `user.update.before` guard for server-controlled columns.
 *
 * Better Auth **merges** a before-hook's result over the original data
 * (`actualData = { ...actualData, ...result.data }`), so omitting a key leaves
 * the caller's value in place. Strip-based defences silently no-op.
 *
 * So this refuses instead. No legitimate client sends these on an update.
 * Admin/plugin writes that must set role or ban go through `auth.api.*` admin
 * endpoints or drizzle, which do not run this hook the same way (or use
 * dedicated admin APIs).
 */
import { APIError } from "better-auth";

/** Server-controlled: never settable through the member update-user API. */
const PROTECTED_FIELDS = [
	"tokensRevokedAt",
	"role",
	"banned",
	"banReason",
	"banExpires",
] as const;

export function userUpdateGuard<T>(data: T): { data: T } {
	if (!data || typeof data !== "object") return { data };
	const present = PROTECTED_FIELDS.filter(
		(field) => (data as Record<string, unknown>)[field] !== undefined,
	);
	if (present.length > 0) {
		throw new APIError("BAD_REQUEST", {
			message: `These fields cannot be changed here: ${present.join(", ")}.`,
		});
	}
	return { data };
}
