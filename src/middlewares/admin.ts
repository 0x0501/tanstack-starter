import { createMiddleware } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { HttpError } from "@/utils/api-error";
import { protectedMiddleware } from "./protected";

function forbidden() {
	return new HttpError({
		status: 403,
		error: "forbidden",
		message: "Forbidden",
	});
}

async function can(
	// biome-ignore lint/suspicious/noExplicitAny: middleware context is framework-typed
	context: any,
	permissions: Record<string, string[]>,
): Promise<boolean> {
	const [currentUser] = await context.db
		.select({ role: user.role })
		.from(user)
		.where(eq(user.id, context.session.user.id))
		.limit(1);
	const res = await context.auth.api.userHasPermission({
		body: { role: currentUser?.role ?? "user", permissions },
	});
	return Boolean(res?.success);
}

/** Admin console gate: roles holding `config:manage` (admin / superadmin). */
export const adminMiddleware = createMiddleware()
	.middleware([protectedMiddleware])
	.server(async ({ next, context }) => {
		if (!(await can(context, { config: ["manage"] }))) {
			throw forbidden();
		}
		// Preserve db + auth from parent middleware (do not drop them).
		return next({
			context: {
				session: context.session,
				db: context.db,
				auth: context.auth,
			},
		});
	});
