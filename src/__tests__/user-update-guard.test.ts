/**
 * Seam: `user.update.before` must refuse server-controlled columns.
 *
 * Better Auth merges a before-hook result over the original data, so
 * stripping keys is a silent no-op. The guard refuses instead.
 */
import { describe, expect, it } from "vitest";
import { userUpdateGuard } from "@/lib/user-update-guard";

describe("userUpdateGuard", () => {
	it("allows ordinary profile fields", () => {
		const data = { name: "Ada Lovelace", locale: "de" };
		expect(userUpdateGuard(data)).toEqual({ data });
	});

	it("refuses role and ban fields", () => {
		expect(() => userUpdateGuard({ role: "admin" })).toThrow(
			/cannot be changed/i,
		);
		expect(() => userUpdateGuard({ banned: true })).toThrow(
			/cannot be changed/i,
		);
		expect(() =>
			userUpdateGuard({ banReason: "x", banExpires: new Date() }),
		).toThrow(/cannot be changed/i);
	});

	it("refuses tokensRevokedAt", () => {
		expect(() =>
			userUpdateGuard({ tokensRevokedAt: new Date() }),
		).toThrow(/cannot be changed/i);
	});

	it("lists every refused field in the message", () => {
		try {
			userUpdateGuard({ role: "admin", banned: true });
			expect.unreachable();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			expect(message).toContain("role");
			expect(message).toContain("banned");
		}
	});

	it("passes through non-objects unchanged", () => {
		expect(userUpdateGuard(null as unknown as object)).toEqual({
			data: null,
		});
	});
});
