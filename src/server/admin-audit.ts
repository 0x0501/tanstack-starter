import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { adminAction } from "@/db/schema";
import { adminMiddleware } from "@/middlewares/admin";
import { databaseMiddleware } from "@/middlewares/database";

export const listAuditEvents = createServerFn({ method: "GET" })
	.middleware([databaseMiddleware, adminMiddleware])
	.validator(
		z.object({
			limit: z.number().int().min(1).max(200).default(50),
		}),
	)
	.handler(async ({ context, data }) => {
		const rows = await context.db
			.select({
				id: adminAction.id,
				actorId: adminAction.actorId,
				action: adminAction.action,
				targetType: adminAction.targetType,
				targetId: adminAction.targetId,
				detail: adminAction.detail,
				createdAt: adminAction.createdAt,
			})
			.from(adminAction)
			.orderBy(desc(adminAction.createdAt))
			.limit(data.limit);

		return rows.map((r) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
		}));
	});
