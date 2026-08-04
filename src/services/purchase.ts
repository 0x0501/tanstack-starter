/**
 * Purchase fulfillment: idempotent mark-paid with the purchase-paid hook
 * running inside the same transaction as the pending→paid flip.
 *
 * Product domain implements fulfillment by replacing `onPurchasePaid`.
 * Adapters (Stripe/Creem/NowPayments) call `markPurchasePaid` after verifying
 * the webhook; they never invent balances or entitlements, and they trust the
 * Purchase row's amount and user rather than the numbers in the callback.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import type { JsonValue } from "@/db/platform.schema";
import { adminAction, purchase as purchaseTable } from "@/db/schema";

export type PurchaseProvider = "stripe" | "creem" | "nowpayments";

export type PurchaseStatus = "pending" | "paid" | "failed";

export type Purchase = {
	id: string;
	userId: string;
	provider: PurchaseProvider;
	externalId: string;
	/** Trusted amount in minor units (e.g. cents). */
	amount: number;
	currency: string;
	status: PurchaseStatus;
	paidAt: Date | null;
};

export type MarkPurchasePaidResult =
	| { status: "fulfilled"; purchase: Purchase }
	| { status: "already_paid"; purchase: Purchase }
	| { status: "not_found" }
	| { status: "not_pending"; purchase: Purchase }
	| { status: "amount_mismatch"; purchase: Purchase };

type PurchaseAuditEntry = {
	action: "purchase.paid" | "purchase.failed" | "purchase.duplicate_ignored";
	targetId?: string;
	detail?: Record<string, JsonValue>;
};

/** Parse a minor-unit amount stored as decimal text (no float parse). */
function parseMinorUnits(amount: string): number {
	if (!/^-?\d+$/.test(amount)) {
		throw new Error(`Invalid purchase amount: ${amount}`);
	}
	const n = Number.parseInt(amount, 10);
	if (!Number.isSafeInteger(n)) {
		throw new Error(`Purchase amount outside safe integer range: ${amount}`);
	}
	return n;
}

function rowToPurchase(row: typeof purchaseTable.$inferSelect): Purchase {
	return {
		id: row.id,
		userId: row.userId,
		provider: row.provider as PurchaseProvider,
		externalId: row.externalId,
		amount: parseMinorUnits(row.amount),
		currency: row.currency,
		status: row.status as PurchaseStatus,
		paidAt: row.paidAt,
	};
}

async function findPurchase(
	db: Database,
	provider: PurchaseProvider,
	externalId: string,
): Promise<Purchase | null> {
	const [row] = await db
		.select()
		.from(purchaseTable)
		.where(
			and(
				eq(purchaseTable.provider, provider),
				eq(purchaseTable.externalId, externalId),
			),
		)
		.limit(1);
	return row ? rowToPurchase(row) : null;
}

/**
 * The single extension point a product domain implements. Default: no-op.
 *
 * It runs **inside the transaction that flips the row to `paid`**, so a throw
 * rolls the flip back, `markPurchasePaid` rethrows, the route answers 5xx, and
 * the provider's retry re-enters and delivers exactly once. That is the whole
 * reason the hook receives `tx`.
 *
 * Because it shares that transaction it must do database work only. An HTTP
 * call or an email send here holds a Postgres connection open across the
 * network (the deadlock rule in ADR 0006, and Hyperdrive cannot multiplex a
 * held connection) and couples the provider's retry window to its latency. If
 * fulfillment needs IO, write a row here and do the IO afterwards.
 */
export async function onPurchasePaid(
	_tx: Database,
	_purchase: Purchase,
): Promise<void> {
	// Product domain implements entitlements here.
}

/**
 * Idempotent payment fulfillment. Amounts and user identity come only from the
 * Purchase row — never from callback-reported amounts alone (optional
 * `reportedAmount` is an integrity check that fails closed on mismatch).
 *
 * Throws only on a genuine processing/DB error — including a throw from
 * `hook` — so the caller can answer 5xx and the provider retries. Every mapped
 * outcome resolves, so the caller answers 200 and the provider stops retrying.
 */
export async function markPurchasePaid(
	db: Database,
	input: {
		provider: PurchaseProvider;
		externalId: string;
		/** Optional integrity check against the local Purchase amount. */
		reportedAmount?: number;
	},
	hook: (tx: Database, purchase: Purchase) => Promise<void> = onPurchasePaid,
): Promise<MarkPurchasePaidResult> {
	const existing = await findPurchase(db, input.provider, input.externalId);
	if (!existing) return { status: "not_found" };
	if (existing.status === "paid") {
		await safeAudit(db, {
			action: "purchase.duplicate_ignored",
			targetId: existing.id,
			detail: { provider: input.provider, externalId: input.externalId },
		});
		return { status: "already_paid", purchase: existing };
	}
	if (existing.status !== "pending") {
		return { status: "not_pending", purchase: existing };
	}
	if (
		input.reportedAmount !== undefined &&
		input.reportedAmount !== existing.amount
	) {
		return { status: "amount_mismatch", purchase: existing };
	}

	const now = new Date();
	const paid = await db.transaction(async (tx) => {
		const flipped = await tx
			.update(purchaseTable)
			.set({ status: "paid", paidAt: now })
			.where(
				and(
					eq(purchaseTable.id, existing.id),
					eq(purchaseTable.status, "pending"),
				),
			)
			.returning();
		// Lost the race: a concurrent confirmation already fulfilled this row.
		if (!flipped[0]) return null;
		const row = rowToPurchase(flipped[0]);
		await hook(tx as unknown as Database, row);
		return row;
	});

	if (!paid) {
		const again = await findPurchase(db, input.provider, input.externalId);
		if (again?.status === "paid") {
			await safeAudit(db, {
				action: "purchase.duplicate_ignored",
				targetId: again.id,
			});
			return { status: "already_paid", purchase: again };
		}
		return { status: "not_pending", purchase: existing };
	}

	// After the commit, never inside it. Audit writes are best-effort: a logging
	// failure must not roll back a payment that has already been delivered.
	await safeAudit(db, {
		action: "purchase.paid",
		targetId: paid.id,
		detail: {
			provider: paid.provider,
			externalId: paid.externalId,
			amount: paid.amount,
			currency: paid.currency,
			userId: paid.userId,
		},
	});
	return { status: "fulfilled", purchase: paid };
}

export async function createPendingPurchase(
	db: Database,
	input: {
		userId: string;
		provider: PurchaseProvider;
		externalId: string;
		amount: number;
		currency?: string;
	},
): Promise<{ purchaseId: string }> {
	const id = crypto.randomUUID();
	await db.insert(purchaseTable).values({
		id,
		userId: input.userId,
		provider: input.provider,
		externalId: input.externalId,
		amount: String(input.amount),
		currency: input.currency ?? "usd",
		status: "pending",
	});
	return { purchaseId: id };
}

async function safeAudit(
	db: Database,
	entry: PurchaseAuditEntry,
): Promise<void> {
	try {
		await db.insert(adminAction).values({
			id: crypto.randomUUID(),
			actorId: null,
			action: entry.action,
			targetType: "purchase",
			targetId: entry.targetId ?? null,
			detail: entry.detail ?? null,
		});
	} catch (e) {
		console.error("purchase audit log write failed", e);
	}
}
