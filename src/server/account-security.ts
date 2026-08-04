import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { betterAuthMiddleware } from "@/middlewares/better-auth";
import {
	changePasswordWithOtp,
	checkPasswordChangeOtp,
	disableTwoFactorWithCode,
	enableTwoFactorWithOtp,
	reauthenticate,
	regenerateBackupCodesWithCode,
	removePasskeyWithFreshSession,
	requestPasswordChangeOtp,
	requestReauthOtp,
} from "@/services/account-security";
import { validated } from "@/utils/api-error";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/utils/input-rules";

// Security-page server functions. betterAuthMiddleware only — auth.api runs on
// the raw connection; an open RLS transaction would buy nothing.

export const getSecurityOverview = createServerFn({ method: "GET" })
	.middleware([betterAuthMiddleware])
	.handler(async ({ context }) => {
		const headers = getRequestHeaders();
		const session = await context.auth.api.getSession({ headers });
		if (!session?.user) return null;
		const [accounts, passkeys] = await Promise.all([
			context.auth.api.listUserAccounts({ headers }),
			context.auth.api.listPasskeys({ headers }),
		]);
		const u = session.user as typeof session.user & {
			twoFactorEnabled?: boolean | null;
			locale?: string | null;
		};
		return {
			email: session.user.email,
			name: session.user.name ?? null,
			locale: u.locale ?? null,
			emailVerified: Boolean(session.user.emailVerified),
			hasPassword: accounts.some((a) => a.providerId === "credential"),
			githubLinked: accounts.some((a) => a.providerId === "github"),
			twoFactorEnabled: Boolean(u.twoFactorEnabled),
			passkeys: passkeys.map((p) => ({
				id: p.id,
				name: p.name ?? null,
				createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
			})),
		};
	});

export const listSessions = createServerFn({ method: "GET" })
	.middleware([betterAuthMiddleware])
	.handler(async ({ context }) => {
		const headers = getRequestHeaders();
		const session = await context.auth.api.getSession({ headers });
		if (!session?.user) return null;
		const sessions = await context.auth.api.listSessions({ headers });
		return sessions.map((s) => ({
			id: s.id,
			token: s.token,
			createdAt: new Date(s.createdAt).toISOString(),
			expiresAt: new Date(s.expiresAt).toISOString(),
			ipAddress: s.ipAddress ?? null,
			userAgent: s.userAgent ?? null,
			isCurrent: s.token === session.session.token,
		}));
	});

export const revokeOtherSessions = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.handler(async ({ context }) => {
		const headers = getRequestHeaders();
		const session = await context.auth.api.getSession({
			headers,
			query: { disableCookieCache: true },
		});
		if (!session?.user) return { ok: false as const, code: "unauthorized" };
		await context.auth.api.revokeOtherSessions({ headers });
		return { ok: true as const };
	});

export const requestPasswordOtp = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.handler(({ context }) =>
		requestPasswordChangeOtp(context.auth, getRequestHeaders()),
	);

export const verifyPasswordOtp = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(validated(z.object({ otp: z.string().trim().min(1).max(16) })))
	.handler(({ context, data }) =>
		checkPasswordChangeOtp(context.auth, getRequestHeaders(), data),
	);

export const confirmPasswordChange = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(
		validated(
			z.object({
				otp: z.string().trim().min(1).max(16),
				newPassword: z
					.string()
					.min(MIN_PASSWORD_LENGTH)
					.max(MAX_PASSWORD_LENGTH),
			}),
		),
	)
	.handler(({ context, data }) =>
		changePasswordWithOtp(context.auth, getRequestHeaders(), data),
	);

export const requestReauthCode = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.handler(({ context }) =>
		requestReauthOtp(context.auth, getRequestHeaders()),
	);

export const confirmReauth = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(
		validated(
			z.object({
				code: z.string().trim().min(1).max(32),
				backupCode: z.boolean().optional(),
			}),
		),
	)
	.handler(({ context, data }) =>
		reauthenticate(context.auth, getRequestHeaders(), data),
	);

export const beginTwoFactorEnable = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(validated(z.object({ otp: z.string().trim().min(1).max(16) })))
	.handler(({ context, data }) =>
		enableTwoFactorWithOtp(context.auth, getRequestHeaders(), data),
	);

const secondFactorInput = z.object({
	code: z.string().trim().min(1).max(32),
	backupCode: z.boolean().optional(),
});

export const disableTwoFactor = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(validated(secondFactorInput))
	.handler(({ context, data }) =>
		disableTwoFactorWithCode(context.auth, getRequestHeaders(), data),
	);

export const regenerateBackupCodes = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(validated(secondFactorInput))
	.handler(({ context, data }) =>
		regenerateBackupCodesWithCode(context.auth, getRequestHeaders(), data),
	);

export const removePasskey = createServerFn({ method: "POST" })
	.middleware([betterAuthMiddleware])
	.validator(validated(z.object({ passkeyId: z.string().trim().min(1) })))
	.handler(({ context, data }) =>
		removePasskeyWithFreshSession(context.auth, getRequestHeaders(), data),
	);
