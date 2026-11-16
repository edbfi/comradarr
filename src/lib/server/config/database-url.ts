import { ConfigError } from "./config-error.ts";
import { readSecretVariable, SecretVariableError } from "./secret-variable.ts";

/** The two variables the owner role's URL can come from (SPEC-setup.md, "The database URL"). */
export type DatabaseUrlEnv = {
	readonly COMRADARR_DATABASE_URL?: string | undefined;
	readonly COMRADARR_DATABASE_URL_FILE?: string | undefined;
};

export type DatabaseUrlVariable = keyof DatabaseUrlEnv;

const SUBJECT: Record<DatabaseUrlVariable, string> = {
	COMRADARR_DATABASE_URL: "COMRADARR_DATABASE_URL",
	COMRADARR_DATABASE_URL_FILE: "the URL in COMRADARR_DATABASE_URL_FILE's file",
};

/**
 * The owner role's URL (D17): a secret, so it follows the master key's rules for its variable and
 * file. It must be a `postgres://` or `postgresql://` URL naming a user and a database; its other
 * parts are PostgreSQL's to check. No message ever holds the URL.
 */
export async function readDatabaseUrl(
	env: DatabaseUrlEnv,
): Promise<{ url: string; variable: DatabaseUrlVariable }> {
	let read: { text: string; variable: DatabaseUrlVariable };
	try {
		read = await readSecretVariable(env, "COMRADARR_DATABASE_URL", "COMRADARR_DATABASE_URL_FILE");
	} catch (error) {
		if (error instanceof SecretVariableError) {
			// Reading a file fails on the file's variable; a missing or doubled one on the URL's.
			const onFile = error.check === "unreadable" || error.check === "too-large";
			throw new ConfigError(
				onFile ? "COMRADARR_DATABASE_URL_FILE" : "COMRADARR_DATABASE_URL",
				error.message,
			);
		}
		throw error;
	}
	const subject = SUBJECT[read.variable];
	const refuse = (problem: string) => new ConfigError(read.variable, `${subject} ${problem}`);
	const url = URL.parse(read.text);
	if (url === null || (url.protocol !== "postgres:" && url.protocol !== "postgresql:")) {
		throw refuse("is not a postgres:// or postgresql:// URL");
	}
	if (url.username === "") throw refuse("names no user");
	if (!/^\/[^/]+$/.test(url.pathname)) throw refuse("names no database");
	return { url: read.text, variable: read.variable };
}

/** How errors name where the URL came from. */
export function databaseUrlSubject(variable: DatabaseUrlVariable): string {
	return SUBJECT[variable];
}
