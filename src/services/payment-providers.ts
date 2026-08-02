/**
 * Thin hosted-checkout adapters for demo purchase start.
 * Webhooks remain the paid confirmation path.
 */
import { env } from "@/env";
import type { PurchaseProvider } from "@/services/purchase";

export function isPaymentProviderConfigured(
	provider: PurchaseProvider,
): boolean {
	switch (provider) {
		case "stripe":
			return Boolean(env.STRIPE_SECRET_KEY);
		case "creem":
			return Boolean(env.CREEM_API_KEY && env.CREEM_PRODUCT_ID);
		case "nowpayments":
			return Boolean(env.NOW_PAYMENTS_API_KEY);
		default:
			return false;
	}
}

export async function createHostedCheckoutSession(input: {
	provider: PurchaseProvider;
	userId: string;
	userEmail: string;
	amount: number;
	currency: string;
}): Promise<{ externalId: string; url: string }> {
	switch (input.provider) {
		case "stripe":
			return createStripeSession(input);
		case "creem":
			return createCreemCheckout(input);
		case "nowpayments":
			return createNowPaymentsInvoice(input);
		default:
			throw new Error(`Unknown payment provider: ${input.provider}`);
	}
}

async function createStripeSession(input: {
	userId: string;
	userEmail: string;
	amount: number;
	currency: string;
}): Promise<{ externalId: string; url: string }> {
	const key = env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("Stripe is not configured.");
	const origin = env.APP_ORIGIN;
	const body = new URLSearchParams();
	body.set("mode", "payment");
	body.set("success_url", `${origin}/dashboard?checkout=success`);
	body.set("cancel_url", `${origin}/dashboard?checkout=cancel`);
	body.set("customer_email", input.userEmail);
	body.set("client_reference_id", input.userId);
	body.set("line_items[0][quantity]", "1");
	body.set("line_items[0][price_data][currency]", input.currency);
	body.set("line_items[0][price_data][unit_amount]", String(input.amount));
	body.set("line_items[0][price_data][product_data][name]", "Demo purchase");

	const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
		method: "POST",
		headers: {
			authorization: `Bearer ${key}`,
			"content-type": "application/x-www-form-urlencoded",
		},
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Stripe checkout failed: ${res.status} ${text}`);
	}
	const data = (await res.json()) as { id: string; url: string };
	if (!data.id || !data.url) throw new Error("Stripe returned no session URL.");
	return { externalId: data.id, url: data.url };
}

async function createCreemCheckout(input: {
	userId: string;
	userEmail: string;
	amount: number;
}): Promise<{ externalId: string; url: string }> {
	const apiKey = env.CREEM_API_KEY;
	const productId = env.CREEM_PRODUCT_ID;
	if (!apiKey || !productId) throw new Error("Creem is not configured.");
	const base = env.CREEM_TEST_MODE
		? "https://test-api.creem.io"
		: "https://api.creem.io";
	const res = await fetch(`${base}/v1/checkouts`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify({
			product_id: productId,
			request_id: input.userId,
			customer: { email: input.userEmail },
			// custom_price in minor units when product allows
			custom_price: input.amount,
			success_url: `${env.APP_ORIGIN}/dashboard?checkout=success`,
		}),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Creem checkout failed: ${res.status} ${text}`);
	}
	const data = (await res.json()) as {
		id?: string;
		checkout_url?: string;
		url?: string;
	};
	const externalId = data.id;
	const url = data.checkout_url ?? data.url;
	if (!externalId || !url) throw new Error("Creem returned no checkout URL.");
	return { externalId, url };
}

async function createNowPaymentsInvoice(input: {
	userId: string;
	userEmail: string;
	amount: number;
	currency: string;
}): Promise<{ externalId: string; url: string }> {
	const apiKey = env.NOW_PAYMENTS_API_KEY;
	if (!apiKey) throw new Error("NOWPayments is not configured.");
	const priceAmount = (input.amount / 100).toFixed(2);
	const res = await fetch("https://api.nowpayments.io/v1/invoice", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify({
			price_amount: Number(priceAmount),
			price_currency: input.currency,
			order_id: `demo-${input.userId}-${Date.now()}`,
			order_description: "Demo purchase",
			ipn_callback_url: `${env.APP_ORIGIN}/api/webhooks/nowpayments`,
			success_url: `${env.APP_ORIGIN}/dashboard?checkout=success`,
			cancel_url: `${env.APP_ORIGIN}/dashboard?checkout=cancel`,
		}),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`NOWPayments invoice failed: ${res.status} ${text}`);
	}
	const data = (await res.json()) as {
		id?: string | number;
		invoice_url?: string;
	};
	if (data.id == null || !data.invoice_url) {
		throw new Error("NOWPayments returned no invoice URL.");
	}
	return { externalId: String(data.id), url: data.invoice_url };
}
