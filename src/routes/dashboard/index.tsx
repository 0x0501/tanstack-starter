import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	buttonClass,
	DashboardShell,
	linkClass,
	mutedTextClass,
	PageAlert,
} from "@/components/shells";
import * as m from "@/paraglide/messages";
import {
	getDemoCheckoutMethods,
	startDemoPurchase,
} from "@/server/demo-checkout";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardOverview,
});

function DashboardOverview() {
	const { session } = Route.useRouteContext();
	const u = session.user;
	const [checkoutError, setCheckoutError] = useState<string | null>(null);

	const methods = useQuery({
		queryKey: ["demo-checkout-methods"],
		queryFn: () => getDemoCheckoutMethods(),
	});

	const start = useMutation({
		mutationFn: (provider: "stripe" | "creem" | "nowpayments") =>
			startDemoPurchase({ data: { provider } }),
		onSuccess: (r) => {
			if (r.ok) {
				window.location.href = r.url;
				return;
			}
			setCheckoutError(
				r.code === "disabled"
					? "That payment method is disabled."
					: "That payment method is not configured.",
			);
		},
		onError: () => setCheckoutError("Could not start checkout."),
	});

	const rails = methods.data
		? (["stripe", "creem", "nowpayments"] as const).filter(
				(k) => methods.data[k],
			)
		: [];

	return (
		<DashboardShell title={m.dashboard_overview_title()}>
			<section className="space-y-3 text-sm">
				<p>
					<span className="text-muted-foreground">
						{m.dashboard_signed_in_as()}
					</span>{" "}
					<strong>{u.name}</strong> ({u.email})
				</p>
				<ul className="list-inside list-disc space-y-1 text-foreground">
					<li>
						{m.dashboard_email_verified()}:{" "}
						{u.emailVerified ? m.yes() : m.dashboard_email_unverified()}
					</li>
					<li>
						{m.dashboard_two_factor()}:{" "}
						{u.twoFactorEnabled ? m.enabled() : m.off()}
					</li>
					<li>
						{m.dashboard_role()}: {u.role ?? "user"}
					</li>
				</ul>
				<p className="pt-4">
					{m.dashboard_manage_account()}{" "}
					<Link to="/dashboard/account" className={linkClass}>
						{m.nav_account()}
					</Link>
					.
				</p>
				{u.role === "admin" || u.role === "superadmin" ? (
					<p>
						<Link to="/admin/users" className={linkClass}>
							{m.dashboard_open_admin()}
						</Link>
					</p>
				) : null}
			</section>

			<section className="mt-10 space-y-3 border-t border-border pt-8 text-sm">
				<h2 className="text-lg font-medium">{m.dashboard_demo_checkout()}</h2>
				<p className={mutedTextClass}>{m.dashboard_demo_checkout_blurb()}</p>
				<p className={mutedTextClass}>{m.dashboard_demo_amount()}</p>
				{checkoutError ? <PageAlert>{checkoutError}</PageAlert> : null}
				{methods.isLoading ? (
					<p className={mutedTextClass}>…</p>
				) : rails.length === 0 ? (
					<p className={mutedTextClass}>{m.dashboard_no_rails()}</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{rails.map((provider) => (
							<button
								key={provider}
								type="button"
								className={cn(buttonClass, "max-w-xs")}
								disabled={start.isPending}
								onClick={() => {
									setCheckoutError(null);
									start.mutate(provider);
								}}
							>
								{m.dashboard_pay_with({ provider })}
							</button>
						))}
					</div>
				)}
			</section>
		</DashboardShell>
	);
}
