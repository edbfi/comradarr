import { fileURLToPath } from "node:url";
import type { TestRun } from "../database.ts";

// The built server for the e2e tests that start their own (setup.test.ts, error-summary.test.ts):
// each with a generated key, a free port and only the variables a test gives it.
const BUILD = fileURLToPath(new URL("../../build", import.meta.url));

/** The run's PostgreSQL, which `bun tests/database.ts start` started for Playwright's config. */
export const runServer = (JSON.parse(process.env.COMRADARR_E2E_DATABASE_RUN ?? "{}") as TestRun)
	.server;
export const adminUrl = runServer.adminUrl;

export const randomKey = () => crypto.getRandomValues(new Uint8Array(32)).toBase64();

/** A built server that started: its address, everything it printed so far, and how to stop it. */
export type Server = {
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
export async function startServer(cwd: string, env: Record<string, string>): Promise<Server> {
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

/**
 * Claims a fresh server's instance with the token its banner printed, through the form's action
 * as a browser without script would, so a test of a page doesn't silently test the setup gate.
 * `origin` is the browser's address: `ORIGIN` when the server has one.
 */
export async function claimServer(server: Server, origin = server.url): Promise<void> {
	const token = /Setup token: ([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}) /.exec(server.output())?.[1];
	if (token === undefined) throw new Error(`no setup token in:\n${server.output()}`);
	const response = await fetch(`${server.url}/setup`, {
		method: "POST",
		redirect: "manual",
		// A page's Accept: with fetch's `*/*`, SvelteKit answers as to `enhance`, in JSON with a 200.
		headers: {
			origin,
			accept: "text/html",
			"content-type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ token, username: "owner", password: "violet harbour lanterns" }),
	});
	if (response.status !== 303) throw new Error(`the claim answered ${response.status}`);
}

/** Runs the built server with `env` until it exits by itself, killing it after 45 s. */
export async function runToExit(cwd: string, env: Record<string, string>) {
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
export function logEntries(output: string): Record<string, unknown>[] {
	return output.split("\n").flatMap((line) => {
		try {
			const entry = JSON.parse(line) as unknown;
			return typeof entry === "object" && entry !== null ? [entry as Record<string, unknown>] : [];
		} catch {
			return [];
		}
	});
}
