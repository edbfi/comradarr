import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
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
import { auditLog } from "#lib/server/db/audit.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../../tests/database.ts";
import { recordAudit, writeAuditEntry } from "./record.ts";

const adminUrl = inject("testDatabaseAdminUrl");
let database: TestDatabase;
let db: Database;
let lines: string[];

beforeAll(async () => {
	database = await createDatabase(adminUrl);
	db = await openDatabase(database.url);
	await migrateDatabase(db);
});

afterAll(async () => {
	await db.$client.close();
	await dropDatabase(adminUrl, database);
});

beforeEach(async () => {
	await db.delete(auditLog);
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		(rest.find((arg) => typeof arg === "function") as (() => void) | undefined)?.();
		return true;
	});
});

afterEach(() => vi.restoreAllMocks());

const entries = () => db.select().from(auditLog).orderBy(auditLog.id);

const request = {
	clientAddress: "192.0.2.7",
	userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
	requestId: "req-1",
};

describe("recordAudit", () => {
	it("writes an entry with its action, actor, context, request fields and the database's time", async () => {
		const before = Date.now();

		await recordAudit(db, {
			action: "setup.claim_attempted",
			actor: "nobody",
			context: { outcome: "wrong_token" },
			request,
		});

		const [entry, ...rest] = await entries();
		expect(rest).toEqual([]);
		expect(entry).toMatchObject({
			action: "setup.claim_attempted",
			actor: "nobody",
			context: { outcome: "wrong_token" },
			clientAddress: "192.0.2.7",
			userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
			requestId: "req-1",
		});
		expect(entry?.at.getTime()).toBeGreaterThanOrEqual(before - 5000);
		expect(entry?.at.getTime()).toBeLessThanOrEqual(Date.now() + 5000);
	});

	it("leaves the request fields empty in an entry the app itself writes", async () => {
		await recordAudit(db, {
			action: "setup.token_printed",
			actor: "app",
			context: { expiresAt: "2026-11-16T15:00:00.000Z" },
		});

		expect(await entries()).toEqual([
			expect.objectContaining({
				actor: "app",
				context: { expiresAt: "2026-11-16T15:00:00.000Z" },
				clientAddress: null,
				userAgent: null,
				requestId: null,
			}),
		]);
	});

	it("passes the context through the log redaction, so no secret reaches it", async () => {
		const jwt =
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

		await recordAudit(db, {
			action: "setup.owner_created",
			actor: "owner",
			context: { username: jwt },
			request,
		});

		const [entry] = await entries();
		expect(entry?.context).toEqual({ username: "[redacted]" });
	});

	it("cuts the user agent to 512 characters, never inside a character", async () => {
		await recordAudit(db, {
			action: "setup.claim_attempted",
			actor: "nobody",
			context: { outcome: "invalid" },
			request: { ...request, userAgent: `${"a".repeat(511)}😀😀` },
		});

		const [entry] = await entries();
		expect(entry?.userAgent).toBe(`${"a".repeat(511)}😀`);
	});

	it("logs a failed write as an error with its action, and doesn't throw", async () => {
		const closed = drizzle({ client: new SQL(database.url, { max: 1 }) });
		await closed.$client.close();

		await recordAudit(closed, {
			action: "setup.claim_attempted",
			actor: "nobody",
			context: { outcome: "failed" },
			request,
		});

		const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
		expect(logged).toEqual([
			expect.objectContaining({
				level: "error",
				source: "audit",
				message: "writing an audit entry failed",
				metadata: expect.objectContaining({ action: "setup.claim_attempted" }),
			}),
		]);
	});
});

describe("writeAuditEntry", () => {
	it("throws a failed write, so the claim's transaction rolls back with it", async () => {
		const closed = drizzle({ client: new SQL(database.url, { max: 1 }) });
		await closed.$client.close();

		await expect(
			writeAuditEntry(closed, {
				action: "setup.first_run_completed",
				actor: "owner",
				context: {},
				request,
			}),
		).rejects.toThrow();
	});

	it("writes inside a transaction, and its entry goes with a rollback", async () => {
		await db
			.transaction(async (tx) => {
				await writeAuditEntry(tx, {
					action: "setup.first_run_completed",
					actor: "owner",
					context: {},
					request,
				});
				throw new Error("roll back");
			})
			.catch(() => {});

		expect(await entries()).toEqual([]);
	});
});
