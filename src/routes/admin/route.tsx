import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { betterAuthMiddleware } from "@/middlewares/better-auth";
import { isAdminRole } from "@/services/admin-security";

const getAdminSession = createServerFn({ method: "GET" })
	.middleware([betterAuthMiddleware])
	.handler(async ({ context, request }) => {
		const session = await context.auth.api.getSession({
			headers: request.headers,
		});
		if (!session?.user) return null;
		const role = (session.user as { role?: string | null }).role ?? null;
		if (!isAdminRole(role)) return { forbidden: true as const };
		return {
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				role,
			},
		};
	});

export const Route = createFileRoute("/admin")({
	beforeLoad: async () => {
		const session = await getAdminSession();
		if (!session) throw redirect({ to: "/sign-in" });
		if ("forbidden" in session) throw redirect({ to: "/dashboard" });
		return { session };
	},
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	component: () => <Outlet />,
});
