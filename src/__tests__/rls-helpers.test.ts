/**
 * RLS helpers seam: withRlsUser / withRlsService set transaction-local GUCs.
 * Policy behavior is covered in rls-policy.test.ts against real Postgres.
 */
import { describe, expect, it } from "vitest";
import {
	setRlsService,
	setRlsUserId,
	withRlsService,
	withRlsUser,
} from "@/db/helper";

describe("RLS helpers", () => {
	it("exports service and user transaction entry points", () => {
		expect(typeof withRlsUser).toBe("function");
		expect(typeof withRlsService).toBe("function");
		expect(typeof setRlsUserId).toBe("function");
		expect(typeof setRlsService).toBe("function");
	});
});
