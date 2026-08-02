import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { user } from "@/db/schema";
import { adminMiddleware } from "@/middlewares/admin";
import { databaseMiddleware } from "@/middlewares/database";
import {
	assertAdminMayActOn,
	assertNotLastAdmin,
	isAdminRole,
	logAdminAction,
	revokeUserCredentials,
} from "@/services/admin-security";
import { applyAdminUserUpdate, listAdminUsers } from "@/services/admin-users";

const listSchema = z.object({
	page: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(1).max(100).default(20),
	search: z.string().default(""),
	sort: z.object({ id: z.string(), desc: z.boolean().optional() }).optional(),
	filters: z
		.object({
			role: z.string().optional(),
			banned: z.string().optional(),
		})
		.default({}),
});

export const getUsers = createServerFn({ method: "GET" })
	.middleware([databaseMiddleware, adminMiddleware])
	.validator(listSchema)
	.handler(({ context, data }) => listAdminUsers(context.db, data));

export const updateUser = createServerFn({ method: "POST" })
	.middleware([databaseMiddleware, adminMiddleware])
	.validator(
		z.object({
			userId: z.string().min(1),
			emailVerified: z.boolean(),
			// Superadmin role is not assignable from UI (SQL bootstrap only).
			role: z.enum(["user", "admin"]).optional(),
			banned: z.boolean(),
		}),
	)
	.handler(async ({ context, data }) => {
		const actorId = context.session.user.id;
		const [current] = await context.db
			.select({
				role: user.role,
				banned: user.banned,
				emailVerified: user.emailVerified,
			})
			.from(user)
			.where(eq(user.id, data.userId))
			.limit(1);
		if (!current) throw new Error("User not found.");

		if (data.banned && !current.banned && actorId === data.userId) {
			throw new Error("You cannot ban your own account.");
		}
		assertAdminMayActOn({
			actorId,
			targetId: data.userId,
			targetRole: current.role,
			nextRole: data.role,
			banning: data.banned && !current.banned,
		});

		const demotingAdmin =
			data.role !== undefined &&
			isAdminRole(current.role) &&
			!isAdminRole(data.role);
		const banningAdmin =
			data.banned && !current.banned && isAdminRole(current.role);
		if (demotingAdmin || banningAdmin) {
			await assertNotLastAdmin(context.db, data.userId);
		}

		const headers = getRequestHeaders();
		await applyAdminUserUpdate(
			{
				db: context.db,
				auth: {
					setRole: (args) => context.auth.api.setRole(args),
					banUser: (args) => context.auth.api.banUser(args),
					unbanUser: (args) => context.auth.api.unbanUser(args),
				},
				headers,
				actorId,
				log: (entry) => logAdminAction(context.db, entry),
				revokeCredentials: (userId) =>
					revokeUserCredentials(context.db, userId),
			},
			current,
			data,
		);
		return { ok: true };
	});
