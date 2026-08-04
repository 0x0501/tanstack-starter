/**
 * Purchase seam extension: demo checkout start is gated by payment toggles
 * and provider env readiness. Creates a pending Purchase under service scope
 * only (user RLS cannot insert purchases).
 */
import { describe, expect, it, vi } from "vitest";
import {
	DEMO_CHECKOUT_AMOUNT_MINOR,
	type DemoCheckoutPort,
	resolveCheckoutGate,
	startDemoCheckout,
} from "@/services/demo-checkout";
import type { PurchaseProvider } from "@/services/purchase";

describe("resolveCheckoutGate", () => {
	const configured = {
		stripe: true,
		creem: true,
		nowpayments: true,
	};

	it("allows a rail that is toggled on and configured", () => {
		expect(
			resolveCheckoutGate({
				provider: "stripe",
				toggles: { stripe: true, creem: true, nowpayments: true },
				configured,
			}),
		).toEqual({ ok: true });
	});

	it("refuses a rail that is toggled off even when configured", () => {
		expect(
			resolveCheckoutGate({
				provider: "stripe",
				toggles: { stripe: false, creem: true, nowpayments: true },
				configured,
			}),
		).toEqual({ ok: false, code: "disabled" });
	});

	it("refuses a rail that lacks credentials even when toggled on", () => {
		expect(
			resolveCheckoutGate({
				provider: "creem",
				toggles: { stripe: true, creem: true, nowpayments: true },
				configured: { ...configured, creem: false },
			}),
		).toEqual({ ok: false, code: "not_configured" });
	});
});

describe("startDemoCheckout", () => {
	function makePort(
		overrides: Partial<DemoCheckoutPort> = {},
	): DemoCheckoutPort {
		return {
			getToggles: async () => ({
				stripe: true,
				creem: true,
				nowpayments: true,
			}),
			isConfigured: (p: PurchaseProvider) => p === "stripe",
			createHostedSession: async () => ({
				externalId: "cs_test_1",
				url: "https://checkout.example/session",
			}),
			createPendingPurchase: async () => ({ purchaseId: "pur_1" }),
			...overrides,
		};
	}

	it("creates a pending purchase and returns the hosted URL", async () => {
		const createPending = vi.fn(async () => ({ purchaseId: "pur_1" }));
		const createHosted = vi.fn(async () => ({
			externalId: "cs_test_1",
			url: "https://checkout.example/session",
		}));
		const result = await startDemoCheckout(
			makePort({
				createPendingPurchase: createPending,
				createHostedSession: createHosted,
			}),
			{ userId: "u1", userEmail: "u1@example.test", provider: "stripe" },
		);

		expect(result).toEqual({
			ok: true,
			url: "https://checkout.example/session",
			purchaseId: "pur_1",
			externalId: "cs_test_1",
			amount: DEMO_CHECKOUT_AMOUNT_MINOR,
		});
		expect(createHosted).toHaveBeenCalledWith({
			provider: "stripe",
			userId: "u1",
			// Providers bill an address, not an id — a session created without it
			// is the difference between a receipt and a silent orphan charge.
			userEmail: "u1@example.test",
			amount: DEMO_CHECKOUT_AMOUNT_MINOR,
			currency: "usd",
		});
		expect(createPending).toHaveBeenCalledWith({
			userId: "u1",
			provider: "stripe",
			externalId: "cs_test_1",
			amount: DEMO_CHECKOUT_AMOUNT_MINOR,
			currency: "usd",
		});
	});

	it("does not create a purchase when the rail is disabled", async () => {
		const createPending = vi.fn();
		const result = await startDemoCheckout(
			makePort({
				getToggles: async () => ({
					stripe: false,
					creem: true,
					nowpayments: true,
				}),
				createPendingPurchase: createPending,
			}),
			{ userId: "u1", userEmail: "u1@example.test", provider: "stripe" },
		);
		expect(result).toEqual({ ok: false, code: "disabled" });
		expect(createPending).not.toHaveBeenCalled();
	});

	it("does not create a purchase when credentials are missing", async () => {
		const createPending = vi.fn();
		const result = await startDemoCheckout(
			makePort({
				isConfigured: () => false,
				createPendingPurchase: createPending,
			}),
			{ userId: "u1", userEmail: "u1@example.test", provider: "stripe" },
		);
		expect(result).toEqual({ ok: false, code: "not_configured" });
		expect(createPending).not.toHaveBeenCalled();
	});
});
