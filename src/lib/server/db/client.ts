import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { ConfigError } from "#lib/server/config/config-error.ts";
import { type DatabaseUrlVariable, databaseUrlSubject } from "#lib/server/config/database-url.ts";

/** The pool's size: one process (D19) serving one owner needs few connections. */
const POOL_SIZE = 10;

/** Opens a pool on `url` and returns Drizzle over it (D5, D6). */
function connect(url: string) {
	return drizzle({ client: new SQL(url, { max: POOL_SIZE }) });
}

export type Database = ReturnType<typeof connect>;

export type OpenOptions = {
	/** How long to keep trying while waiting can help (SPEC-setup.md, "Waiting for PostgreSQL"). */
	readonly waitMs?: number;
	/** The pause between attempts. */
	readonly intervalMs?: number;
	/** Called after each failed attempt worth waiting for, with its number from 1. */
	readonly onWaiting?: (attempt: number, reason: string) => void;
	/** The variable the URL came from, which errors name. */
	readonly variable?: DatabaseUrlVariable;
	/** Who connects, when it isn't the URL's own role, such as `the app role "comradarr_app"`. */
	readonly as?: string;
};

/** `url` with another role's name and password, keeping its host, port, database and parameters. */
export function withCredentials(url: string, user: string, password: string): string {
	const parsed = new URL(url);
	parsed.username = encodeURIComponent(user);
	parsed.password = encodeURIComponent(password);
	return parsed.toString();
}

/** What Bun SQL reports for a connection that failed before PostgreSQL answered. */
const CONNECTION_CODES = new Set([
	"ERR_POSTGRES_CONNECTION_REFUSED",
	"ERR_POSTGRES_CONNECTION_TIMEOUT",
	"ERR_POSTGRES_CONNECTION_CLOSED",
]);

/** PostgreSQL's "the database system is starting up". */
const STARTING_UP = "57P03";

/**
 * Whether waiting could fix `error`: a refused, timed-out or closed connection (Bun SQL reports a
 * host name that doesn't resolve yet as refused) or a server still starting. An authentication or
 * permission failure, or any other answer from PostgreSQL, fails at once.
 */
export function isWorthWaiting(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const { code, errno } = error as Error & { code?: unknown; errno?: unknown };
	return (typeof code === "string" && CONNECTION_CODES.has(code)) || errno === STARTING_UP;
}

/**
 * Opens the database at `url`, first waiting while PostgreSQL can't be reached yet: containers start
 * together. It tries every `intervalMs` for `waitMs` in all, each attempt bounded by the time left,
 * and fails at once on anything waiting won't fix. Errors never hold the URL.
 */
export async function openDatabase(url: string, options: OpenOptions = {}): Promise<Database> {
	const { waitMs = 30_000, intervalMs = 2_000, onWaiting } = options;
	const variable = options.variable ?? "COMRADARR_DATABASE_URL";
	const at = `PostgreSQL at ${databaseUrlSubject(variable)}`;
	const deadline = Date.now() + waitMs;
	for (let attempt = 1; ; attempt++) {
		const left = Math.max(deadline - Date.now(), 1);
		const probe = new SQL(url, { max: 1, connectionTimeout: Math.ceil(left / 1000) });
		let timer: ReturnType<typeof setTimeout> | undefined;
		// The connection timeout covers only connecting: a server can accept and then never answer,
		// so the whole attempt is bounded by the time left.
		const timedOut = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() =>
					reject(Object.assign(new Error("timeout"), { code: "ERR_POSTGRES_CONNECTION_TIMEOUT" })),
				left,
			);
		});
		try {
			await Promise.race([probe`select 1`, timedOut]);
			return connect(url);
		} catch (error) {
			if (!isWorthWaiting(error)) throw refusal(error, variable, options.as);
			const reason = reasonOf(error);
			if (Date.now() + intervalMs >= deadline) {
				throw new ConfigError(
					variable,
					`${at} could not be reached within ${waitMs / 1000} seconds (${reason})`,
				);
			}
			onWaiting?.(attempt, reason);
			await Bun.sleep(intervalMs);
		} finally {
			clearTimeout(timer);
			await probe.close({ timeout: 0 }).catch(() => {});
		}
	}
}

/**
 * PostgreSQL's refusal of a connection, which waiting won't fix, such as a wrong password or a
 * `pg_hba.conf` that rejects the role (28000). It names who connected and PostgreSQL's reason.
 */
export function refusal(
	error: unknown,
	variable: DatabaseUrlVariable = "COMRADARR_DATABASE_URL",
	as?: string,
): ConfigError {
	const who =
		as === undefined
			? `PostgreSQL at ${databaseUrlSubject(variable)} refused the connection`
			: `PostgreSQL refused ${as}`;
	return new ConfigError(variable, `${who} (${reasonOf(error)})`);
}

/** The SQLSTATE and PostgreSQL's message, or Bun's code: neither holds the URL. */
function reasonOf(error: unknown): string {
	if (!(error instanceof Error)) return "unknown error";
	const { code, errno } = error as Error & { code?: unknown; errno?: unknown };
	if (typeof errno === "string") return `${errno}: ${error.message}`;
	return typeof code === "string" ? code : "unknown error";
}
