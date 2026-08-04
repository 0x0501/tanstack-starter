/**
 * Demo checkout server fns. sessionMiddleware + explicit withRlsService:
 * system_config and purchase writes need service GUC; provider HTTP must not
 * run inside a held transaction (client-bundle: import providers in handler).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withRlsService } from "@/db/helper";
import { sessionMiddleware } from "@/middlewares/protected";
import { startDemoCheckout } from "@/services/demo-checkout";
import { getPaymentToggles } from "@/services/payment-toggles";
import { createPendingPurchase } from "@/services/purchase-db";
import { validated } from "@/utils/api-error";

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
		validated(
			z.object({
				provider: z.enum(["stripe", "creem", "nowpayments"]),
			}),
		),
	)
	.handler(async ({ context, data }) => {
		const { createHostedCheckoutSession, isPaymentProviderConfigured } =
			await import("@/services/payment-providers");

		// The order (gate → host session → pending row) lives in
		// `startDemoCheckout` and is covered there. This handler only supplies
		// the Worker-side edges: RLS-scoped reads and writes, and provider HTTP
		// that must stay outside any held transaction.
		return startDemoCheckout(
			{
				getToggles: () =>
					withRlsService(context.db, (tx) => getPaymentToggles(tx)),
				isConfigured: isPaymentProviderConfigured,
				createHostedSession: createHostedCheckoutSession,
				createPendingPurchase: (input) =>
					withRlsService(context.db, (tx) => createPendingPurchase(tx, input)),
			},
			{
				userId: context.session.user.id,
				userEmail: context.session.user.email,
				provider: data.provider,
			},
		);
	});
