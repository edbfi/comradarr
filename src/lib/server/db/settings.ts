import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** One value per key; modules add their own keys (SPEC-setup.md, "Tables"). */
export const settings = pgTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull(),
});
