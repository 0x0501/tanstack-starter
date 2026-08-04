// @vitest-environment jsdom

/**
 * Seam: the query layer, entered the way a page enters it.
 *
 * A user whose session expired mid-session used to watch the page crash or
 * render zeros because a 401 arrived as the resolved query value. The remedy
 * is one rule on the shared QueryClient: send them to sign-in and never cache
 * the refusal as data.
 */
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/utils/api-error";

const { goToSignIn } = vi.hoisted(() => ({ goToSignIn: vi.fn() }));

vi.mock("@/utils/auth-redirect", async (importActual) => ({
	...(await importActual<typeof import("@/utils/auth-redirect")>()),
	goToSignIn,
}));

const { getContext } = await import(
	"@/integrations/tanstack-query/root-provider"
);

/** A guarded server function refusing the way the guard middleware refuses. */
function refuses(status: number) {
	return () => {
		throw new HttpError({
			status,
			error: status === 401 ? "unauthorized" : "forbidden",
			message: "Authentication required.",
		});
	};
}

/**
 * Through the client's own defaults, so the retry policy under test is the one
 * a page gets. `retry: false` is only for the transient-fault case.
 */
async function runQuery(queryFn: () => unknown, retry?: false) {
	const { queryClient } = getContext();
	await queryClient
		.fetchQuery({ queryKey: ["guarded"], queryFn, retry })
		.catch(() => {});
	return queryClient;
}

describe("a guarded query refused mid-session", () => {
	it("sends the user to sign-in, carrying where they were", async () => {
		goToSignIn.mockClear();
		window.history.replaceState({}, "", "/dashboard/account?tab=security");

		await runQuery(refuses(401));

		expect(goToSignIn).toHaveBeenCalledWith("/dashboard/account?tab=security");
	});

	it("never caches the refusal as data", async () => {
		goToSignIn.mockClear();

		const queryClient = await runQuery(refuses(401));

		expect(queryClient.getQueryData(["guarded"])).toBeUndefined();
	});

	// If the retry policy is ever lost, the three default retries back off for
	// ~7s — this fails by call count (and by timeout) rather than passing slowly.
	it("is refused exactly once — a 4xx is deterministic, so the redirect is immediate", async () => {
		goToSignIn.mockClear();
		const queryFn = vi.fn(refuses(401));

		await runQuery(queryFn);

		expect(queryFn).toHaveBeenCalledTimes(1);
		expect(goToSignIn).toHaveBeenCalledTimes(1);
	});

	it("leaves a 403 where it is — the session is fine, the permission is not", async () => {
		goToSignIn.mockClear();

		await runQuery(refuses(403));

		expect(goToSignIn).not.toHaveBeenCalled();
	});

	it("does not mistake a network failure for an expired session", async () => {
		goToSignIn.mockClear();

		await runQuery(() => {
			throw new TypeError("Failed to fetch");
		}, false);

		expect(goToSignIn).not.toHaveBeenCalled();
	});
});
