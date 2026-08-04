/**
 * Purchase fulfillment seam: the purchase-paid hook runs inside the same
 * transaction as the pending→paid flip, so a delivery is exactly-once across
 * webhook retries — never twice, and never silently lost.
 *
 * Runs against the real Postgres container: the atomicity under test is the
 * database's, and an in-memory double cannot fail the way this needs to.
 */
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";
import { adminAction, purchase } from "@/db/schema";
import { markPurchasePaid, type Purchase } from "@/services/purchase";
import { createTestDatabase, hasTestDatabase } from "./test-db";

const PURCHASE_DDL = `
	CREATE TEMP TABLE "purchase" (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		provider TEXT NOT NULL,
		external_id TEXT NOT NULL,
		amount TEXT NOT NULL,
		currency TEXT NOT NULL DEFAULT 'usd',
		status TEXT NOT NULL DEFAULT 'pending',
		metadata JSONB,
		paid_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
		updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
		UNIQUE (provider, external_id)
	);
	CREATE TEMP TABLE "admin_action" (
		id TEXT PRIMARY KEY,
		actor_id TEXT,
		action TEXT NOT NULL,
		target_type TEXT,
		target_id TEXT,
		detail JSONB,
		created_at TIMESTAMPTZ DEFAULT now() NOT NULL
	);
`;

async function seedPending(
	db: Database,
	overrides: Partial<{ externalId: string; amount: number }> = {},
) {
	const id = crypto.randomUUID();
	await db.insert(purchase).values({
		id,
		userId: "user-1",
		provider: "stripe",
		externalId: overrides.externalId ?? "cs_test_1",
		amount: String(overrides.amount ?? 1999),
		currency: "usd",
		status: "pending",
	});
	return id;
}

function readRow(db: Database, externalId: string) {
	return db
		.select()
		.from(purchase)
		.where(
			and(eq(purchase.provider, "stripe"), eq(purchase.externalId, externalId)),
		)
		.limit(1);
}

function readAudits(db: Database) {
	return db.select().from(adminAction);
}

describe.skipIf(!hasTestDatabase)("markPurchasePaid", () => {
	it("fulfills a pending purchase once, with the row's own amount and user", async () => {
		const db = await createTestDatabase(PURCHASE_DDL);
		await seedPending(db);
		const hook = vi.fn(async (_tx: Database, _p: Purchase) => {});

		const result = await markPurchasePaid(
			db,
			{ provider: "stripe", externalId: "cs_test_1" },
			hook,
		);

		expect(result.status).toBe("fulfilled");
		expect(hook).toHaveBeenCalledTimes(1);
		// Trusted values come from the row, never from the callback.
		expect(hook.mock.calls[0][1]).toMatchObject({
			userId: "user-1",
			amount: 1999,
			currency: "usd",
			status: "paid",
		});

		const [row] = await readRow(db, "cs_test_1");
		expect(row.status).toBe("paid");
		expect(row.paidAt).not.toBeNull();
	});

	it("ignores a duplicate delivery without running the hook again", async () => {
		const db = await createTestDatabase(PURCHASE_DDL);
		await seedPending(db);
		const hook = vi.fn(async (_tx: Database, _p: Purchase) => {});

		await markPurchasePaid(
			db,
			{ provider: "stripe", externalId: "cs_test_1" },
			hook,
		);
		const again = await markPurchasePaid(
			db,
			{ provider: "stripe", externalId: "cs_test_1" },
			hook,
		);

		expect(again.status).toBe("already_paid");
		expect(hook).toHaveBeenCalledTimes(1);

		const audits = await readAudits(db);
		expect(audits.map((a) => a.action)).toEqual([
			"purchase.paid",
			"purchase.duplicate_ignored",
		]);
	});

	it("reports not_found for an external id it does not know", async () => {
		const db = await createTestDatabase(PURCHASE_DDL);
		const hook = vi.fn(async (_tx: Database, _p: Purchase) => {});

		const result = await markPurchasePaid(
			db,
			{ provider: "stripe", externalId: "cs_missing" },
			hook,
		);

		expect(result.status).toBe("not_found");
		expect(hook).not.toHaveBeenCalled();
	});

	it("fails closed when the reported amount disagrees with the row", async () => {
		const db = await createTestDatabase(PURCHASE_DDL);
		await seedPending(db, { amount: 1999 });
		const hook = vi.fn(async (_tx: Database, _p: Purchase) => {});

		const result = await markPurchasePaid(
			db,
			{ provider: "stripe", externalId: "cs_test_1", reportedAmount: 100 },
			hook,
		);

		expect(result.status).toBe("amount_mismatch");
		expect(hook).not.toHaveBeenCalled();
		const [row] = await readRow(db, "cs_test_1");
		expect(row.status).toBe("pending");
	});

	// The reason the hook takes `tx`. Without the shared transaction the flip
	// survives a failed hook, the provider's retry short-circuits on
	// `already_paid`, and the delivery is lost while the audit log claims it
	// happened.
	it("rolls the flip back when the hook throws, and the retry delivers exactly once", async () => {
		const db = await createTestDatabase(PURCHASE_DDL);
		await seedPending(db);

		let attempts = 0;
		const delivered: string[] = [];
		const hook = async (_tx: Database, p: Purchase) => {
			attempts += 1;
			if (attempts === 1) throw new Error("fulfillment backend is down");
			delivered.push(p.id);
		};

		await expect(
			markPurchasePaid(
				db,
				{ provider: "stripe", externalId: "cs_test_1" },
				hook,
			),
		).rejects.toThrow("fulfillment backend is down");

		// The row is back to pending, so the retry is not short-circuited.
		const [afterFailure] = await readRow(db, "cs_test_1");
		expect(afterFailure.status).toBe("pending");
		expect(afterFailure.paidAt).toBeNull();
		expect(delivered).toEqual([]);

		// And nothing claimed the purchase was delivered.
		expect(await readAudits(db)).toHaveLength(0);

		const retry = await markPurchasePaid(
			db,
			{ provider: "stripe", externalId: "cs_test_1" },
			hook,
		);

		expect(retry.status).toBe("fulfilled");
		expect(delivered).toHaveLength(1);
		const [afterRetry] = await readRow(db, "cs_test_1");
		expect(afterRetry.status).toBe("paid");
		expect((await readAudits(db)).map((a) => a.action)).toEqual([
			"purchase.paid",
		]);
	});
});
