import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
	// `session` comes from the root route's beforeLoad (one read per request).
	// This gate is chrome only: it decides whether the console renders. Every
	// privileged mutation re-checks the role server-side, so a stale cookie
	// cache here can reveal a layout, never an operation.
	//
	// The role list is spelled out rather than imported from
	// `services/admin-security`: that module also imports Drizzle tables, and a
	// route file is client code, so the import shipped the whole schema — table
	// and column names, index names, and the RLS policy predicates — to every
	// visitor. `check:client-bundle` fails on that now. Server-side role checks
	// keep using `isAdminRole`; this one line is chrome.
	beforeLoad: ({ context: { session } }) => {
		if (!session?.user) throw redirect({ to: "/sign-in" });
		if (!["admin", "superadmin"].includes(session.user.role ?? "")) {
			throw redirect({ to: "/dashboard" });
		}
		return { session };
	},
	// Private area — keep the whole admin subtree out of search indexes.
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	component: () => <Outlet />,
});
