import { sql } from "drizzle-orm";
import { check, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

/** The instance's one owner (D20): the fixed id and its check allow one row at most. */
export const owner = pgTable(
	"owner",
	{
		id: smallint("id").primaryKey(),
		username: text("username").notNull(),
		passwordHash: text("password_hash").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull(),
	},
	(table) => [check("owner_one_row", sql`${table.id} = 1`)],
);
