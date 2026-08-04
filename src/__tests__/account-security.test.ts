import { createHmac } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
	changePasswordWithOtp,
	checkPasswordChangeOtp,
	disableTwoFactorWithCode,
	enableTwoFactorWithOtp,
	evaluateGithubSignup,
	MONEY_REAUTH_MAX_AGE_SECONDS,
	reauthenticate,
	regenerateBackupCodesWithCode,
	requestPasswordChangeOtp,
	requestReauthOtp,
} from "@/services/account-security";
import { AUTH_DDL } from "./auth-harness";
import { createTestDatabase, hasTestDatabase } from "./test-db";

/** Expire the server-side resend cooldown so the next send is allowed. */
async function expireCooldowns(db: Awaited<ReturnType<typeof makeAuth>>["db"]) {
	const { verification } = await import("@/db/auth.schema");
	await db
		.update(verification)
		.set({ expiresAt: new Date(Date.now() - 1000) })
		.where(like(verification.identifier, "otp-cooldown-%"));
}

// Minimal auth instance mirroring the production slice under test:
// emailAndPassword + emailOTP, revokeSessionsOnPasswordReset left at its
// default (off) — the orchestration itself must handle session revocation.
async function makeAuth() {
	const otps: { email: string; otp: string; type: string }[] = [];
	const db = await createTestDatabase(AUTH_DDL);
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "account-security-test-secret",
		telemetry: { enabled: false },
		database: drizzleAdapter(db, { provider: "pg" }),
		emailAndPassword: { enabled: true },
		plugins: [
			emailOTP({
				async sendVerificationOTP(data) {
					otps.push(data);
				},
			}),
			twoFactor(),
		],
	});
	return { auth, otps, db };
}

/** Turn a returnHeaders response into a Cookie header for follow-up calls. */
function cookieHeaders(headers: Headers): Headers {
	const cookie = headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	return new Headers({ cookie });
}

const EMAIL = "alice@example.com";
const OLD_PW = "old-password-123";
const NEW_PW = "new-password-456";

describe.skipIf(!hasTestDatabase)("changePasswordWithOtp", () => {
	it("changes the password, keeps the current session, revokes the rest", async () => {
		const { auth, otps } = await makeAuth();
		const signUp = await auth.api.signUpEmail({
			body: { email: EMAIL, password: OLD_PW, name: "Alice" },
			returnHeaders: true,
		});
		const current = cookieHeaders(signUp.headers);
		const signInAgain = await auth.api.signInEmail({
			body: { email: EMAIL, password: OLD_PW },
			returnHeaders: true,
		});
		const other = cookieHeaders(signInAgain.headers);

		expect(await requestPasswordChangeOtp(auth, current)).toEqual({
			ok: true,
			retryAfterSeconds: 30,
		});
		const otp = otps.at(-1);
		expect(otp?.type).toBe("forget-password");

		expect(
			await changePasswordWithOtp(auth, current, {
				otp: otp?.otp ?? "",
				newPassword: NEW_PW,
			}),
		).toEqual({ ok: true });

		// New password works, old one doesn't.
		await expect(
			auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PW } }),
		).resolves.toBeTruthy();
		await expect(
			auth.api.signInEmail({ body: { email: EMAIL, password: OLD_PW } }),
		).rejects.toThrow();

		// The session that performed the change survives; the other one is dead.
		expect(await auth.api.getSession({ headers: current })).not.toBeNull();
		expect(await auth.api.getSession({ headers: other })).toBeNull();

		// Consuming the code lifts the resend cooldown — nothing is in-flight.
		expect(await requestPasswordChangeOtp(auth, current)).toEqual({
			ok: true,
			retryAfterSeconds: 30,
		});
	});

	it("lets a passwordless (social) user set a first password", async () => {
		const { auth, otps, db } = await makeAuth();
		// A GitHub-registered user: user row without any credential account.
		// Seeded directly — social sign-up needs a live provider round-trip.
		const { user } = await import("@/db/auth.schema");
		await db.insert(user).values({
			id: "gh-user",
			name: "Hub",
			email: EMAIL,
			emailVerified: true,
		});
		// Session via the OTP sign-in endpoint (public API, no password needed).
		await auth.api.sendVerificationOTP({
			body: { email: EMAIL, type: "sign-in" },
		});
		const signIn = await auth.api.signInEmailOTP({
			body: { email: EMAIL, otp: otps.at(-1)?.otp ?? "" },
			returnHeaders: true,
		});
		const current = cookieHeaders(signIn.headers);

		await requestPasswordChangeOtp(auth, current);
		expect(
			await changePasswordWithOtp(auth, current, {
				otp: otps.at(-1)?.otp ?? "",
				newPassword: NEW_PW,
			}),
		).toEqual({ ok: true });

		// The credential now exists: password sign-in works.
		await expect(
			auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PW } }),
		).resolves.toBeTruthy();
	});

	it("rejects a wrong OTP with no side effects", async () => {
		const { auth } = await makeAuth();
		const signUp = await auth.api.signUpEmail({
			body: { email: EMAIL, password: OLD_PW, name: "Alice" },
			returnHeaders: true,
		});
		const current = cookieHeaders(signUp.headers);
		const signInAgain = await auth.api.signInEmail({
			body: { email: EMAIL, password: OLD_PW },
			returnHeaders: true,
		});
		const other = cookieHeaders(signInAgain.headers);

		await requestPasswordChangeOtp(auth, current);
		expect(
			await changePasswordWithOtp(auth, current, {
				otp: "000000",
				newPassword: NEW_PW,
			}),
		).toEqual({ ok: false, code: "invalid_otp" });

		// Old password still stands, and no session was revoked.
		await expect(
			auth.api.signInEmail({ body: { email: EMAIL, password: OLD_PW } }),
		).resolves.toBeTruthy();
		expect(await auth.api.getSession({ headers: other })).not.toBeNull();
	});

	it("rejects a replayed OTP after a successful change", async () => {
		const { auth, otps } = await makeAuth();
		const signUp = await auth.api.signUpEmail({
			body: { email: EMAIL, password: OLD_PW, name: "Alice" },
			returnHeaders: true,
		});
		const current = cookieHeaders(signUp.headers);

		await requestPasswordChangeOtp(auth, current);
		const otp = otps.at(-1)?.otp ?? "";
		expect(
			await changePasswordWithOtp(auth, current, {
				otp,
				newPassword: NEW_PW,
			}),
		).toEqual({ ok: true });

		// Same code again must not move the password a second time.
		const replay = await changePasswordWithOtp(auth, current, {
			otp,
			newPassword: "attacker-chosen-789",
		});
		expect(replay).toEqual({ ok: false, code: "invalid_otp" });
		await expect(
			auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PW } }),
		).resolves.toBeTruthy();
	});
});

// RFC 6238 TOTP (SHA-1, 6 digits, 30s period) — enough to act as the
// authenticator app in tests.
function totp(base32Secret: string, at = Date.now()): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = 0;
	let value = 0;
	const bytes: number[] = [];
	for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
		value = (value << 5) | alphabet.indexOf(char);
		bits += 5;
		if (bits >= 8) {
			bytes.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
	const hmac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
	const offset = (hmac.at(-1) ?? 0) & 0xf;
	const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** 6;
	return String(code).padStart(6, "0");
}

/** Sign up and mark the email verified — production users always are, and
 * signInEmailOTP takes a different (session-revoking) branch for unverified
 * ones, which would mask the explicit stale-session replacement under test. */
async function signUpWithSession(
	auth: Awaited<ReturnType<typeof makeAuth>>["auth"],
	db: Awaited<ReturnType<typeof makeAuth>>["db"],
) {
	const signUp = await auth.api.signUpEmail({
		body: { email: EMAIL, password: OLD_PW, name: "Alice" },
		returnHeaders: true,
	});
	const { user } = await import("@/db/auth.schema");
	await db.update(user).set({ emailVerified: true });
	return cookieHeaders(signUp.headers);
}

/** Full TOTP enrollment. Completing it replaces the caller's session, so the
 * returned headers must be used for everything after. */
async function enrollTotp(
	auth: Awaited<ReturnType<typeof makeAuth>>["auth"],
	headers: Headers,
) {
	const enabled = await auth.api.enableTwoFactor({
		body: { password: OLD_PW },
		headers,
	});
	const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
	const verified = await auth.api.verifyTOTP({
		body: { code: totp(secret) },
		headers,
		returnHeaders: true,
	});
	return {
		secret,
		backupCodes: enabled.backupCodes,
		headers: cookieHeaders(verified.headers),
	};
}

describe.skipIf(!hasTestDatabase)("reauthenticate", () => {
	it("without 2FA: emails a sign-in code, and confirming it mints a fresh session", async () => {
		const { auth, otps, db } = await makeAuth();
		const current = await signUpWithSession(auth, db);
		const { session } = await import("@/db/auth.schema");
		const before = await db.select().from(session);
		expect(before).toHaveLength(1);

		expect(await requestReauthOtp(auth, current)).toEqual({
			ok: true,
			retryAfterSeconds: 30,
		});
		const otp = otps.at(-1);
		expect(otp?.type).toBe("sign-in");
		expect(otp?.email).toBe(EMAIL);

		expect(
			await reauthenticate(auth, current, { code: otp?.otp ?? "" }),
		).toEqual({ ok: true });

		// The stale session is REPLACED by a brand-new one (fresh createdAt is
		// what clears freshSessionMiddleware; the old row dies with the swap).
		const after = await db.select().from(session);
		expect(after).toHaveLength(1);
		expect(after[0]?.token).not.toBe(before[0]?.token);
		expect(await auth.api.getSession({ headers: current })).toBeNull();

		// Consuming the code lifts the resend cooldown for the next flow (e.g.
		// opening the 2FA-enable dialog right after a re-auth).
		const signIn = await auth.api.signInEmail({
			body: { email: EMAIL, password: OLD_PW },
			returnHeaders: true,
		});
		expect(await requestReauthOtp(auth, cookieHeaders(signIn.headers))).toEqual(
			{ ok: true, retryAfterSeconds: 30 },
		);
	});

	it("without 2FA: rejects a wrong emailed code and mints nothing", async () => {
		const { auth, db } = await makeAuth();
		const current = await signUpWithSession(auth, db);
		await requestReauthOtp(auth, current);

		expect(await reauthenticate(auth, current, { code: "000000" })).toEqual({
			ok: false,
			code: "invalid_code",
		});
		const { session } = await import("@/db/auth.schema");
		expect(await db.select().from(session)).toHaveLength(1);
	});

	it("with 2FA on: refuses to email a code — the authenticator is the factor", async () => {
		const { auth, otps, db } = await makeAuth();
		const signUpHeaders = await signUpWithSession(auth, db);
		const { headers } = await enrollTotp(auth, signUpHeaders);
		const sent = otps.length;

		expect(await requestReauthOtp(auth, headers)).toEqual({
			ok: false,
			code: "totp_required",
		});
		expect(otps).toHaveLength(sent);
	});

	it("with 2FA on: a valid authenticator code mints a fresh session without emailing", async () => {
		const { auth, otps, db } = await makeAuth();
		const signUpHeaders = await signUpWithSession(auth, db);
		const { secret, headers } = await enrollTotp(auth, signUpHeaders);
		const { session } = await import("@/db/auth.schema");
		// Enrollment replaced the sign-up session, so exactly one row remains.
		const before = await db.select().from(session);
		expect(before).toHaveLength(1);
		const sent = otps.length;

		expect(await reauthenticate(auth, headers, { code: totp(secret) })).toEqual(
			{ ok: true },
		);

		// Same replacement semantics as the email arm: new session, old one dead.
		const after = await db.select().from(session);
		expect(after).toHaveLength(1);
		expect(after[0]?.token).not.toBe(before[0]?.token);
		// The internal one-shot OTP that mints the session must never be emailed.
		expect(otps).toHaveLength(sent);
	});

	it("with 2FA on: rejects a wrong authenticator code", async () => {
		const { auth, db } = await makeAuth();
		const signUpHeaders = await signUpWithSession(auth, db);
		const { secret, headers } = await enrollTotp(auth, signUpHeaders);
		const wrong = totp(secret) === "000000" ? "111111" : "000000";

		expect(await reauthenticate(auth, headers, { code: wrong })).toEqual({
			ok: false,
			code: "invalid_code",
		});
		const { session } = await import("@/db/auth.schema");
		expect(await db.select().from(session)).toHaveLength(1);
	});

	it("with 2FA on: locks after 5 failed codes, even for a then-correct one", async () => {
		const { auth, db } = await makeAuth();
		const signUpHeaders = await signUpWithSession(auth, db);
		const { secret, headers } = await enrollTotp(auth, signUpHeaders);
		const wrong = totp(secret) === "000000" ? "111111" : "000000";

		for (let i = 0; i < 5; i++) {
			expect(await reauthenticate(auth, headers, { code: wrong })).toEqual({
				ok: false,
				code: "invalid_code",
			});
		}
		expect(await reauthenticate(auth, headers, { code: totp(secret) })).toEqual(
			{ ok: false, code: "too_many_attempts" },
		);
		const { session } = await import("@/db/auth.schema");
		expect(await db.select().from(session)).toHaveLength(1);
	});

	it("with 2FA on: accepts a backup code once, then never again", async () => {
		const { auth, otps, db } = await makeAuth();
		const signUpHeaders = await signUpWithSession(auth, db);
		const { backupCodes, headers } = await enrollTotp(auth, signUpHeaders);
		const code = backupCodes[0] ?? "";

		expect(
			await reauthenticate(auth, headers, { code, backupCode: true }),
		).toEqual({ ok: true });
		const { session } = await import("@/db/auth.schema");
		expect(await db.select().from(session)).toHaveLength(1);

		// Backup codes are single-use: replay from a fresh session must fail.
		// (The fresh session comes via the server-side OTP sign-in channel —
		// password sign-in would stop at the 2FA interstitial.)
		await auth.api.sendVerificationOTP({
			body: { email: EMAIL, type: "sign-in" },
		});
		const signIn = await auth.api.signInEmailOTP({
			body: { email: EMAIL, otp: otps.at(-1)?.otp ?? "" },
			returnHeaders: true,
		});
		expect(
			await reauthenticate(auth, cookieHeaders(signIn.headers), {
				code,
				backupCode: true,
			}),
		).toEqual({ ok: false, code: "invalid_code" });
	});

	it("requires a session", async () => {
		const { auth } = await makeAuth();
		expect(await requestReauthOtp(auth, new Headers())).toEqual({
			ok: false,
			code: "unauthorized",
		});
		expect(await reauthenticate(auth, new Headers(), { code: "x" })).toEqual({
			ok: false,
			code: "unauthorized",
		});
	});
});

describe.skipIf(!hasTestDatabase)(
	"two-factor management via OTP (no password)",
	() => {
		it("enables 2FA with an emailed code, and the result round-trips through Better Auth's own verify", async () => {
			const { auth, otps, db } = await makeAuth();
			const current = await signUpWithSession(auth, db);
			await requestReauthOtp(auth, current);
			const otp = otps.at(-1)?.otp ?? "";

			const result = await enableTwoFactorWithOtp(auth, current, { otp });
			if (!result.ok) throw new Error(`enable failed: ${result.code}`);
			expect(result.backupCodes).toHaveLength(10);
			const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
			expect(secret.length).toBeGreaterThan(0);

			// Not enabled yet — enrollment completes through the OFFICIAL verify
			// endpoint, which decrypts our stored secret (format compatibility).
			const verified = await auth.api.verifyTOTP({
				body: { code: totp(secret) },
				headers: current,
				returnHeaders: true,
			});
			const fresh = cookieHeaders(verified.headers);
			const session = await auth.api.getSession({ headers: fresh });
			expect(session?.user.twoFactorEnabled).toBe(true);

			// The backup codes we stored verify through the official path too.
			expect(
				await reauthenticate(auth, fresh, {
					code: result.backupCodes[0] ?? "",
					backupCode: true,
				}),
			).toEqual({ ok: true });
		});

		it("rejects a wrong emailed code, and refuses when already enabled", async () => {
			const { auth, otps, db } = await makeAuth();
			const current = await signUpWithSession(auth, db);
			await requestReauthOtp(auth, current);
			const otp = otps.at(-1)?.otp ?? "";
			const wrong = otp === "000000" ? "111111" : "000000";

			expect(
				await enableTwoFactorWithOtp(auth, current, { otp: wrong }),
			).toEqual({ ok: false, code: "invalid_otp" });
			const { twoFactor: twoFactorTable } = await import("@/db/auth.schema");
			expect(await db.select().from(twoFactorTable)).toHaveLength(0);

			const { headers } = await enrollTotp(auth, current);
			expect(await enableTwoFactorWithOtp(auth, headers, { otp })).toEqual({
				ok: false,
				code: "already_enabled",
			});
		});

		it("disables 2FA with an authenticator code: row gone, trust revoked, session swapped", async () => {
			const { auth, db } = await makeAuth();
			const signUpHeaders = await signUpWithSession(auth, db);
			const { secret, headers } = await enrollTotp(auth, signUpHeaders);
			const { user, session, twoFactor, verification } = await import(
				"@/db/auth.schema"
			);
			const userId = (await db.select().from(user))[0]?.id ?? "";
			// A trusted device from the 2FA era must not survive the disable.
			await db.insert(verification).values({
				id: crypto.randomUUID(),
				identifier: "trust-device-e2e-fixture",
				value: userId,
				expiresAt: new Date(Date.now() + 60_000),
			});

			expect(
				await disableTwoFactorWithCode(auth, headers, { code: totp(secret) }),
			).toEqual({ ok: true });

			expect((await db.select().from(user))[0]?.twoFactorEnabled).toBe(false);
			expect(await db.select().from(twoFactor)).toHaveLength(0);
			const trustRows = await db
				.select()
				.from(verification)
				.where(like(verification.identifier, "trust-device-%"));
			expect(trustRows).toHaveLength(0);
			// Session swapped: exactly one, and the old cookie is dead.
			expect(await db.select().from(session)).toHaveLength(1);
			expect(await auth.api.getSession({ headers })).toBeNull();
		});

		it("keeps 2FA on when the disable code is wrong", async () => {
			const { auth, db } = await makeAuth();
			const signUpHeaders = await signUpWithSession(auth, db);
			const { secret, headers } = await enrollTotp(auth, signUpHeaders);
			const wrong = totp(secret) === "000000" ? "111111" : "000000";

			expect(
				await disableTwoFactorWithCode(auth, headers, { code: wrong }),
			).toEqual({ ok: false, code: "invalid_code" });
			const { user, twoFactor } = await import("@/db/auth.schema");
			expect((await db.select().from(user))[0]?.twoFactorEnabled).toBe(true);
			expect(await db.select().from(twoFactor)).toHaveLength(1);
		});

		it("regenerates backup codes with an authenticator code; old codes die, new ones work", async () => {
			const { auth, db } = await makeAuth();
			const signUpHeaders = await signUpWithSession(auth, db);
			const { secret, backupCodes, headers } = await enrollTotp(
				auth,
				signUpHeaders,
			);

			const result = await regenerateBackupCodesWithCode(auth, headers, {
				code: totp(secret),
			});
			if (!result.ok) throw new Error(`regenerate failed: ${result.code}`);
			expect(result.backupCodes).toHaveLength(10);

			// An old code no longer verifies; a new one does.
			expect(
				await reauthenticate(auth, headers, {
					code: backupCodes[0] ?? "",
					backupCode: true,
				}),
			).toEqual({ ok: false, code: "invalid_code" });
			expect(
				await reauthenticate(auth, headers, {
					code: result.backupCodes[0] ?? "",
					backupCode: true,
				}),
			).toEqual({ ok: true });
		});
	},
);

describe.skipIf(!hasTestDatabase)("otp resend cooldown", () => {
	it("refuses a resend inside the 30s window, per flow, until it expires", async () => {
		const { auth, otps, db } = await makeAuth();
		const current = await signUpWithSession(auth, db);

		expect(await requestReauthOtp(auth, current)).toEqual({
			ok: true,
			retryAfterSeconds: 30,
		});
		const blocked = await requestReauthOtp(auth, current);
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) {
			expect(blocked.code).toBe("cooldown");
			expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
			expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30);
		}

		// The password flow has its own independent window.
		expect(await requestPasswordChangeOtp(auth, current)).toEqual({
			ok: true,
			retryAfterSeconds: 30,
		});
		expect((await requestPasswordChangeOtp(auth, current)).ok).toBe(false);

		// Only two emails went out despite four requests.
		expect(otps).toHaveLength(2);

		await expireCooldowns(db);
		expect(await requestReauthOtp(auth, current)).toEqual({
			ok: true,
			retryAfterSeconds: 30,
		});
		expect(otps).toHaveLength(3);
	});
});

describe.skipIf(!hasTestDatabase)("checkPasswordChangeOtp", () => {
	it("verifies the code without consuming it — the change still works after", async () => {
		const { auth, otps, db } = await makeAuth();
		const current = await signUpWithSession(auth, db);
		await requestPasswordChangeOtp(auth, current);
		const otp = otps.at(-1)?.otp ?? "";

		expect(await checkPasswordChangeOtp(auth, current, { otp })).toEqual({
			ok: true,
		});
		// Not consumed: the very same code then performs the actual change.
		expect(
			await changePasswordWithOtp(auth, current, {
				otp,
				newPassword: NEW_PW,
			}),
		).toEqual({ ok: true });
	});

	it("counts wrong guesses against the shared attempt budget", async () => {
		const { auth, otps, db } = await makeAuth();
		const current = await signUpWithSession(auth, db);
		await requestPasswordChangeOtp(auth, current);
		const otp = otps.at(-1)?.otp ?? "";
		const wrong = otp === "000000" ? "111111" : "000000";

		for (let i = 0; i < 3; i++) {
			expect(
				await checkPasswordChangeOtp(auth, current, { otp: wrong }),
			).toEqual({ ok: false, code: "invalid_otp" });
		}
		// Budget exhausted: even the right code is now refused.
		expect(await checkPasswordChangeOtp(auth, current, { otp })).toEqual({
			ok: false,
			code: "too_many_attempts",
		});
	});
});

// The gate's deny codes are the error contract with the sign-in page: they
// arrive as /sign-in?error=<code> via Better Auth's callback redirectOnError.
describe("evaluateGithubSignup", () => {
	it("allows a GitHub-verified email", () => {
		expect(
			evaluateGithubSignup({ email: "dev@example.com", emailVerified: true }),
		).toEqual({ ok: true });
	});

	it("denies a missing email with the built-in email_not_found code", () => {
		expect(
			evaluateGithubSignup({ email: undefined, emailVerified: false }),
		).toEqual({ ok: false, code: "email_not_found" });
		expect(evaluateGithubSignup({ email: "", emailVerified: true })).toEqual({
			ok: false,
			code: "email_not_found",
		});
	});

	it("denies an email GitHub has not verified", () => {
		expect(
			evaluateGithubSignup({ email: "dev@example.com", emailVerified: false }),
		).toEqual({ ok: false, code: "github_email_unverified" });
	});
});

describe("money re-auth window (docs pattern constant)", () => {
	it("is five minutes", () => {
		expect(MONEY_REAUTH_MAX_AGE_SECONDS).toBe(5 * 60);
	});
});
