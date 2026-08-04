/**
 * Administrators are peers: none may ban, demote, or revoke credentials of an
 * admin or superadmin, and none may change their own role. superadmin is a
 * protected label, not a higher-privilege tier.
 *
 * Last-admin checks hit real (temp) user rows — pure role matrices alone cannot
 * prove the SQL count.
 */
import { describe, expect, it } from "vitest";
import type { Database as AppDatabase } from "@/db";
import { user } from "@/db/schema";
import {
	assertAdminMayActOn,
	assertNotLastAdmin,
	isAdminRole,
} from "@/services/admin-security";
import { HttpError } from "@/utils/api-error";
import { createTestDatabase, hasTestDatabase } from "./test-db";

const ACTOR = "actor-admin";
const TARGET = "target";

describe.skipIf(!hasTestDatabase)("administrator peer protection", () => {
	it("lets an administrator ban, demote and revoke an ordinary user", () => {
		const act = (extra: Record<string, unknown>) =>
			assertAdminMayActOn({
				actorId: ACTOR,
				targetId: TARGET,
				targetRole: "user",
				...extra,
			});

		expect(() => act({ banning: true })).not.toThrow();
		expect(() => act({ nextRole: "admin" })).not.toThrow();
		expect(() => act({ revokingCredentials: true })).not.toThrow();
	});

	for (const peerRole of ["admin", "superadmin"] as const) {
		const act = (extra: Record<string, unknown>) =>
			assertAdminMayActOn({
				actorId: ACTOR,
				targetId: TARGET,
				targetRole: peerRole,
				...extra,
			});

		it(`refuses to ban a ${peerRole}`, () => {
			expect(() => act({ banning: true })).toThrow(/administrator/i);
		});

		// A bare Error would reach the client without a status, so the query
		// client's "a 4xx is a refusal, not a flake" rule would miss it and retry
		// a decision that can never change.
		it(`refuses to ban a ${peerRole} with a 403 that survives the wire`, () => {
			expect(() => act({ banning: true })).toThrow(HttpError);
			try {
				act({ banning: true });
				expect.unreachable();
			} catch (e) {
				expect((e as HttpError).status).toBe(403);
				expect((e as HttpError).error).toBe("forbidden");
			}
		});

		it(`refuses to demote a ${peerRole}`, () => {
			expect(() => act({ nextRole: "user" })).toThrow(/administrator/i);
		});

		it(`refuses to revoke a ${peerRole}'s credentials`, () => {
			expect(() => act({ revokingCredentials: true })).toThrow(
				/administrator/i,
			);
		});

		it(`still lets a ${peerRole} be unbanned`, () => {
			expect(() => act({ banning: false })).not.toThrow();
		});

		it(`leaves a ${peerRole}'s other fields editable`, () => {
			expect(() => act({})).not.toThrow();
		});
	}

	it("refuses an administrator changing their own role", () => {
		expect(() =>
			assertAdminMayActOn({
				actorId: ACTOR,
				targetId: ACTOR,
				targetRole: "admin",
				nextRole: "user",
			}),
		).toThrow(/own role/i);
	});

	it("does not refuse a self-update that leaves the role alone", () => {
		expect(() =>
			assertAdminMayActOn({
				actorId: ACTOR,
				targetId: ACTOR,
				targetRole: "admin",
				nextRole: "admin",
			}),
		).not.toThrow();
	});

	it("treats admin and superadmin as administrator roles", () => {
		expect(isAdminRole("admin")).toBe(true);
		expect(isAdminRole("superadmin")).toBe(true);
		expect(isAdminRole("user")).toBe(false);
		expect(isAdminRole(null)).toBe(false);
	});
});

// Temp table: assertNotLastAdmin only reads `user`; shared rls_test is never
// truncated, so counting needs its own isolation.
async function makeUserTable(): Promise<AppDatabase> {
	return createTestDatabase(`
		CREATE TEMP TABLE "user" (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			email_verified BOOLEAN NOT NULL DEFAULT false,
			two_factor_enabled BOOLEAN DEFAULT false,
			image TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT now(),
			updated_at TIMESTAMP NOT NULL DEFAULT now(),
			role TEXT,
			banned BOOLEAN DEFAULT false,
			ban_reason TEXT,
			ban_expires TIMESTAMP,
			stripe_customer_id TEXT,
			tokens_revoked_at TIMESTAMP,
			locale TEXT
		);
	`);
}

const seed = (db: AppDatabase, rows: Array<[string, string | null, boolean]>) =>
	db.insert(user).values(
		rows.map(([id, role, banned]) => ({
			id,
			name: id,
			email: `${id}@peer.test`,
			role,
			banned,
		})),
	);

describe.skipIf(!hasTestDatabase)("the last usable administrator", () => {
	it("counts a superadmin as an administrator", async () => {
		const db = await makeUserTable();
		await seed(db, [
			["a1", "admin", false],
			["s1", "superadmin", false],
		]);

		await expect(assertNotLastAdmin(db, "a1")).resolves.toBeUndefined();
	});

	it("refuses when the only other administrator is a banned superadmin", async () => {
		const db = await makeUserTable();
		await seed(db, [
			["a1", "admin", false],
			["s1", "superadmin", true],
		]);

		await expect(assertNotLastAdmin(db, "a1")).rejects.toThrow(
			/last administrator/i,
		);
	});

	it("refuses when the target is the only administrator left", async () => {
		const db = await makeUserTable();
		await seed(db, [
			["s1", "superadmin", false],
			["u1", "user", false],
		]);

		await expect(assertNotLastAdmin(db, "s1")).rejects.toThrow(
			/last administrator/i,
		);
	});
});
