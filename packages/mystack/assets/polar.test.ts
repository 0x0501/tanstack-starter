import { createHmac } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import type { Database } from "@/db";
import { handlePolarWebhook } from "@/services/polar";
import { markPurchasePaid } from "@/services/purchase";
vi.mock("@/services/purchase", () => ({ markPurchasePaid: vi.fn() }));
const db = {} as Database;
const secret = "whsec_test-signing-secret";
function signed(rawBody: string) {
	const id = "test-event";
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
	return { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` };
}
beforeEach(() => vi.clearAllMocks());
test("invalid signatures never reach the purchase ledger", async () => {
	expect(await handlePolarWebhook(db, { rawBody: "{}", headers: {}, secret })).toBe("invalid_signature");
	expect(markPurchasePaid).not.toHaveBeenCalled();
});
test("verified paid events map the checkout id and subtotal to the ledger", async () => {
	vi.mocked(markPurchasePaid).mockResolvedValue({ status: "not_found" });
	const rawBody = JSON.stringify({ type: "order.paid", timestamp: new Date().toISOString(), data: { checkout_id: "checkout-1", subtotal_amount: 500 } });
	expect(await handlePolarWebhook(db, { rawBody, headers: signed(rawBody), secret })).toBe("unknown_order");
	expect(markPurchasePaid).toHaveBeenCalledWith(db, { provider: "polar", externalId: "checkout-1", reportedAmount: 500 });
});
test("a signed malformed payload is refused without ledger effects", async () => {
	const rawBody = "{invalid-json";
	expect(await handlePolarWebhook(db, { rawBody, headers: signed(rawBody), secret })).toBe("invalid_payload");
	expect(markPurchasePaid).not.toHaveBeenCalled();
});
