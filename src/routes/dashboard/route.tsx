import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { betterAuthMiddleware } from "@/middlewares/better-auth";

const getDashboardSession = createServerFn({ method: "GET" })
	.middleware([betterAuthMiddleware])
	.handler(async ({ context, request }) => {
		const session = await context.auth.api.getSession({
			headers: request.headers,
		});
		if (!session?.user) return null;
		return {
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				emailVerified: session.user.emailVerified,
				role: (session.user as { role?: string | null }).role ?? null,
				twoFactorEnabled:
					(session.user as { twoFactorEnabled?: boolean | null })
						.twoFactorEnabled ?? false,
			},
		};
	});

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async () => {
		const session = await getDashboardSession();
		if (!session) {
			throw redirect({ to: "/sign-in" });
		}
		return { session };
	},
	head: () => ({
		meta: [{ name: "robots", content: "noindex, nofollow" }],
	}),
	component: () => <Outlet />,
});
