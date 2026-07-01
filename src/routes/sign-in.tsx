import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

// General-purpose login page. It doubles as the oauthProvider `loginPage`: when
// the OAuth flow redirects here it carries the signed authorization query, so
// after login we resume `/oauth2/authorize`; on a plain visit we just go home.
export const Route = createFileRoute("/sign-in")({
	// Keep any signed authorization query intact in the URL.
	validateSearch: (search: Record<string, unknown>) =>
		search as { client_id?: string; redirect?: string },
	component: RouteComponent,
});

function afterSignIn(): void {
	if (typeof window === "undefined") return;
	const query = window.location.search.replace(/^\?/, "");
	const params = new URLSearchParams(query);
	if (params.has("client_id")) {
		// Arrived mid OAuth-authorize → resume it, now authenticated.
		window.location.href = `/api/auth/oauth2/authorize?${query}`;
	} else {
		window.location.href = params.get("redirect") || "/";
	}
}

function RouteComponent() {
	const { client_id } = Route.useSearch();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setPending(true);
		const { error } = await authClient.signIn.email({ email, password });
		if (error) {
			setError(error.message ?? "Invalid email or password.");
			setPending(false);
			return;
		}
		afterSignIn();
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-8">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm border border-neutral-300 p-8 dark:border-neutral-700"
			>
				<h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
					Sign in
				</h1>
				{client_id && (
					<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
						to continue to <span className="font-medium">{client_id}</span>.
					</p>
				)}

				<label className="mt-6 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
					Email
					<input
						type="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						autoComplete="email"
						className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-50"
					/>
				</label>

				<label className="mt-4 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
					Password
					<input
						type="password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete="current-password"
						className="mt-1 h-9 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-50"
					/>
				</label>

				{error && (
					<p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
				)}

				<button
					type="submit"
					disabled={pending}
					className="mt-6 h-9 w-full bg-neutral-900 px-4 text-sm font-medium text-neutral-50 transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
				>
					{pending ? "Signing in…" : "Sign in"}
				</button>
			</form>
		</div>
	);
}
