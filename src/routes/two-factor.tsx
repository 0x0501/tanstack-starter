import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	AuthShell,
	buttonClass,
	Field,
	inputClass,
	mutedTextClass,
	PageAlert,
} from "@/components/shells";
import { authClient } from "@/lib/auth-client";
import { NOINDEX_META, pageTitle } from "@/lib/site";
import * as m from "@/paraglide/messages";
import { afterAuthTarget } from "@/utils/auth-redirect";

export const Route = createFileRoute("/two-factor")({
	validateSearch: (search: Record<string, unknown>) => search,
	head: () => ({
		meta: [...NOINDEX_META, { title: pageTitle(m.auth_two_factor_title()) }],
	}),
	component: TwoFactorPage,
});

function TwoFactorPage() {
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		const { error: err } = await authClient.twoFactor.verifyTotp({
			code,
		});
		if (err) {
			// Try backup code if TOTP fails.
			const backup = await authClient.twoFactor.verifyBackupCode({
				code,
			});
			setPending(false);
			if (backup.error) {
				setError(err.message ?? m.auth_invalid_code());
				return;
			}
		} else {
			setPending(false);
		}
		window.location.href = afterAuthTarget();
	}

	return (
		<AuthShell title={m.auth_two_factor_title()}>
			<p className={`mb-4 ${mutedTextClass}`}>{m.auth_two_factor_blurb()}</p>
			<form onSubmit={onSubmit}>
				<Field label={m.field_code()}>
					<input
						className={inputClass}
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						required
						value={code}
						onChange={(ev) => setCode(ev.target.value)}
					/>
				</Field>
				{error ? <PageAlert>{error}</PageAlert> : null}
				<button type="submit" className={buttonClass} disabled={pending}>
					{pending ? m.auth_verifying() : m.auth_verify()}
				</button>
			</form>
		</AuthShell>
	);
}
