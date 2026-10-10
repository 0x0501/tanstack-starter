import { readFile } from "node:fs/promises";
import { catalog, isPostgres } from "../catalog.mjs";
import { replace, text } from "../template.mjs";

const definitions = {
	stripe: {
		required: "env.STRIPE_SECRET_KEY",
		functionName: "createStripeSession",
		envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
	},
	creem: {
		required: "env.CREEM_API_KEY && env.CREEM_PRODUCT_ID",
		functionName: "createCreemCheckout",
		envKeys: [
			"CREEM_API_KEY",
			"CREEM_WEBHOOK_SECRET",
			"CREEM_PRODUCT_ID",
			"CREEM_TEST_MODE",
		],
	},
	nowpayments: {
		required: "env.NOW_PAYMENTS_API_KEY",
		functionName: "createNowPaymentsInvoice",
		envKeys: [
			"NOW_PAYMENTS_API_KEY",
			"NOW_PAYMENTS_IPN_KEY",
			"NOW_PAYMENTS_TEST_MODE",
		],
	},
	polar: {
		checkoutAsset: "polar-checkout.ts",
		testAsset: "polar.test.ts",
		webhookAsset: "polar.ts",
		routeAsset: "polar-route.ts",
		dependencies: { "@polar-sh/sdk": "1.0.2" },
		envSchema:
			"\t\t\tPOLAR_ACCESS_TOKEN: z.string().optional(),\n\t\t\tPOLAR_PRODUCT_ID: z.string().optional(),\n\t\t\tPOLAR_WEBHOOK_SECRET: z.string().optional(),\n\t\t\tPOLAR_SANDBOX: z.stringbool().default(false),",
		envExample:
			"POLAR_ACCESS_TOKEN=\nPOLAR_PRODUCT_ID=\nPOLAR_WEBHOOK_SECRET=\nPOLAR_SANDBOX=true\n",
		required: "env.POLAR_ACCESS_TOKEN && env.POLAR_PRODUCT_ID",
		functionName: "createPolarCheckout",
		envKeys: [
			"POLAR_ACCESS_TOKEN",
			"POLAR_PRODUCT_ID",
			"POLAR_WEBHOOK_SECRET",
			"POLAR_SANDBOX",
		],
	},
};

export async function configurePayments({ files, pkg, selection }) {
	const ids = selection.payments;
	const allIds = catalog.payments.map((option) => option.id);
	const original = text(files, "src/services/payment-providers.ts");
	let functions = "";
	for (const id of ids) {
		const definition = definitions[id];
		if (!definition) throw new Error(`Missing payment adapter: ${id}`);
		if (definition.checkoutAsset) {
			functions += await readFile(
				new URL(`../../assets/${definition.checkoutAsset}`, import.meta.url),
				"utf8",
			);
			files.set(
				`src/services/${id}.ts`,
				await readFile(
					new URL(`../../assets/${definition.webhookAsset}`, import.meta.url),
				),
			);
			files.set(
				`src/routes/api/webhooks/${id}.ts`,
				(
					await readFile(
						new URL(`../../assets/${definition.routeAsset}`, import.meta.url),
						"utf8",
					)
				).replaceAll(
					"withRlsService",
					isPostgres(selection.database)
						? "withRlsService"
						: "withDatabaseService",
				),
			);
			if (definition.testAsset)
				files.set(
					`src/__tests__/${id}.test.ts`,
					await readFile(
						new URL(`../../assets/${definition.testAsset}`, import.meta.url),
					),
				);
			Object.assign(pkg.dependencies, definition.dependencies);
		} else {
			const start = original.indexOf(
				`async function ${definition.functionName}(`,
			);
			const end = original.indexOf("\nasync function ", start + 1);
			if (start < 0) throw new Error(`Payment template changed: ${id}`);
			functions += `${original.slice(start, end < 0 ? undefined : end)}\n`;
		}
	}
	files.set(
		"src/lib/payment-options.ts",
		`export const supportedPaymentProviders = ${JSON.stringify(allIds)} as const;
export const paymentProviders: readonly (typeof supportedPaymentProviders[number])[] = ${JSON.stringify(ids)};
`,
	);
	files.set(
		"src/services/payment-providers.ts",
		`${ids.length ? 'import { env } from "@/env";\n' : ""}import type { PurchaseProvider } from "./purchase";
export function isPaymentProviderConfigured(provider: PurchaseProvider): boolean {
	switch (provider) {
${ids.map((id) => `		case "${id}": return Boolean(${definitions[id].required});`).join("\n")}
		default: return false;
	}
}
export async function createHostedCheckoutSession(input: { provider: PurchaseProvider; userId: string; userEmail: string; amount: number; currency: string }): Promise<{ externalId: string; url: string }> {
	switch (input.provider) {
${ids.map((id) => `		case "${id}": return ${definitions[id].functionName}(input);`).join("\n")}
		default: throw new Error("Payment provider is not enabled in this project.");
	}
}
${functions}`,
	);
	replace(
		files,
		"src/services/purchase.ts",
		'"stripe" | "creem" | "nowpayments"',
		allIds.map((id) => JSON.stringify(id)).join(" | "),
	);
	files.set(
		"src/services/payment-toggles.ts",
		`import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { systemConfig } from "@/db/schema";
import { paymentProviders, supportedPaymentProviders } from "@/lib/payment-options";
import type { PurchaseProvider } from "./purchase";
export type PaymentToggles = Record<PurchaseProvider, boolean>;
const KEY = "payment_toggles";
export async function getPaymentToggles(db: Database): Promise<PaymentToggles> {
	const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, KEY)).limit(1);
	const saved = row && typeof row.value === "object" && row.value !== null ? row.value as Partial<PaymentToggles> : {};
	return Object.fromEntries(supportedPaymentProviders.map((id) => [id, paymentProviders.includes(id) && saved[id] !== false])) as PaymentToggles;
}
export async function setPaymentToggles(db: Database, toggles: PaymentToggles): Promise<void> {
	await db.insert(systemConfig).values({ key: KEY, value: toggles }).onConflictDoUpdate({ target: systemConfig.key, set: { value: toggles, updatedAt: new Date() } });
}
`,
	);
	const extras = allIds.filter(
		(id) => !["stripe", "creem", "nowpayments"].includes(id),
	);
	if (files.has("src/__tests__/demo-checkout.test.ts"))
		files.set(
			"src/__tests__/demo-checkout.test.ts",
			text(files, "src/__tests__/demo-checkout.test.ts").replace(
				/nowpayments: (true|false),?/g,
				`nowpayments: $1, ${extras.map((id) => `${id}: false,`).join(" ")}`,
			),
		);
	replace(
		files,
		"src/server/payment-toggles.ts",
		"stripe: z.boolean(),\n				creem: z.boolean(),\n				nowpayments: z.boolean(),",
		allIds.map((id) => `${id}: z.boolean(),`).join("\n"),
	);
	replace(
		files,
		"src/routes/admin/users.tsx",
		"mutationFn: (next: {\n			stripe: boolean;\n			creem: boolean;\n			nowpayments: boolean;\n		})",
		"mutationFn: (next: PaymentToggles)",
	);
	files.set(
		"src/routes/admin/users.tsx",
		`import { paymentProviders } from "@/lib/payment-options";\nimport type { PaymentToggles } from "@/services/payment-toggles";\n${text(files, "src/routes/admin/users.tsx")}`,
	);
	replace(
		files,
		"src/routes/admin/users.tsx",
		'(["stripe", "creem", "nowpayments"] as const).map',
		"paymentProviders.map",
	);
	files.set(
		"src/routes/dashboard/index.tsx",
		`import { paymentProviders } from "@/lib/payment-options";\nimport type { PurchaseProvider } from "@/services/purchase";\n${text(files, "src/routes/dashboard/index.tsx")}`,
	);
	replace(
		files,
		"src/routes/dashboard/index.tsx",
		'"stripe" | "creem" | "nowpayments"',
		"PurchaseProvider",
	);
	replace(
		files,
		"src/routes/dashboard/index.tsx",
		'(["stripe", "creem", "nowpayments"] as const).filter',
		"paymentProviders.filter",
	);
	files.set(
		"src/server/demo-checkout.ts",
		`import { paymentProviders, supportedPaymentProviders } from "@/lib/payment-options";\nimport type { PurchaseProvider } from "@/services/purchase";\n${text(files, "src/server/demo-checkout.ts")}`,
	);
	replace(
		files,
		"src/server/demo-checkout.ts",
		`return {
			stripe: toggles.stripe && isPaymentProviderConfigured("stripe"),
			creem: toggles.creem && isPaymentProviderConfigured("creem"),
			nowpayments:
				toggles.nowpayments && isPaymentProviderConfigured("nowpayments"),
		};`,
		`return Object.fromEntries(supportedPaymentProviders.map((id) => [id, toggles[id] && isPaymentProviderConfigured(id)])) as Record<PurchaseProvider, boolean>;`,
	);
	replace(
		files,
		"src/server/demo-checkout.ts",
		'provider: z.enum(["stripe", "creem", "nowpayments"]),',
		'provider: z.enum(supportedPaymentProviders).refine((value) => paymentProviders.includes(value), "Payment provider is not enabled."),',
	);
	files.set(
		"src/services/demo-checkout.ts",
		`import { supportedPaymentProviders } from "@/lib/payment-options";\n${text(files, "src/services/demo-checkout.ts")}`,
	);
	replace(
		files,
		"src/services/demo-checkout.ts",
		`configured: {
			stripe: port.isConfigured("stripe"),
			creem: port.isConfigured("creem"),
			nowpayments: port.isConfigured("nowpayments"),
		},`,
		`configured: Object.fromEntries(supportedPaymentProviders.map((id) => [id, port.isConfigured(id)])) as Record<PurchaseProvider, boolean>,`,
	);
	for (const id of allIds) {
		const definition = definitions[id];
		if (!ids.includes(id)) {
			files.delete(`src/services/${id}.ts`);
			files.delete(`src/routes/api/webhooks/${id}.ts`);
			files.delete(`src/__tests__/${id}.test.ts`);
			for (const key of definition.envKeys) {
				files.set(
					"src/env.ts",
					text(files, "src/env.ts").replace(
						new RegExp(`^			${key}:.*\\n`, "m"),
						"",
					),
				);
				files.set(
					".env.example",
					text(files, ".env.example").replace(
						new RegExp(`^${key}=.*\\n?`, "m"),
						"",
					),
				);
			}
		} else if (definition.envSchema) {
			replace(
				files,
				"src/env.ts",
				"			// Optional payment adapters",
				`${definition.envSchema}\n			// Optional payment adapters`,
			);
			files.set(
				".env.example",
				`${text(files, ".env.example")}\n${definition.envExample}`,
			);
		}
	}
	pkg.scripts.typecheck =
		"bun run generate-routes && bun run paraglide:compile && tsc --noEmit";
}
