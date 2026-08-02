import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : "",
	}),
	head: () => ({
		meta: [...NOINDEX_META, { title: pageTitle(m.auth_reset_title()) }],
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!token) {
			setError(m.auth_missing_reset_token());
			return;
		}
		setPending(true);
		setError(null);
		const { error: err } = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setPending(false);
		if (err) {
			setError(err.message ?? m.auth_reset_failed());
			return;
		}
		void navigate({ to: "/sign-in" });
	}

	return (
		<AuthShell title={m.auth_reset_title()}>
			<form onSubmit={onSubmit}>
				<Field label={m.field_new_password()} hint={m.auth_password_hint()}>
					<input
						className={inputClass}
						type="password"
						autoComplete="new-password"
						required
						minLength={8}
						value={password}
						onChange={(ev) => setPassword(ev.target.value)}
					/>
				</Field>
				{error ? <PageAlert>{error}</PageAlert> : null}
				<button type="submit" className={buttonClass} disabled={pending}>
					{pending ? m.auth_saving() : m.auth_update_password()}
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
