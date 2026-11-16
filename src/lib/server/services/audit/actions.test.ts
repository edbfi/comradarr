import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../../tests/database.ts";
import { AUDIT_ACTIONS, checkAuditActions } from "./actions.ts";

const adminUrl = inject("testDatabaseAdminUrl");
let database: TestDatabase;
let db: Database;

beforeAll(async () => {
	database = await createDatabase(adminUrl);
	db = await openDatabase(database.url);
	await migrateDatabase(db);
});

afterAll(async () => {
	await db.$client.close();
	await dropDatabase(adminUrl, database);
});

describe("checkAuditActions", () => {
	it("passes on a migrated database, which knows every code", async () => {
		await expect(checkAuditActions(db)).resolves.toBeUndefined();
	});

	it("stops on a code the database lacks, naming it", async () => {
		await expect(
			checkAuditActions(db, [...AUDIT_ACTIONS, "setup.not_migrated", "setup.nor_this"]),
		).rejects.toThrow(
			"the database's audit_action type lacks setup.not_migrated, setup.nor_this; a migration must add each code in services/audit/actions.ts",
		);
	});
});
