import { defineConfig, devices } from "@playwright/test";
import type { TestRun } from "./tests/database.ts";

// A developer's own key, database and `ORIGIN` never reach a test: only the web server gets a key,
// generated per run, and the run's own database (SPEC-secrets.md, "Startup"; SPEC-setup.md).
delete process.env.COMRADARR_SECRET_KEY;
delete process.env.COMRADARR_SECRET_KEY_FILE;
delete process.env.COMRADARR_DATABASE_URL;
delete process.env.COMRADARR_DATABASE_URL_FILE;
delete process.env.ORIGIN;
const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();

/**
 * The run's PostgreSQL and the web server's database (SPEC-setup.md, "Testing strategy"). The web
 * server starts before any global setup and this file can't await, so the runner process starts
 * them through a command. Playwright loads this file again in each worker, where
 * `TEST_WORKER_INDEX` is set: the workers inherit the runner's variables instead. The run is
 * removed on exit, once the web server has stopped.
 */
function databaseRun(): TestRun {
	const given = process.env.COMRADARR_E2E_DATABASE_RUN;
	if (given !== undefined) return JSON.parse(given) as TestRun;
	const started = Bun.spawnSync(["bun", "tests/database.ts", "start"], { stderr: "inherit" });
	if (!started.success) throw new Error("the e2e tests' PostgreSQL didn't start");
	const json = started.stdout.toString();
	process.env.COMRADARR_E2E_DATABASE_RUN = json;
	process.on("exit", () => {
		Bun.spawnSync(["bun", "tests/database.ts", "stop", json], { stderr: "inherit" });
	});
	return JSON.parse(json) as TestRun;
}

const run = databaseRun();

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

// The smoke test runs against the built adapter-bun server: `bun run --bun build` first.
export default defineConfig({
	testDir: "tests/e2e",
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? "github" : "list",
	use: { baseURL },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun --no-env-file ./build",
		url: `${baseURL}/healthz`,
		env: {
			HOST: "127.0.0.1",
			PORT: String(port),
			COMRADARR_SECRET_KEY: key,
			COMRADARR_DATABASE_URL: run.database.url,
		},
		reuseExistingServer: false,
		gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
	},
});
