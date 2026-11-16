import { eq } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Database } from "./client.ts";

/** One value per key; modules add their own keys (SPEC-setup.md, "Tables"). */
export const settings = pgTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull(),
});

/** The value stored under `key`, or undefined when none is. */
export async function readSetting(
	db: Pick<Database, "select">,
	key: string,
): Promise<string | undefined> {
	const rows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, key))
		.limit(1);
	return rows[0]?.value;
}

/** Stores `value` under `key`, replacing what was there, at the time `now`. */
export async function writeSetting(
	db: Pick<Database, "insert">,
	key: string,
	value: string,
	now: Date,
): Promise<void> {
	await db
		.insert(settings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}
