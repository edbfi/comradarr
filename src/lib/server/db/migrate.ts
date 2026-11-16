import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { Database } from "./client.ts";

/** A migration as Drizzle's migrator takes it, with the name Drizzle Kit gave it. */
export type Migration = MigrationMeta & { readonly tag: string };

/** A migration failed; startup stops with its name and PostgreSQL's reason (D5). */
export class MigrationError extends Error {
	override readonly name = "MigrationError";
}

// Vite bundles every reviewed migration and Drizzle Kit's journal, so the built server needs no
// `drizzle/` folder beside it (D15).
const files = import.meta.glob<string>(["/drizzle/*.sql", "/drizzle/meta/_journal.json"], {
	query: "?raw",
	import: "default",
	eager: true,
});

type Journal = { entries: { tag: string; when: number; breakpoints: boolean }[] };

/**
 * The migrations in the journal's order, built as Drizzle's `readMigrationFiles` builds them from
 * the folder: the statements split at each breakpoint, and the file's sha256 as its hash.
 */
export const migrations: readonly Migration[] = (JSON.parse(journalText()) as Journal).entries.map(
	(entry) => {
		const text = files[`/drizzle/${entry.tag}.sql`];
		if (text === undefined) throw new Error(`the migration ${entry.tag} isn't bundled`);
		return {
			tag: entry.tag,
			sql: text.split("--> statement-breakpoint"),
			bps: entry.breakpoints,
			folderMillis: entry.when,
			hash: createHash("sha256").update(text).digest("hex"),
		};
	},
);

/** The journal's text; a build without it would apply nothing and serve an empty database. */
function journalText(): string {
	const text = files["/drizzle/meta/_journal.json"];
	if (text === undefined) throw new Error("the migration journal isn't bundled");
	return text;
}

/**
 * Applies the migrations `db` hasn't recorded yet, in one transaction, and returns their names.
 * It keeps Drizzle's PostgreSQL migrator's bookkeeping exactly (its `drizzle.__drizzle_migrations`
 * table, a migration pending when it is newer than the last one recorded), applying them itself
 * only so that a failure names its migration.
 */
export async function migrateDatabase(
	db: Database,
	list: readonly Migration[] = migrations,
): Promise<string[]> {
	// What failed: the bookkeeping until a migration starts, then that migration.
	let current = "the migrations' bookkeeping";
	let pending: readonly Migration[] = [];
	try {
		await db.execute(sql`create schema if not exists drizzle`);
		await db.execute(
			sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
		);
		const [last] = await db.execute<{ created_at: string }>(
			sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
		);
		pending = list.filter(
			(migration) => last === undefined || Number(last.created_at) < migration.folderMillis,
		);
		await db.transaction(async (tx) => {
			for (const migration of pending) {
				current = `the migration ${migration.tag}`;
				for (const statement of migration.sql) await tx.execute(sql.raw(statement));
				await tx.execute(
					sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`,
				);
			}
		});
	} catch (error) {
		throw new MigrationError(`${current} failed: ${serverMessage(error)}`);
	}
	return pending.map((migration) => migration.tag);
}

/**
 * PostgreSQL's own message: Drizzle wraps it in an error whose message repeats the query and its
 * parameters, so the reason comes from the innermost cause.
 */
function serverMessage(error: unknown): string {
	let inner = error;
	while (inner instanceof Error && inner.cause instanceof Error) inner = inner.cause;
	return inner instanceof Error ? inner.message : "unknown error";
}
