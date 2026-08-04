/**
 * Peer-protection guards for administrator mutations.
 *
 * `admin` and `superadmin` hold the same capabilities — superadmin is a
 * protected label, not a higher tier. Neither may ban, demote, or revoke
 * credentials of an administrator; nobody may change their own role.
 */

import { and, count, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Database } from "@/db";
import {
	adminAction,
	type JsonValue,
	oauthAccessToken,
	oauthRefreshToken,
	session,
	user,
} from "@/db/schema";
import { HttpError } from "@/utils/api-error";

const ADMIN_ROLES = ["admin", "superadmin"] as const;

export function isAdminRole(role: string | null | undefined): boolean {
	return role === "admin" || role === "superadmin";
}

/**
 * Neutralize web + OAuth access for a banned user (sessions + tokens).
 * Starter has no api-key plugin; only sessions and OAuth tokens are revoked.
 */
export async function revokeUserCredentials(
	db: Database,
	userId: string,
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.delete(oauthAccessToken)
			.where(eq(oauthAccessToken.userId, userId));
		await tx
			.delete(oauthRefreshToken)
			.where(eq(oauthRefreshToken.userId, userId));
		await tx.delete(session).where(eq(session.userId, userId));
		await tx
			.update(user)
			.set({ tokensRevokedAt: new Date() })
			.where(eq(user.id, userId));
	});
}

/**
 * Throw if `userId` is the last remaining usable admin/superadmin.
 */
export async function assertNotLastAdmin(
	db: Database,
	userId: string,
): Promise<void> {
	const rows = await db
		.select({ n: count() })
		.from(user)
		.where(
			and(
				inArray(user.role, [...ADMIN_ROLES]),
				ne(user.id, userId),
				or(eq(user.banned, false), isNull(user.banned)),
			),
		);
	if (Number(rows[0]?.n ?? 0) === 0) {
		throw new HttpError({
			status: 409,
			error: "conflict",
			message: "Cannot remove the last administrator.",
		});
	}
}

export type AdminAuditEntry = {
	actorId: string;
	action: string;
	targetType?: string;
	targetId?: string;
	detail?: JsonValue;
};

/** Best-effort audit row; never blocks the main operation. */
export async function logAdminAction(
	db: Database,
	entry: AdminAuditEntry,
	onFailure?: (error: unknown, entry: AdminAuditEntry) => void,
): Promise<void> {
	try {
		await db.insert(adminAction).values({
			id: crypto.randomUUID(),
			actorId: entry.actorId,
			action: entry.action,
			targetType: entry.targetType ?? null,
			targetId: entry.targetId ?? null,
			detail: entry.detail ?? null,
		});
	} catch (e) {
		onFailure?.(e, entry);
		console.error("admin audit log write failed", e);
	}
}

/**
 * Who may create, read, update and delete OAuth clients.
 * Both administrator roles are capability-identical.
 */
export function canManageOAuthClients(user: unknown): boolean {
	if (!user || typeof user !== "object") return false;
	const { role } = user as { role?: unknown };
	return typeof role === "string" && isAdminRole(role);
}

/**
 * Pure peer-protection check. Callers have already read the target row.
 */
export function assertAdminMayActOn(args: {
	actorId: string;
	targetId: string;
	targetRole: string | null | undefined;
	/** The role this submit writes, when it writes one. */
	nextRole?: string;
	/** The ban state this submit writes, when it changes it. */
	banning?: boolean;
	/** True on the credential-revocation path. */
	revokingCredentials?: boolean;
}): void {
	const { actorId, targetId, targetRole, nextRole, banning } = args;

	const changesRole = nextRole !== undefined && nextRole !== targetRole;
	if (changesRole && actorId === targetId) {
		throw new HttpError({
			status: 403,
			error: "forbidden",
			message: "You cannot change your own role.",
		});
	}

	if (!isAdminRole(targetRole)) return;
	if (changesRole) {
		throw new HttpError({
			status: 403,
			error: "forbidden",
			message: "You cannot change another administrator's role.",
		});
	}
	if (banning === true) {
		throw new HttpError({
			status: 403,
			error: "forbidden",
			message: "You cannot ban another administrator.",
		});
	}
	if (args.revokingCredentials) {
		throw new HttpError({
			status: 403,
			error: "forbidden",
			message: "You cannot revoke another administrator's credentials.",
		});
	}
}

export { ADMIN_ROLES };
