/**
 * Re-registering an address that already has an account (ADR 0008).
 *
 * Stock Better Auth answers a duplicate sign-up with a synthetic success and
 * silently discards the submitted password — so a consumer who "fixed a typo"
 * by re-registering could never sign in after clicking the link. The previous
 * fix stored the second password instead, which handed the account to anyone
 * who merely knew the address: they re-register with a password of their
 * choosing, the victim clicks the link *they* already received, and the account
 * verifies under the attacker's password.
 *
 * So: re-registration writes nothing at all — not the password, not the name,
 * not any other field, whatever the account's verification state. It re-sends
 * the verification link when the account is still unverified (the one
 * legitimate reason to re-register), and it tells the user the address is
 * already registered.
 *
 * That message is deliberately **the same for verified and unverified
 * accounts**. Differing copy would turn the endpoint into a finer oracle,
 * distinguishing three states (absent / unverified / verified) instead of two.
 * Disclosing existence at all is accepted here because the endpoint sits behind
 * Turnstile and rate limiting, and the alternative was a silent credential
 * overwrite.
 */
import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	createEmailVerificationToken,
} from "better-auth/api";

export const EMAIL_ALREADY_REGISTERED_MESSAGE =
	"This email is already registered. We've sent a verification link if it still needs one — otherwise sign in, or reset your password.";

export function existingEmailSignup() {
	return {
		id: "existing-email-signup",
		hooks: {
			before: [
				{
					matcher(ctx) {
						return ctx.path === "/sign-up/email";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const body = ctx.body as
							| { email?: unknown; callbackURL?: unknown }
							| undefined;
						const email =
							typeof body?.email === "string" ? body.email.trim() : "";
						if (!email) return;

						const existing = await ctx.context.internalAdapter.findUserByEmail(
							email.toLowerCase(),
						);
						if (!existing?.user) return;

						const send =
							ctx.context.options.emailVerification?.sendVerificationEmail;
						if (!existing.user.emailVerified && send) {
							const token = await createEmailVerificationToken(
								ctx.context.secret,
								existing.user.email,
								undefined,
								ctx.context.options.emailVerification?.expiresIn,
							);
							const callbackURL =
								typeof body?.callbackURL === "string" && body.callbackURL
									? encodeURIComponent(body.callbackURL)
									: encodeURIComponent("/");
							const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
							await ctx.context.runInBackgroundOrAwait(
								send({ user: existing.user, url, token }, ctx.request),
							);
						}

						// One message for any existing address — see the note above.
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: EMAIL_ALREADY_REGISTERED_MESSAGE,
							code: "USER_ALREADY_EXISTS",
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
