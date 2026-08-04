import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	buttonClass,
	buttonSecondaryClass,
	DashboardShell,
	Field,
	inputClass,
	mutedTextClass,
} from "@/components/shells";
import {
	Select,
	SelectIcon,
	SelectItem,
	SelectItemText,
	SelectPopup,
	SelectPortal,
	SelectPositioner,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";
import {
	beginTwoFactorEnable,
	confirmPasswordChange,
	disableTwoFactor,
	getSecurityOverview,
	removePasskey,
	requestPasswordOtp,
	requestReauthCode,
	revokeOtherSessions,
} from "@/server/account-security";
import { accountSecurityErrorMessage } from "@/utils/auth-errors";

/** One key for the page: profile, security, passkeys and sessions load together. */
const SECURITY_OVERVIEW_KEY = ["security-overview"] as const;

export const Route = createFileRoute("/dashboard/account")({
	component: AccountPage,
});

function AccountPage() {
	// `/dashboard` narrowed `session` to signed-in for this whole subtree.
	const { session } = Route.useRouteContext();
	const qc = useQueryClient();
	const overview = useQuery({
		queryKey: SECURITY_OVERVIEW_KEY,
		queryFn: () => getSecurityOverview(),
	});

	const sessionLocale =
		(session.user as { locale?: string | null }).locale ?? "en";
	const [name, setName] = useState(session.user.name);
	const [locale, setLocale] = useState(sessionLocale);
	const [message, setMessage] = useState<string | null>(null);
	const [otp, setOtp] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [totpUri, setTotpUri] = useState<string | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
	const [factorCode, setFactorCode] = useState("");

	const invalidate = () => {
		void qc.invalidateQueries({ queryKey: SECURITY_OVERVIEW_KEY });
	};

	async function saveProfile(e: React.FormEvent) {
		e.preventDefault();
		setMessage(null);
		const { error } = await authClient.updateUser({ name, locale });
		setMessage(
			error
				? (error.message ?? m.account_update_failed())
				: m.account_profile_saved(),
		);
		invalidate();
	}

	const requestOtp = useMutation({
		mutationFn: () => requestPasswordOtp(),
		onSuccess: (r) => {
			setMessage(
				r.ok
					? m.account_otp_sent({ seconds: r.retryAfterSeconds })
					: accountSecurityErrorMessage(r.code),
			);
		},
	});

	const changePw = useMutation({
		mutationFn: () => confirmPasswordChange({ data: { otp, newPassword } }),
		onSuccess: (r) => {
			setMessage(
				r.ok
					? m.account_password_updated()
					: accountSecurityErrorMessage(r.code),
			);
			if (r.ok) {
				setOtp("");
				setNewPassword("");
			}
			invalidate();
		},
	});

	const reauthFor2fa = useMutation({
		mutationFn: () => requestReauthCode(),
		onSuccess: (r) => {
			setMessage(
				r.ok ? m.account_reauth_emailed() : accountSecurityErrorMessage(r.code),
			);
		},
	});

	const enable2fa = useMutation({
		mutationFn: () => beginTwoFactorEnable({ data: { otp } }),
		onSuccess: (r) => {
			if (r.ok) {
				setTotpUri(r.totpURI);
				setBackupCodes(r.backupCodes);
				setMessage(m.account_2fa_enroll_hint());
			} else setMessage(accountSecurityErrorMessage(r.code));
			invalidate();
		},
	});

	const disable2fa = useMutation({
		mutationFn: () =>
			disableTwoFactor({ data: { code: factorCode, backupCode: false } }),
		onSuccess: (r) => {
			setMessage(
				r.ok ? m.account_2fa_disabled() : accountSecurityErrorMessage(r.code),
			);
			invalidate();
		},
	});

	const revokeOthers = useMutation({
		mutationFn: () => revokeOtherSessions(),
		onSuccess: (r) => {
			setMessage(
				r.ok ? m.account_sessions_revoked() : m.account_err_unauthorized(),
			);
			invalidate();
		},
	});

	const dropPasskey = useMutation({
		mutationFn: (passkeyId: string) => removePasskey({ data: { passkeyId } }),
		onSuccess: (r) => {
			setMessage(
				r.ok
					? m.account_passkey_removed()
					: accountSecurityErrorMessage(r.code),
			);
			invalidate();
		},
	});

	const o = overview.data;

	useEffect(() => {
		if (o?.locale) setLocale(o.locale);
	}, [o?.locale]);

	return (
		<DashboardShell title={m.account_title()}>
			{message ? (
				<p className="mb-4 text-sm text-foreground">{message}</p>
			) : null}

			<Tabs defaultValue="profile">
				<TabsList>
					<TabsTab value="profile">{m.account_tab_profile()}</TabsTab>
					<TabsTab value="security">{m.account_tab_security()}</TabsTab>
					<TabsTab value="sessions">{m.account_tab_sessions()}</TabsTab>
				</TabsList>

				<TabsPanel value="profile">
					<form onSubmit={saveProfile} className="max-w-md">
						<Field label={m.field_display_name()}>
							<input
								className={inputClass}
								value={name}
								onChange={(ev) => setName(ev.target.value)}
							/>
						</Field>
						<Field label={m.field_locale()}>
							<Select
								value={locale}
								onValueChange={(v) => {
									if (typeof v === "string") setLocale(v);
								}}
							>
								<SelectTrigger>
									<SelectValue>
										{(value: string | null) =>
											value === "de" ? m.locale_de() : m.locale_en()
										}
									</SelectValue>
									<SelectIcon />
								</SelectTrigger>
								<SelectPortal>
									<SelectPositioner>
										<SelectPopup>
											<SelectItem value="en">
												<SelectItemText>{m.locale_en()}</SelectItemText>
											</SelectItem>
											<SelectItem value="de">
												<SelectItemText>{m.locale_de()}</SelectItemText>
											</SelectItem>
										</SelectPopup>
									</SelectPositioner>
								</SelectPortal>
							</Select>
						</Field>
						<button type="submit" className={`${buttonClass} max-w-xs`}>
							{m.account_save_profile()}
						</button>
					</form>
				</TabsPanel>

				<TabsPanel value="security">
					<section className="mb-8">
						{overview.isLoading ? (
							<p className={mutedTextClass}>{m.common_loading()}</p>
						) : o ? (
							<ul className="list-inside list-disc text-sm text-foreground">
								<li>
									{m.account_email_label()}: {o.email} (
									{o.emailVerified
										? m.account_verified()
										: m.account_unverified()}
									)
								</li>
								<li>
									{m.account_password_label()}:{" "}
									{o.hasPassword
										? m.account_password_set()
										: m.account_password_none()}
								</li>
								<li>
									{m.account_github_label()}:{" "}
									{o.githubLinked
										? m.account_github_linked()
										: m.account_github_not_linked()}
								</li>
								<li>
									{m.account_2fa_label()}:{" "}
									{o.twoFactorEnabled ? m.account_on() : m.account_off()}
								</li>
								<li>
									{m.account_passkeys_label()}: {o.passkeys.length}
								</li>
							</ul>
						) : null}
					</section>

					<section className="mb-8 max-w-md">
						<h2 className="mb-3 text-lg font-medium">
							{m.account_change_password_title()}
						</h2>
						<button
							type="button"
							className={`${buttonClass} mb-3 max-w-xs`}
							disabled={requestOtp.isPending}
							onClick={() => requestOtp.mutate()}
						>
							{m.account_send_otp()}
						</button>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								changePw.mutate();
							}}
						>
							<Field label={m.account_field_otp()}>
								<input
									className={inputClass}
									value={otp}
									onChange={(e) => setOtp(e.target.value)}
								/>
							</Field>
							<Field label={m.account_field_new_password()}>
								<input
									className={inputClass}
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
								/>
							</Field>
							<button type="submit" className={`${buttonClass} max-w-xs`}>
								{m.account_update_password()}
							</button>
						</form>
					</section>

					<section className="mb-8 max-w-md">
						<h2 className="mb-3 text-lg font-medium">
							{m.account_section_two_factor()}
						</h2>
						{!o?.twoFactorEnabled ? (
							<>
								<button
									type="button"
									className={`${buttonClass} mb-2 max-w-xs`}
									onClick={() => reauthFor2fa.mutate()}
								>
									{m.account_email_enrollment_code()}
								</button>
								<form
									onSubmit={(e) => {
										e.preventDefault();
										enable2fa.mutate();
									}}
								>
									<Field label={m.account_field_enrollment_otp()}>
										<input
											className={inputClass}
											value={otp}
											onChange={(e) => setOtp(e.target.value)}
										/>
									</Field>
									<button type="submit" className={`${buttonClass} max-w-xs`}>
										{m.account_begin_2fa()}
									</button>
								</form>
								{totpUri ? (
									<p className="mt-2 break-all font-mono text-xs">{totpUri}</p>
								) : null}
								{backupCodes ? (
									<pre className="mt-2 text-xs">{backupCodes.join("\n")}</pre>
								) : null}
							</>
						) : (
							<form
								onSubmit={(e) => {
									e.preventDefault();
									disable2fa.mutate();
								}}
							>
								<Field label={m.account_field_totp_disable()}>
									<input
										className={inputClass}
										value={factorCode}
										onChange={(e) => setFactorCode(e.target.value)}
									/>
								</Field>
								<button type="submit" className={`${buttonClass} max-w-xs`}>
									{m.account_disable_2fa()}
								</button>
							</form>
						)}
					</section>

					<section className="mb-8">
						<h2 className="mb-3 text-lg font-medium">
							{m.account_section_passkeys()}
						</h2>
						{o?.passkeys.length ? (
							<ul className="space-y-2 text-sm">
								{o.passkeys.map((pk) => (
									<li key={pk.id} className="flex items-center gap-3">
										<span>
											{pk.name ?? pk.id}
											{pk.createdAt ? ` · ${pk.createdAt}` : ""}
										</span>
										<button
											type="button"
											className={`${buttonClass} w-auto px-2 py-1 text-xs`}
											onClick={() => dropPasskey.mutate(pk.id)}
										>
											{m.account_remove()}
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className={mutedTextClass}>{m.account_no_passkeys()}</p>
						)}
						<p className="mt-2 text-xs text-muted-foreground">
							{m.account_passkey_hint()}
						</p>
					</section>
				</TabsPanel>

				<TabsPanel value="sessions">
					<button
						type="button"
						className={`${buttonClass} mb-3 max-w-xs`}
						onClick={() => revokeOthers.mutate()}
					>
						{m.account_revoke_other_sessions()}
					</button>
					{overview.data?.sessions ? (
						<ul className="space-y-1 text-xs text-muted-foreground">
							{overview.data.sessions.map((s) => (
								<li key={s.id}>
									{s.isCurrent ? `${m.account_session_current()} · ` : ""}
									{s.createdAt}
									{s.ipAddress ? ` · ${s.ipAddress}` : ""}
								</li>
							))}
						</ul>
					) : null}
					<button
						type="button"
						className={`${buttonSecondaryClass} mt-6 w-full max-w-xs`}
						onClick={async () => {
							await authClient.signOut();
							window.location.href = "/sign-in";
						}}
					>
						{m.action_sign_out()}
					</button>
				</TabsPanel>
			</Tabs>
		</DashboardShell>
	);
}
