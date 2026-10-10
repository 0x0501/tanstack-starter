import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import * as m from "@/paraglide/messages";
import { cn } from "@/utils/cn";
import { cardClass, labelClass, mutedTextClass } from "./ui/styles";

export {
	buttonClass,
	buttonPrimaryClass,
	buttonSecondaryClass,
	cardClass,
	inputClass,
	labelClass,
	linkClass,
	mutedTextClass,
} from "./ui/styles";

type ShellProps = ComponentProps<"div"> & { title: string };

/** Auth flow layout; presentation is replaceable through CSS and className. */
export function AuthShell({
	title,
	children,
	className,
	...props
}: ShellProps) {
	return (
		<div {...props} className={cn("page page--narrow auth-shell", className)}>
			<div className="auth-shell__header">
				<Link to="/" className={cn(mutedTextClass, "hover:text-foreground")}>
					← {m.nav_home()}
				</Link>
				<div className="flex items-center gap-2">
					<LocaleSwitcher variant="bare" />
					<ThemeToggle />
				</div>
			</div>
			<h1 className="shell-title auth-shell__title">{title}</h1>
			<div
				className={cn(cardClass, "auth-shell__content")}
				data-testid="auth-card"
			>
				{children}
			</div>
		</div>
	);
}

/** Signed-in member layout. */
export function DashboardShell({
	title,
	children,
	className,
	...props
}: ShellProps) {
	return (
		<div
			{...props}
			className={cn("page app-shell", className)}
			data-testid="dashboard-shell"
		>
			<header className="app-shell__header">
				<div>
					<p className="text-xs text-muted-foreground">{m.dashboard_title()}</p>
					<h1 className="shell-title">{title}</h1>
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

/** Administrator layout. */
export function AdminShell({
	title,
	children,
	className,
	...props
}: ShellProps) {
	return (
		<div
			{...props}
			className={cn("page page--wide app-shell", className)}
			data-testid="admin-shell"
		>
			<header className="app-shell__header">
				<div>
					<p className="text-xs text-muted-foreground">{m.admin_title()}</p>
					<h1 className="shell-title">{title}</h1>
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
			activeOptions={{ exact: true }}
			activeProps={{ "aria-current": "page" }}
			className={cn(
				"shell-nav-link",
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
