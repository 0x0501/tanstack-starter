import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	AuthShell,
	buttonClass,
	buttonSecondaryClass,
	linkClass,
	mutedTextClass,
	PageAlert,
} from "@/components/shells";
import { authClient } from "@/lib/auth-client";
import { NOINDEX_META, pageTitle } from "@/lib/site";
import * as m from "@/paraglide/messages";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/oauth/consent")({
	// Keep the signed OAuth query intact for consent.
	validateSearch: (search: Record<string, unknown>) => search,
	head: () => ({
		meta: [...NOINDEX_META, { title: pageTitle(m.auth_consent_title()) }],
	}),
	component: ConsentPage,
});

function ConsentPage() {
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function decide(accept: boolean) {
		setPending(true);
		setError(null);
		// Better Auth requires the signed query as oauth_query.
		const oauth_query = window.location.search.replace(/^\?/, "");
		try {
			// Plugin requires the signed query forwarded as oauth_query.
			await (
				authClient.oauth2.consent as (body: {
					accept: boolean;
					oauth_query: string;
				}) => Promise<unknown>
			)({ accept, oauth_query });
		} catch (e) {
			setError(e instanceof Error ? e.message : m.auth_consent_failed());
			setPending(false);
		}
	}

	return (
		<AuthShell title={m.auth_consent_title()}>
			<p className={cn(mutedTextClass, "mb-4")}>{m.auth_consent_blurb()}</p>
			{error ? <PageAlert>{error}</PageAlert> : null}
			<div className="flex flex-col gap-2">
				<button
					type="button"
					className={buttonClass}
					disabled={pending}
					onClick={() => void decide(true)}
				>
					{m.auth_consent_approve()}
				</button>
				<button
					type="button"
					className={cn(buttonSecondaryClass, "w-full")}
					disabled={pending}
					onClick={() => void decide(false)}
				>
					{m.auth_consent_deny()}
				</button>
			</div>
			<p className="mt-4 text-center text-sm">
				<Link to="/dashboard" className={linkClass}>
					{m.auth_back_to_dashboard()}
				</Link>
			</p>
		</AuthShell>
	);
}
