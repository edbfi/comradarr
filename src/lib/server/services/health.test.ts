import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../tests/database.ts";
import { checkHealth, healthResponse } from "./health.ts";

const adminUrl = inject("testDatabaseAdminUrl");
let database: TestDatabase;
let db: Database;

beforeAll(async () => {
	database = await createDatabase(adminUrl);
	db = await openDatabase(database.url);
});

afterAll(async () => {
	await db.$client.close();
	await dropDatabase(adminUrl, database);
});

describe("checkHealth", () => {
	it("is healthy when the database answers", async () => {
		expect(await checkHealth(db)).toEqual({
			status: "healthy",
			components: { database: "healthy" },
		});
	});

	it("is unavailable when the database fails, saying nothing about why", async () => {
		const closed = await openDatabase(database.url);
		await closed.$client.close();

		expect(await checkHealth(closed)).toEqual({
			status: "unavailable",
			components: { database: "unavailable" },
		});
	});

	it("is unavailable when the database takes longer than the limit", async () => {
		const stalled = { execute: () => new Promise(() => {}) } as unknown as Database;
		const started = Date.now();

		expect((await checkHealth(stalled, { timeoutMs: 50 })).status).toBe("unavailable");
		expect(Date.now() - started).toBeLessThan(1000);
	});
});

describe("healthResponse", () => {
	it("answers healthy and degraded with 200, and unavailable with 503, never cached", async () => {
		const healthy = healthResponse({ status: "healthy", components: { database: "healthy" } });
		const degraded = healthResponse({ status: "degraded", components: { database: "healthy" } });
		const down = healthResponse({ status: "unavailable", components: { database: "unavailable" } });

		expect([healthy.status, degraded.status, down.status]).toEqual([200, 200, 503]);
		expect(healthy.headers.get("cache-control")).toBe("no-store");
		expect(healthy.headers.get("content-type")).toMatch(/^application\/json/);
		expect(await down.json()).toEqual({
			status: "unavailable",
			components: { database: "unavailable" },
		});
	});
});
