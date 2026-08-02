/**
 * Account-security domain logic (CONTEXT.md "Account security").
 *
 * Verified-email invariant: every account's email is verified. GitHub
 * sign-up may only proceed when GitHub supplies an email it has itself
 * verified — otherwise the attempt fails outright (no user, no session).
 */

import { APIError } from "better-auth";
import {
	generateRandomString,
	type SecretConfig,
	symmetricEncrypt,
} from "better-auth/crypto";

/** Adapter where-clause slice: no operator means equality. */
type SecurityWhere = {
	field: string;
	value: string | Date;
	operator?: "starts_with" | "gt";
};

/**
 * The slice of a Better Auth instance this service needs. Structural on
 * purpose: production `createAuth(db)` satisfies it, and tests can build a
 * minimal instance without the full plugin stack. `$context` is used for
 * the second-factor attempt counter, the OTP resend cooldown, the
 * stale-session replacement and the password-free two-factor mutations —
 * none of which have public api endpoints.
 */
export type SecurityAuth = {
	api: {
		// `disableCookieCache` forces a database read. Every credential-change
		// gate below must pass it: the signed cookie-cache blob keeps answering
		// for up to `cookieCache.maxAge` (60s) after the session row is deleted,
		// so a plain read lets a caller whose session was just evicted from
		// another browser — or wiped by `revokeSessionsOnPasswordReset` mid-flow —
		// pass the gate, mutate the credential, and only then hit the 401 that
		// `revokeOtherSessions`/`replaceSession` (authoritative reads) raise.
		getSession(ctx: {
			headers: Headers;
			query?: { disableCookieCache?: boolean };
		}): Promise<{
			user: { id: string; email: string; twoFactorEnabled?: boolean | null };
			session: { token: string; createdAt: Date | string };
		} | null>;
		requestPasswordResetEmailOTP(ctx: {
			body: { email: string };
		}): Promise<unknown>;
		resetPasswordEmailOTP(ctx: {
			body: { email: string; otp: string; password: string };
		}): Promise<unknown>;
		checkVerificationOTP(ctx: {
			body: { email: string; type: "forget-password" | "sign-in"; otp: string };
		}): Promise<unknown>;
		revokeOtherSessions(ctx: { headers: Headers }): Promise<unknown>;
		sendVerificationOTP(ctx: {
			body: { email: string; type: "sign-in" };
		}): Promise<unknown>;
		verifyTOTP(ctx: {
			body: { code: string };
			headers: Headers;
		}): Promise<unknown>;
		verifyBackupCode(ctx: {
			body: { code: string };
			headers: Headers;
		}): Promise<unknown>;
		createVerificationOTP(ctx: {
			body: { email: string; type: "sign-in" };
		}): Promise<string>;
		signInEmailOTP(ctx: {
			body: { email: string; otp: string };
			headers: Headers;
		}): Promise<unknown>;
	};
	$context: Promise<{
		secretConfig: string | SecretConfig;
		adapter: {
			count(args: { model: string; where: SecurityWhere[] }): Promise<number>;
			create(args: {
				model: string;
				data: Record<string, unknown>;
			}): Promise<unknown>;
			update(args: {
				model: string;
				where: SecurityWhere[];
				update: Record<string, unknown>;
			}): Promise<unknown>;
			deleteMany(args: {
				model: string;
				where: SecurityWhere[];
			}): Promise<unknown>;
		};
		internalAdapter: {
			createVerificationValue(value: {
				identifier: string;
				value: string;
				expiresAt: Date;
			}): Promise<unknown>;
			findVerificationValue(
				identifier: string,
			): Promise<{ expiresAt: Date | string } | null | undefined>;
			deleteVerificationByIdentifier(identifier: string): Promise<unknown>;
			deleteSession(token: string): Promise<unknown>;
			updateUser(
				userId: string,
				data: Record<string, unknown>,
			): Promise<unknown>;
		};
	}>;
};

// -------------------------------------------------------- session eviction

/** Everything `evictOtherSessions` needs — satisfied by every auth slice here. */
type RevocableAuth = {
	api: { revokeOtherSessions(ctx: { headers: Headers }): Promise<unknown> };
};

/**
 * The account-security invariant (CONTEXT.md "Account security"): a change to
 * a credential or to a second factor signs out every session on the account
 * except the caller's own. Written down once so a seventh credential-changing
 * flow cannot silently omit it.
 *
 * Two ordering rules, both load-bearing:
 * - it authenticates by the caller's *current* cookie, so it must run before
 *   `replaceSession` — afterwards that cookie names a deleted row;
 * - it is an `auth.api.*` call on a different pooled connection, so in any
 *   handler that also writes `context.db` it comes first (AGENTS.md).
 */
async function evictOtherSessions(
	auth: RevocableAuth,
	headers: Headers,
): Promise<void> {
	await auth.api.revokeOtherSessions({ headers });
}

// ------------------------------------------------------------ send cooldown

const OTP_RESEND_COOLDOWN_SECONDS = 30;

export type OtpSendResult =
	| { ok: true; retryAfterSeconds: number }
	| {
			ok: false;
			code: "unauthorized" | "totp_required" | "cooldown";
			retryAfterSeconds?: number;
	  };

/**
 * Server-side resend throttle shared by every OTP email flow: one send per
 * user per flow per 30s window. The UI countdown mirrors
 * `retryAfterSeconds`, but this gate is the authority — closing the modal
 * or reloading the page cannot sidestep it.
 */
async function otpSendGate(
	auth: SecurityAuth,
	kind: "password" | "reauth",
	userId: string,
): Promise<OtpSendResult> {
	const { internalAdapter } = await auth.$context;
	const identifier = `otp-cooldown-${kind}-${userId}`;
	const existing = await internalAdapter.findVerificationValue(identifier);
	if (existing) {
		const remainingMs = new Date(existing.expiresAt).getTime() - Date.now();
		if (remainingMs > 0)
			return {
				ok: false,
				code: "cooldown",
				retryAfterSeconds: Math.ceil(remainingMs / 1000),
			};
		await internalAdapter.deleteVerificationByIdentifier(identifier);
	}
	await internalAdapter.createVerificationValue({
		identifier,
		value: "1",
		expiresAt: new Date(Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000),
	});
	return { ok: true, retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
}

/**
 * The cooldown throttles sends while a code is in flight — once the code is
 * consumed, the next flow may send immediately (e.g. opening the 2FA-enable
 * dialog right after a re-auth spent the previous code).
 */
async function clearOtpCooldown(
	auth: SecurityAuth,
	kind: "password" | "reauth",
	userId: string,
): Promise<void> {
	const { internalAdapter } = await auth.$context;
	await internalAdapter.deleteVerificationByIdentifier(
		`otp-cooldown-${kind}-${userId}`,
	);
}

// -------------------------------------------------------- password change

export type PasswordChangeResult =
	| { ok: true }
	| {
			ok: false;
			code:
				| "unauthorized"
				| "invalid_otp"
				| "invalid_password"
				| "too_many_attempts";
	  };

/**
 * Email a password-change OTP to the calling session's own verified email.
 * The email is taken from the session, never from client input.
 */
export async function requestPasswordChangeOtp(
	auth: SecurityAuth,
	headers: Headers,
): Promise<OtpSendResult> {
	const session = await auth.api.getSession({ headers });
	if (!session) return { ok: false, code: "unauthorized" };
	const gate = await otpSendGate(auth, "password", session.user.id);
	if (!gate.ok) return gate;
	await auth.api.requestPasswordResetEmailOTP({
		body: { email: session.user.email },
	});
	return gate;
}

/**
 * Step-1 verification for the two-modal password flow: proves the code is
 * right WITHOUT consuming it (Better Auth's check endpoint only burns
 * attempts on wrong guesses), so the same code still authorizes the actual
 * change in step 2. Wrong guesses here count against the shared 3-attempt
 * budget of the code.
 */
export async function checkPasswordChangeOtp(
	auth: SecurityAuth,
	headers: Headers,
	input: { otp: string },
): Promise<PasswordChangeResult> {
	const session = await auth.api.getSession({ headers });
	if (!session) return { ok: false, code: "unauthorized" };
	try {
		await auth.api.checkVerificationOTP({
			body: {
				email: session.user.email,
				type: "forget-password",
				otp: input.otp,
			},
		});
	} catch (err) {
		if (err instanceof APIError) {
			const status = (err as { statusCode?: number }).statusCode;
			return {
				ok: false,
				code: status === 403 ? "too_many_attempts" : "invalid_otp",
			};
		}
		throw err;
	}
	return { ok: true };
}

/**
 * OTP-gated password change (CONTEXT.md "Account security"): verify the OTP,
 * set the new password (creating the credential for passwordless users),
 * then force every session except the caller's off.
 */
export async function changePasswordWithOtp(
	auth: SecurityAuth,
	headers: Headers,
	input: { otp: string; newPassword: string },
): Promise<PasswordChangeResult> {
	const session = await auth.api.getSession({ headers });
	if (!session) return { ok: false, code: "unauthorized" };
	try {
		await auth.api.resetPasswordEmailOTP({
			body: {
				email: session.user.email,
				otp: input.otp,
				password: input.newPassword,
			},
		});
	} catch (err) {
		if (err instanceof APIError) {
			const status = (err as { statusCode?: number }).statusCode;
			if (status === 403) return { ok: false, code: "too_many_attempts" };
			return {
				ok: false,
				code:
					status === 400 && /password/i.test(err.message ?? "")
						? "invalid_password"
						: "invalid_otp",
			};
		}
		throw err;
	}
	// Two shapes, one outcome: the caller signed in and nobody else. Which one
	// applies depends on `revokeSessionsOnPasswordReset`, which the reset-by-link
	// arm needs ON and which this OTP endpoint honours too — when it fires, the
	// account-wide wipe has already taken the caller's own session with it, so
	// they get a replacement rather than an eviction they can no longer authorize.
	// The probe must bypass the cookie cache, or under that flag it reports the
	// just-deleted session as alive and takes the eviction branch, which then
	// 401s with the password already changed and no session left.
	if (
		await auth.api.getSession({ headers, query: { disableCookieCache: true } })
	) {
		await evictOtherSessions(auth, headers);
	} else {
		await replaceSession(
			auth,
			session.user.email,
			headers,
			session.session.token,
		);
	}
	await clearOtpCooldown(auth, "password", session.user.id);
	return { ok: true };
}

// -------------------------------------------------- fresh-session re-auth

export type ReauthResult =
	| { ok: true }
	| {
			ok: false;
			code:
				| "unauthorized"
				| "totp_required"
				| "invalid_code"
				| "too_many_attempts";
	  };

const REAUTH_ATTEMPT_PREFIX = "reauth-totp-attempt-";
const REAUTH_ATTEMPT_LIMIT = 5;
const REAUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Email a re-auth code to the calling session's own email — the no-2FA arm
 * of the fresh-session challenge. Refused when 2FA is on: the authenticator
 * (or a backup code) is the factor then, and a sign-in OTP would sidestep
 * it.
 */
export async function requestReauthOtp(
	auth: SecurityAuth,
	headers: Headers,
): Promise<OtpSendResult> {
	const session = await auth.api.getSession({ headers });
	if (!session) return { ok: false, code: "unauthorized" };
	if (session.user.twoFactorEnabled)
		return { ok: false, code: "totp_required" };
	const gate = await otpSendGate(auth, "reauth", session.user.id);
	if (!gate.ok) return gate;
	await auth.api.sendVerificationOTP({
		body: { email: session.user.email, type: "sign-in" },
	});
	return gate;
}

/**
 * Fresh-session re-auth (sudo mode). Passkey registration and account
 * unlinking sit behind Better Auth's freshSessionMiddleware, which compares
 * `session.createdAt` against `freshAge` — the only way through is a newly
 * minted session. The caller re-proves identity (TOTP or a single-use
 * backup code when 2FA is on, the emailed code otherwise) and on success a
 * one-shot sign-in OTP is created server-side (never emailed) and redeemed
 * via `signInEmailOTP`, whose fresh session cookie reaches the browser
 * through tanstackStartCookies.
 *
 * `/sign-in/email-otp` bypassing the 2FA hook is safe here: the HTTP path is
 * in disabledPaths, and this server-side call happens only after the factor
 * appropriate to the account was just verified.
 */
export async function reauthenticate(
	auth: SecurityAuth,
	headers: Headers,
	input: { code: string; backupCode?: boolean },
): Promise<ReauthResult> {
	const session = await auth.api.getSession({ headers });
	if (!session) return { ok: false, code: "unauthorized" };
	const email = session.user.email;

	if (session.user.twoFactorEnabled) {
		const verified = await verifySecondFactor(auth, headers, session.user.id, {
			code: input.code,
			backupCode: input.backupCode,
		});
		if (!verified.ok) return verified;
		await replaceSession(auth, email, headers, session.session.token);
		return { ok: true };
	}

	try {
		// Wrong-code budget is the plugin's own allowedAttempts (3 per code).
		// Redeeming the code IS the fresh-session mint for this arm.
		await auth.api.signInEmailOTP({
			body: { email, otp: input.code },
			headers,
		});
	} catch (err) {
		if (err instanceof APIError) {
			const status = (err as { statusCode?: number }).statusCode;
			return {
				ok: false,
				code: status === 403 ? "too_many_attempts" : "invalid_code",
			};
		}
		throw err;
	}
	// The browser just overwrote its cookie with the fresh session's, so the
	// stale token must not stay redeemable.
	const { internalAdapter } = await auth.$context;
	await internalAdapter.deleteSession(session.session.token);
	await clearOtpCooldown(auth, "reauth", session.user.id);
	return { ok: true };
}

/**
 * Mint a brand-new session for the caller and revoke their current one.
 * Mechanism: a one-shot sign-in OTP created server-side (never emailed) and
 * redeemed immediately — the only sanctioned session-minting door reachable
 * from here. The fresh cookie reaches the browser via tanstackStartCookies;
 * with the cookie session cache enabled it also refreshes the cached user
 * snapshot (e.g. after twoFactorEnabled flips).
 */
async function replaceSession(
	auth: SecurityAuth,
	email: string,
	headers: Headers,
	staleToken: string,
): Promise<void> {
	const otp = await auth.api.createVerificationOTP({
		body: { email, type: "sign-in" },
	});
	await auth.api.signInEmailOTP({ body: { email, otp }, headers });
	const { internalAdapter } = await auth.$context;
	await internalAdapter.deleteSession(staleToken);
}

/**
 * Prove the caller's second factor (TOTP, or a single-use backup code) under
 * the shared attempt gate. Used by every 2FA-sensitive mutation.
 */
async function verifySecondFactor(
	auth: SecurityAuth,
	headers: Headers,
	userId: string,
	input: { code: string; backupCode?: boolean },
): Promise<
	{ ok: true } | { ok: false; code: "invalid_code" | "too_many_attempts" }
> {
	const gate = await recordSecondFactorAttempt(auth, userId);
	if (!gate.ok) return gate;
	try {
		if (input.backupCode)
			await auth.api.verifyBackupCode({ body: { code: input.code }, headers });
		else await auth.api.verifyTOTP({ body: { code: input.code }, headers });
	} catch (err) {
		if (err instanceof APIError) return { ok: false, code: "invalid_code" };
		throw err;
	}
	await gate.clear();
	return { ok: true };
}

/**
 * Attempt gate for the 2FA arm (TOTP and backup codes): the session-scoped
 * verify endpoints have no built-in throttle, and server-side api calls
 * skip HTTP rate limiting — without this, a stolen session cookie could
 * brute-force the 6-digit space. Insert-then-count so parallel bursts see
 * each other's rows (a read-modify-write counter would let a flood
 * through). Rows expire with the window; a successful re-auth clears them.
 */
async function recordSecondFactorAttempt(
	auth: SecurityAuth,
	userId: string,
): Promise<
	| { ok: false; code: "too_many_attempts" }
	| { ok: true; clear: () => Promise<unknown> }
> {
	const ctx = await auth.$context;
	const prefix = `${REAUTH_ATTEMPT_PREFIX}${userId}-`;
	await ctx.internalAdapter.createVerificationValue({
		identifier: `${prefix}${crypto.randomUUID()}`,
		value: "1",
		expiresAt: new Date(Date.now() + REAUTH_ATTEMPT_WINDOW_MS),
	});
	const attempts = await ctx.adapter.count({
		model: "verification",
		where: [
			{ field: "identifier", operator: "starts_with", value: prefix },
			{ field: "expiresAt", operator: "gt", value: new Date() },
		],
	});
	if (attempts > REAUTH_ATTEMPT_LIMIT)
		return { ok: false, code: "too_many_attempts" };
	return {
		ok: true,
		clear: () =>
			ctx.adapter.deleteMany({
				model: "verification",
				where: [
					{ field: "identifier", operator: "starts_with", value: prefix },
				],
			}),
	};
}

// ---------------------------------------------------- passkey removal (fresh)

/**
 * Focused slice for passkey removal — the only operation here that needs the
 * delete endpoint and the freshness config. Kept separate from SecurityAuth
 * so callers/tests that never touch passkeys aren't forced to include the
 * passkey plugin.
 */
/** All the freshness gate itself needs — no passkey plugin required. */
export type FreshSessionAuth = {
	api: {
		getSession(ctx: {
			headers: Headers;
			query?: { disableCookieCache?: boolean };
		}): Promise<{
			session: { createdAt: Date | string };
		} | null>;
	};
	$context: Promise<{ sessionConfig: { freshAge: number } }>;
};

export type PasskeyRemovalAuth = FreshSessionAuth &
	RevocableAuth & {
		api: {
			deletePasskey(ctx: {
				body: { id: string };
				headers: Headers;
			}): Promise<unknown>;
		};
	};

export type PasskeyRemoveResult =
	| { ok: true }
	| { ok: false; code: "unauthorized" | "not_fresh" };

/**
 * Whether the session clears Better Auth's freshness bar, replicating
 * `freshSessionMiddleware` exactly (`sessionConfig.freshAge`, 0 = disabled).
 * The fresh check must be identical to the one guarding passkey ADD so the
 * two operations demand the same proof of a recent login.
 */
async function isSessionFresh(
	auth: FreshSessionAuth,
	createdAt: Date | string,
	maxAgeSeconds?: number,
): Promise<boolean> {
	const { sessionConfig } = await auth.$context;
	const freshAge = maxAgeSeconds ?? sessionConfig.freshAge;
	if (freshAge === 0) return true;
	const age = Date.now() - new Date(createdAt).getTime();
	return age < freshAge * 1000;
}

/**
 * How recently a session must have proved itself for high-risk product
 * mutations (short “sudo” window; see ADR 0008).
 *
 * Deliberately far shorter than Better Auth's `freshAge` (24h), which the
 * passkey gates use: a cookie stolen from someone who signed in this morning
 * clears 24h without proving anything, which is exactly the theft this is meant
 * to stop. `reauthenticate` mints a new session in both arms, so the retried
 * operation lands inside this window. The Starter documents the constant;
 * product pages that use it live in clones.
 */
export const MONEY_REAUTH_MAX_AGE_SECONDS = 5 * 60;

/**
 * The shared gate behind every operation that demands a recent proof of
 * identity. Defaults to Better Auth's own freshness bar, so the passkey paths
 * keep asking for exactly what they asked for before; high-risk product
 * operations may pass the short sudo window above.
 *
 * A refusal is a *code*, not a throw: the UI turns `not_fresh` into the
 * re-authentication dialog and replays the original call, and an operation the
 * user abandons at that prompt has changed nothing.
 */
export async function requireFreshSession(
	auth: FreshSessionAuth,
	headers: Headers,
	maxAgeSeconds: number = MONEY_REAUTH_MAX_AGE_SECONDS,
): Promise<{ ok: true } | { ok: false; code: "unauthorized" | "not_fresh" }> {
	// Authoritative read: a freshness gate must never trust the cookie cache,
	// which would report a just-evicted session as still present (and fresh).
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!session) return { ok: false, code: "unauthorized" };
	if (!(await isSessionFresh(auth, session.session.createdAt, maxAgeSeconds))) {
		return { ok: false, code: "not_fresh" };
	}
	return { ok: true };
}

/**
 * Remove a passkey behind the SAME fresh-session gate as adding one. Better
 * Auth's `/passkey/delete-passkey` uses only `sessionMiddleware`, so a stolen
 * stale cookie could otherwise strip a victim's passkeys (a security
 * downgrade / lock-out) even though it cannot add one. A stale session gets
 * `not_fresh`, which the UI turns into the re-auth dialog (TOTP for 2FA
 * users) and retries — matching passkey addition and account unlink.
 *
 * Retiring a sign-in credential evicts every other session: the device whose
 * passkey this was must not keep a live session on the account.
 */
export async function removePasskeyWithFreshSession(
	auth: PasskeyRemovalAuth,
	headers: Headers,
	input: { passkeyId: string },
): Promise<PasskeyRemoveResult> {
	const { sessionConfig } = await auth.$context;
	const fresh = await requireFreshSession(
		auth,
		headers,
		sessionConfig.freshAge,
	);
	if (!fresh.ok) return fresh;
	await auth.api.deletePasskey({ body: { id: input.passkeyId }, headers });
	await evictOtherSessions(auth, headers);
	return { ok: true };
}

// ------------------------------------------- two-factor management (no password)

/**
 * Single source for the TOTP issuer — `twoFactor({ issuer })` in the auth
 * config must use this same value so enrollment URIs stay consistent.
 */
export const TWO_FACTOR_ISSUER = "Starter";

export type TwoFactorEnableResult =
	| { ok: true; totpURI: string; backupCodes: string[] }
	| {
			ok: false;
			code:
				| "unauthorized"
				| "invalid_otp"
				| "too_many_attempts"
				| "already_enabled";
	  };

export type TwoFactorManageResult =
	| { ok: true }
	| {
			ok: false;
			code:
				| "unauthorized"
				| "not_enabled"
				| "invalid_code"
				| "too_many_attempts";
	  };

export type BackupCodesResult =
	| { ok: true; backupCodes: string[] }
	| Extract<TwoFactorManageResult, { ok: false }>;

/** RFC 4648 base32 (unpadded) — how otpauth URIs carry the raw secret. */
function base32Encode(input: string): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of new TextEncoder().encode(input)) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
	return out;
}

/** Same shape as Better Auth's default backup codes: 10 × `xxxxx-xxxxx`. */
function newBackupCodes(): string[] {
	return Array.from({ length: 10 }, () => {
		const code = generateRandomString(10, "a-z", "0-9", "A-Z");
		return `${code.slice(0, 5)}-${code.slice(5)}`;
	});
}

/** Better Auth's default at-rest format for the twoFactor.backupCodes
 * column: the JSON array encrypted with the auth secret (pinned by the
 * round-trip tests against the official verify endpoint). */
function encodeBackupCodes(
	secretConfig: string | SecretConfig,
	codes: string[],
): Promise<string> {
	return symmetricEncrypt({ key: secretConfig, data: JSON.stringify(codes) });
}

/**
 * Enable 2FA gated by an emailed one-time code — never a password (the
 * password may be exactly what the user no longer trusts, and GitHub-only
 * users have none). Better Auth's own `/two-factor/enable` cannot skip the
 * password check for credential users, so this replicates its mutation
 * (same secret encryption via `symmetricEncrypt`, same plaintext-JSON
 * backup-code storage as our config) and the round-trip is pinned by tests
 * against the official verify endpoints. The HTTP management endpoints are
 * in disabledPaths; this is the only enable path.
 *
 * `twoFactorEnabled` stays false until the user confirms a code from their
 * app (the official enrollment completion via `/two-factor/verify-totp`).
 *
 * The other sessions go at this point rather than at that confirmation: this
 * is the step that proves control of the verified email, and it is the only
 * enable path, so the invariant cannot be reached from the plugin's own
 * `/two-factor/verify-totp` — which also serves the routine sign-in challenge
 * and must never sign a returning user out of their other devices. The cost
 * is that abandoning enrolment after the QR code still evicts them.
 */
export async function enableTwoFactorWithOtp(
	auth: SecurityAuth,
	headers: Headers,
	input: { otp: string },
): Promise<TwoFactorEnableResult> {
	// Authoritative: the flow evicts every other session after writing the
	// twoFactor row, so a caller whose own row is already gone must be refused
	// here — before the write — not left with a written row and a thrown 401.
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!session) return { ok: false, code: "unauthorized" };
	if (session.user.twoFactorEnabled)
		return { ok: false, code: "already_enabled" };
	try {
		await auth.api.checkVerificationOTP({
			body: { email: session.user.email, type: "sign-in", otp: input.otp },
		});
	} catch (err) {
		if (err instanceof APIError) {
			const status = (err as { statusCode?: number }).statusCode;
			return {
				ok: false,
				code: status === 403 ? "too_many_attempts" : "invalid_otp",
			};
		}
		throw err;
	}
	const ctx = await auth.$context;
	const secret = generateRandomString(32);
	const backupCodes = newBackupCodes();
	// Replaces any abandoned enrollment for this user.
	await ctx.adapter.deleteMany({
		model: "twoFactor",
		where: [{ field: "userId", value: session.user.id }],
	});
	await ctx.adapter.create({
		model: "twoFactor",
		data: {
			secret: await symmetricEncrypt({ key: ctx.secretConfig, data: secret }),
			backupCodes: await encodeBackupCodes(ctx.secretConfig, backupCodes),
			userId: session.user.id,
			verified: false,
		},
	});
	await evictOtherSessions(auth, headers);
	const issuer = encodeURIComponent(TWO_FACTOR_ISSUER);
	const totpURI = `otpauth://totp/${issuer}:${encodeURIComponent(
		session.user.email,
	)}?secret=${base32Encode(secret)}&issuer=${issuer}&digits=6&period=30`;
	return { ok: true, totpURI, backupCodes };
}

/**
 * Disable 2FA gated by the factor itself (TOTP or a backup code) — a stolen
 * password must not be enough to strip the account's second factor. Mirrors
 * the official endpoint's effects: flag off, row deleted, session swapped
 * (so the cookie cache stops saying twoFactorEnabled), and trusted-device
 * records revoked — for ALL devices, since we can't expire the calling
 * device's cookie from here; without its verification row a trust cookie is
 * inert.
 */
export async function disableTwoFactorWithCode(
	auth: SecurityAuth,
	headers: Headers,
	input: { code: string; backupCode?: boolean },
): Promise<TwoFactorManageResult> {
	// Authoritative: this deletes the twoFactor row and evicts other sessions,
	// so a caller whose own row is already gone is refused before either write.
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!session) return { ok: false, code: "unauthorized" };
	if (!session.user.twoFactorEnabled) return { ok: false, code: "not_enabled" };
	const verified = await verifySecondFactor(
		auth,
		headers,
		session.user.id,
		input,
	);
	if (!verified.ok) return verified;

	const ctx = await auth.$context;
	await ctx.internalAdapter.updateUser(session.user.id, {
		twoFactorEnabled: false,
	});
	await ctx.adapter.deleteMany({
		model: "twoFactor",
		where: [{ field: "userId", value: session.user.id }],
	});
	await ctx.adapter.deleteMany({
		model: "verification",
		where: [
			{ field: "identifier", operator: "starts_with", value: "trust-device-" },
			{ field: "value", value: session.user.id },
		],
	});
	// Before the swap: `headers` still names a live session here, and after it
	// they would not.
	await evictOtherSessions(auth, headers);
	await replaceSession(
		auth,
		session.user.email,
		headers,
		session.session.token,
	);
	return { ok: true };
}

/**
 * Rotate backup codes, gated like disable (the old codes are invalidated,
 * which is 2FA-sensitive). Storage format matches enable.
 */
export async function regenerateBackupCodesWithCode(
	auth: SecurityAuth,
	headers: Headers,
	input: { code: string; backupCode?: boolean },
): Promise<BackupCodesResult> {
	// Authoritative: this rotates the backup codes and evicts other sessions,
	// so a caller whose own row is already gone is refused before the rotation
	// overwrites the codes.
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!session) return { ok: false, code: "unauthorized" };
	if (!session.user.twoFactorEnabled) return { ok: false, code: "not_enabled" };
	const verified = await verifySecondFactor(
		auth,
		headers,
		session.user.id,
		input,
	);
	if (!verified.ok) return verified;

	const ctx = await auth.$context;
	const backupCodes = newBackupCodes();
	await ctx.adapter.update({
		model: "twoFactor",
		where: [{ field: "userId", value: session.user.id }],
		update: {
			backupCodes: await encodeBackupCodes(ctx.secretConfig, backupCodes),
		},
	});
	await evictOtherSessions(auth, headers);
	return { ok: true, backupCodes };
}

// ------------------------------------------------------------ github gate

export type GithubSignupVerdict =
	| { ok: true }
	| { ok: false; code: "email_not_found" | "github_email_unverified" };

/**
 * Gate for creating a user from a GitHub profile. Deny codes double as the
 * `/sign-in?error=<code>` redirect contract: `email_not_found` matches the
 * code Better Auth's callback already emits when the profile has no email
 * (this gate is the defense-in-depth backstop behind that check).
 */
export function evaluateGithubSignup(profile: {
	email: string | null | undefined;
	emailVerified: boolean;
}): GithubSignupVerdict {
	if (!profile.email) return { ok: false, code: "email_not_found" };
	if (!profile.emailVerified)
		return { ok: false, code: "github_email_unverified" };
	return { ok: true };
}
