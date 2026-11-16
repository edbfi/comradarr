import { type DatabaseUrlEnv, readDatabaseUrl } from "#lib/server/config/database-url.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { openDatabase } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabaseUrlEnv;

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"): the master key, the configuration, then the database, reached and migrated. A step
 * that fails throws, so the built server exits before it listens.
 */
export async function startUp(env: StartupEnv): Promise<void> {
	// 1. The master key.
	await loadKeyring(env);
	// 2. The configuration.
	const { url, variable } = await readDatabaseUrl(env);
	// 3. The database, reached and migrated; the owner role's pool closes once it has migrated.
	const db = await openDatabase(url, { variable });
	try {
		await migrateDatabase(db);
	} finally {
		await db.$client.close();
	}
}
