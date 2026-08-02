/**
 * Server-side field rules on the Better Auth HTTP surface (ADR 0008).
 *
 * The sign-up form's zod schema runs in the browser only, so these endpoints
 * accept whatever is posted. Rules that need the raw request body — password
 * composition, email limits — are enforced here, before Better Auth hashes or
 * stores anything. Rules that belong to a stored column (e.g. display name)
 * live in `databaseHooks` instead, so they cover every writer.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
	assertEmailLimits,
	assertPasswordRules,
	InvalidFieldError,
} from "@/utils/input-rules";

/**
 * The paths that *set* a password, and the body field each uses.
 *
 * Sign-in is deliberately absent: an account whose stored password predates the
 * 32-character maximum keeps working until its owner changes it. So are the
 * paths that take a password to *prove* identity (`/two-factor/enable`,
 * `/delete-user`) — the same reason.
 */
const PASSWORD_FIELD_BY_PATH: Record<string, "password" | "newPassword"> = {
	"/sign-up/email": "password",
	"/reset-password": "newPassword",
	"/change-password": "newPassword",
	"/email-otp/reset-password": "password",
	"/admin/create-user": "password",
	"/admin/set-user-password": "newPassword",
};

/** The paths that accept an address we will store. */
const EMAIL_PATHS = new Set([
	"/sign-up/email",
	"/change-email",
	"/email-otp/change-email",
	"/admin/create-user",
	"/admin/update-user",
]);

export function fieldRules() {
	return {
		id: "field-rules",
		hooks: {
			before: [
				{
					matcher(ctx) {
						const path = ctx.path ?? "";
						return path in PASSWORD_FIELD_BY_PATH || EMAIL_PATHS.has(path);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const body = ctx.body as Record<string, unknown> | undefined;
						if (!body) return;
						const path = ctx.path ?? "";

						try {
							const passwordField = PASSWORD_FIELD_BY_PATH[path];
							if (passwordField) {
								const password = body[passwordField];
								if (typeof password === "string") assertPasswordRules(password);
							}
							if (EMAIL_PATHS.has(path)) {
								// `/admin/update-user` posts `{ userId, data }`, so the
								// address arrives nested; every other path is flat.
								const fields =
									(body.data as Record<string, unknown> | undefined) ?? body;
								const email = fields.email ?? fields.newEmail;
								if (typeof email === "string") assertEmailLimits(email.trim());
							}
						} catch (error) {
							if (error instanceof InvalidFieldError) {
								throw new APIError("BAD_REQUEST", { message: error.message });
							}
							throw error;
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
