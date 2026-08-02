/**
 * Second factor on social sign-in (ADR 0008).
 *
 * Better Auth's own 2FA hook matches only `/sign-in/email`,
 * `/sign-in/username` and `/sign-in/phone-number` — the matcher is hardcoded in
 * `better-auth/plugins/two-factor`, so it cannot be configured to cover the
 * OAuth callback. A 2FA-enrolled account signing in with GitHub therefore got a
 * complete, brand-new session with no code ever presented, which also cleared
 * every fresh-session gate (passkey enrolment among them).
 *
 * This reproduces the teardown the password path already performs: delete the
 * session row, clear the session cookie, null `newSession`, write the pending-
 * challenge verification records, set the signed `two_factor` cookie. Because
 * no session exists, every authenticated surface refuses the pending state by
 * construction — no `aal`/`amr` flag to remember to check.
 *
 * One difference: the callback answers with a redirect rather than JSON, so
 * instead of returning `{ twoFactorRedirect: true }` this rewrites the redirect
 * target to the two-factor page, carrying the original destination.
 */
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie, expireCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

/** Better Auth's own `two_factor` cookie name — not publicly re-exported. */
const TWO_FACTOR_COOKIE = "two_factor";

/** Ditto for `trust_device`, written by `/two-factor/verify-totp`. */
const TRUST_DEVICE_COOKIE = "trust_device";

/** `twoFactorCookieMaxAge ?? 600` in the twoFactor plugin; we leave it unset. */
const CHALLENGE_MAX_AGE_SEC = 600;

/** `trustDeviceMaxAge ?? 2592e3` in the twoFactor plugin; also left unset. */
const TRUST_DEVICE_MAX_AGE_SEC = 2592e3;

/** Where the browser lands to answer the challenge. */
const TWO_FACTOR_PAGE = "/two-factor";

// Returns the literal shape rather than a widened `BetterAuthPlugin`: annotating
// the broad type erases the sibling plugins' endpoints from `auth.api`.
export function socialTwoFactor() {
	return {
		id: "social-two-factor",
		hooks: {
			after: [
				{
					// The route is registered as `/callback/:id`; the dispatcher sets
					// `path` to the route pattern, not the concrete provider path.
					matcher(ctx) {
						return ctx.path === "/callback/:id";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const data = ctx.context.newSession;
						// Null on the account-link arm, on every redirectOnError path,
						// and on the POST form_post pre-redirect arm.
						if (!data) return;
						if (!data.user.twoFactorEnabled) return;

						// "Trust this device" is offered on our own challenge page, so
						// it has to be honoured here too — otherwise the checkbox only
						// ever works for the password path that wrote the cookie.
						if (await deviceIsTrusted(ctx, data.user.id)) return;

						// Same teardown, same order, as the password path.
						// `true` = skipDontRememberMe: verify-totp reads that cookie
						// later to decide the session lifetime.
						deleteSessionCookie(ctx, true);
						await ctx.context.internalAdapter.deleteSession(data.session.token);
						ctx.context.setNewSession(null);

						const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, {
							maxAge: CHALLENGE_MAX_AGE_SEC,
						});
						const identifier = `2fa-${generateRandomString(20)}`;
						const expiresAt = new Date(
							Date.now() + CHALLENGE_MAX_AGE_SEC * 1000,
						);
						await ctx.context.internalAdapter.createVerificationValue({
							value: data.user.id,
							identifier,
							expiresAt,
						});
						await ctx.context.internalAdapter.createVerificationValue({
							value: "0",
							identifier: `2fa-attempts-${identifier}`,
							expiresAt,
						});
						await ctx.setSignedCookie(
							cookie.name,
							identifier,
							ctx.context.secret,
							cookie.attributes,
						);

						// The callback answers with a 302, so send the browser to the
						// challenge instead of stranding it with a JSON body. The
						// original destination rides along so it is not lost.
						const target = new URL(TWO_FACTOR_PAGE, ctx.context.baseURL);
						const original = ctx.context.responseHeaders?.get("location");
						if (original) {
							target.searchParams.set(
								"redirect",
								toRelative(original, ctx.context.baseURL),
							);
						}
						throw ctx.redirect(`${target.pathname}${target.search}`);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}

/** `GenericEndpointContext`; `@better-auth/core` is not a resolvable import. */
type HookContext = Parameters<typeof expireCookie>[0];

/**
 * The password path's trust-device check, verbatim (`two-factor/index.mjs`):
 * the cookie carries `${token}!${identifier}`, the token is an HMAC over
 * `${user.id}!${identifier}`, and the identifier must still resolve to a live
 * verification row holding that same user id. A match rotates both record and
 * cookie; anything else expires the cookie and falls through to the challenge.
 */
async function deviceIsTrusted(ctx: HookContext, userId: string) {
	const attrs = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE, {
		maxAge: TRUST_DEVICE_MAX_AGE_SEC,
	});
	const cookie = await ctx.getSignedCookie(attrs.name, ctx.context.secret);
	if (!cookie) return false;

	const [token, identifier] = cookie.split("!");
	if (token && identifier && token === (await sign(ctx, userId, identifier))) {
		const record =
			await ctx.context.internalAdapter.findVerificationValue(identifier);
		if (record && record.value === userId && record.expiresAt > new Date()) {
			await ctx.context.internalAdapter.deleteVerificationByIdentifier(
				identifier,
			);
			const next = `trust-device-${generateRandomString(32)}`;
			await ctx.context.internalAdapter.createVerificationValue({
				value: userId,
				identifier: next,
				expiresAt: new Date(Date.now() + TRUST_DEVICE_MAX_AGE_SEC * 1000),
			});
			await ctx.setSignedCookie(
				attrs.name,
				`${await sign(ctx, userId, next)}!${next}`,
				ctx.context.secret,
				attrs.attributes,
			);
			return true;
		}
	}
	expireCookie(ctx, attrs);
	return false;
}

/**
 * `createHMAC("SHA-256", "base64urlnopad").sign` — `@better-auth/utils` is a
 * transitive dependency of better-auth, not one we can import.
 */
async function sign(ctx: HookContext, userId: string, identifier: string) {
	const bytes = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		bytes.encode(ctx.context.secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		bytes.encode(`${userId}!${identifier}`),
	);
	return btoa(String.fromCharCode(...new Uint8Array(signature)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Keep same-origin redirects relative; drop anything pointing elsewhere. */
function toRelative(location: string, baseURL: string): string {
	try {
		const url = new URL(location, baseURL);
		const base = new URL(baseURL);
		if (url.origin !== base.origin) return "/";
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return "/";
	}
}
