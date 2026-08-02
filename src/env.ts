import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function createAppEnv() {
	return createEnv({
		server: {
			APP_ORIGIN: z.url(),
			SERVER_URL: z.url().optional(),
			BETTER_AUTH_URL: z.url(),
			BETTER_AUTH_SECRET: z.string().min(1),
			// Comma-separated OAuth resource audiences; empty defaults to APP_ORIGIN.
			BETTER_AUTH_AUDIENCES: z.string().optional(),
			TURNSTILE_SECRET_KEY: z.string().optional(),
			EMAIL_FROM: z.string().min(1),
			/** Inbox From display name — clone-time brand string. */
			EMAIL_FROM_NAME: z.string().min(1).default("Starter"),

			GITHUB_CLIENT_ID: z.string().optional(),
			GITHUB_CLIENT_SECRET: z.string().optional(),

			// Optional payment adapters — absence means inactive.
			CREEM_API_KEY: z.string().optional(),
			CREEM_WEBHOOK_SECRET: z.string().optional(),
			CREEM_PRODUCT_ID: z.string().optional(),
			CREEM_TEST_MODE: z.stringbool().default(false),

			STRIPE_SECRET_KEY: z.string().optional(),
			STRIPE_WEBHOOK_SECRET: z.string().optional(),

			NOW_PAYMENTS_API_KEY: z.string().optional(),
			NOW_PAYMENTS_IPN_KEY: z.string().optional(),
			NOW_PAYMENTS_TEST_MODE: z.stringbool().default(false),
		},

		clientPrefix: "VITE_",

		client: {
			VITE_APP_TITLE: z.string().min(1).optional(),
			VITE_APP_ORIGIN: z.url().optional(),
			VITE_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
			// Public GitHub OAuth client id (same value as GITHUB_CLIENT_ID).
			// When set with GITHUB_CLIENT_SECRET, the provider is enabled end-to-end.
			VITE_GITHUB_CLIENT_ID: z.string().min(1).optional(),
		},

		runtimeEnv: process.env,
		emptyStringAsUndefined: true,
	});
}

type AppEnv = ReturnType<typeof createAppEnv>;

let appEnv: AppEnv | undefined;

export function getEnv() {
	if (!appEnv) appEnv = createAppEnv();
	return appEnv;
}

/** Lazy proxy so importing modules does not force env validation at load time in tests. */
export const env = new Proxy({} as AppEnv, {
	get(_target, prop, receiver) {
		return Reflect.get(getEnv(), prop, receiver);
	},
});
