import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminMiddleware } from "@/middlewares/admin";
import { databaseMiddleware } from "@/middlewares/database";
import { logAdminAction } from "@/services/admin-security";
import {
	getPaymentToggles,
	type PaymentToggles,
	setPaymentToggles,
} from "@/services/payment-toggles";

export const getPaymentMethodToggles = createServerFn({ method: "GET" })
	.middleware([databaseMiddleware, adminMiddleware])
	.handler(({ context }) => getPaymentToggles(context.db));

export const updatePaymentMethodToggles = createServerFn({ method: "POST" })
	.middleware([databaseMiddleware, adminMiddleware])
	.validator(
		z.object({
			stripe: z.boolean(),
			creem: z.boolean(),
			nowpayments: z.boolean(),
		}),
	)
	.handler(async ({ context, data }) => {
		const next = data as PaymentToggles;
		await setPaymentToggles(context.db, next);
		await logAdminAction(context.db, {
			actorId: context.session.user.id,
			action: "payment_toggle.change",
			targetType: "system_config",
			targetId: "payment_toggles",
			detail: next,
		});
		return { ok: true as const, toggles: next };
	});
