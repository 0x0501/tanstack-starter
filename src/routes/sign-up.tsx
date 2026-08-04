import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AuthDivider, GithubButton } from "@/components/auth/social";
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
import { afterAuthTarget } from "@/utils/auth-redirect";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>) => search,
	beforeLoad: ({ context: { session } }) => {
		if (session?.user) {
			throw redirect({ to: "/dashboard" });
		}
	},
	head: () => ({
		meta: [...NOINDEX_META, { title: pageTitle(m.auth_sign_up_title()) }],
	}),
	component: SignUpPage,
});

function SignUpPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const turnstile = useRef<TurnstileHandle>(null);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		setInfo(null);
		if (CAPTCHA_ENABLED && !captchaToken) {
			setError(m.auth_captcha_required());
			setPending(false);
			return;
		}
		const { error: err } = await authClient.signUp.email({
			email,
			password,
			name,
			callbackURL: afterAuthTarget(),
			fetchOptions: {
				headers: { "x-captcha-response": captchaToken ?? "" },
			},
		});
		turnstile.current?.reset();
		setPending(false);
		if (err) {
			setError(err.message ?? m.auth_sign_up_failed());
			return;
		}
		setInfo(m.auth_check_email());
	}

	return (
		<AuthShell title={m.auth_sign_up_title()}>
			<form onSubmit={onSubmit}>
				<Field label={m.field_display_name()}>
					<input
						className={inputClass}
						type="text"
						autoComplete="name"
						required
						value={name}
						onChange={(ev) => setName(ev.target.value)}
					/>
				</Field>
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
				<Field label={m.field_password()} hint={m.auth_password_hint()}>
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
				<Turnstile ref={turnstile} onToken={setCaptchaToken} />
				{error ? <PageAlert>{error}</PageAlert> : null}
				{info ? <PageAlert tone="success">{info}</PageAlert> : null}
				<button
					type="submit"
					className={buttonClass}
					disabled={pending || (CAPTCHA_ENABLED && !captchaToken)}
				>
					{pending ? m.auth_creating() : m.nav_sign_up()}
				</button>
			</form>

			{GITHUB_OAUTH_ENABLED ? (
				<>
					<AuthDivider />
					<div className="mt-4">
						<GithubButton label={m.auth_signup_github()} />
					</div>
				</>
			) : null}

			<p className={`mt-4 text-center ${mutedTextClass}`}>
				{m.auth_have_account()}{" "}
				<Link to="/sign-in" className={linkClass}>
					{m.nav_sign_in()}
				</Link>
			</p>
		</AuthShell>
	);
}
