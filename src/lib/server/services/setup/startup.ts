import { type DatabaseUrlEnv, readDatabaseUrl } from "#lib/server/config/database-url.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { type Database, openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabaseUrlEnv;

let database: Database | undefined;

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"): the master key, the configuration, then the database, reached and migrated. A step
 * that fails throws, so the built server exits before it listens.
 */
export async function startUp(env: StartupEnv): Promise<void> {
	// 1. The master key.
	await loadKeyring(env);
	// 2. The configuration.
	const url = await readDatabaseUrl(env);
	// 3. The database, reached and migrated.
	const db = await openDatabase(url);
	await migrateDatabase(db);
	database = db;
}

/** The database startup opened; it throws before startup has opened it. */
export function currentDatabase(): Database {
	if (database === undefined) throw new Error("the database is used before startup opened it");
	return database;
}
