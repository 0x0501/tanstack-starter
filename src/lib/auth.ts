import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { admin, captcha, jwt } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { Database } from "@/db";
import { env } from "@/env";
import { sendResetPasswordEmail, sendVerificationEmail } from "./email";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export function createAuth(db: Database) {
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		// Disable the jwt plugin's /token shortcut so session holders can't mint a
		// signed JWT outside the OAuth flow. Matches the official jwt+oauthProvider
		// mounting example. Remove if you consume /api/auth/token directly.
		disabledPaths: ["/token"],
		database: drizzleAdapter(db, {
			provider: "sqlite",
		}),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			sendResetPassword: async ({ user, url }) => {
				await sendResetPasswordEmail({ to: user.email, url, name: user.name });
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				await sendVerificationEmail({ to: user.email, url, name: user.name });
			},
		},
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/sign-in",
				consentPage: "/oauth/consent",

				// For who uses the token
				validAudiences: [],

				// disable users create oauth client
				clientPrivileges: () => false,

				// disable dynamic register
				allowDynamicClientRegistration: false,
				allowUnauthenticatedClientRegistration: false,

				accessTokenExpiresIn: 6 * HOUR,
				refreshTokenExpiresIn: 30 * DAY,
			}),
			captcha({
				provider: "cloudflare-turnstile",
				secretKey: env.TURNSTILE_SECRET_KEY,
			}),
			admin(),
			// tanstack start must be the last one
			tanstackStartCookies(),
		],
	});
}

// For better auth schema generation only

export const auth = createAuth({} as unknown as Database);
