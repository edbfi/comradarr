import { EventEmitter } from "node:events";
import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { createLogger } from "#lib/server/logging/logger.ts";
import { createDatabase, dropDatabase, type TestDatabase } from "../../../../../tests/database.ts";
import {
	closeServices,
	currentDatabase,
	handleShutdown,
	type ShutdownTarget,
	startUp,
} from "./startup.ts";

/** What startup wrote to standard output during the current test. */
let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		// `flushLogs` waits for each entry's write callback, so the mock calls it.
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => vi.restoreAllMocks());

const adminUrl = inject("testDatabaseAdminUrl");
const created: TestDatabase[] = [];

afterAll(async () => {
	await closeServices();
	for (const database of created) await dropDatabase(adminUrl, database);
});

const key = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** Startup's variables for a new database of its own. */
async function newEnv() {
	const database = await createDatabase(adminUrl);
	created.push(database);
	return { COMRADARR_SECRET_KEY: key(), COMRADARR_DATABASE_URL: database.url };
}

describe("startUp", () => {
	it("writes its failure entry out before it throws, so a slow reader still gets it", async () => {
		let written = false;
		vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest: unknown[]) => {
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			setTimeout(() => {
				written = true;
				done?.();
			}, 50);
			return true;
		});
		const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();

		const failure = await startUp(
			{ COMRADARR_SECRET_KEY: key, COMRADARR_LOG_DEBUG: "maybe" },
			{ dev: true },
		).then(
			() => "started",
			() => (written ? "thrown after the write" : "thrown before the write"),
		);

		expect(failure).toBe("thrown after the write");
	});
});

describe("startUp's configuration", () => {
	it("refuses a bad ORIGIN before it reads the database URL", async () => {
		const error = await startUp(
			{ COMRADARR_SECRET_KEY: key(), ORIGIN: "https://comradarr.example/app" },
			{ dev: true },
		).catch((caught: unknown) => caught);

		expect(error).toMatchObject({ name: "ConfigError", variable: "ORIGIN" });
	});
});

/** A stand-in for the process: it records the signals sent, and the exit code in `steps`. */
function fakeProcess(steps: string[] = []) {
	const events = new EventEmitter();
	const sent: string[] = [];
	let exitCode: number | undefined;
	const target: ShutdownTarget = {
		pid: 4242,
		on: (event, listener) => events.on(event, listener),
		once: (event, listener) => events.once(event, listener),
		kill: (pid, signal) => {
			sent.push(`${pid} ${signal}`);
			return true;
		},
		exit: (code) => {
			exitCode = code;
			steps.push(`exit ${code}`);
		},
	};
	return { target, events, sent, exitCode: () => exitCode };
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("handleShutdown", () => {
	it("stops the work on SIGTERM and SIGINT, while adapter-bun drains", () => {
		const fake = fakeProcess();
		const stopped: string[] = [];
		handleShutdown(fake.target, async () => {}, { stopWork: () => stopped.push("stopped") });
		fake.events.emit("SIGTERM");
		fake.events.emit("SIGINT");
		expect(stopped).toEqual(["stopped", "stopped"]);
	});

	it("passes SIGHUP on as SIGTERM, which adapter-bun drains on", () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {});
		fake.events.emit("SIGHUP");
		expect(fake.sent).toEqual(["4242 SIGTERM"]);
	});

	it("exits 0 only after the cleanup on sveltekit:shutdown has finished", async () => {
		const steps: string[] = [];
		const fake = fakeProcess(steps);
		let finish!: () => void;
		handleShutdown(
			fake.target,
			() =>
				new Promise<void>((resolve) => {
					finish = () => {
						steps.push("cleaned up");
						resolve();
					};
				}),
		);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(20);
		expect(steps).toEqual([]);
		finish();
		await settle(20);
		expect(steps).toEqual(["cleaned up", "exit 0"]);
	});

	it("exits non-zero when the cleanup never finishes by the deadline", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), { deadlineMs: 100 });
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(50);
		expect(fake.exitCode()).toBeUndefined();
		await settle(500);
		expect(fake.exitCode()).toBe(1);
		expect(lines.some((line) => line.includes("shutdown didn't finish in time"))).toBe(true);
	});

	it("exits non-zero once the deadline has fired, even if the cleanup finishes during its flush", async () => {
		// Hold every log write, so the deadline's bounded flush is still waiting when the cleanup ends.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		const fake = fakeProcess();
		let finish!: () => void;
		handleShutdown(
			fake.target,
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
			{ deadlineMs: 50 },
		);
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(lines.some((line) => line.includes("shutdown didn't finish in time"))).toBe(true);
		finish();
		for (const release of held.splice(0)) release();
		await settle(50);
		expect(fake.exitCode()).toBe(1);
	});

	it("bounds the deadline's own flush, so a stuck stdout can't hold the exit", async () => {
		// Every write stays held, as if nothing read standard output, until the test ends.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		const fake = fakeProcess();
		handleShutdown(fake.target, () => new Promise(() => {}), { deadlineMs: 50 });
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		try {
			await settle(150);
			expect(fake.exitCode()).toBeUndefined();
			await settle(400);
			expect(fake.exitCode()).toBe(1);
		} finally {
			// The logger counts unfinished writes, so a held one would stall later flushes.
			for (const release of held.splice(0)) release();
		}
	});

	it("exits non-zero when the cleanup fails", async () => {
		const fake = fakeProcess();
		handleShutdown(fake.target, async () => {
			throw new Error("close failed");
		});
		fake.events.emit("sveltekit:shutdown", "SIGTERM");
		await settle(100);
		expect(fake.exitCode()).toBe(1);
	});
});

describe("startUp's shutdown", () => {
	const watched = ["SIGHUP", "SIGTERM", "SIGINT", "sveltekit:shutdown"] as const;
	const counts = () => watched.map((event) => process.listenerCount(event));

	it("installs no handler in dev, where Ctrl+C must still end the dev server", async () => {
		const before = counts();
		await startUp(await newEnv(), { dev: true });
		try {
			// The built server's handlers go in a turn later, so the check waits for that turn too.
			await new Promise((resolve) => setImmediate(resolve));
			expect(counts()).toEqual(before);
		} finally {
			await closeServices();
		}
	});

	it("installs the handlers in the built server, after adapter-bun's own", async () => {
		const before = watched.map((event) => process.listeners(event));
		await startUp(await newEnv(), { dev: false });
		try {
			// adapter-bun registers its handlers synchronously once `init` resolves; the app's come
			// on the next turn of the event loop, so a signal never reaches only the app's.
			expect(counts()).toEqual(before.map((listeners) => listeners.length));
			await new Promise((resolve) => setImmediate(resolve));
			expect(counts()).toEqual(before.map((listeners) => listeners.length + 1));
		} finally {
			watched.forEach((event, index) => {
				for (const listener of process.listeners(event)) {
					if (!before[index]?.includes(listener)) process.removeListener(event, listener);
				}
			});
			await closeServices();
		}
	});

	it("closeServices logs a failed close, flushes, and finishes, so the stop still exits 0", async () => {
		await startUp(await newEnv(), { dev: true });
		const pool = currentDatabase().$client;
		vi.spyOn(pool, "close").mockRejectedValueOnce(new Error("socket went away"));

		try {
			await expect(closeServices()).resolves.toBeUndefined();
			const entry = JSON.parse(lines.find((line) => line.includes("closing the database")) ?? "{}");
			expect(entry).toMatchObject({
				level: "error",
				metadata: { error: { message: "socket went away" } },
			});
		} finally {
			await pool.close();
		}
	});

	it("closeServices finishes the close before it flushes, and the flush before it returns", async () => {
		await startUp(await newEnv(), { dev: true });
		const pool = currentDatabase().$client;
		const realClose = pool.close.bind(pool);
		let closed!: () => void;
		vi.spyOn(pool, "close").mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					closed = resolve;
				}),
		);
		// From here, each entry's write waits until `release` runs, like a slow reader.
		const held: (() => void)[] = [];
		vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
			lines.push(String(chunk));
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			if (done) held.push(done);
			return true;
		});
		let finished = false;
		const closing = closeServices().then(() => {
			finished = true;
		});
		await settle(20);
		expect(finished).toBe(false);
		createLogger("test").info("written while closing");
		closed();
		await settle(20);
		expect(finished).toBe(false);
		for (const release of held.splice(0)) release();
		await closing;
		expect(finished).toBe(true);
		await realClose();
	});

	it("closeServices closes the pool startup opened, once", async () => {
		await startUp(await newEnv(), { dev: true });
		const close = vi.spyOn(currentDatabase().$client, "close");
		try {
			await closeServices();
			await closeServices();
			expect(close).toHaveBeenCalledTimes(1);
		} finally {
			await closeServices();
		}
	});
});
