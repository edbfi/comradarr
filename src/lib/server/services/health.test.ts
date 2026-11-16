import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	inject,
	it,
	vi,
} from "vitest";
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

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		(rest.find((arg) => typeof arg === "function") as (() => void) | undefined)?.();
		return true;
	});
});

afterEach(() => vi.restoreAllMocks());

const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

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

	it("logs when the database stops answering and when it is back, once each, with the reason", async () => {
		const closed = await openDatabase(database.url);
		await closed.$client.close();

		// Whatever an earlier test left, the database is answering again before this one starts.
		await checkHealth(db);
		lines.length = 0;

		await checkHealth(closed);
		await checkHealth(closed);
		await checkHealth(db);

		expect(entries()).toEqual([
			expect.objectContaining({
				level: "warn",
				source: "health",
				message: "the database is unavailable",
				metadata: { reason: expect.any(String) },
			}),
			expect.objectContaining({ level: "info", source: "health", message: "the database is back" }),
		]);
		expect(lines.join("")).not.toContain(new URL(database.url).password);
	});
});

describe("healthResponse", () => {
	it("answers healthy and degraded with 200, and unavailable with 503, never cached", async () => {
		const healthy = healthResponse({ status: "healthy", components: { database: "healthy" } });
		const degraded = healthResponse({
			status: "degraded",
			components: { database: "healthy", other: "degraded" },
		});
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
