import { afterAll, afterEach, describe, expect, inject, it, vi } from "vitest";
import { auditLog } from "#lib/server/db/audit.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { insertOwner, owner } from "#lib/server/db/owner.ts";
import { readSetting } from "#lib/server/db/settings.ts";
import { verifyPassword } from "#lib/server/security/password.ts";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../../tests/database.ts";
import { claimInstance } from "./claim.ts";
import {
	FIRST_RUN_STEP_KEY,
	isClaimed,
	isFirstRunComplete,
	startFirstRun,
	stopFirstRun,
} from "./first-run.ts";

const adminUrl = inject("testDatabaseAdminUrl");
const created: { database: TestDatabase; db: Database }[] = [];

afterEach(() => {
	stopFirstRun();
	vi.restoreAllMocks();
});

afterAll(async () => {
	for (const { database, db } of created) {
		await db.$client.close();
		await dropDatabase(adminUrl, database);
	}
});

/** A fresh, unclaimed instance on a database of its own, and the banners it printed so far. */
async function freshInstance() {
	const database = await createDatabase(adminUrl);
	const db = await openDatabase(database.url);
	created.push({ database, db });
	await migrateDatabase(db);
	const printed: string[] = [];
	await startFirstRun({ db, origin: undefined, print: (banner) => printed.push(banner) });
	const token = (index = printed.length - 1) =>
		/Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(printed[index] ?? "")?.[1] ?? "";
	/** The audit entries the claims wrote, oldest first, without the token's printings. */
	const claimEntries = async () =>
		(await db.select().from(auditLog).orderBy(auditLog.id)).filter(
			(entry) => entry.action !== "setup.token_printed",
		);
	return { db, printed, token, claimEntries };
}

const PASSWORD = "violet harbour lanterns";

const REQUEST = { clientAddress: "192.0.2.7", userAgent: "Mozilla/5.0", requestId: "req-1" };

/** A claim attempt's audit entry with `outcome`, as the claim writes it. */
const attempt = (outcome: string) =>
	expect.objectContaining({
		action: "setup.claim_attempted",
		actor: "nobody",
		context: { outcome },
		clientAddress: "192.0.2.7",
		userAgent: "Mozilla/5.0",
		requestId: "req-1",
	});

/** Silences standard output, where the renewed banner and the error entry would go. */
const quietOutput = () =>
	vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest: unknown[]) => {
		(rest.find((arg) => typeof arg === "function") as (() => void) | undefined)?.();
		return true;
	});

describe("claimInstance", () => {
	it("creates the owner with a hashed password, completes first run and audits the grant", async () => {
		const { db, token, claimEntries } = await freshInstance();

		const result = await claimInstance(
			db,
			{
				token: token().toUpperCase().replaceAll("-", ""),
				username: "  Owner  ",
				password: PASSWORD,
			},
			REQUEST,
		);

		expect(result).toEqual({ status: "claimed" });
		const rows = await db.select().from(owner);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.username).toBe("Owner");
		expect(rows[0]?.passwordHash).not.toContain(PASSWORD);
		expect(await verifyPassword(PASSWORD, rows[0]?.passwordHash ?? "")).toBe(true);
		expect(await readSetting(db, FIRST_RUN_STEP_KEY)).toBe("complete");
		expect(isClaimed()).toBe(true);
		expect(isFirstRunComplete()).toBe(true);
		const entries = await claimEntries();
		expect(entries).toEqual([
			attempt("granted"),
			expect.objectContaining({
				action: "setup.owner_created",
				actor: "nobody",
				context: { username: "Owner" },
			}),
			expect.objectContaining({ action: "setup.first_run_completed", context: {} }),
		]);
		// The three entries share the claim's transaction, so they share its time.
		expect(new Set(entries.map((entry) => entry.at.getTime())).size).toBe(1);
		expect(JSON.stringify(entries)).not.toContain(PASSWORD);
	});

	it("reports field errors before the token, leaves it unused, and audits them as invalid", async () => {
		const { db, token, claimEntries } = await freshInstance();
		const hash = vi.spyOn(Bun.password, "hash");

		expect(
			await claimInstance(db, { token: token(), username: " ", password: "short" }, REQUEST),
		).toEqual({ status: "invalid", username: "empty", password: "too-short" });
		expect(
			await claimInstance(
				db,
				{ token: "wrong", username: "owner", password: "comradarr is my home" },
				REQUEST,
			),
		).toEqual({ status: "invalid", password: "app-name" });

		expect(hash).not.toHaveBeenCalled();
		expect(await claimEntries()).toEqual([attempt("invalid"), attempt("invalid")]);
		hash.mockRestore();
		expect(
			await claimInstance(db, { token: token(), username: "owner", password: PASSWORD }, REQUEST),
		).toEqual({ status: "claimed" });
	});

	it("refuses a wrong token without ever reaching the hash, and audits it as wrong", async () => {
		const { db, printed, claimEntries } = await freshInstance();
		const hash = vi.spyOn(Bun.password, "hash");

		expect(
			await claimInstance(
				db,
				{ token: "aaaa-bbbb-cccc", username: "owner", password: PASSWORD },
				REQUEST,
			),
		).toEqual({ status: "token" });

		expect(hash).not.toHaveBeenCalled();
		expect(await db.select().from(owner)).toEqual([]);
		// A wrong guess leaves the printed token as it was.
		expect(printed).toHaveLength(1);
		expect(await claimEntries()).toEqual([attempt("wrong_token")]);
	});

	it("refuses an expired token without ever reaching the hash, and audits it as expired", async () => {
		const { db, token, claimEntries } = await freshInstance();
		const expired = token();
		// The token is still the current one: only the clock has moved past its 15 minutes.
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now + 15 * 60 * 1000 + 1);
		const hash = vi.spyOn(Bun.password, "hash");

		expect(
			await claimInstance(db, { token: expired, username: "owner", password: PASSWORD }, REQUEST),
		).toEqual({ status: "token" });

		expect(hash).not.toHaveBeenCalled();
		expect(await claimEntries()).toEqual([attempt("expired_token")]);
	});

	it("answers not found once the instance is claimed, and records nothing", async () => {
		const { db, token, claimEntries } = await freshInstance();
		const first = token();
		await claimInstance(db, { token: first, username: "owner", password: PASSWORD }, REQUEST);
		const before = (await claimEntries()).length;

		expect(
			await claimInstance(db, { token: first, username: "other", password: PASSWORD }, REQUEST),
		).toEqual({ status: "not-found" });
		expect(await claimEntries()).toHaveLength(before);
	});

	it("lets only one of two claims at once through, leaving one owner and one grant", async () => {
		const { db, token, claimEntries } = await freshInstance();
		const value = token();

		const results = await Promise.all([
			claimInstance(db, { token: value, username: "first", password: PASSWORD }, REQUEST),
			claimInstance(db, { token: value, username: "second", password: PASSWORD }, REQUEST),
		]);

		expect(results.map((result) => result.status).sort()).toEqual(["claimed", "token"]);
		expect(await db.select().from(owner)).toHaveLength(1);
		const outcomes = (await claimEntries())
			.filter((entry) => entry.action === "setup.claim_attempted")
			.map((entry) => (entry.context as { outcome: string }).outcome);
		expect(outcomes.filter((outcome) => outcome === "granted")).toHaveLength(1);
	});

	it("prints a new token when the claim fails after the token was used, and audits only the failure", async () => {
		const { db, printed, token, claimEntries } = await freshInstance();
		// An owner written behind first run's back makes the claim's insert fail.
		await insertOwner(db, { username: "elsewhere", passwordHash: "h", createdAt: new Date() });
		const output = quietOutput();
		const used = token();

		expect(
			await claimInstance(db, { token: used, username: "owner", password: PASSWORD }, REQUEST),
		).toEqual({ status: "failed" });

		expect(isClaimed()).toBe(false);
		expect(printed).toHaveLength(2);
		expect(token()).not.toBe(used);
		expect(await readSetting(db, FIRST_RUN_STEP_KEY)).toBeUndefined();
		expect(await claimEntries()).toEqual([attempt("failed")]);
		// The error entry names PostgreSQL's reason, never the insert's values.
		const logged = output.mock.calls.map(([chunk]) => String(chunk)).join("");
		expect(logged).toContain('"message":"the claim failed"');
		expect(logged).not.toContain("elsewhere");
		expect(logged).not.toContain('"owner"');
	});

	it("prints no new token once shutdown has stopped first run", async () => {
		const { db, printed, token, claimEntries } = await freshInstance();
		await insertOwner(db, { username: "elsewhere", passwordHash: "h", createdAt: new Date() });
		quietOutput();
		const used = token();
		stopFirstRun();

		expect(
			await claimInstance(db, { token: used, username: "owner", password: PASSWORD }, REQUEST),
		).toEqual({ status: "failed" });
		expect(printed).toHaveLength(1);
		expect(await claimEntries()).toEqual([attempt("failed")]);
	});
});
