import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page, test } from "@playwright/test";
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

/** The JSON log entries among a server's output lines. */
function logEntries(output: string): Record<string, unknown>[] {
	return output.split("\n").flatMap((line) => {
		try {
			const entry = JSON.parse(line) as unknown;
			return typeof entry === "object" && entry !== null ? [entry as Record<string, unknown>] : [];
		} catch {
			return [];
		}
	});
}

/** A database role's password as D17 derives it from `key`, to search the output for. */
async function rolePassword(key: string, role: "app" | "audit-admin"): Promise<string> {
	const base = await crypto.subtle.importKey("raw", Uint8Array.fromBase64(key), "HKDF", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: new TextEncoder().encode(`edbfi:database-role:v1:${role}`),
		},
		base,
		256,
	);
	return new Uint8Array(bits).toBase64({ alphabet: "base64url", omitPadding: true });
}

let root: string;
const databases: TestDatabase[] = [];

/** A new database on the run's PostgreSQL, dropped after the test. */
async function newDatabase(attributes?: string): Promise<TestDatabase> {
	const database = await createDatabase(adminUrl, undefined, attributes);
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
			// The first start logs the migrations it applies, with the reminder; the second, none.
			const applying = logEntries(server.output()).filter((entry) =>
				String(entry.message).startsWith("applying migrations"),
			);
			expect(applying.length, `${start} start`).toBe(start === "first" ? 1 : 0);
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

test.describe("the roles (D17)", () => {
	test("are set up, and the server keeps no owner-role session once it serves", async () => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		const admin = new SQL(adminUrl, { max: 1 });
		try {
			const sessions = await admin`
				select usename from pg_stat_activity where datname = ${database.name} and usename = ${database.name}`;
			const roles = await admin`
				select rolname from pg_roles where rolname in (${`${database.name}_app`}, ${`${database.name}_audit_admin`})
				order by rolname`;

			expect(sessions.length).toBe(0);
			expect(roles.map((row: { rolname: string }) => row.rolname)).toEqual([
				`${database.name}_app`,
				`${database.name}_audit_admin`,
			]);
		} finally {
			await admin.close();
			await server.stop();
		}
	});

	test("are refused to an owner role without CREATEROLE, naming it and echoing nothing", async () => {
		const database = await newDatabase("");

		const { exitCode, output } = await runToExit(root, { COMRADARR_DATABASE_URL: database.url });

		expect(exitCode).not.toBe(0);
		expect(output).toContain(
			`the owner role "${database.name}" may not create roles: it needs CREATEROLE`,
		);
		expect(output).not.toContain(new URL(database.url).password);
	});
});

test.describe("the logs", () => {
	test("are JSON lines, with one line per request carrying its id", async () => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		try {
			await fetch(`${server.url}/?page=2`);
		} finally {
			await server.stop();
		}
		// The setup banner and adapter-bun's line are console output for whoever runs the server,
		// not log entries (SPEC-setup.md, "Logging").
		const lines = server
			.output()
			.replace(/^=+ Comradarr setup =+\n[\s\S]*?\n=+\n/m, "")
			.split("\n")
			.filter((line) => line.trim() !== "" && !line.startsWith("Listening on"));
		expect(server.output()).toContain("Comradarr setup");

		for (const line of lines) expect(() => JSON.parse(line), line).not.toThrow();
		const request = logEntries(server.output()).find(
			(entry) =>
				entry.message === "request" && (entry.metadata as { path: string }).path === "/?page=",
		);
		expect(request).toMatchObject({ level: "info", source: "http", metadata: { status: 200 } });
		expect(request?.requestId).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("hold no password, verifier or database URL from startup", async () => {
		const database = await newDatabase();
		const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();
		const server = await startServer(root, {
			COMRADARR_SECRET_KEY: key,
			COMRADARR_DATABASE_URL: database.url,
			COMRADARR_LOG_DEBUG: "true",
		});
		await server.stop();
		const output = server.output();

		expect(output).not.toContain(new URL(database.url).password);
		expect(output).not.toContain(database.url);
		expect(output).not.toContain(key);
		for (const role of ["app", "audit-admin"] as const) {
			expect(output).not.toContain(await rolePassword(key, role));
		}
		expect(output).not.toContain("SCRAM-SHA-256");
	});

	test("refuse a debug switch that isn't true or false in one entry, without echoing it", async () => {
		const database = await newDatabase();

		const { exitCode, output } = await runToExit(root, {
			COMRADARR_DATABASE_URL: database.url,
			COMRADARR_LOG_DEBUG: "verbose-please",
		});

		expect(exitCode).not.toBe(0);
		const failures = logEntries(output).filter((entry) => entry.message === "startup failed");
		expect(failures).toHaveLength(1);
		expect(JSON.stringify(failures[0])).toContain("COMRADARR_LOG_DEBUG must be true or false");
		expect(output).not.toContain("verbose-please");
	});
});

test.describe("shutdown", () => {
	for (const signal of ["SIGTERM", "SIGHUP"] as const) {
		test(`${signal} shuts the built server down with exit code 0`, async () => {
			const database = await newDatabase();
			const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
			expect((await fetch(`${server.url}/healthz`)).status).toBe(200);

			expect(await server.stop(signal)).toBe(0);
			const stopping = logEntries(server.output()).filter((entry) => entry.message === "stopping");
			// SIGHUP arrives as itself, then the app passes it on as SIGTERM.
			expect(stopping.map((entry) => (entry.metadata as { signal: string }).signal)).toEqual([
				"SIGTERM",
			]);
		});
	}
});

test.describe("security headers and the CSP", () => {
	const ALWAYS = {
		"x-frame-options": "DENY",
		"x-content-type-options": "nosniff",
		"referrer-policy": "same-origin",
		"cross-origin-opener-policy": "same-origin",
		"cross-origin-resource-policy": "same-origin",
	};

	test("every response that passes through handle carries them, with no HSTS over plain HTTP and no server banner", async () => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		try {
			const statuses: Record<string, number> = {};
			for (const path of ["/", "/healthz", "/no-such-page"]) {
				const response = await fetch(`${server.url}${path}`, { redirect: "manual" });
				statuses[path] = response.status;
				for (const [name, value] of Object.entries(ALWAYS)) {
					expect(response.headers.get(name), `${name} on ${path}`).toBe(value);
				}
				expect(response.headers.get("permissions-policy"), path).toContain("camera=()");
				expect(response.headers.get("strict-transport-security"), path).toBeNull();
				expect(response.headers.get("server"), path).toBeNull();
				expect(response.headers.get("x-powered-by"), path).toBeNull();
			}
			expect(statuses).toEqual({ "/": 200, "/healthz": 200, "/no-such-page": 404 });
		} finally {
			await server.stop();
		}
	});

	test("a page's policy is the spec's, its scripts carry the nonce, and the browser reports no violation or header error", async ({
		page,
	}) => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		try {
			const response = await fetch(`${server.url}/`);
			const policy = response.headers.get("content-security-policy") ?? "";
			const html = await response.text();
			const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
			expect(nonce).toBeDefined();
			const directives = Object.fromEntries(
				policy.split(";").map((directive) => {
					const [name = "", ...sources] = directive.trim().split(/\s+/);
					return [name, sources.sort()];
				}),
			);
			expect(directives).toEqual({
				"default-src": ["'self'"],
				"script-src": [`'nonce-${nonce}'`, "'self'"].sort(),
				"style-src": ["'self'"],
				"style-src-elem": ["'self'"],
				"style-src-attr": ["'unsafe-inline'"],
				"img-src": ["'self'", "data:"],
				"font-src": ["'self'"],
				"connect-src": ["'self'"],
				"frame-ancestors": ["'none'"],
				"frame-src": ["'none'"],
				"object-src": ["'none'"],
				"base-uri": ["'self'"],
				"form-action": ["'self'"],
				"report-uri": ["/api/csp-report"],
			});
			const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
			expect(scripts.length).toBeGreaterThan(0);
			for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);

			const violations: string[] = [];
			page.on("console", (message) => {
				// A violation, or a header the browser can't read, such as a feature it doesn't know.
				if (/Content Security Policy|Permissions-Policy/i.test(message.text())) {
					violations.push(message.text());
				}
			});
			await page.addInitScript(() => {
				document.addEventListener("securitypolicyviolation", (event) => {
					console.error(`Content Security Policy violation: ${event.violatedDirective}`);
				});
			});
			const visit = await page.goto(`${server.url}/`);
			await expect(page.locator("html[data-hydrated]")).toBeAttached();
			expect(violations).toEqual([]);
			// Chromium sends Sec-Fetch-Site to this loopback address over plain HTTP: no HSTS.
			expect(visit?.headers()["strict-transport-security"]).toBeUndefined();

			// A style element without the nonce is a violation the browser reports to the endpoint.
			await page.evaluate(() => {
				const style = document.createElement("style");
				style.textContent = "body { outline: 1px solid red; }";
				document.head.append(style);
			});
			await expect
				.poll(
					() =>
						logEntries(server.output()).find(
							(entry) => entry.message === "content security policy violation",
						),
					{ timeout: 10_000 },
				)
				.toMatchObject({ level: "warn", metadata: { directive: "style-src-elem", page: "/" } });
		} finally {
			await server.stop();
		}
	});

	for (const [value, message] of [
		["https://u:p@comradarr.example", "ORIGIN must not hold credentials"],
		["https://comradarr.example/app", "ORIGIN must not have a path"],
	] as const) {
		test(`the built server refuses ORIGIN=${value}, without echoing it`, async () => {
			const database = await newDatabase();
			const { exitCode, output } = await runToExit(root, {
				COMRADARR_DATABASE_URL: database.url,
				ORIGIN: value,
			});

			expect(output.includes(value), "output holds the value").toBe(false);
			expect(output.includes("u:p@"), "output holds the credentials").toBe(false);
			expect(exitCode).not.toBe(0);
			expect(output).not.toContain("Listening on");
			const failures = logEntries(output).filter((entry) => entry.message === "startup failed");
			expect(failures).toHaveLength(1);
			expect(JSON.stringify(failures[0])).toContain(message);
		});
	}
});

test.describe("the bootstrap token", () => {
	test("is printed in its banner before the server listens, and never reaches a log entry, a response or the audit trail", async () => {
		const database = await newDatabase();
		const server = await startServer(root, {
			COMRADARR_DATABASE_URL: database.url,
			ORIGIN: "http://comradarr.test",
		});
		try {
			const output = server.output();
			const shown = /Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) \(valid until /.exec(
				output,
			)?.[1];
			expect(shown).toBeDefined();
			const token = shown?.replaceAll("-", "") ?? "";
			expect(output.indexOf("Comradarr setup")).toBeLessThan(output.indexOf("Listening on"));
			expect(output).toContain(`Open http://comradarr.test/setup#token=${shown} to claim`);

			const bodies: string[] = [];
			for (const path of ["/", "/healthz", "/setup", "/no-such-page"]) {
				const response = await fetch(`${server.url}${path}`, { redirect: "manual" });
				bodies.push(`${JSON.stringify([...response.headers])}${await response.text()}`);
			}
			const sql = new SQL(database.url);
			const entries = [...(await sql`select action, actor, context from audit_log`)];
			await sql.close();
			expect(entries).toEqual([
				expect.objectContaining({ action: "setup.token_printed", actor: "app" }),
			]);

			const logged = JSON.stringify(logEntries(server.output()));
			for (const [where, text] of [
				["a log entry", logged],
				["a response", bodies.join("\n")],
				["the audit trail", JSON.stringify(entries)],
			] as const) {
				expect(text.includes(token), `the token in ${where}`).toBe(false);
				expect(text.includes(shown ?? ""), `the shown token in ${where}`).toBe(false);
			}
		} finally {
			await server.stop();
		}
	});
});

test.describe("the claim", () => {
	const PASSWORD = "violet harbour lanterns";

	test("the console's link, a refused token, the rules, the switcher, then the claim, which leaves no secret behind and outlives a restart", async ({
		browser,
	}) => {
		const database = await newDatabase();
		let server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		const context = await browser.newContext({ locale: "en-GB" });
		const answers: string[] = [];
		try {
			const page = await context.newPage();
			page.on("response", async (response) => {
				answers.push(
					`${JSON.stringify(response.headers())}${await response.text().catch(() => "")}`,
				);
			});
			const shown =
				/Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(server.output())?.[1] ?? "";
			expect(shown).not.toBe("");

			// The link fills the token in and takes it out of the address bar.
			await page.goto(`${server.url}/setup#token=${shown}`);
			await expect(page.locator("html[data-hydrated]")).toBeAttached();
			await expect(page.locator("#token")).toHaveValue(shown);
			expect(new URL(page.url()).hash).toBe("");

			// A link opened in a tab already showing the page changes only the fragment: it is
			// filled in and taken out of the address bar all the same.
			await page.fill("#token", "");
			await page.goto(`${server.url}/setup#token=${shown}`);
			await expect(page.locator("#token")).toHaveValue(shown);
			await expect.poll(() => new URL(page.url()).hash).toBe("");

			// The rules say what the password meets as it is typed.
			await page.fill("#username", "owner");
			await page.fill("#password", "violet");
			await expect(page.getByText("15 to 128 characters (6 so far)")).toBeVisible();

			// A wrong token is refused: the username stays, the token and the password go.
			await page.fill("#token", "aaaa-bbbb-cccc");
			await page.fill("#password", PASSWORD);
			await page.getByRole("button", { name: "Claim and create owner" }).click();
			await expect(page.locator("#token-error")).toHaveText(
				"That setup token isn't valid. Use the newest one printed in the server console.",
			);
			await expect(page.locator("#username")).toHaveValue("owner");
			await expect(page.locator("#token")).toHaveValue("");
			await expect(page.locator("#password")).toHaveValue("");
			await expect(page.locator("#token")).toBeFocused();

			// The switcher reloads the page in Danish.
			await page.getByRole("button", { name: "Dansk" }).click();
			await expect(page.locator("h1")).toHaveText("Tag denne Comradarr i brug");

			// The right token, in upper case without dashes, claims and lands on /.
			await page.fill("#token", shown.replaceAll("-", "").toUpperCase());
			await page.fill("#username", "owner");
			await page.fill("#password", PASSWORD);
			await page.getByRole("button", { name: "Tag i brug og opret ejer" }).click();
			await page.waitForURL(`${server.url}/`);

			// The claim no longer exists: the page and its action answer 404.
			expect((await fetch(`${server.url}/setup`)).status).toBe(404);
			const action = await fetch(`${server.url}/setup`, {
				method: "POST",
				headers: { origin: server.url, "content-type": "application/x-www-form-urlencoded" },
				body: "token=x&username=y&password=z",
			});
			expect(action.status).toBe(404);

			// After a restart too, and no token is printed. The first server's log is kept for the
			// secrets check below.
			const firstLog = logEntries(server.output());
			await server.stop();
			server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
			expect(server.output()).not.toContain("Comradarr setup");
			expect((await fetch(`${server.url}/setup`)).status).toBe(404);

			// Neither secret anywhere: not in a log entry, a response or the audit trail.
			const sql = new SQL(database.url);
			const entries = [...(await sql`select action, actor, context from audit_log order by id`)];
			await sql.close();
			expect(entries.map((entry) => entry.action)).toEqual([
				"setup.token_printed",
				"setup.claim_attempted",
				"setup.claim_attempted",
				"setup.owner_created",
				"setup.first_run_completed",
			]);
			const token = shown.replaceAll("-", "");
			for (const [where, text] of [
				["a log entry", JSON.stringify([...firstLog, ...logEntries(server.output())])],
				["a response", answers.join("\n")],
				["the audit trail", JSON.stringify(entries)],
			] as const) {
				expect(text.includes(token), `the token in ${where}`).toBe(false);
				expect(text.includes(shown), `the shown token in ${where}`).toBe(false);
				expect(text.includes(PASSWORD), `the password in ${where}`).toBe(false);
			}
		} finally {
			await context.close();
			await server.stop();
		}
	});
});

test.describe("the cross-origin check", () => {
	const REFUSAL_POLICY =
		"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

	/** Serves a page as `http://evil.test/` that posts a form to `target` as soon as it loads. */
	async function postFromAnotherSite(page: Page, target: string) {
		await page.route("http://evil.test/", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: `<form method="post" action="${target}"><input name="a" value="1"></form>
					<script>document.forms[0].submit()</script>`,
			}),
		);
		const answer = page.waitForResponse((response) => response.url() === target);
		await page.goto("http://evil.test/");
		return answer;
	}

	test("a cross-site form POST gets the Access denied page, with the headers, its own policy and the viewer's language", async ({
		browser,
	}) => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		const context = await browser.newContext({ locale: "da-DK" });
		try {
			const page = await context.newPage();
			const response = await postFromAnotherSite(page, `${server.url}/`);
			expect(response.status()).toBe(403);
			const headers = response.headers();
			expect(headers["content-security-policy"]).toBe(REFUSAL_POLICY);
			expect(headers["x-frame-options"]).toBe("DENY");
			expect(headers["referrer-policy"]).toBe("same-origin");
			await expect(page.locator("html")).toHaveAttribute("lang", "da");
			await expect(page.locator("h1")).toHaveText("Adgang nægtet");
			await expect(page).toHaveTitle("Adgang nægtet");
			await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
		} finally {
			await context.close();
			await server.stop();
		}
	});

	test("on localhost, a same-origin POST without Sec-Fetch headers passes, and a JSON caller from another site gets the error format with its request id", async () => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		try {
			const url = server.url.replace("127.0.0.1", "localhost");
			const own = await fetch(`${url}/`, {
				method: "POST",
				headers: { origin: url, "content-type": "application/x-www-form-urlencoded" },
				body: "a=1",
			});
			// Past the check, SvelteKit answers that `/` has no form actions.
			expect(own.status).toBe(405);

			const other = await fetch(`${url}/`, {
				method: "POST",
				headers: { origin: "http://evil.test", accept: "application/json" },
				body: "{}",
			});
			expect(other.status).toBe(403);
			expect(other.headers.get("x-frame-options")).toBe("DENY");
			const body = (await other.json()) as Record<string, unknown>;
			expect(body).toEqual({
				type: "access_denied",
				title: "Access denied",
				status: 403,
				detail: "The request was refused because it didn't come from this site.",
				requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			});
			const line = logEntries(server.output()).find(
				(entry) => (entry.metadata as { status?: number } | undefined)?.status === 403,
			);
			expect(line?.requestId).toBe(body.requestId);
		} finally {
			await server.stop();
		}
	});

	test("on a plain-HTTP host name that isn't loopback, the app's own form and a CSP report pass and another site's form is refused", async () => {
		const database = await newDatabase();
		const server = await startServer(root, { COMRADARR_DATABASE_URL: database.url });
		// Chromium sends no Sec-Fetch headers to app.test over plain HTTP, so the check compares
		// Origin with Host there.
		const browser = await chromium.launch({
			args: ["--host-resolver-rules=MAP app.test 127.0.0.1"],
		});
		try {
			const page = await browser.newPage();
			const appUrl = server.url.replace("127.0.0.1", "app.test");
			await page.goto(`${appUrl}/`);
			await expect(page.locator("html[data-hydrated]")).toBeAttached();

			// The browser's own report of a violation carries Origin and passes the check.
			const report = page.waitForRequest((request) => request.url().endsWith("/api/csp-report"));
			await page.evaluate(() => {
				const style = document.createElement("style");
				style.textContent = "body { outline: 1px solid red; }";
				document.head.append(style);
			});
			expect(await (await report).headerValue("sec-fetch-site")).toBeNull();
			await expect
				.poll(
					() =>
						logEntries(server.output()).find(
							(entry) => entry.message === "content security policy violation",
						),
					{ timeout: 10_000 },
				)
				.toMatchObject({ level: "warn", metadata: { directive: "style-src-elem", page: "/" } });

			const own = page.waitForResponse(
				(response) => response.url() === `${appUrl}/` && response.request().method() === "POST",
			);
			await page.evaluate(() => {
				const form = document.createElement("form");
				form.method = "post";
				form.action = "/";
				document.body.append(form);
				form.submit();
			});
			const ownResponse = await own;
			// `headerValue` reads what Chromium sent; `headers()` leaves out the Sec-Fetch headers.
			expect(await ownResponse.request().headerValue("sec-fetch-site")).toBeNull();
			expect(ownResponse.status()).toBe(405);

			const other = await postFromAnotherSite(page, `${appUrl}/`);
			expect(await other.request().headerValue("sec-fetch-site")).toBeNull();
			expect(other.status()).toBe(403);
		} finally {
			await browser.close();
			await server.stop();
		}
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
