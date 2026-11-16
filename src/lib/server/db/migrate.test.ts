import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../tests/database.ts";
import { type Database, openDatabase } from "./client.ts";
import { type Migration, MigrationError, migrateDatabase, migrations } from "./migrate.ts";

const adminUrl = inject("testDatabaseAdminUrl");
const created: TestDatabase[] = [];
const opened: Database[] = [];

async function freshDatabase(): Promise<{ database: TestDatabase; db: Database }> {
	const database = await createDatabase(adminUrl);
	created.push(database);
	const db = await openDatabase(database.url);
	opened.push(db);
	return { database, db };
}

afterAll(async () => {
	for (const db of opened) await db.$client.close();
	for (const database of created) await dropDatabase(adminUrl, database);
});

const records = async (db: Database) =>
	(
		await db.execute<{ hash: string; created_at: string }>(
			sql`select hash, created_at from drizzle.__drizzle_migrations order by id`,
		)
	).map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) }));

describe("migrateDatabase", () => {
	let db: Database;

	beforeAll(async () => {
		({ db } = await freshDatabase());
	});

	it("applies the bundled migrations to a new database, then nothing on a second run", async () => {
		expect(await migrateDatabase(db)).toEqual(migrations.map((migration) => migration.tag));
		expect(await migrateDatabase(db)).toEqual([]);
	});

	it("creates the three tables and the audit enums", async () => {
		const tables = await db.execute<{ table_name: string }>(
			sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
		);
		const actions = await db.execute<{ value: string }>(
			sql`select unnest(enum_range(null::audit_action))::text as value`,
		);

		expect(tables.map((row) => row.table_name)).toEqual(["audit_log", "owner", "settings"]);
		expect(actions.map((row) => row.value)).toEqual([
			"setup.token_printed",
			"setup.claim_attempted",
			"setup.owner_created",
			"setup.first_run_completed",
		]);
	});

	it("records each migration as Drizzle Kit's own migrator does", async () => {
		const { database } = await freshDatabase();
		const reference = drizzle(database.url);
		try {
			await migrate(reference, { migrationsFolder: "drizzle" });
			const theirs = (
				await reference.execute<{ hash: string; created_at: string }>(
					sql`select hash, created_at from drizzle.__drizzle_migrations order by id`,
				)
			).map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) }));

			expect(await records(db)).toEqual(theirs);
		} finally {
			await reference.$client.close();
		}
	});

	it("names the bookkeeping when it fails before any migration starts", async () => {
		const { database } = await freshDatabase();
		const db = await openDatabase(database.url);
		const owner = new URL(database.url).username;
		await db.execute(
			sql`revoke create on database ${sql.identifier(database.name)} from ${sql.identifier(owner)}`,
		);
		await db.$client.close();

		const error = await migrateDatabase(await openDatabase(database.url)).catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(MigrationError);
		expect((error as Error).message).toMatch(
			/^the migrations' bookkeeping failed: permission denied/,
		);
	});

	it("stops at a failed migration, naming it and PostgreSQL's reason, and applies none", async () => {
		const { db: target } = await freshDatabase();
		const last = migrations.at(-1) as Migration;
		const broken: Migration = {
			tag: "9999_broken",
			sql: ["create table later (id int)", "select * from nowhere"],
			bps: true,
			folderMillis: last.folderMillis + 1,
			hash: "0".repeat(64),
		};

		const error = await migrateDatabase(target, [...migrations, broken]).catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(MigrationError);
		expect((error as Error).message).toBe(
			'the migration 9999_broken failed: relation "nowhere" does not exist',
		);
		const tables = await target.execute<{ count: string }>(
			sql`select count(*) as count from information_schema.tables where table_schema = 'public'`,
		);
		expect(Number(tables[0]?.count)).toBe(0);
		expect(await records(target)).toEqual([]);
	});
});
