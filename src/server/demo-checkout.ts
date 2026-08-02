/**
 * Demo checkout server fns. sessionMiddleware + explicit withRlsService:
 * system_config and purchase writes need service GUC; provider HTTP must not
 * run inside a held transaction (client-bundle: import providers in handler).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withRlsService } from "@/db/helper";
import { sessionMiddleware } from "@/middlewares/protected";
import {
	DEMO_CHECKOUT_AMOUNT_MINOR,
	resolveCheckoutGate,
} from "@/services/demo-checkout";
import { getPaymentToggles } from "@/services/payment-toggles";
import { createPendingPurchase } from "@/services/purchase-db";

// sessionMiddleware → betterAuth → database (raw db, no user RLS tx).
// Purchase / system_config writes use withRlsService; provider HTTP stays outside.

export const getDemoCheckoutMethods = createServerFn({ method: "GET" })
	.middleware([sessionMiddleware])
	.handler(async ({ context }) => {
		const { isPaymentProviderConfigured } = await import(
			"@/services/payment-providers"
		);
		const toggles = await withRlsService(context.db, (tx) =>
			getPaymentToggles(tx),
		);
		return {
			stripe: toggles.stripe && isPaymentProviderConfigured("stripe"),
			creem: toggles.creem && isPaymentProviderConfigured("creem"),
			nowpayments:
				toggles.nowpayments && isPaymentProviderConfigured("nowpayments"),
		};
	});

export const startDemoPurchase = createServerFn({ method: "POST" })
	.middleware([sessionMiddleware])
	.validator(
		z.object({
			provider: z.enum(["stripe", "creem", "nowpayments"]),
		}),
	)
	.handler(async ({ context, data }) => {
		const { createHostedCheckoutSession, isPaymentProviderConfigured } =
			await import("@/services/payment-providers");
		const userId = context.session.user.id;
		const userEmail = context.session.user.email;
		const provider = data.provider;

		const toggles = await withRlsService(context.db, (tx) =>
			getPaymentToggles(tx),
		);
		const gate = resolveCheckoutGate({
			provider,
			toggles,
			configured: {
				stripe: isPaymentProviderConfigured("stripe"),
				creem: isPaymentProviderConfigured("creem"),
				nowpayments: isPaymentProviderConfigured("nowpayments"),
			},
		});
		if (!gate.ok) return gate;

		// Network call outside any transaction.
		const session = await createHostedCheckoutSession({
			provider,
			userId,
			userEmail,
			amount: DEMO_CHECKOUT_AMOUNT_MINOR,
			currency: "usd",
		});

		const { purchaseId } = await withRlsService(context.db, (tx) =>
			createPendingPurchase(tx, {
				userId,
				provider,
				externalId: session.externalId,
				amount: DEMO_CHECKOUT_AMOUNT_MINOR,
				currency: "usd",
			}),
		);

		return {
			ok: true as const,
			url: session.url,
			purchaseId,
			externalId: session.externalId,
			amount: DEMO_CHECKOUT_AMOUNT_MINOR,
		};
	});
