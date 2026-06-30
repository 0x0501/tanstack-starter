import { createMiddleware } from "@tanstack/react-start";
import { createAuth } from "@/lib/auth";
import { databaseMiddleware } from "./database";

export const betterAuthMiddleware = createMiddleware()
	.middleware([databaseMiddleware])
	.server(({ next, context }) => {
		const auth = createAuth(context.db);

		return next({
			context: {
				auth,
			},
		});
	});
