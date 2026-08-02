import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	AuthShell,
	buttonClass,
	Field,
	inputClass,
	linkClass,
	PageAlert,
} from "@/components/shells";
import { authClient } from "@/lib/auth-client";
import { NOINDEX_META, pageTitle } from "@/lib/site";
import * as m from "@/paraglide/messages";

export const Route = createFileRoute("/forgot-password")({
	head: () => ({
		meta: [...NOINDEX_META, { title: pageTitle(m.auth_forgot_title()) }],
	}),
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		setMessage(null);
		await authClient.requestPasswordReset({
			email,
			redirectTo: `${window.location.origin}/reset-password`,
		});
		setPending(false);
		// Same copy whether or not the address exists.
		setMessage(m.auth_reset_link_sent());
	}

	return (
		<AuthShell title={m.auth_forgot_title()}>
			<form onSubmit={onSubmit}>
				<Field label={m.field_email()}>
					<input
						className={inputClass}
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(ev) => setEmail(ev.target.value)}
					/>
				</Field>
				{message ? <PageAlert tone="info">{message}</PageAlert> : null}
				<button type="submit" className={buttonClass} disabled={pending}>
					{pending ? m.auth_sending() : m.auth_send_reset_link()}
				</button>
			</form>
			<p className="mt-4 text-center text-sm">
				<Link to="/sign-in" className={linkClass}>
					{m.auth_back_to_sign_in()}
				</Link>
			</p>
		</AuthShell>
	);
}
