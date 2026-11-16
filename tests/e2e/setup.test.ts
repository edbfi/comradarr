import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SQL } from "bun";
import { createDatabase, dropDatabase, type TestDatabase, type TestRun } from "../database.ts";

// First run and the request checks on the built server (docs/SPEC.md, "Testing strategy"). Each
// test starts its own server, with a generated key and a new database on the run's PostgreSQL.
const BUILD = fileURLToPath(new URL("../../build", import.meta.url));
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

const adminUrl = (JSON.parse(process.env.COMRADARR_E2E_DATABASE_RUN ?? "{}") as TestRun).server
	.adminUrl;

const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** A built server that started: its address, everything it printed so far, and how to stop it. */
type Server = {
	url: string;
	output: () => string;
	stop: (signal?: "SIGTERM" | "SIGHUP") => Promise<number | null>;
};

/**
 * Spawns the built server in `cwd` with a generated key, a free port and `env`, and nothing else
 * from the test's environment.
 */
const spawnServer = (cwd: string, env: Record<string, string>) =>
	Bun.spawn([process.execPath, "--no-env-file", BUILD], {
		cwd,
		env: { HOST: "127.0.0.1", PORT: "0", COMRADARR_SECRET_KEY: randomKey(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});

/**
 * Starts the built server with `env` and resolves once it listens, or rejects with its output if
 * it exits or is still starting after 15 s.
 */
async function startServer(cwd: string, env: Record<string, string>): Promise<Server> {
	const server = spawnServer(cwd, env);
	let output = "";
	const collect = async (stream: ReadableStream<Uint8Array>) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) output += decoder.decode(chunk, { stream: true });
	};
	const collected = Promise.all([collect(server.stdout), collect(server.stderr)]);
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		const url = /Listening on (http:\/\/\S+?)\/?\s/.exec(output)?.[1];
		if (url !== undefined) {
			return {
				url,
				output: () => output,
				stop: async (signal = "SIGTERM") => {
					server.kill(signal);
					await collected;
					return server.exited;
				},
			};
		}
		if (server.exitCode !== null) break;
		await Bun.sleep(50);
	}
	server.kill("SIGKILL");
	await collected;
	throw new Error(`the server didn't start:\n${output}`);
}

/** Runs the built server with `env` until it exits by itself, killing it after 45 s. */
async function runToExit(cwd: string, env: Record<string, string>) {
	const server = spawnServer(cwd, env);
	const timer = setTimeout(() => server.kill("SIGKILL"), 45_000);
	try {
		const [stdout, stderr] = await Promise.all([
			new Response(server.stdout).text(),
			new Response(server.stderr).text(),
		]);
		await server.exited;
		return { exitCode: server.exitCode, output: `${stdout}\n${stderr}` };
	} finally {
		clearTimeout(timer);
	}
}

let root: string;
const databases: TestDatabase[] = [];

/** A new database on the run's PostgreSQL, dropped after the test. */
async function newDatabase(): Promise<TestDatabase> {
	const database = await createDatabase(adminUrl);
	databases.push(database);
	return database;
}

test.beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "comradarr-e2e-setup-"));
});

test.afterEach(async () => {
	await rm(root, { recursive: true, force: true });
	for (const database of databases.splice(0)) await dropDatabase(adminUrl, database);
});

test.describe("the database", () => {
	test("is migrated on a new database, and a second start on it applies nothing", async () => {
		const database = await newDatabase();
		const env = { COMRADARR_DATABASE_URL: database.url };
		const migrations = (await Array.fromAsync(new Bun.Glob("*.sql").scan(MIGRATIONS))).length;
		const recorded = async () => {
			const sql = new SQL(database.url, { max: 1 });
			try {
				const [row] = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
				return (row as { count: number }).count;
			} finally {
				await sql.close();
			}
		};

		for (const start of ["first", "second"]) {
			const server = await startServer(root, env);
			try {
				expect((await fetch(`${server.url}/healthz`)).status, `${start} start`).toBe(200);
			} finally {
				expect(await server.stop()).toBe(0);
			}
			expect(await recorded(), `${start} start`).toBe(migrations);
		}
	});

	test("stops startup on a failed migration, naming it and PostgreSQL's reason", async () => {
		const database = await newDatabase();
		const sql = new SQL(database.url, { max: 1 });
		await sql`create table settings (key text)`;
		await sql.close();

		const { exitCode, output } = await runToExit(root, { COMRADARR_DATABASE_URL: database.url });

		expect(exitCode).not.toBe(0);
		expect(output).toMatch(/the migration \d{4}_\w+ failed: relation "settings" already exists/);
		expect(output).not.toContain(new URL(database.url).password);
	});
});

test.describe("the database URL", () => {
	test("is required, and never echoed when refused", async () => {
		const database = await newDatabase();
		const password = new URL(database.url).password;
		const file = join(root, "database-url");
		await writeFile(file, database.url);
		const cases: { env: Record<string, string>; says: string }[] = [
			{
				env: {},
				says: "neither COMRADARR_DATABASE_URL nor COMRADARR_DATABASE_URL_FILE is set",
			},
			{
				env: { COMRADARR_DATABASE_URL: database.url, COMRADARR_DATABASE_URL_FILE: file },
				says: "COMRADARR_DATABASE_URL and COMRADARR_DATABASE_URL_FILE are both set; set only one",
			},
			{
				env: { COMRADARR_DATABASE_URL: `mysql://${password}@db/comradarr` },
				says: "COMRADARR_DATABASE_URL is not a postgres:// or postgresql:// URL",
			},
		];

		for (const { env, says } of cases) {
			const { exitCode, output } = await runToExit(root, env);

			expect(exitCode, says).not.toBe(0);
			expect(output, says).toContain(says);
			expect(output, says).not.toContain(password);
			expect(output, says).not.toContain(root);
		}
	});

	test("may come from a file", async () => {
		const database = await newDatabase();
		const file = join(root, "database-url");
		await writeFile(file, `${database.url}\n`);

		const server = await startServer(root, { COMRADARR_DATABASE_URL_FILE: file });
		try {
			expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
		} finally {
			await server.stop();
		}
	});
});
