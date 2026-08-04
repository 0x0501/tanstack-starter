import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import * as m from "@/paraglide/messages";
import { cn } from "@/utils/cn";
import { cardClass, labelClass, mutedTextClass } from "./ui/styles";

export {
	buttonClass,
	buttonDestructiveClass,
	buttonGhostClass,
	buttonPrimaryClass,
	buttonSecondaryClass,
	cardClass,
	inputClass,
	labelClass,
	linkClass,
	mutedTextClass,
} from "./ui/styles";

/** Structural auth layout (no brand skin). */
export function AuthShell({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="page page--narrow flex min-h-[100dvh] flex-col justify-center">
			<div className="mb-6 flex items-center justify-between gap-2">
				<Link to="/" className={cn(mutedTextClass, "hover:text-foreground")}>
					← {m.nav_home()}
				</Link>
				<div className="flex items-center gap-2">
					<LocaleSwitcher variant="bare" />
					<ThemeToggle />
				</div>
			</div>
			<h1 className="mb-6 text-xl font-medium tracking-tight">{title}</h1>
			<div className={cn(cardClass, "p-4 sm:p-5")} data-testid="auth-card">
				{children}
			</div>
		</div>
	);
}

/** Structural signed-in member shell. */
export function DashboardShell({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="page" data-testid="dashboard-shell">
			<header className="mb-8 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-xs text-muted-foreground">{m.dashboard_title()}</p>
					<h1 className="text-xl font-medium tracking-tight">{title}</h1>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<nav
						className="flex flex-wrap gap-3 text-sm"
						aria-label={m.dashboard_title()}
					>
						<ShellNavLink to="/dashboard">{m.nav_overview()}</ShellNavLink>
						<ShellNavLink to="/dashboard/account">
							{m.nav_account()}
						</ShellNavLink>
						<ShellNavLink to="/" muted>
							{m.nav_home()}
						</ShellNavLink>
					</nav>
					<LocaleSwitcher />
					<ThemeToggle />
				</div>
			</header>
			{children}
		</div>
	);
}

/** Structural administrator shell. */
export function AdminShell({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="page page--wide" data-testid="admin-shell">
			<header className="mb-8 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-xs text-muted-foreground">{m.admin_title()}</p>
					<h1 className="text-xl font-medium tracking-tight">{title}</h1>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<nav
						className="flex flex-wrap gap-3 text-sm"
						aria-label={m.admin_title()}
					>
						<ShellNavLink to="/admin/users">{m.nav_users()}</ShellNavLink>
						<ShellNavLink to="/admin/audit">{m.nav_audit()}</ShellNavLink>
						<ShellNavLink to="/admin/oauth-apps">
							{m.nav_oauth_apps()}
						</ShellNavLink>
						<ShellNavLink to="/dashboard" muted>
							{m.nav_dashboard()}
						</ShellNavLink>
					</nav>
					<LocaleSwitcher />
					<ThemeToggle />
				</div>
			</header>
			{children}
		</div>
	);
}

function ShellNavLink({
	to,
	children,
	muted = false,
}: {
	to:
		| "/"
		| "/dashboard"
		| "/dashboard/account"
		| "/admin/users"
		| "/admin/audit"
		| "/admin/oauth-apps";
	children: ReactNode;
	muted?: boolean;
}) {
	return (
		<Link
			to={to}
			className={cn(
				"hover:underline",
				muted ? "text-muted-foreground" : "text-foreground",
			)}
		>
			{children}
		</Link>
	);
}

export function Field({
	label,
	children,
	hint,
}: {
	label: string;
	children: ReactNode;
	hint?: string;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: control is provided via children
		<label className="mb-4 block">
			<span className={labelClass}>{label}</span>
			{children}
			{hint ? (
				<span className={cn(mutedTextClass, "mt-1 block text-xs")}>{hint}</span>
			) : null}
		</label>
	);
}

export function PageAlert({
	children,
	tone = "error",
}: {
	children: ReactNode;
	tone?: "error" | "success" | "info";
}) {
	const toneClass =
		tone === "success"
			? "text-success"
			: tone === "info"
				? "text-muted-foreground"
				: "text-destructive";
	return (
		<p className={cn("mb-3 text-sm", toneClass)} role="alert">
			{children}
		</p>
	);
}
