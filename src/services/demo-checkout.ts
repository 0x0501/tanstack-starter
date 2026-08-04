/**
 * Minimal demo checkout start: toggle + env gated, pending Purchase under
 * service scope. Product domain fulfills via onPurchasePaid.
 */
import type { PaymentToggles } from "@/services/payment-toggles";
import type { PurchaseProvider } from "@/services/purchase";

/** Fixed demo price in minor units ($5.00). Clones replace or parameterize. */
export const DEMO_CHECKOUT_AMOUNT_MINOR = 500;

type CheckoutGateResult =
	| { ok: true }
	| { ok: false; code: "disabled" | "not_configured" };

export function resolveCheckoutGate(args: {
	provider: PurchaseProvider;
	toggles: PaymentToggles;
	configured: Record<PurchaseProvider, boolean>;
}): CheckoutGateResult {
	if (!args.toggles[args.provider]) return { ok: false, code: "disabled" };
	if (!args.configured[args.provider]) {
		return { ok: false, code: "not_configured" };
	}
	return { ok: true };
}

export type DemoCheckoutPort = {
	getToggles(): Promise<PaymentToggles>;
	isConfigured(provider: PurchaseProvider): boolean;
	createHostedSession(input: {
		provider: PurchaseProvider;
		userId: string;
		userEmail: string;
		amount: number;
		currency: string;
	}): Promise<{ externalId: string; url: string }>;
	createPendingPurchase(input: {
		userId: string;
		provider: PurchaseProvider;
		externalId: string;
		amount: number;
		currency: string;
	}): Promise<{ purchaseId: string }>;
};

type StartDemoCheckoutResult =
	| {
			ok: true;
			url: string;
			purchaseId: string;
			externalId: string;
			amount: number;
	  }
	| { ok: false; code: "disabled" | "not_configured" };

/**
 * Start a demo checkout: host session first (external id), then pending row
 * keyed by that id so webhooks can fulfill. Host session before DB so a
 * failed provider call never leaves an orphan pending purchase.
 */
export async function startDemoCheckout(
	port: DemoCheckoutPort,
	input: { userId: string; userEmail: string; provider: PurchaseProvider },
): Promise<StartDemoCheckoutResult> {
	const toggles = await port.getToggles();
	const gate = resolveCheckoutGate({
		provider: input.provider,
		toggles,
		configured: {
			stripe: port.isConfigured("stripe"),
			creem: port.isConfigured("creem"),
			nowpayments: port.isConfigured("nowpayments"),
		},
	});
	if (!gate.ok) return gate;

	const currency = "usd";
	const amount = DEMO_CHECKOUT_AMOUNT_MINOR;
	const session = await port.createHostedSession({
		provider: input.provider,
		userId: input.userId,
		userEmail: input.userEmail,
		amount,
		currency,
	});
	const { purchaseId } = await port.createPendingPurchase({
		userId: input.userId,
		provider: input.provider,
		externalId: session.externalId,
		amount,
		currency,
	});
	return {
		ok: true,
		url: session.url,
		purchaseId,
		externalId: session.externalId,
		amount,
	};
}
