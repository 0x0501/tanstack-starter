import { waitUntil } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { admin, captcha, emailOTP, jwt, twoFactor } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { Database } from "@/db";
import { env } from "@/env";
import { CAPTCHA_ENDPOINTS, DISABLED_AUTH_PATHS } from "@/lib/auth-paths";
import { CAPTCHA_ENABLED } from "@/lib/captcha";
import {
	evaluateGithubSignup,
	TWO_FACTOR_ISSUER,
} from "@/services/account-security";
import { canManageOAuthClients } from "@/services/admin-security";
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	normalizeDisplayName,
	sanitizeDerivedDisplayName,
} from "@/utils/input-rules";
import { existingEmailSignup } from "./auth-plugins/existing-email-signup";
import { fieldRules } from "./auth-plugins/field-rules";
import { socialTwoFactor } from "./auth-plugins/social-two-factor";
import {
	sendPasswordOtpEmail,
	sendResetPasswordEmail,
	sendVerificationEmail,
} from "./email";
import {
	ACCESS_TOKEN_TTL_SEC,
	DAY,
	EMAIL_VERIFICATION_EXPIRES_IN_SEC,
} from "./auth-timing";
import { issuerFromAuthUrl } from "./oauth-metadata";
import { ac, admin as adminRole, superadmin, user } from "./permissions";
import { userUpdateGuard } from "./user-update-guard";

export { ACCESS_TOKEN_TTL_SEC } from "./auth-timing";

/** Authorization-server identifier advertised in discovery / PRM. */
export function getIssuer() {
	return issuerFromAuthUrl(env.BETTER_AUTH_URL);
}

function audiences(): string[] {
	if (env.BETTER_AUTH_AUDIENCES) {
		return env.BETTER_AUTH_AUDIENCES.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [env.APP_ORIGIN];
}

export function createAuth(db: Database) {
	// Public client id: prefer server GITHUB_CLIENT_ID, fall back to the same
	// Vite-public value the UI uses so button visibility and provider config
	// cannot drift.
	const githubClientId =
		env.GITHUB_CLIENT_ID?.trim() ||
		(typeof import.meta.env.VITE_GITHUB_CLIENT_ID === "string"
			? import.meta.env.VITE_GITHUB_CLIENT_ID.trim()
			: "") ||
		undefined;
	const githubConfigured =
		Boolean(githubClientId) && Boolean(env.GITHUB_CLIENT_SECRET);

	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		disabledPaths: [...DISABLED_AUTH_PATHS],
		database: drizzleAdapter(db, {
			provider: "pg",
		}),
		trustedOrigins: [
			"http://localhost:3000",
			env.APP_ORIGIN,
			env.BETTER_AUTH_URL,
		].filter((v, i, a) => a.indexOf(v) === i),
		telemetry: { enabled: false },
		advanced: {
			backgroundTasks: {
				handler: (promise) => {
					waitUntil(promise);
				},
			},
		},
		session: {
			cookieCache: {
				enabled: !import.meta.env.DEV,
				maxAge: 60,
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			maxPasswordLength: MAX_PASSWORD_LENGTH,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user: u, url }) => {
				await sendResetPasswordEmail({
					to: u.email,
					url,
					name: u.name,
				});
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_SEC,
			sendVerificationEmail: async ({ user: u, url }) => {
				await sendVerificationEmail({
					to: u.email,
					url,
					name: u.name,
				});
			},
		},
		...(githubConfigured
			? {
					socialProviders: {
						github: {
							clientId: githubClientId as string,
							clientSecret: env.GITHUB_CLIENT_SECRET as string,
						},
					},
				}
			: {}),
		user: {
			additionalFields: {
				tokensRevokedAt: { type: "date", required: false, input: false },
				locale: { type: "string", required: false, input: true },
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (newUser, context) => {
						if (context?.path?.startsWith("/callback")) {
							const u = newUser as {
								email?: string;
								emailVerified?: boolean;
								name?: string;
							};
							const verdict = evaluateGithubSignup({
								email: u.email,
								emailVerified: Boolean(u.emailVerified),
							});
							if (!verdict.ok) {
								throw new APIError("BAD_REQUEST", {
									message: verdict.code,
									code: verdict.code,
								});
							}
							if (typeof u.name === "string") {
								return {
									data: {
										...newUser,
										name: sanitizeDerivedDisplayName(u.name),
									},
								};
							}
						}
						if (typeof newUser.name === "string") {
							try {
								return {
									data: {
										...newUser,
										name: normalizeDisplayName(newUser.name),
									},
								};
							} catch {
								throw new APIError("BAD_REQUEST", {
									message: "Invalid display name.",
								});
							}
						}
						return { data: newUser };
					},
				},
				update: {
					before: async (data, context) => {
						const guarded = userUpdateGuard(data);
						if (!guarded.data || typeof guarded.data !== "object") {
							return guarded;
						}
						const rest = { ...(guarded.data as Record<string, unknown>) };
						// Same display-name rule on edit. Human-typed updates refuse
						// invalid names; system-supplied names (e.g. provider sync) strip.
						if (typeof rest.name === "string") {
							if (context?.path === "/update-user") {
								try {
									rest.name = normalizeDisplayName(rest.name);
								} catch (err) {
									throw new APIError("BAD_REQUEST", {
										message:
											err instanceof Error ? err.message : "Invalid name.",
									});
								}
							} else {
								rest.name = sanitizeDerivedDisplayName(rest.name);
							}
						}
						return { data: rest as typeof data };
					},
				},
			},
		},
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/sign-in",
				consentPage: "/oauth/consent",
				validAudiences: audiences(),
				clientPrivileges: ({ user: u }) => canManageOAuthClients(u),
				allowDynamicClientRegistration: false,
				allowUnauthenticatedClientRegistration: false,
				accessTokenExpiresIn: ACCESS_TOKEN_TTL_SEC,
				refreshTokenExpiresIn: 30 * DAY,
			}),
			...(CAPTCHA_ENABLED && env.TURNSTILE_SECRET_KEY
				? [
						captcha({
							provider: "cloudflare-turnstile",
							secretKey: env.TURNSTILE_SECRET_KEY,
							endpoints: [...CAPTCHA_ENDPOINTS],
						}),
					]
				: []),
			admin({
				ac,
				roles: { admin: adminRole, superadmin, user },
			}),
			twoFactor({
				issuer: TWO_FACTOR_ISSUER,
			}),
			emailOTP({
				async sendVerificationOTP({ email, otp, type }) {
					if (type === "forget-password" || type === "sign-in") {
						await sendPasswordOtpEmail({ to: email, otp, type });
					}
				},
			}),
			passkey({
				rpID: new URL(env.APP_ORIGIN).hostname,
				rpName: env.EMAIL_FROM_NAME,
			}),
			existingEmailSignup(),
			fieldRules(),
			// After twoFactor so the social callback can tear down a full session.
			socialTwoFactor(),
			// Must be last.
			tanstackStartCookies(),
		],
	});
}

// For better-auth schema generation only.
export const auth = createAuth({} as unknown as Database);
