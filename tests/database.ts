import { SQL } from "bun";

/**
 * A PostgreSQL for the tests (SPEC-setup.md, "Testing strategy"): the server
 * `COMRADARR_TEST_DATABASE_URL` names, or a throwaway `postgres:18` container started with Docker,
 * labelled and removed when the run ends. Each test file gets its own database, owned by its own
 * owner role, and the run drops exactly what it created.
 *
 * Vitest uses it as a global setup (the default export). Playwright's config can't await before its
 * web server starts, so it runs this file as a command (`bun tests/database.ts start|stop`).
 */

/** The label every test container carries, and the one naming the process that started it. */
const LABEL = "comradarr-test";
const PID_LABEL = "comradarr-test-pid";

/** A server the tests may create databases and roles on. */
export type TestServer = { readonly adminUrl: string; readonly containerId?: string };

/** A test file's own database and its owner role, with the URL the app is given. */
export type TestDatabase = { readonly name: string; readonly url: string };

const VARIABLE = "COMRADARR_TEST_DATABASE_URL";

/** Runs `docker` with `args`, returning its trimmed output, or throwing what it printed. */
function docker(args: string[]): string {
	const result = Bun.spawnSync(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
	if (!result.success) {
		throw new Error(`docker ${args[0]} failed: ${result.stderr.toString().trim()}`);
	}
	return result.stdout.toString().trim();
}

function dockerAvailable(): boolean {
	try {
		return Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).success;
	} catch {
		return false;
	}
}

/** Removes test containers whose starting process is gone, such as a crashed run's. */
function removeAbandonedContainers(): void {
	const lines = docker([
		"ps",
		"-a",
		"--filter",
		`label=${LABEL}`,
		"--format",
		`{{.ID}} {{.Label "${PID_LABEL}"}}`,
	]);
	for (const line of lines.split("\n").filter((entry) => entry !== "")) {
		const [id, pid] = line.split(" ");
		if (id === undefined || isAlive(Number(pid))) continue;
		Bun.spawnSync(["docker", "rm", "-f", id], { stdout: "ignore", stderr: "ignore" });
	}
}

function isAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Waits until the server accepts a query over TCP, which the image's first-start server never does. */
async function waitUntilReady(adminUrl: string): Promise<void> {
	const deadline = Date.now() + 60_000;
	for (;;) {
		const sql = new SQL(adminUrl, { max: 1, connectionTimeout: 2 });
		try {
			await sql`select 1`;
			return;
		} catch (error) {
			if (Date.now() > deadline) throw error;
			await Bun.sleep(250);
		} finally {
			await sql.close().catch(() => {});
		}
	}
}

/**
 * The server for this run: `COMRADARR_TEST_DATABASE_URL` (or `…_16` for `version` 16) when set,
 * otherwise a new container. Without either, it fails with what to do; it never skips.
 */
export async function startServer(
	version: 16 | 18 = 18,
	/** The process the container belongs to; a later run removes it once that process is gone. */
	ownerPid = process.pid,
): Promise<TestServer> {
	const variable = version === 18 ? VARIABLE : `${VARIABLE}_${version}`;
	const given = process.env[variable];
	if (given) {
		await waitUntilReady(given);
		return { adminUrl: given };
	}
	if (!dockerAvailable()) {
		throw new Error(
			`the tests need PostgreSQL ${version}: set ${variable} to a URL for a role that may create databases and roles, or make Docker available`,
		);
	}
	removeAbandonedContainers();
	const password = crypto.randomUUID();
	const containerId = docker([
		"run",
		"-d",
		"--rm",
		"--label",
		LABEL,
		"--label",
		`${PID_LABEL}=${ownerPid}`,
		"-e",
		`POSTGRES_PASSWORD=${password}`,
		"-p",
		"127.0.0.1::5432",
		`postgres:${version}`,
		// Durability is irrelevant to a throwaway server, and these make it faster.
		"-c",
		"fsync=off",
		"-c",
		"synchronous_commit=off",
		"-c",
		"full_page_writes=off",
	]);
	const port = docker(["port", containerId, "5432/tcp"]).split("\n")[0]?.split(":").at(-1);
	const adminUrl = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
	try {
		await waitUntilReady(adminUrl);
	} catch (error) {
		stopServer({ adminUrl, containerId });
		throw error;
	}
	return { adminUrl, containerId };
}

/** Removes the run's container; a server the variable named is left as it was. */
export function stopServer(server: TestServer): void {
	if (server.containerId === undefined) return;
	Bun.spawnSync(["docker", "rm", "-f", server.containerId], { stdout: "ignore", stderr: "ignore" });
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * A new database owned by a new owner role that may create roles, as D17's owner role, with the
 * URL for it on the same server.
 */
export async function createDatabase(adminUrl: string): Promise<TestDatabase> {
	const name = `t_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
	const password = crypto.randomUUID();
	const admin = new SQL(adminUrl, { max: 1 });
	try {
		await admin.unsafe(`create role ${quote(name)} login createrole password '${password}'`);
		// A role that isn't a superuser may give a database only to a role it can SET ROLE to.
		await admin.unsafe(`grant ${quote(name)} to current_user`);
		await admin.unsafe(`create database ${quote(name)} owner ${quote(name)}`);
	} catch (error) {
		await admin.unsafe(`drop role if exists ${quote(name)}`).catch(() => {});
		throw error;
	} finally {
		await admin.close();
	}
	const url = new URL(adminUrl);
	url.username = name;
	url.password = password;
	url.pathname = `/${name}`;
	return { name, url: url.toString() };
}

/**
 * Drops a test database and every role the run created for it: its owner role, and the app and
 * audit-admin roles startup derives from its name.
 */
export async function dropDatabase(adminUrl: string, database: TestDatabase): Promise<void> {
	const admin = new SQL(adminUrl, { max: 1 });
	try {
		await admin.unsafe(`drop database if exists ${quote(database.name)} with (force)`);
		for (const role of [`${database.name}_app`, `${database.name}_audit_admin`, database.name]) {
			await admin.unsafe(`drop role if exists ${quote(role)}`);
		}
	} finally {
		await admin.close();
	}
}

/** Vitest's global setup: one server for the run, its admin URL provided to every test file. */
export default async function setup(project: {
	provide: (key: "testDatabaseAdminUrl", value: string) => void;
}): Promise<() => void> {
	const server = await startServer(18);
	project.provide("testDatabaseAdminUrl", server.adminUrl);
	return () => stopServer(server);
}

declare module "vitest" {
	export interface ProvidedContext {
		testDatabaseAdminUrl: string;
	}
}

/** A server and a first database on it, as the command prints them for Playwright. */
export type TestRun = { readonly server: TestServer; readonly database: TestDatabase };

// `bun tests/database.ts start` prints a `TestRun` as JSON; `stop '<json>'` drops its database and
// removes its container.
if (import.meta.main) {
	const [command, argument] = process.argv.slice(2);
	if (command === "start") {
		// The container belongs to the process that ran this command, such as Playwright's runner.
		const server = await startServer(18, process.ppid);
		const run: TestRun = { server, database: await createDatabase(server.adminUrl) };
		process.stdout.write(JSON.stringify(run));
	} else if (command === "stop" && argument !== undefined) {
		const run = JSON.parse(argument) as TestRun;
		if (run.server.containerId === undefined) await dropDatabase(run.server.adminUrl, run.database);
		stopServer(run.server);
	} else {
		throw new Error("usage: bun tests/database.ts start | stop '<run json>'");
	}
}
