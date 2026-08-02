/**
 * Admin user list + update. Starter roles only: user | admin | superadmin.
 */
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { user } from "@/db/schema";
import type { AdminAuditEntry } from "@/services/admin-security";

export type AdminUserRole = "user" | "admin" | "superadmin";

export type ListAdminUsersParams = {
	page: number;
	pageSize: number;
	search: string;
	sort?: { id: string; desc?: boolean };
	filters: { role?: string; banned?: string };
};

export async function listAdminUsers(
	db: Database,
	params: ListAdminUsersParams,
) {
	const { page, pageSize, search, sort, filters } = params;

	const conds: SQL[] = [];
	if (search.trim()) {
		const q = `%${search.trim()}%`;
		const m = or(ilike(user.email, q), ilike(user.name, q));
		if (m) conds.push(m);
	}
	if (
		filters.role === "user" ||
		filters.role === "admin" ||
		filters.role === "superadmin"
	) {
		conds.push(eq(user.role, filters.role));
	}
	if (filters.banned === "true" || filters.banned === "false") {
		conds.push(eq(user.banned, filters.banned === "true"));
	}
	const where = conds.length ? and(...conds) : undefined;

	const sortCol =
		sort?.id === "email"
			? user.email
			: sort?.id === "name"
				? user.name
				: user.createdAt;
	const orderBy = sort && sort.desc === false ? asc(sortCol) : desc(sortCol);

	const rows = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			role: user.role,
			banned: user.banned,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: user.createdAt,
		})
		.from(user)
		.where(where)
		.orderBy(orderBy)
		.limit(pageSize)
		.offset(page * pageSize);

	const [{ n }] = await db.select({ n: count() }).from(user).where(where);
	return {
		rows: rows.map((row) => ({
			...row,
			createdAt: row.createdAt.getTime(),
		})),
		total: Number(n),
	};
}

export type AdminUserCurrent = {
	role: string | null;
	banned: boolean | null;
	emailVerified: boolean;
};

export type AdminUserUpdateData = {
	userId: string;
	emailVerified: boolean;
	banned: boolean;
	role?: AdminUserRole;
};

export type AdminUserAuthApi = {
	setRole(args: {
		body: { userId: string; role: string };
		headers: HeadersInit;
	}): Promise<unknown>;
	banUser(args: {
		body: { userId: string };
		headers: HeadersInit;
	}): Promise<unknown>;
	unbanUser(args: {
		body: { userId: string };
		headers: HeadersInit;
	}): Promise<unknown>;
};

export type AdminUserUpdateDeps = {
	db: Database;
	auth: AdminUserAuthApi;
	headers: HeadersInit;
	actorId: string;
	log: (entry: AdminAuditEntry) => Promise<void>;
	revokeCredentials: (userId: string) => Promise<void>;
};

/**
 * Apply admin user mutations. Auth API calls first (other connection), then
 * direct db writes — never hold a row lock across auth.api (deadlock rule).
 */
export async function applyAdminUserUpdate(
	deps: AdminUserUpdateDeps,
	current: AdminUserCurrent,
	data: AdminUserUpdateData,
): Promise<void> {
	const { db, auth, headers, actorId, log, revokeCredentials } = deps;

	const roleChanged =
		data.role !== undefined && (current.role ?? "user") !== data.role;
	const banChanged = Boolean(current.banned) !== data.banned;
	const verifiedChanged = current.emailVerified !== data.emailVerified;

	if (roleChanged && data.role !== undefined) {
		await auth.setRole({
			body: { userId: data.userId, role: data.role },
			headers,
		});
	}
	if (banChanged) {
		if (data.banned) {
			await auth.banUser({ body: { userId: data.userId }, headers });
		} else {
			await auth.unbanUser({ body: { userId: data.userId }, headers });
		}
	}

	if (banChanged && data.banned) {
		await revokeCredentials(data.userId);
	}
	if (verifiedChanged) {
		await db
			.update(user)
			.set({ emailVerified: data.emailVerified, updatedAt: new Date() })
			.where(eq(user.id, data.userId));
	}

	if (verifiedChanged) {
		await log({
			actorId,
			action: "user.email_verified",
			targetType: "user",
			targetId: data.userId,
			detail: { emailVerified: data.emailVerified },
		});
	}
	if (roleChanged && data.role !== undefined) {
		await log({
			actorId,
			action: "user.role_change",
			targetType: "user",
			targetId: data.userId,
			detail: { from: current.role ?? "user", to: data.role },
		});
	}
	if (banChanged) {
		await log({
			actorId,
			action: data.banned ? "user.ban" : "user.unban",
			targetType: "user",
			targetId: data.userId,
		});
	}
}
