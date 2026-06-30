import { env } from "cloudflare:workers";
import { createMiddleware } from "@tanstack/react-start";
import { createDB } from "@/db";

export const databaseMiddleware = createMiddleware().server(({ next }) => {
	const db = createDB(env.DB);

	return next({
		context: {
			db,
		},
	});
});
