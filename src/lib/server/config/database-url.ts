import { ConfigError } from "./config-error.ts";
import { readSecretVariable, SecretVariableError } from "./secret-variable.ts";

/** The two variables the owner role's URL can come from (SPEC-setup.md, "The database URL"). */
export type DatabaseUrlEnv = {
	readonly COMRADARR_DATABASE_URL?: string | undefined;
	readonly COMRADARR_DATABASE_URL_FILE?: string | undefined;
};

type Variable = keyof DatabaseUrlEnv;

const SUBJECT: Record<Variable, string> = {
	COMRADARR_DATABASE_URL: "COMRADARR_DATABASE_URL",
	COMRADARR_DATABASE_URL_FILE: "the URL in COMRADARR_DATABASE_URL_FILE's file",
};

/**
 * The owner role's URL (D17): a secret, so it follows the master key's rules for its variable and
 * file. It must be a `postgres://` or `postgresql://` URL naming a user and a database; its other
 * parts are PostgreSQL's to check. No message ever holds the URL.
 */
export async function readDatabaseUrl(env: DatabaseUrlEnv): Promise<string> {
	let read: { text: string; variable: Variable };
	try {
		read = await readSecretVariable(env, "COMRADARR_DATABASE_URL", "COMRADARR_DATABASE_URL_FILE");
	} catch (error) {
		if (error instanceof SecretVariableError) {
			throw new ConfigError("COMRADARR_DATABASE_URL", error.message);
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
	return read.text;
}
