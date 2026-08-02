/**
 * Runtime payment method toggles stored in system_config.
 * Disabled rails are refused server-side, not merely hidden.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { systemConfig } from "@/db/schema";
import type { PurchaseProvider } from "@/services/purchase";

const KEY = "payment_toggles";

export type PaymentToggles = Record<PurchaseProvider, boolean>;

const DEFAULT_TOGGLES: PaymentToggles = {
	stripe: true,
	creem: true,
	nowpayments: true,
};

export async function getPaymentToggles(db: Database): Promise<PaymentToggles> {
	const [row] = await db
		.select()
		.from(systemConfig)
		.where(eq(systemConfig.key, KEY))
		.limit(1);
	if (!row || typeof row.value !== "object" || row.value === null) {
		return { ...DEFAULT_TOGGLES };
	}
	const v = row.value as Partial<PaymentToggles>;
	return {
		stripe: v.stripe !== false,
		creem: v.creem !== false,
		nowpayments: v.nowpayments !== false,
	};
}

export async function setPaymentToggles(
	db: Database,
	toggles: PaymentToggles,
): Promise<void> {
	await db
		.insert(systemConfig)
		.values({ key: KEY, value: toggles })
		.onConflictDoUpdate({
			target: systemConfig.key,
			set: { value: toggles, updatedAt: new Date() },
		});
}

export async function assertPaymentEnabled(
	db: Database,
	provider: PurchaseProvider,
): Promise<void> {
	const toggles = await getPaymentToggles(db);
	if (!toggles[provider]) {
		throw new Error(`Payment provider ${provider} is disabled.`);
	}
}
