import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAdminRole } from "@/services/admin-security";

export const Route = createFileRoute("/admin")({
	// `session` comes from the root route's beforeLoad (one read per request).
	// This gate is chrome only: it decides whether the console renders. Every
	// privileged mutation re-checks the role server-side, so a stale cookie
	// cache here can reveal a layout, never an operation.
	beforeLoad: ({ context: { session } }) => {
		if (!session?.user) throw redirect({ to: "/sign-in" });
		if (!isAdminRole(session.user.role)) throw redirect({ to: "/dashboard" });
		return { session };
	},
	// Private area — keep the whole admin subtree out of search indexes.
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	component: () => <Outlet />,
});
