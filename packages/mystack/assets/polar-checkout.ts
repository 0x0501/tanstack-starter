async function createPolarCheckout(input: { userId: string; userEmail: string; amount: number; currency: string }): Promise<{ externalId: string; url: string }> {
	const { createPolar } = await import("@polar-sh/sdk/2026-10");
	if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_PRODUCT_ID) throw new Error("Polar is not configured.");
	const polar = createPolar({ accessToken: env.POLAR_ACCESS_TOKEN, environment: env.POLAR_SANDBOX ? "sandbox" : "production" });
	const checkout = await polar.checkouts.create({ products: [env.POLAR_PRODUCT_ID], customer_email: input.userEmail, external_customer_id: input.userId, success_url: `${env.APP_ORIGIN}/dashboard?checkout=success`, return_url: `${env.APP_ORIGIN}/dashboard?checkout=cancel` });
	// The configured catalog price must match the local purchase ledger. Do not
	// issue a pending purchase with an invented price for a fixed-price product.
	if (checkout.amount !== input.amount || checkout.currency.toLowerCase() !== input.currency.toLowerCase()) throw new Error("Polar product price must match the demo purchase price and currency.");
	return { externalId: checkout.id, url: checkout.url };
}
