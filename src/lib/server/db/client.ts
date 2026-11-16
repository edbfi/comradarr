import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { ConfigError } from "#lib/server/config/config-error.ts";

/** The pool's size: one process (D19) serving one owner needs few connections. */
const POOL_SIZE = 10;

/** Opens a pool on `url` and returns Drizzle over it (D5, D6). */
function connect(url: string) {
	return drizzle({ client: new SQL(url, { max: POOL_SIZE }) });
}

export type Database = ReturnType<typeof connect>;

/** A transaction's handle: every statement in a transaction goes through it (D6). */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What a named operation runs on: the database, or a transaction a service opened. */
export type Executor = Database | Transaction;

export type OpenOptions = {
	/** How long to keep trying while waiting can help (SPEC-setup.md, "Waiting for PostgreSQL"). */
	readonly waitMs?: number;
	/** The pause between attempts. */
	readonly intervalMs?: number;
	/** Called after each failed attempt worth waiting for, with its number from 1. */
	readonly onWaiting?: (attempt: number, reason: string) => void;
};

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
	const deadline = Date.now() + waitMs;
	for (let attempt = 1; ; attempt++) {
		const left = Math.max(deadline - Date.now(), 1);
		const probe = new SQL(url, { max: 1, connectionTimeout: Math.ceil(left / 1000) });
		try {
			await probe`select 1`;
			return connect(url);
		} catch (error) {
			if (!isWorthWaiting(error)) throw refused(error);
			const reason = reasonOf(error);
			if (Date.now() + intervalMs >= deadline) {
				throw new ConfigError(
					"COMRADARR_DATABASE_URL",
					`the PostgreSQL COMRADARR_DATABASE_URL names could not be reached within ${waitMs / 1000} seconds (${reason})`,
				);
			}
			onWaiting?.(attempt, reason);
			await Bun.sleep(intervalMs);
		} finally {
			await probe.close().catch(() => {});
		}
	}
}

/** The SQLSTATE and PostgreSQL's message, or Bun's code: neither holds the URL. */
function reasonOf(error: unknown): string {
	if (!(error instanceof Error)) return "unknown error";
	const { code, errno } = error as Error & { code?: unknown; errno?: unknown };
	if (typeof errno === "string") return `${errno}: ${error.message}`;
	return typeof code === "string" ? code : "unknown error";
}

function refused(error: unknown): ConfigError {
	return new ConfigError(
		"COMRADARR_DATABASE_URL",
		`the PostgreSQL COMRADARR_DATABASE_URL names refused the connection (${reasonOf(error)})`,
	);
}
