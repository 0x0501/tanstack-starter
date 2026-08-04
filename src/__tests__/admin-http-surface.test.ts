/**
 * Peer protection must hold against Better Auth's own HTTP surface, not only
 * server functions. The admin plugin mounts `/admin/*` routes that check
 * `hasPermission` alone — without disabledPaths, a console fetch could demote
 * a superadmin. Server-side `auth.api.*` still reaches those endpoints.
 *
 * Also measures DISABLED_AUTH_PATHS against routes plugins actually mount so a
 * plugin upgrade cannot silently remount a surface believed closed.
 *
 * Starter omits the api-key plugin and product roles (no `provider`).
 */

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { admin, emailOTP, twoFactor } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { DISABLED_AUTH_PATHS } from "@/lib/auth-paths";
import { ac, admin as adminRole, superadmin, user } from "@/lib/permissions";
import {
	AUTH_DDL,
	cookieHeaders,
	insertPasskey,
	PASSKEY_DDL,
} from "./auth-harness";
import { createTestDatabase, hasTestDatabase } from "./test-db";

const BASE = "http://localhost:3000";
const PW = "Passw0rd!";

async function makeAuth() {
	const db = await createTestDatabase(AUTH_DDL);
	const auth = betterAuth({
		baseURL: BASE,
		secret: "admin-http-surface-test-secret",
		telemetry: { enabled: false },
		database: drizzleAdapter(db, { provider: "pg" }),
		emailAndPassword: { enabled: true },
		disabledPaths: [...DISABLED_AUTH_PATHS],
		plugins: [
			admin({
				ac,
				roles: { admin: adminRole, superadmin, user },
			}),
		],
	});
	return { auth, db };
}

async function signedInAs(
	auth: Awaited<ReturnType<typeof makeAuth>>["auth"],
	db: Awaited<ReturnType<typeof makeAuth>>["db"],
	email: string,
	role: string,
) {
	const { eq } = await import("drizzle-orm");
	const { user: userTable } = await import("@/db/auth.schema");
	const res = await auth.api.signUpEmail({
		body: { email, password: PW, name: role },
		returnHeaders: true,
	});
	await db
		.update(userTable)
		.set({ role, emailVerified: true })
		.where(eq(userTable.email, email));
	const [row] = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email));
	return { headers: cookieHeaders(res.headers), id: row.id };
}

const roleOf = async (
	db: Awaited<ReturnType<typeof makeAuth>>["db"],
	id: string,
) => {
	const { eq } = await import("drizzle-orm");
	const { user: userTable } = await import("@/db/auth.schema");
	const [row] = await db
		.select({ role: userTable.role, banned: userTable.banned })
		.from(userTable)
		.where(eq(userTable.id, id));
	return row;
};

const post = (
	auth: Awaited<ReturnType<typeof makeAuth>>["auth"],
	path: string,
	body: unknown,
	headers: Headers,
) =>
	auth.handler(
		new Request(`${BASE}/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: headers.get("cookie") ?? "",
			},
			body: JSON.stringify(body),
		}),
	);

describe.skipIf(!hasTestDatabase)("the admin plugin's HTTP surface", () => {
	it("does not let an administrator demote a superadmin", async () => {
		const { auth, db } = await makeAuth();
		const actor = await signedInAs(auth, db, "admin@test.local", "admin");
		const target = await signedInAs(auth, db, "root@test.local", "superadmin");

		const res = await post(
			auth,
			"/admin/set-role",
			{ userId: target.id, role: "user" },
			actor.headers,
		);

		expect(res.status).not.toBe(200);
		expect((await roleOf(db, target.id)).role).toBe("superadmin");
	});

	it("does not let an administrator promote themselves", async () => {
		const { auth, db } = await makeAuth();
		const actor = await signedInAs(auth, db, "admin@test.local", "admin");

		const res = await post(
			auth,
			"/admin/set-role",
			{ userId: actor.id, role: "superadmin" },
			actor.headers,
		);

		expect(res.status).not.toBe(200);
		expect((await roleOf(db, actor.id)).role).toBe("admin");
	});

	it("does not let an administrator ban a peer", async () => {
		const { auth, db } = await makeAuth();
		const actor = await signedInAs(auth, db, "admin@test.local", "admin");
		const target = await signedInAs(auth, db, "peer@test.local", "admin");

		const res = await post(
			auth,
			"/admin/ban-user",
			{ userId: target.id },
			actor.headers,
		);

		expect(res.status).not.toBe(200);
		expect((await roleOf(db, target.id)).banned).toBeFalsy();
	});

	it("does not let an administrator hard-delete anyone", async () => {
		const { auth, db } = await makeAuth();
		const actor = await signedInAs(auth, db, "admin@test.local", "admin");
		const target = await signedInAs(auth, db, "victim@test.local", "user");

		const res = await post(
			auth,
			"/admin/remove-user",
			{ userId: target.id },
			actor.headers,
		);

		expect(res.status).not.toBe(200);
		expect(await roleOf(db, target.id)).toBeTruthy();
	});

	it("still reaches admin operations server-side via auth.api", async () => {
		const { auth, db } = await makeAuth();
		const actor = await signedInAs(auth, db, "admin@test.local", "admin");
		const target = await signedInAs(auth, db, "victim@test.local", "user");

		await auth.api.setRole({
			body: { userId: target.id, role: "admin" },
			headers: actor.headers,
		});

		expect((await roleOf(db, target.id)).role).toBe("admin");
	});
});

/**
 * Routes managed plugins mount that stay reachable on purpose.
 */
const PUBLIC_BY_DESIGN = new Set([
	"/two-factor/verify-totp",
	"/two-factor/verify-backup-code",
]);

describe.skipIf(!hasTestDatabase)("the disabled-path list", () => {
	it("declares every route of every plugin whose surface it controls", async () => {
		// Measured, not assumed: diff mounted routes with vs without each plugin.
		const db = await createTestDatabase(AUTH_DDL);
		const base = {
			baseURL: BASE,
			secret: "admin-http-surface-test-secret",
			telemetry: { enabled: false },
			database: drizzleAdapter(db, { provider: "pg" }),
			emailAndPassword: { enabled: true },
		};
		const pathsOf = (plugins: Parameters<typeof betterAuth>[0]["plugins"]) =>
			new Set(
				Object.values(
					betterAuth({ ...base, plugins }).api as Record<
						string,
						{ path?: string }
					>,
				)
					.map((endpoint) => endpoint?.path)
					.filter((p): p is string => typeof p === "string"),
			);
		const stock = pathsOf([]);
		const declared = DISABLED_AUTH_PATHS as readonly string[];

		// No api-key plugin — not a Starter platform default.
		const managed = [
			["admin", admin({ ac, roles: { admin: adminRole, superadmin, user } })],
			["two-factor", twoFactor()],
			["email-otp", emailOTP({ async sendVerificationOTP() {} })],
		] as const;

		const undeclared: string[] = [];
		for (const [name, plugin] of managed) {
			const mounted = [...pathsOf([plugin])].filter((p) => !stock.has(p));
			expect(mounted.length, `${name} mounted no routes`).toBeGreaterThan(0);
			undeclared.push(
				...mounted.filter(
					(p) => !declared.includes(p) && !PUBLIC_BY_DESIGN.has(p),
				),
			);
		}

		expect(undeclared).toEqual([]);
	});

	it("has no stale admin entry — every disabled admin path is still mounted", async () => {
		const { auth } = await makeAuth();
		const adminMounted = Object.values(
			auth.api as Record<string, { path?: string }>,
		)
			.map((endpoint) => endpoint?.path)
			.filter((p): p is string => typeof p === "string")
			.filter((p) => p.startsWith("/admin/"));

		expect([...adminMounted].sort()).toEqual(
			(DISABLED_AUTH_PATHS as readonly string[])
				.filter((p) => p.startsWith("/admin/"))
				.slice()
				.sort(),
		);
	});
});

describe.skipIf(!hasTestDatabase)(
	"credential-mutating routes the server fns guard",
	() => {
		it("POST /change-password is off — OTP flow with eviction is the only path", async () => {
			const { auth } = await makeAuth();
			const signedUp = await auth.api.signUpEmail({
				body: { email: "pw@example.com", password: PW, name: "PW" },
				returnHeaders: true,
			});

			const res = await post(
				auth,
				"/change-password",
				{ currentPassword: PW, newPassword: "Changed1!" },
				cookieHeaders(signedUp.headers),
			);

			expect(res.status).toBe(404);
			await expect(
				auth.api.signInEmail({
					body: { email: "pw@example.com", password: PW },
				}),
			).resolves.toBeTruthy();
		});

		it("POST /passkey/delete-passkey is off — removal stays fresh-gated", async () => {
			const db = await createTestDatabase(AUTH_DDL + PASSKEY_DDL);
			const auth = betterAuth({
				baseURL: BASE,
				secret: "admin-http-surface-test-secret",
				telemetry: { enabled: false },
				database: drizzleAdapter(db, { provider: "pg" }),
				emailAndPassword: { enabled: true },
				disabledPaths: [...DISABLED_AUTH_PATHS],
				plugins: [passkey({ rpID: "localhost", rpName: "Starter" })],
			});
			const signedUp = await auth.api.signUpEmail({
				body: { email: "pk@example.com", password: PW, name: "PK" },
				returnHeaders: true,
			});
			const pkId = await insertPasskey(db, signedUp.response.user.id);

			const res = await auth.handler(
				new Request(`${BASE}/api/auth/passkey/delete-passkey`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						cookie: cookieHeaders(signedUp.headers).get("cookie") ?? "",
					},
					body: JSON.stringify({ id: pkId }),
				}),
			);

			expect(res.status).toBe(404);
			const { passkey: pkTable } = await import("@/db/auth.schema");
			expect(await db.select().from(pkTable)).toHaveLength(1);
		});
	},
);
