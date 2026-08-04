import { useState } from "react";
import { buttonClass, mutedTextClass } from "@/components/shells";
import { authClient } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";
import { afterAuthTarget } from "@/utils/auth-redirect";
import { cn } from "@/utils/cn";

/** "or" hairline between the credentials form and social / passkey options. */
export function AuthDivider() {
	return (
		// No `role="separator"`: a separator carries no children, and the word
		// "or" is content a reader needs. The hairlines are decoration.
		<div className="mt-6 flex items-center gap-3">
			<span aria-hidden="true" className="h-px flex-1 bg-border" />
			<span className={cn(mutedTextClass, "text-xs uppercase tracking-wide")}>
				{m.auth_or()}
			</span>
			<span aria-hidden="true" className="h-px flex-1 bg-border" />
		</div>
	);
}

/**
 * GitHub OAuth entry. Success resumes a mid-authorize flow (or ?redirect);
 * failures bounce back with Better Auth's error handling.
 */
export function GithubButton({ label }: { label: string }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<div className="flex w-full flex-col gap-2">
			<button
				type="button"
				disabled={busy}
				className={cn(buttonClass, "w-full")}
				onClick={() => {
					setBusy(true);
					setError(null);
					void authClient.signIn
						.social({
							provider: "github",
							callbackURL: afterAuthTarget(),
							errorCallbackURL: `${window.location.pathname}${window.location.search}`,
						})
						.then(({ error: authError }) => {
							if (authError)
								setError(authError.message ?? m.auth_github_failed());
						})
						.catch((err) => {
							setError(
								err instanceof Error ? err.message : m.auth_github_failed(),
							);
						})
						.finally(() => {
							setBusy(false);
						});
				}}
			>
				{busy ? m.auth_redirecting() : label}
			</button>
			{error ? (
				<p className="text-center text-xs text-red-600 dark:text-red-400">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** Passkey sign-in entry. */
export function PasskeyButton({
	label,
	disabled,
	onClick,
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			className={cn(buttonClass, "w-full")}
			onClick={onClick}
		>
			{label}
		</button>
	);
}
