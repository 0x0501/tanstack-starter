import type { Database as AppDatabase } from "@/db";

/**
 * Core Better Auth tables for temp-table suites (column names match the
 * generated auth schema / platform migration).
 */
export const AUTH_DDL = `
	CREATE TEMP TABLE "user" (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT NOT NULL UNIQUE,
		email_verified BOOLEAN DEFAULT false NOT NULL,
		two_factor_enabled boolean default false,
		image TEXT,
		created_at TIMESTAMP DEFAULT now() NOT NULL,
		updated_at TIMESTAMP DEFAULT now() NOT NULL,
		role TEXT,
		banned BOOLEAN DEFAULT false,
		ban_reason TEXT,
		ban_expires TIMESTAMP,
		stripe_customer_id TEXT,
		tokens_revoked_at TIMESTAMP,
		locale TEXT
	);
	CREATE TEMP TABLE "session" (
		id TEXT PRIMARY KEY,
		expires_at TIMESTAMP NOT NULL,
		token TEXT NOT NULL UNIQUE,
		created_at TIMESTAMP DEFAULT now() NOT NULL,
		updated_at TIMESTAMP NOT NULL,
		ip_address TEXT,
		user_agent TEXT,
		user_id TEXT NOT NULL,
		impersonated_by TEXT
	);
	CREATE TEMP TABLE "account" (
		id TEXT PRIMARY KEY,
		account_id TEXT NOT NULL,
		provider_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		access_token TEXT,
		refresh_token TEXT,
		id_token TEXT,
		access_token_expires_at TIMESTAMP,
		refresh_token_expires_at TIMESTAMP,
		scope TEXT,
		password TEXT,
		created_at TIMESTAMP DEFAULT now() NOT NULL,
		updated_at TIMESTAMP NOT NULL
	);
	CREATE TEMP TABLE "verification" (
		id TEXT PRIMARY KEY,
		identifier TEXT NOT NULL,
		value TEXT NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT now() NOT NULL,
		updated_at TIMESTAMP DEFAULT now() NOT NULL
	);
	CREATE TEMP TABLE "two_factor" (
		id TEXT PRIMARY KEY,
		secret TEXT NOT NULL,
		backup_codes TEXT NOT NULL,
		user_id TEXT NOT NULL,
		verified BOOLEAN DEFAULT true,
		failed_verification_count INTEGER DEFAULT 0,
		locked_until TIMESTAMP
	);
`;

export const PASSKEY_DDL = `
	CREATE TEMP TABLE "passkey" (
		id TEXT PRIMARY KEY, name TEXT, public_key TEXT NOT NULL, user_id TEXT NOT NULL,
		credential_id TEXT NOT NULL, counter INTEGER NOT NULL, device_type TEXT NOT NULL,
		backed_up BOOLEAN NOT NULL, transports TEXT, created_at TIMESTAMP, aaguid TEXT
	);
`;

export async function insertPasskey(
	db: AppDatabase,
	userId: string,
	id = "pk-1",
) {
	const { passkey: pk } = await import("@/db/auth.schema");
	await db.insert(pk).values({
		id,
		name: "Starter",
		publicKey: "fake-public-key",
		userId,
		credentialID: `cred-${id}`,
		counter: 0,
		deviceType: "singleDevice",
		backedUp: false,
		createdAt: new Date(),
	});
	return id;
}

/** Turn a returnHeaders response into a Cookie header for follow-up calls. */
export function cookieHeaders(headers: Headers): Headers {
	const cookie = headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	return new Headers({ cookie });
}
