import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { auditLog } from "#lib/server/db/audit.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner } from "#lib/server/db/owner.ts";
import { writeSetting } from "#lib/server/db/settings.ts";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../../tests/database.ts";
import {
	FIRST_RUN_COMPLETE,
	FIRST_RUN_STEP_KEY,
	isClaimed,
	isFirstRunComplete,
	markClaimed,
	startFirstRun,
	stopFirstRun,
	useToken,
	withClaimInProgress,
} from "./first-run.ts";

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

afterEach(() => {
	stopFirstRun();
	vi.useRealTimers();
});

/**
 * Fakes the clock from here on, so a token expires exactly when the test moves time on rather than
 * whenever a loaded machine gets to it. The database's own clock and I/O stay real.
 */
const fakeClock = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

/** A banner's token, without its dashes. */
const tokenIn = (banner: string | undefined) =>
	/Setup token: ([a-z0-9]{4})-([a-z0-9]{4})-([a-z0-9]{4})/
		.exec(banner ?? "")
		?.slice(1)
		.join("");

describe("first run's bootstrap token", () => {
	it("is printed as the banner while unclaimed, with the path to open at Comradarr's address", async () => {
		const printed: string[] = [];
		fakeClock();
		vi.setSystemTime(new Date("2026-11-16T14:30:00.000Z"));
		await startFirstRun({ db, origin: undefined, print: (banner) => printed.push(banner) });

		expect(isClaimed()).toBe(false);
		expect(printed).toHaveLength(1);
		const token = tokenIn(printed[0]) ?? "";
		const shown = `${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8)}`;
		expect(printed[0]?.split("\n")).toEqual([
			"==================== Comradarr setup ====================",
			`Setup token: ${shown} (valid until 2026-11-16 14:45:00 UTC)`,
			`Open /setup#token=${shown} at the address you reach Comradarr at, to claim it.`,
			"This output is a setup secret: don't paste it into chats or issue trackers.",
			"=========================================================",
			"",
		]);
	});

	it("gives the full link when ORIGIN is set", async () => {
		const printed: string[] = [];
		await startFirstRun({
			db,
			origin: "https://comradarr.example",
			print: (banner) => printed.push(banner),
		});

		const token = tokenIn(printed[0]) ?? "";
		expect(printed[0]).toContain(
			`Open https://comradarr.example/setup#token=${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8)} to claim this Comradarr.`,
		);
	});

	it("records every printing in the audit trail, with its expiry and never the token", async () => {
		// A database of its own: another test's renewal may still be writing to the shared one.
		const own = await createDatabase(adminUrl);
		const ownDb = await openDatabase(own.url);
		await migrateDatabase(ownDb);
		const printedEntries = () => ownDb.select().from(auditLog).orderBy(auditLog.id);
		try {
			const printed: string[] = [];
			fakeClock();
			vi.setSystemTime(new Date("2026-11-16T14:30:00.000Z"));
			await startFirstRun({
				db: ownDb,
				origin: undefined,
				print: (banner) => printed.push(banner),
				lifetimeMs: 60_000,
			});
			expect(await printedEntries()).toEqual([
				expect.objectContaining({
					action: "setup.token_printed",
					actor: "app",
					context: { expiresAt: "2026-11-16T14:31:00.000Z" },
					clientAddress: null,
					userAgent: null,
					requestId: null,
				}),
			]);

			vi.advanceTimersByTime(60_000);
			expect(printed).toHaveLength(2);
			await expect.poll(async () => (await printedEntries()).length).toBe(2);

			const stored = JSON.stringify(await printedEntries());
			for (const banner of printed) expect(stored).not.toContain(tokenIn(banner));
		} finally {
			stopFirstRun();
			await ownDb.$client.close();
			await dropDatabase(adminUrl, own);
		}
	});

	it("is printed again with a new token at expiry", async () => {
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (banner) => printed.push(banner),
			lifetimeMs: 60,
		});
		vi.advanceTimersByTime(59);
		expect(printed).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(printed).toHaveLength(2);
		expect(tokenIn(printed[1])).not.toBe(tokenIn(printed[0]));
	});

	it("is used up by a matching entry, once", async () => {
		const printed: string[] = [];
		await startFirstRun({ db, origin: undefined, print: (banner) => printed.push(banner) });
		const token = tokenIn(printed[0]) ?? "";

		await withClaimInProgress(async () => {
			expect(useToken("aaaa-bbbb-cccc")).toBe("wrong");
			expect(useToken(token.toUpperCase())).toBe("used");
			expect(useToken(token)).toBe("expired");
		});
	});

	it("is refused once it has expired, while a claim holds back the next", async () => {
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (banner) => printed.push(banner),
			lifetimeMs: 60,
		});

		await withClaimInProgress(async () => {
			vi.advanceTimersByTime(60);
			expect(useToken(tokenIn(printed[0]) ?? "")).toBe("expired");
		});
	});

	it("calls the token a renewal replaced expired, not wrong, as an old link would hold", async () => {
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (banner) => printed.push(banner),
			lifetimeMs: 60,
		});
		vi.advanceTimersByTime(60);

		expect(printed).toHaveLength(2);
		expect(useToken(tokenIn(printed[0]) ?? "")).toBe("expired");
		expect(useToken(tokenIn(printed[1]) ?? "")).toBe("used");
	});

	it("waits to print a new one while a claim is in progress", async () => {
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (banner) => printed.push(banner),
			lifetimeMs: 40,
		});
		await withClaimInProgress(async () => {
			vi.advanceTimersByTime(100);
			expect(printed).toHaveLength(1);
		});
		expect(printed).toHaveLength(2);
	});

	it("prints a new one when a claim used the token up and the instance is still unclaimed", async () => {
		const printed: string[] = [];
		await startFirstRun({ db, origin: undefined, print: (banner) => printed.push(banner) });

		await withClaimInProgress(async () => {
			expect(useToken(tokenIn(printed[0]) ?? "")).toBe("used");
			throw new Error("the claim's transaction failed");
		}).catch(() => {});

		expect(printed).toHaveLength(2);
		expect(tokenIn(printed[1])).not.toBe(tokenIn(printed[0]));
	});

	it("prints no more once stopped, as shutdown does, even after a claim that fails meanwhile", async () => {
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (banner) => printed.push(banner),
			lifetimeMs: 40,
		});
		await withClaimInProgress(async () => {
			useToken(tokenIn(printed[0]) ?? "");
			stopFirstRun();
		});
		vi.advanceTimersByTime(100);

		expect(printed).toHaveLength(1);
	});

	it("is never printed again once the instance is claimed", async () => {
		const printed: string[] = [];
		fakeClock();
		await startFirstRun({
			db,
			origin: undefined,
			print: (banner) => printed.push(banner),
			lifetimeMs: 40,
		});
		await withClaimInProgress(async () => {
			useToken(tokenIn(printed[0]) ?? "");
			markClaimed();
		});
		vi.advanceTimersByTime(100);

		expect(isClaimed()).toBe(true);
		expect(printed).toHaveLength(1);
	});
});

describe("first run after a restart", () => {
	it("reads the step pointer back: a claimed instance starts complete and prints nothing", async () => {
		const own = await createDatabase(adminUrl);
		const ownDb = await openDatabase(own.url);
		try {
			await migrateDatabase(ownDb);
			// First a fresh instance, so the flags start false and must be read back.
			await startFirstRun({ db: ownDb, origin: undefined, print: () => {} });
			expect(isFirstRunComplete()).toBe(false);
			stopFirstRun();

			await writeSetting(ownDb, FIRST_RUN_STEP_KEY, FIRST_RUN_COMPLETE, new Date());
			const printed: string[] = [];
			await startFirstRun({
				db: ownDb,
				origin: undefined,
				print: (banner) => printed.push(banner),
			});

			expect(isClaimed()).toBe(true);
			expect(isFirstRunComplete()).toBe(true);
			expect(printed).toEqual([]);
		} finally {
			await ownDb.$client.close();
			await dropDatabase(adminUrl, own);
		}
	});

	it("infers nothing from an owner row without the pointer: the instance is still unclaimed", async () => {
		const own = await createDatabase(adminUrl);
		const ownDb = await openDatabase(own.url);
		try {
			await migrateDatabase(ownDb);
			await insertOwner(ownDb, { username: "owner", passwordHash: "h", createdAt: new Date() });
			const printed: string[] = [];
			await startFirstRun({
				db: ownDb,
				origin: undefined,
				print: (banner) => printed.push(banner),
			});

			expect(isClaimed()).toBe(false);
			expect(printed).toHaveLength(1);
		} finally {
			stopFirstRun();
			await ownDb.$client.close();
			await dropDatabase(adminUrl, own);
		}
	});
});
