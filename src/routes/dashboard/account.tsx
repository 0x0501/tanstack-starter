import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	buttonClass,
	DashboardShell,
	Field,
	inputClass,
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
	listSessions,
	removePasskey,
	requestPasswordOtp,
	requestReauthCode,
	revokeOtherSessions,
} from "@/server/account-security";

export const Route = createFileRoute("/dashboard/account")({
	component: AccountPage,
});

function AccountPage() {
	const { session } = Route.useRouteContext({ from: "/dashboard" });
	const qc = useQueryClient();
	const overview = useQuery({
		queryKey: ["security-overview"],
		queryFn: () => getSecurityOverview(),
	});
	const sessions = useQuery({
		queryKey: ["sessions"],
		queryFn: () => listSessions(),
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
		void qc.invalidateQueries({ queryKey: ["security-overview"] });
		void qc.invalidateQueries({ queryKey: ["sessions"] });
	};

	async function saveProfile(e: React.FormEvent) {
		e.preventDefault();
		setMessage(null);
		const { error } = await authClient.updateUser({ name, locale });
		setMessage(error ? (error.message ?? "Update failed") : "Profile saved.");
		invalidate();
	}

	const requestOtp = useMutation({
		mutationFn: () => requestPasswordOtp(),
		onSuccess: (r) => {
			if (r.ok) setMessage(`OTP sent. Retry after ${r.retryAfterSeconds}s.`);
			else setMessage(`Could not send OTP: ${r.code}`);
		},
	});

	const changePw = useMutation({
		mutationFn: () => confirmPasswordChange({ data: { otp, newPassword } }),
		onSuccess: (r) => {
			setMessage(
				r.ok ? "Password updated; other sessions signed out." : r.code,
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
			if (r.ok) setMessage("Enrollment code emailed.");
			else setMessage(`Re-auth: ${r.code}`);
		},
	});

	const enable2fa = useMutation({
		mutationFn: () => beginTwoFactorEnable({ data: { otp } }),
		onSuccess: (r) => {
			if (r.ok) {
				setTotpUri(r.totpURI);
				setBackupCodes(r.backupCodes);
				setMessage("Scan the URI / save backup codes, then verify with TOTP.");
			} else setMessage(`Enable 2FA: ${r.code}`);
			invalidate();
		},
	});

	const disable2fa = useMutation({
		mutationFn: () =>
			disableTwoFactor({ data: { code: factorCode, backupCode: false } }),
		onSuccess: (r) => {
			setMessage(r.ok ? "2FA disabled." : `Disable 2FA: ${r.code}`);
			invalidate();
		},
	});

	const revokeOthers = useMutation({
		mutationFn: () => revokeOtherSessions(),
		onSuccess: (r) => {
			setMessage(r.ok ? "Other sessions revoked." : "Unauthorized.");
			invalidate();
		},
	});

	const dropPasskey = useMutation({
		mutationFn: (passkeyId: string) => removePasskey({ data: { passkeyId } }),
		onSuccess: (r) => {
			if (r.ok) setMessage("Passkey removed.");
			else if (r.code === "not_fresh")
				setMessage("Session not fresh — re-authenticate, then retry.");
			else setMessage(r.code);
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
				<p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
					{message}
				</p>
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
							<p className="text-sm text-neutral-500">Loading…</p>
						) : o ? (
							<ul className="list-inside list-disc text-sm text-neutral-700 dark:text-neutral-300">
								<li>
									Email: {o.email} (
									{o.emailVerified ? "verified" : "unverified"})
								</li>
								<li>Password: {o.hasPassword ? "set" : "none"}</li>
								<li>GitHub: {o.githubLinked ? "linked" : "not linked"}</li>
								<li>2FA: {o.twoFactorEnabled ? "on" : "off"}</li>
								<li>Passkeys: {o.passkeys.length}</li>
							</ul>
						) : null}
					</section>

					<section className="mb-8 max-w-md">
						<h2 className="mb-3 text-lg font-medium">
							Change password (email OTP)
						</h2>
						<button
							type="button"
							className={`${buttonClass} mb-3 max-w-xs`}
							disabled={requestOtp.isPending}
							onClick={() => requestOtp.mutate()}
						>
							Send OTP to my email
						</button>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								changePw.mutate();
							}}
						>
							<Field label="OTP">
								<input
									className={inputClass}
									value={otp}
									onChange={(e) => setOtp(e.target.value)}
								/>
							</Field>
							<Field label="New password">
								<input
									className={inputClass}
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
								/>
							</Field>
							<button type="submit" className={`${buttonClass} max-w-xs`}>
								Update password
							</button>
						</form>
					</section>

					<section className="mb-8 max-w-md">
						<h2 className="mb-3 text-lg font-medium">Two-factor</h2>
						{!o?.twoFactorEnabled ? (
							<>
								<button
									type="button"
									className={`${buttonClass} mb-2 max-w-xs`}
									onClick={() => reauthFor2fa.mutate()}
								>
									Email enrollment code
								</button>
								<form
									onSubmit={(e) => {
										e.preventDefault();
										enable2fa.mutate();
									}}
								>
									<Field label="Enrollment OTP">
										<input
											className={inputClass}
											value={otp}
											onChange={(e) => setOtp(e.target.value)}
										/>
									</Field>
									<button type="submit" className={`${buttonClass} max-w-xs`}>
										Begin 2FA enable
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
								<Field label="TOTP to disable 2FA">
									<input
										className={inputClass}
										value={factorCode}
										onChange={(e) => setFactorCode(e.target.value)}
									/>
								</Field>
								<button type="submit" className={`${buttonClass} max-w-xs`}>
									Disable 2FA
								</button>
							</form>
						)}
					</section>

					<section className="mb-8">
						<h2 className="mb-3 text-lg font-medium">Passkeys</h2>
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
											Remove
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-neutral-600">
								No passkeys registered.
							</p>
						)}
						<p className="mt-2 text-xs text-neutral-500">
							Add passkeys from a fresh session via the browser passkey prompt
							(auth client).
						</p>
					</section>
				</TabsPanel>

				<TabsPanel value="sessions">
					<button
						type="button"
						className={`${buttonClass} mb-3 max-w-xs`}
						onClick={() => revokeOthers.mutate()}
					>
						Revoke other sessions
					</button>
					{sessions.data ? (
						<ul className="space-y-1 text-xs text-neutral-600">
							{sessions.data.map((s) => (
								<li key={s.id}>
									{s.isCurrent ? "current · " : ""}
									{s.createdAt}
									{s.ipAddress ? ` · ${s.ipAddress}` : ""}
								</li>
							))}
						</ul>
					) : null}
					<button
						type="button"
						className={`${buttonClass} mt-6 max-w-xs bg-neutral-600`}
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
