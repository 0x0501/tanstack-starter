/**
 * Platform tables owned by the Starter (not Better Auth generated).
 * Purchase, audit log, system_config — product domain tables stay out.
 */
import { sql } from "drizzle-orm";
import {
	index,
	jsonb,
	pgPolicy,
	pgRole,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

/** App role used by Hyperdrive connections (RLS policies target this). */
export const appRole = pgRole("starter_app", { createRole: false }).existing();

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| { [key: string]: JsonValue }
	| JsonValue[];

export const systemConfig = pgTable(
	"system_config",
	{
		key: text("key").primaryKey(),
		value: jsonb("value").$type<JsonValue>().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	() => [
		pgPolicy("rls_policy", {
			as: "permissive",
			to: appRole,
			for: "all",
			using: sql`app_private.is_admin()`,
			withCheck: sql`app_private.is_admin()`,
		}),
	],
);

export const adminAction = pgTable(
	"admin_action",
	{
		id: text("id").primaryKey(),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		action: text("action").notNull(),
		targetType: text("target_type"),
		targetId: text("target_id"),
		detail: jsonb("detail").$type<JsonValue>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		pgPolicy("rls_policy", {
			as: "permissive",
			to: appRole,
			for: "all",
			using: sql`app_private.is_admin()`,
			withCheck: sql`app_private.is_admin()`,
		}),
		index("admin_action_created_idx").on(t.createdAt.desc()),
	],
);

export const purchase = pgTable(
	"purchase",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(), // stripe | creem | nowpayments
		externalId: text("external_id").notNull(),
		// Minor units as decimal text (e.g. "1999" cents). Avoid float JSON;
		// adapters parse with parseInt, not Number(), for safe integers.
		amount: text("amount").notNull(),
		currency: text("currency").notNull().default("usd"),
		status: text("status").notNull().default("pending"), // pending | paid | failed
		metadata: jsonb("metadata").$type<JsonValue>(),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		uniqueIndex("purchase_provider_external_uq").on(t.provider, t.externalId),
		index("purchase_userId_idx").on(t.userId),
		pgPolicy("rls_user_read", {
			as: "permissive",
			to: appRole,
			for: "select",
			using: sql`app_private.is_admin() OR user_id = app_private.current_user_id()`,
		}),
		pgPolicy("rls_service_write", {
			as: "permissive",
			to: appRole,
			for: "all",
			using: sql`app_private.is_admin()`,
			withCheck: sql`app_private.is_admin()`,
		}),
	],
);

export type SystemConfigRow = typeof systemConfig.$inferSelect;
export type AdminActionRow = typeof adminAction.$inferSelect;
export type PurchaseRow = typeof purchase.$inferSelect;
