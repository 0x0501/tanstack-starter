import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { RootSession } from "@/server/auth";
import { HttpError } from "@/utils/api-error";
import { goToSignIn } from "@/utils/auth-redirect";

export interface MyRouterContext {
	queryClient: QueryClient;
	/** Filled by root `beforeLoad` — one session read per request. */
	session?: RootSession | null;
}

/**
 * The one place an expired session is handled.
 *
 * Every guarded server function throws a 401 the same way, so the remedy
 * belongs here rather than in each page that consumes one — a component
 * whose query 401s has no better answer than the sign-in page.
 */
function handleClientDataError(error: unknown) {
	if (typeof window === "undefined") return;

	if (error instanceof HttpError && error.status === 401) {
		goToSignIn(`${window.location.pathname}${window.location.search}`);
	}
}

export function getContext(): MyRouterContext {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// A 4xx is a refusal, not a flake: asking again gets the same
				// answer, and for a 401 the default three retries held the user
				// on a dead page through ~7s of backoff before the redirect
				// above could fire. Everything else — network faults, 5xx —
				// keeps the default three attempts.
				retry: (failureCount, error) =>
					!(
						error instanceof HttpError &&
						error.status >= 400 &&
						error.status < 500
					) && failureCount < 3,
			},
		},
		queryCache: new QueryCache({
			onError: (error) => handleClientDataError(error),
		}),
		mutationCache: new MutationCache({
			onError: (error) => handleClientDataError(error),
		}),
	});

	return {
		queryClient,
	};
}

export default function TanstackQueryProvider() {}
