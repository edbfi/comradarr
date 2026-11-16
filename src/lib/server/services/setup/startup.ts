import { type DatabaseUrlEnv, readDatabaseUrl } from "#lib/server/config/database-url.ts";
import { type LogDebugEnv, readLogDebug } from "#lib/server/config/log-debug.ts";
import type { SecretKeyEnv } from "#lib/server/config/secret-key.ts";
import { type Database, openDatabase, withCredentials } from "#lib/server/db/client.ts";
import { migrateDatabase } from "#lib/server/db/migrate.ts";
import { checkOwnerRole } from "#lib/server/db/preflight.ts";
import { setUpRoles } from "#lib/server/db/roles.ts";
import { configureLogging, createLogger } from "#lib/server/logging/logger.ts";
import { currentKeyring, loadKeyring } from "#lib/server/security/secrets/keyring.ts";

/** Every variable startup reads. */
export type StartupEnv = SecretKeyEnv & DatabaseUrlEnv & LogDebugEnv;

const log = createLogger("startup");

let database: Database | undefined;

/**
 * Runs startup's steps in order, before any request is served (SPEC-setup.md, "Startup and
 * shutdown"): the master key, the configuration, then the database. A step that fails is logged,
 * then thrown, so the built server exits before it listens.
 */
export async function startUp(env: StartupEnv): Promise<void> {
	try {
		await runSteps(env);
	} catch (error) {
		log.error("startup failed", { error });
		throw error;
	}
}

async function runSteps(env: StartupEnv): Promise<void> {
	// 1. The master key, which also derives the role passwords.
	await loadKeyring(env);
	// 2. The configuration, all of it before the database.
	configureLogging({ debug: readLogDebug(env) });
	const { url, variable } = await readDatabaseUrl(env);
	// 3. The database (D17): as the owner role, the pre-flight check, the migrations and the
	// roles; the owner role's pool closes, and requests use the app role's.
	const owner = await openDatabase(url, { variable });
	let app: { name: string; password: string };
	try {
		const context = await checkOwnerRole(owner);
		await migrateDatabase(owner);
		const passwords = currentKeyring().rolePasswords;
		await setUpRoles(owner, context, passwords);
		app = { name: context.names.app, password: passwords.app.reveal() };
	} finally {
		await owner.$client.close();
	}
	database = await openDatabase(withCredentials(url, app.name, app.password), {
		variable,
		as: `the app role "${app.name}"`,
	});
}

/** The app role's pool, which requests and jobs use; it throws before startup has opened it. */
export function currentDatabase(): Database {
	if (database === undefined) throw new Error("the database is used before startup opened it");
	return database;
}
