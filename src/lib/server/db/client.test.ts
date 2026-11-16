import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../tests/database.ts";
import { ConfigError } from "../config/config-error.ts";
import { type Database, isWorthWaiting, openDatabase } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { settings } from "./settings.ts";

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

const keys = async () => (await db.select({ key: settings.key }).from(settings)).map((r) => r.key);

describe("openDatabase", () => {
	// D6: a statement outside the transaction's handle runs on another pooled connection.
	it("keeps a concurrent, unrelated write when a transaction rolls back", async () => {
		const updatedAt = new Date();
		let inserted!: () => void;
		const insertedInside = new Promise<void>((resolve) => {
			inserted = resolve;
		});
		let release!: () => void;
		const rollBack = new Promise<void>((resolve) => {
			release = resolve;
		});

		const transaction = db
			.transaction(async (tx) => {
				await tx.insert(settings).values({ key: "inside", value: "1", updatedAt });
				inserted();
				await rollBack;
				throw new Error("roll back");
			})
			.then(
				() => "committed",
				(error: Error) => error.message,
			);
		await insertedInside;
		// Drizzle's queries are lazy, so `execute()` starts the write now, while the transaction is
		// open; the pause lets it reach the server before the transaction rolls back.
		const outside = db
			.insert(settings)
			.values({ key: "outside", value: "1", updatedAt })
			.execute()
			.then(
				() => "written",
				(error: Error) => error.message,
			);
		await new Promise((resolve) => setTimeout(resolve, 50));
		release();

		expect(await transaction).toBe("roll back");
		expect(await outside).toBe("written");
		expect(await keys()).toEqual(["outside"]);
	});

	it("round-trips a timestamp to the millisecond", async () => {
		const updatedAt = new Date("2026-11-16T10:11:12.345Z");
		await db.insert(settings).values({ key: "time", value: "1", updatedAt });

		const [row] = await db.select().from(settings).where(eq(settings.key, "time"));

		expect(row?.updatedAt.toISOString()).toBe(updatedAt.toISOString());
	});

	it("waits for a server that refuses connections, then gives up naming why", async () => {
		const started = Date.now();
		const waits: number[] = [];

		const error = await openDatabase("postgres://comradarr:secret-word@127.0.0.1:1/comradarr", {
			waitMs: 600,
			intervalMs: 200,
			onWaiting: (attempt) => waits.push(attempt),
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ConfigError);
		expect((error as Error).message).toBe(
			"PostgreSQL at COMRADARR_DATABASE_URL could not be reached within 0.6 seconds (ERR_POSTGRES_CONNECTION_REFUSED)",
		);
		expect((error as Error).message).not.toContain("secret-word");
		expect(waits.length).toBeGreaterThanOrEqual(2);
		expect(Date.now() - started).toBeLessThan(3000);
	});

	it("waits for a host name that doesn't resolve yet, as a Compose service's before it starts", async () => {
		const waits: number[] = [];

		const error = await openDatabase("postgres://comradarr:secret-word@no-such-host.invalid/c", {
			waitMs: 600,
			intervalMs: 200,
			onWaiting: (attempt) => waits.push(attempt),
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ConfigError);
		expect((error as Error).message).toMatch(
			/^PostgreSQL at COMRADARR_DATABASE_URL could not be reached within 0\.6 seconds \(/,
		);
		expect(waits.length).toBeGreaterThanOrEqual(2);
	});

	it("gives up on a server that accepts the connection and then never answers", async () => {
		const server = silentServer();
		const started = Date.now();

		const error = await openDatabase(
			`postgres://comradarr:secret-word@127.0.0.1:${server.port}/comradarr?sslmode=disable`,
			{ waitMs: 500, intervalMs: 100 },
		).catch((caught: unknown) => caught);
		server.stop(true);

		expect(error).toBeInstanceOf(ConfigError);
		expect((error as Error).message).toMatch(/could not be reached within 0\.5 seconds/);
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it("names the file variable when the URL came from it", async () => {
		const error = await openDatabase("postgres://comradarr:secret-word@127.0.0.1:1/comradarr", {
			waitMs: 200,
			intervalMs: 100,
			variable: "COMRADARR_DATABASE_URL_FILE",
		}).catch((caught: unknown) => caught);

		expect((error as ConfigError).variable).toBe("COMRADARR_DATABASE_URL_FILE");
		expect((error as Error).message).toMatch(
			/^PostgreSQL at the URL in COMRADARR_DATABASE_URL_FILE's file could not be reached/,
		);
	});

	it("names the role it connects as when it can't reach PostgreSQL", async () => {
		const error = await openDatabase("postgres://comradarr:secret-word@127.0.0.1:1/comradarr", {
			waitMs: 200,
			intervalMs: 100,
			as: 'the app role "comradarr_app"',
		}).catch((caught: unknown) => caught);

		expect((error as Error).message).toMatch(
			/^PostgreSQL, for the app role "comradarr_app", could not be reached within 0\.2 seconds/,
		);
	});

	it("fails at once when PostgreSQL refuses the owner role's password", async () => {
		const url = new URL(database.url);
		url.password = "not-the-password";
		const started = Date.now();

		const error = await openDatabase(url.toString(), { waitMs: 10_000 }).catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(ConfigError);
		expect((error as Error).message).toBe(
			`PostgreSQL at COMRADARR_DATABASE_URL refused the connection (28P01: password authentication failed for user "${database.name}")`,
		);
		expect((error as Error).message).not.toContain("not-the-password");
		expect(Date.now() - started).toBeLessThan(5000);
	});
});

describe("isWorthWaiting", () => {
	const error = (fields: Record<string, string>) => Object.assign(new Error("x"), fields);

	it("waits for a refused, timed-out or closed connection, and a server still starting", () => {
		expect(isWorthWaiting(error({ code: "ERR_POSTGRES_CONNECTION_REFUSED" }))).toBe(true);
		expect(isWorthWaiting(error({ code: "ERR_POSTGRES_CONNECTION_TIMEOUT" }))).toBe(true);
		expect(isWorthWaiting(error({ code: "ERR_POSTGRES_CONNECTION_CLOSED" }))).toBe(true);
		expect(isWorthWaiting(error({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "57P03" }))).toBe(true);
	});

	it("doesn't wait for authentication, a missing database or anything else", () => {
		expect(isWorthWaiting(error({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "28P01" }))).toBe(
			false,
		);
		expect(isWorthWaiting(error({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "3D000" }))).toBe(
			false,
		);
		expect(isWorthWaiting(new Error("other"))).toBe(false);
	});
});

/**
 * A server that speaks just enough of PostgreSQL's protocol to accept a connection (refusing TLS,
 * then authentication OK and ready for a query) and then never answers a query.
 */
function silentServer() {
	return Bun.listen({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			data(socket, data) {
				const sslRequest = data.length === 8 && data.readInt32BE(4) === 80877103;
				if (sslRequest) {
					socket.write("N");
					return;
				}
				if (data[0] === 0) {
					// The startup message: AuthenticationOk, then ReadyForQuery (idle).
					const ok = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]);
					const ready = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]);
					socket.write(Buffer.concat([ok, ready]));
				}
			},
		},
	});
}
