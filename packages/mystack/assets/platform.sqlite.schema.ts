import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.sqlite.schema";

export type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('subsec') * 1000)`).notNull();
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('subsec') * 1000)`).$onUpdate(() => new Date()).notNull();
export const systemConfig = sqliteTable("system_config", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }).$type<JsonValue>().notNull(),
	updatedAt: updatedAt(),
});
export const adminAction = sqliteTable("admin_action", {
	id: text("id").primaryKey(),
	actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
	action: text("action").notNull(),
	targetType: text("target_type"),
	targetId: text("target_id"),
	detail: text("detail", { mode: "json" }).$type<JsonValue>(),
	createdAt: createdAt(),
}, (table) => [index("admin_action_created_idx").on(table.createdAt)]);
export const purchase = sqliteTable("purchase", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	provider: text("provider").notNull(),
	externalId: text("external_id").notNull(),
	amount: text("amount").notNull(),
	currency: text("currency").notNull().default("usd"),
	status: text("status").notNull().default("pending"),
	metadata: text("metadata", { mode: "json" }).$type<JsonValue>(),
	paidAt: integer("paid_at", { mode: "timestamp_ms" }),
	fulfillmentKey: text("fulfillment_key"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
}, (table) => [uniqueIndex("purchase_provider_external_uq").on(table.provider, table.externalId), index("purchase_userId_idx").on(table.userId)]);
// Durable paid events. D1 commits this row in the same batch as the paid flip.
// Product-specific fulfillment consumes these events with purchaseId as its
// idempotency key; no arbitrary async callback pretends to be a D1 transaction.
export const purchaseDelivery = sqliteTable("purchase_delivery", {
	purchaseId: text("purchase_id").primaryKey().references(() => purchase.id, { onDelete: "cascade" }),
	createdAt: createdAt(),
	processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});
export type SystemConfigRow = typeof systemConfig.$inferSelect;
export type AdminActionRow = typeof adminAction.$inferSelect;
export type PurchaseRow = typeof purchase.$inferSelect;
