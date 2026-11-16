import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Database } from "./client.ts";

/**
 * The audit trail's action codes (SPEC-setup.md, "The audit trail"). The list only grows: a
 * migration may add a value, never remove or rename one, and never uses a value that it or another
 * migration in the same release adds, since PostgreSQL won't use an enum value in the transaction
 * that adds it.
 */
export const auditAction = pgEnum("audit_action", [
	"setup.token_printed",
	"setup.claim_attempted",
	"setup.owner_created",
	"setup.first_run_completed",
]);

/** Who acted: the owner, nobody (the client address is who acted), or the app itself. */
export const auditActor = pgEnum("audit_actor", ["owner", "nobody", "app"]);

/**
 * The append-only audit trail (D7): the app role may only insert and read it. An entry the app
 * itself writes has no client address, user agent or request id.
 */
export const auditLog = pgTable(
	"audit_log",
	{
		id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		at: timestamp("at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
		action: auditAction("action").notNull(),
		actor: auditActor("actor").notNull(),
		context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
		clientAddress: text("client_address"),
		userAgent: text("user_agent"),
		requestId: text("request_id"),
	},
	(table) => [
		index("audit_log_at").on(table.at.desc()),
		index("audit_log_action_at").on(table.action, table.at.desc()),
	],
);

/** The action codes the database's `audit_action` type knows, which startup checks the list against. */
export async function auditActionsInDatabase(db: Database): Promise<string[]> {
	const rows = await db.execute<{ code: string }>(
		sql`select unnest(enum_range(null::audit_action))::text as code`,
	);
	return rows.map((row) => row.code);
}
