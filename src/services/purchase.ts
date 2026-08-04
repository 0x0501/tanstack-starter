/**
 * Purchase fulfillment: idempotent mark-paid + single purchase-paid hook.
 *
 * Product domain implements fulfillment by replacing `onPurchasePaid`.
 * Adapters (Stripe/Creem/NowPayments) call `markPurchasePaid` after verifying
 * the webhook; they never invent balances or entitlements.
 */
// Type-only: erased at build, so this stays framework-agnostic. It is the same
// JSON shape the audit column stores, named once rather than twice.
import type { JsonValue } from "@/db/platform.schema";

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

/**
 * Port the fulfillment algorithm talks to. Production wires this to Drizzle;
 * tests use an in-memory implementation.
 */
export type PurchaseFulfillmentPort = {
	findByProviderExternal(
		provider: PurchaseProvider,
		externalId: string,
	): Promise<Purchase | null>;
	/** Atomic pending→paid flip. Returns null if lost the race or not pending. */
	tryMarkPaid(id: string): Promise<Purchase | null>;
	/** Best-effort; must not throw out to the caller of markPurchasePaid. */
	logAudit(entry: PurchaseAuditEntry): Promise<void>;
};

/** Default hook: no-op. Clones replace this module export for fulfillment. */
export async function onPurchasePaid(_purchase: Purchase): Promise<void> {
	// Product domain implements entitlements here.
}

/**
 * Idempotent payment fulfillment. Amounts and user identity come only from the
 * Purchase row — never from callback-reported amounts alone (optional
 * `reportedAmount` is an integrity check that fails closed on mismatch).
 */
export async function markPurchasePaid(
	port: PurchaseFulfillmentPort,
	input: {
		provider: PurchaseProvider;
		externalId: string;
		/** Optional integrity check against the local Purchase amount. */
		reportedAmount?: number;
	},
	hook: (purchase: Purchase) => Promise<void> = onPurchasePaid,
): Promise<MarkPurchasePaidResult> {
	const existing = await port.findByProviderExternal(
		input.provider,
		input.externalId,
	);
	if (!existing) return { status: "not_found" };
	if (existing.status === "paid") {
		await safeAudit(port, {
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

	const paid = await port.tryMarkPaid(existing.id);
	if (!paid) {
		// Lost the race: concurrent confirmation already fulfilled.
		const again = await port.findByProviderExternal(
			input.provider,
			input.externalId,
		);
		if (again?.status === "paid") {
			await safeAudit(port, {
				action: "purchase.duplicate_ignored",
				targetId: again.id,
			});
			return { status: "already_paid", purchase: again };
		}
		return { status: "not_pending", purchase: existing };
	}

	await safeAudit(port, {
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
	await hook(paid);
	return { status: "fulfilled", purchase: paid };
}

async function safeAudit(
	port: PurchaseFulfillmentPort,
	entry: PurchaseAuditEntry,
): Promise<void> {
	try {
		await port.logAudit(entry);
	} catch (e) {
		console.error("purchase audit log write failed", e);
	}
}
