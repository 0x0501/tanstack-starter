import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

// The oauthProvider plugin redirects here with the signed authorization query
// (client_id, scope, redirect_uri, … plus a signature). We pass that whole
// query back as `oauth_query` so the server can verify it and resume the flow;
// authClient.oauth2.consent then returns where to redirect the user.
export const Route = createFileRoute("/oauth/consent")({
	// Pass every param through untouched so the signed query survives in the URL.
	validateSearch: (search: Record<string, unknown>) =>
		search as { client_id?: string; scope?: string },
	component: RouteComponent,
});

// Faithful copy of the signed query as the server produced it (order-independent
// once canonicalized server-side, but we avoid re-encoding just in case).
function currentOAuthQuery(): string {
	return typeof window === "undefined"
		? ""
		: window.location.search.replace(/^\?/, "");
}

function RouteComponent() {
	const { client_id, scope } = Route.useSearch();
	const scopes = (scope ?? "").split(" ").filter(Boolean);
	const [pending, setPending] = useState<"accept" | "reject" | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function decide(accept: boolean) {
		setError(null);
		setPending(accept ? "accept" : "reject");
		const { data, error } = await authClient.oauth2.consent({
			accept,
			oauth_query: currentOAuthQuery(),
		});
		if (error) {
			setError(error.message ?? "Something went wrong. Please try again.");
			setPending(null);
			return;
		}
		// The plugin returns where to send the user back to the client app.
		if (data?.redirect && data.url) {
			window.location.href = data.url;
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-8">
			<div className="w-full max-w-md border border-neutral-300 p-8 dark:border-neutral-700">
				<h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
					Authorize access
				</h1>
				<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					<span className="font-medium">{client_id || "An application"}</span>{" "}
					wants to access your account.
				</p>

				{scopes.length > 0 && (
					<ul className="mt-4 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
						{scopes.map((s) => (
							<li key={s} className="flex items-center gap-2">
								<span aria-hidden>•</span>
								{s}
							</li>
						))}
					</ul>
				)}

				{error && (
					<p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
				)}

				<div className="mt-6 flex gap-2">
					<button
						type="button"
						disabled={pending !== null}
						onClick={() => void decide(true)}
						className="h-9 flex-1 bg-neutral-900 px-4 text-sm font-medium text-neutral-50 transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
					>
						{pending === "accept" ? "Authorizing…" : "Allow"}
					</button>
					<button
						type="button"
						disabled={pending !== null}
						onClick={() => void decide(false)}
						className="h-9 flex-1 border border-neutral-300 px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-50 dark:hover:bg-neutral-800"
					>
						Deny
					</button>
				</div>
			</div>
		</div>
	);
}
