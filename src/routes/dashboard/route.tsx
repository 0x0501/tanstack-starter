import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
	// `session` comes from the root route's beforeLoad (one read per request);
	// re-returning it only narrows it to signed-in for the subtree below.
	beforeLoad: ({ context: { session } }) => {
		if (!session?.user) {
			throw redirect({ to: "/sign-in" });
		}
		return { session };
	},
	// Private area — keep the whole dashboard subtree out of search indexes.
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	component: () => <Outlet />,
});
