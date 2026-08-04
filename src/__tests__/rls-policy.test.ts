/**
 * RLS policy integration (seam 6): real migrations, real `starter_app` role
 * (NOBYPASSRLS). Temp-table suites cannot see policies (superuser BYPASSRLS).
 *
 * Platform invariant: ordinary users cannot read `admin_action`; admin and
 * service contexts can.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Database as AppDatabase } from "@/db";
import { withRlsService, withRlsUser } from "@/db/helper";
import { adminAction, user } from "@/db/schema";
import { createRlsAppDatabase, hasTestDatabase } from "./test-rls-db";

async function seedUser(
	db: AppDatabase,
	role: string | null = "user",
): Promise<string> {
	const id = crypto.randomUUID();
	// `user` has no RLS — inserts work without a service GUC.
	await db.insert(user).values({
		id,
		name: `rls-${id.slice(0, 8)}`,
		email: `${id}@rls.test`,
		role,
	});
	return id;
}

describe.skipIf(!hasTestDatabase)(
	"admin_action RLS on the real schema (starter_app, NOBYPASSRLS)",
	() => {
		it("lets service write and read audit rows", async () => {
			const db = createRlsAppDatabase();
			const actorId = await seedUser(db, "admin");
			const actionId = crypto.randomUUID();

			await withRlsService(db, (tx) =>
				tx.insert(adminAction).values({
					id: actionId,
					actorId,
					action: "user.role_change",
					targetType: "user",
					targetId: actorId,
					detail: { test: true },
				}),
			);

			const rows = await withRlsService(db, (tx) =>
				tx.select().from(adminAction).where(eq(adminAction.id, actionId)),
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].action).toBe("user.role_change");
		});

		it("lets an administrator read audit rows under withRlsUser", async () => {
			const db = createRlsAppDatabase();
			const adminId = await seedUser(db, "admin");
			const actionId = crypto.randomUUID();

			await withRlsService(db, (tx) =>
				tx.insert(adminAction).values({
					id: actionId,
					actorId: adminId,
					action: "oauth_client.create",
					targetType: "oauth_client",
					targetId: "client-1",
				}),
			);

			const rows = await withRlsUser(db, adminId, (tx) =>
				tx.select().from(adminAction).where(eq(adminAction.id, actionId)),
			);
			expect(rows).toHaveLength(1);
		});

		it("hides audit rows from an ordinary user under withRlsUser", async () => {
			const db = createRlsAppDatabase();
			const memberId = await seedUser(db, "user");
			const adminId = await seedUser(db, "admin");
			const actionId = crypto.randomUUID();

			await withRlsService(db, (tx) =>
				tx.insert(adminAction).values({
					id: actionId,
					actorId: adminId,
					action: "user.ban",
					targetType: "user",
					targetId: memberId,
				}),
			);

			const rows = await withRlsUser(db, memberId, (tx) =>
				tx.select().from(adminAction).where(eq(adminAction.id, actionId)),
			);
			expect(rows).toHaveLength(0);
		});

		it("rejects ordinary-user writes to admin_action", async () => {
			const db = createRlsAppDatabase();
			const memberId = await seedUser(db, "user");
			const actionId = crypto.randomUUID();

			await expect(
				withRlsUser(db, memberId, (tx) =>
					tx.insert(adminAction).values({
						id: actionId,
						actorId: memberId,
						action: "forged.action",
					}),
				),
			).rejects.toThrow();

			const rows = await withRlsService(db, (tx) =>
				tx.select().from(adminAction).where(eq(adminAction.id, actionId)),
			);
			expect(rows).toHaveLength(0);
		});
	},
);
