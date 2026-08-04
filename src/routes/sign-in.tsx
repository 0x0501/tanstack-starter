import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
	AuthDivider,
	GithubButton,
	PasskeyButton,
} from "@/components/auth/social";
import { Turnstile, type TurnstileHandle } from "@/components/auth/turnstile";
import {
	AuthShell,
	buttonClass,
	Field,
	inputClass,
	linkClass,
	mutedTextClass,
	PageAlert,
} from "@/components/shells";
import { authClient } from "@/lib/auth-client";
import { CAPTCHA_ENABLED } from "@/lib/captcha";
import { GITHUB_OAUTH_ENABLED } from "@/lib/github";
import { NOINDEX_META, pageTitle } from "@/lib/site";
import * as m from "@/paraglide/messages";
import { afterAuthTarget, localizedAuthPath } from "@/utils/auth-redirect";

export const Route = createFileRoute("/sign-in")({
	// Pass-through search so signed OAuth queries survive login.
	validateSearch: (search: Record<string, unknown>) => search,
	beforeLoad: ({ context: { session } }) => {
		if (session?.user) {
			throw redirect({ to: "/dashboard" });
		}
	},
	head: () => ({
		meta: [...NOINDEX_META, { title: pageTitle(m.auth_sign_in_title()) }],
	}),
	component: SignInPage,
});

function afterAuth(): void {
	if (typeof window === "undefined") return;
	window.location.href = afterAuthTarget();
}

function SignInPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const turnstile = useRef<TurnstileHandle>(null);

	// Passkey conditional UI: browser may offer a saved passkey from autofill.
	useEffect(() => {
		let cancelled = false;
		const check =
			window.PublicKeyCredential?.isConditionalMediationAvailable?.();
		if (!check) return;
		void check.then((available) => {
			if (!available || cancelled) return;
			void authClient.signIn.passkey({ autoFill: true }).then((result) => {
				if (!cancelled && !result.error) afterAuth();
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		if (CAPTCHA_ENABLED && !captchaToken) {
			setError(m.auth_captcha_required());
			setPending(false);
			return;
		}
		const { error: err } = await authClient.signIn.email({
			email,
			password,
			// Locale-aware so verification / error returns stay on the same language URL.
			callbackURL: localizedAuthPath("/sign-in"),
			fetchOptions: {
				headers: { "x-captcha-response": captchaToken ?? "" },
			},
		});
		turnstile.current?.reset();
		setPending(false);
		if (err) {
			setError(err.message ?? m.auth_sign_in_failed());
			return;
		}
		afterAuth();
	}

	return (
		<AuthShell title={m.auth_sign_in_title()}>
			<form onSubmit={onSubmit}>
				<Field label={m.field_email()}>
					<input
						className={inputClass}
						type="email"
						autoComplete="username webauthn"
						required
						value={email}
						onChange={(ev) => setEmail(ev.target.value)}
					/>
				</Field>
				<Field label={m.field_password()}>
					<input
						className={inputClass}
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(ev) => setPassword(ev.target.value)}
					/>
				</Field>
				<Turnstile ref={turnstile} onToken={setCaptchaToken} />
				{error ? <PageAlert>{error}</PageAlert> : null}
				<button
					type="submit"
					className={buttonClass}
					disabled={pending || (CAPTCHA_ENABLED && !captchaToken)}
				>
					{pending ? m.auth_signing_in() : m.nav_sign_in()}
				</button>
			</form>

			<AuthDivider />
			<div className="mt-4 flex flex-col gap-2">
				{GITHUB_OAUTH_ENABLED ? (
					<GithubButton label={m.auth_continue_github()} />
				) : null}
				<PasskeyButton
					label={m.auth_use_passkey()}
					disabled={pending}
					onClick={() => {
						setPending(true);
						setError(null);
						void authClient.signIn
							.passkey()
							.then(({ error: err }) => {
								if (err) {
									setError(err.message ?? m.auth_passkey_failed());
									return;
								}
								afterAuth();
							})
							.catch((err) => {
								setError(
									err instanceof Error ? err.message : m.auth_passkey_failed(),
								);
							})
							.finally(() => {
								setPending(false);
							});
					}}
				/>
			</div>

			<p className={`mt-4 text-center ${mutedTextClass}`}>
				{m.auth_no_account()}{" "}
				<Link to="/sign-up" className={linkClass}>
					{m.nav_sign_up()}
				</Link>
				{" · "}
				<Link to="/forgot-password" className={linkClass}>
					{m.auth_forgot_title()}
				</Link>
			</p>
		</AuthShell>
	);
}
