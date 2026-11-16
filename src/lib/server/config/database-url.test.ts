import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "./config-error.ts";
import { type DatabaseUrlEnv, readDatabaseUrl } from "./database-url.ts";

// A password generated per run, so a message that echoed the URL would be caught.
const password = crypto.randomUUID();
const URL_TEXT = `postgres://comradarr:${password}@db.internal:5432/comradarr?sslmode=require`;

let dir: string;
let files = 0;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "comradarr-database-url-"));
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function urlFile(content: string): Promise<string> {
	const path = join(dir, `url-${files++}`);
	await writeFile(path, content);
	return path;
}

async function failure(env: DatabaseUrlEnv): Promise<ConfigError> {
	try {
		await readDatabaseUrl(env);
	} catch (error) {
		if (error instanceof ConfigError) return error;
		throw error;
	}
	throw new Error("the URL was accepted");
}

describe("readDatabaseUrl", () => {
	it("returns COMRADARR_DATABASE_URL as it is", async () => {
		expect(await readDatabaseUrl({ COMRADARR_DATABASE_URL: URL_TEXT })).toEqual({
			url: URL_TEXT,
			variable: "COMRADARR_DATABASE_URL",
		});
	});

	it("reads the file COMRADARR_DATABASE_URL_FILE names, without its trailing newline", async () => {
		const path = await urlFile(`${URL_TEXT}\n`);

		expect(await readDatabaseUrl({ COMRADARR_DATABASE_URL_FILE: path })).toEqual({
			url: URL_TEXT,
			variable: "COMRADARR_DATABASE_URL_FILE",
		});
	});

	it("accepts postgresql:// and a URL without a password or port", async () => {
		const url = "postgresql://comradarr@localhost/comradarr";

		expect((await readDatabaseUrl({ COMRADARR_DATABASE_URL: url })).url).toBe(url);
	});

	it("counts an empty variable as unset", async () => {
		const path = await urlFile(URL_TEXT);

		expect(
			(await readDatabaseUrl({ COMRADARR_DATABASE_URL: "", COMRADARR_DATABASE_URL_FILE: path }))
				.url,
		).toBe(URL_TEXT);
	});

	const refusals: {
		label: string;
		env: () => Promise<DatabaseUrlEnv>;
		says: string;
		variable?: string;
	}[] = [
		{
			label: "neither variable",
			env: async () => ({}),
			says: "neither COMRADARR_DATABASE_URL nor COMRADARR_DATABASE_URL_FILE is set",
		},
		{
			label: "both variables",
			env: async () => ({
				COMRADARR_DATABASE_URL: URL_TEXT,
				COMRADARR_DATABASE_URL_FILE: await urlFile(URL_TEXT),
			}),
			says: "COMRADARR_DATABASE_URL and COMRADARR_DATABASE_URL_FILE are both set; set only one",
		},
		{
			label: "an unreadable file",
			env: async () => ({ COMRADARR_DATABASE_URL_FILE: join(dir, "missing") }),
			says: "COMRADARR_DATABASE_URL_FILE names a file that can't be read (ENOENT)",
			variable: "COMRADARR_DATABASE_URL_FILE",
		},
		{
			label: "text that isn't a URL",
			env: async () => ({ COMRADARR_DATABASE_URL: `comradarr:${password}` }),
			says: "COMRADARR_DATABASE_URL is not a postgres:// or postgresql:// URL",
		},
		{
			label: "another scheme",
			env: async () => ({ COMRADARR_DATABASE_URL: `mysql://comradarr:${password}@db/comradarr` }),
			says: "COMRADARR_DATABASE_URL is not a postgres:// or postgresql:// URL",
		},
		{
			label: "no user",
			env: async () => ({ COMRADARR_DATABASE_URL: "postgres://db.internal/comradarr" }),
			says: "COMRADARR_DATABASE_URL names no user",
		},
		{
			label: "no database",
			env: async () => ({ COMRADARR_DATABASE_URL: `postgres://comradarr:${password}@db/` }),
			says: "COMRADARR_DATABASE_URL names no database",
		},
		{
			label: "a path below the database",
			env: async () => ({ COMRADARR_DATABASE_URL: `postgres://comradarr:${password}@db/a/b` }),
			says: "COMRADARR_DATABASE_URL names no database",
		},
		{
			label: "a URL in the file that names no user",
			env: async () => ({
				COMRADARR_DATABASE_URL_FILE: await urlFile("postgres://db.internal/comradarr"),
			}),
			says: "the URL in COMRADARR_DATABASE_URL_FILE's file names no user",
			variable: "COMRADARR_DATABASE_URL_FILE",
		},
	];

	for (const { label, env, says, variable = "COMRADARR_DATABASE_URL" } of refusals) {
		it(`refuses ${label}, without echoing the URL`, async () => {
			const error = await failure(await env());

			expect(error.message).toBe(says);
			expect(error.variable).toBe(variable);
			expect(error.message).not.toContain(password);
			expect(error.message).not.toContain(dir);
		});
	}
});
