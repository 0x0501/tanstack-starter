/**
 * Purchase fulfillment seam: a paid Purchase invokes the purchase-paid hook at
 * most once; fulfillment trusts the Purchase row's amount and user.
 */
import { describe, expect, it, vi } from "vitest";
import {
	type MarkPurchasePaidResult,
	markPurchasePaid,
	type Purchase,
	type PurchaseFulfillmentPort,
} from "@/services/purchase";

function memoryPort(seed: Purchase[]): PurchaseFulfillmentPort & {
	audits: Array<{ action: string; targetId: string }>;
} {
	const rows = new Map(seed.map((p) => [p.id, { ...p }]));
	const audits: Array<{ action: string; targetId: string }> = [];

	return {
		audits,
		async findByProviderExternal(provider, externalId) {
			for (const row of rows.values()) {
				if (row.provider === provider && row.externalId === externalId) {
					return { ...row };
				}
			}
			return null;
		},
		async tryMarkPaid(id) {
			const row = rows.get(id);
			if (!row || row.status !== "pending") return null;
			row.status = "paid";
			row.paidAt = new Date();
			return { ...row };
		},
		async logAudit(entry) {
			audits.push({
				action: entry.action,
				targetId: entry.targetId ?? "",
			});
		},
	};
}

const pending = (over: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	userId: "u1",
	provider: "stripe",
	externalId: "cs_1",
	amount: 1_000,
	currency: "usd",
	status: "pending",
	paidAt: null,
	...over,
});

describe("markPurchasePaid", () => {
	it("flips pending to paid and invokes the purchase-paid hook once with trusted fields", async () => {
		const port = memoryPort([pending()]);
		const onPaid = vi.fn(async (_p: Purchase) => {});

		const result = await markPurchasePaid(
			port,
			{ provider: "stripe", externalId: "cs_1" },
			onPaid,
		);

		expect(result).toEqual({
			status: "fulfilled",
			purchase: expect.objectContaining({
				id: "p1",
				userId: "u1",
				amount: 1_000,
				status: "paid",
			}),
		} satisfies Partial<MarkPurchasePaidResult>);
		expect(onPaid).toHaveBeenCalledTimes(1);
		expect(onPaid).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "u1", amount: 1_000 }),
		);
		expect(port.audits).toContainEqual({
			action: "purchase.paid",
			targetId: "p1",
		});
	});

	it("credits at most once no matter how many confirmations arrive", async () => {
		const port = memoryPort([pending()]);
		const onPaid = vi.fn(async () => {});

		const first = await markPurchasePaid(
			port,
			{ provider: "stripe", externalId: "cs_1" },
			onPaid,
		);
		const second = await markPurchasePaid(
			port,
			{ provider: "stripe", externalId: "cs_1" },
			onPaid,
		);

		expect(first.status).toBe("fulfilled");
		expect(second.status).toBe("already_paid");
		expect(onPaid).toHaveBeenCalledTimes(1);
		expect(
			port.audits.filter((a) => a.action === "purchase.paid"),
		).toHaveLength(1);
		expect(
			port.audits.filter((a) => a.action === "purchase.duplicate_ignored"),
		).toHaveLength(1);
	});

	it("is a no-op for an unknown external id", async () => {
		const port = memoryPort([]);
		const onPaid = vi.fn(async () => {});

		const result = await markPurchasePaid(
			port,
			{ provider: "stripe", externalId: "cs_ghost" },
			onPaid,
		);

		expect(result.status).toBe("not_found");
		expect(onPaid).not.toHaveBeenCalled();
	});

	it("fails closed when the provider-reported amount disagrees with the Purchase row", async () => {
		const port = memoryPort([pending({ amount: 50_000 })]);
		const onPaid = vi.fn(async () => {});

		const result = await markPurchasePaid(
			port,
			{
				provider: "stripe",
				externalId: "cs_1",
				reportedAmount: 1,
			},
			onPaid,
		);

		expect(result.status).toBe("amount_mismatch");
		expect(onPaid).not.toHaveBeenCalled();
		const after = await port.findByProviderExternal("stripe", "cs_1");
		expect(after?.status).toBe("pending");
	});

	it("does not fulfill a failed purchase", async () => {
		const port = memoryPort([pending({ status: "failed" })]);
		const onPaid = vi.fn(async () => {});

		const result = await markPurchasePaid(
			port,
			{ provider: "stripe", externalId: "cs_1" },
			onPaid,
		);

		expect(result.status).toBe("not_pending");
		expect(onPaid).not.toHaveBeenCalled();
	});
});
