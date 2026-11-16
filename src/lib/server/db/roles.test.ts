import { SQL } from "bun";
import { afterAll, describe, expect, inject, it } from "vitest";
import {
	createDatabase,
	dropDatabase,
	inContainer,
	type TestDatabase,
	type TestServer,
} from "../../../../tests/database.ts";
import { ConfigError } from "../config/config-error.ts";
import { Secret } from "../security/secrets/secret.ts";
import { type Database, openDatabase, refusal, withCredentials } from "./client.ts";
import { migrateDatabase } from "./migrate.ts";
import { checkOwnerRole } from "./preflight.ts";
import { quoteIdentifier, RoleSetupError, scramVerifier, setUpRoles } from "./roles.ts";

const servers = inject("testDatabaseServers");
const created: { server: TestServer; database: TestDatabase }[] = [];
const opened: Database[] = [];

afterAll(async () => {
	for (const db of opened) await db.$client.close();
	for (const { server, database } of created) await dropDatabase(server.adminUrl, database);
});

const password = () => new Secret(crypto.getRandomValues(new Uint8Array(32)).toBase64());

/** A migrated database, set up as startup sets it up, with the passwords it used. */
async function setUp(server: TestServer, suffix?: string) {
	const database = await createDatabase(server.adminUrl, suffix);
	created.push({ server, database });
	const owner = await openDatabase(database.url);
	opened.push(owner);
	const context = await checkOwnerRole(owner);
	await migrateDatabase(owner);
	const passwords = { app: password(), auditAdmin: password() };
	await setUpRoles(owner, context, passwords);
	return { database, owner, context, passwords };
}

/** A single connection as `role`, for running statements the test expects to pass or fail. */
function connectAs(database: TestDatabase, role: string, secret: Secret) {
	return new SQL(withCredentials(database.url, role, secret.reveal()), { max: 1 });
}

/** Whether `statement` runs, or the SQLSTATE PostgreSQL refused it with. */
async function attempt(client: SQL, statement: string): Promise<string> {
	try {
		await client.unsafe(statement);
		return "ok";
	} catch (error) {
		return (error as { errno?: string }).errno ?? String(error);
	}
}

const DENIED = "42501";

for (const version of [18, 16] as const) {
	describe(`setUpRoles on PostgreSQL ${version}`, () => {
		const server = servers[version];

		it("creates both roles with their passwords, and sets them again under a new key", async () => {
			const { database, owner, context, passwords } = await setUp(server);
			const app = connectAs(database, context.names.app, passwords.app);
			expect(await attempt(app, "select 1")).toBe("ok");
			await app.close();

			const next = { app: password(), auditAdmin: password() };
			await setUpRoles(owner, context, next);
			const old = connectAs(database, context.names.app, passwords.app);
			const renewed = connectAs(database, context.names.auditAdmin, next.auditAdmin);

			expect(await attempt(old, "select 1")).toBe("28P01");
			expect(await attempt(renewed, "select 1")).toBe("ok");
			await Promise.all([old.close(), renewed.close()]);
		});

		it("stores each password as a SCRAM-SHA-256 verifier with 4096 iterations", async () => {
			const { context } = await setUp(server);
			const admin = new SQL(server.adminUrl, { max: 1 });
			const [row] =
				await admin`select rolpassword from pg_authid where rolname = ${context.names.app}`;
			await admin.close();

			expect((row as { rolpassword: string }).rolpassword).toMatch(
				/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/,
			);
		});

		it("lets the app role add and read audit entries, and nothing else on them", async () => {
			const { database, context, passwords } = await setUp(server);
			const app = connectAs(database, context.names.app, passwords.app);
			const outcomes = {
				insert: await attempt(
					app,
					"insert into audit_log (action, actor) values ('setup.token_printed', 'app')",
				),
				select: await attempt(app, "select * from audit_log"),
				update: await attempt(app, "update audit_log set actor = 'owner'"),
				delete: await attempt(app, "delete from audit_log"),
				truncate: await attempt(app, "truncate audit_log"),
				settings: await attempt(
					app,
					"insert into settings values ('k', 'v', now()); update settings set value = 'w'; delete from settings",
				),
				alter: await attempt(app, "alter table settings add column x int"),
				drop: await attempt(app, "drop table owner"),
				create: await attempt(app, "create table extra (id int)"),
				temporary: await attempt(app, "create temporary table scratch (id int)"),
				migrations: await attempt(app, "select * from drizzle.__drizzle_migrations"),
				setRole: await attempt(app, `set role ${quoteIdentifier(context.owner)}`),
			};
			await app.close();

			expect(outcomes).toEqual({
				insert: "ok",
				select: "ok",
				update: DENIED,
				delete: DENIED,
				truncate: DENIED,
				settings: "ok",
				alter: DENIED,
				drop: DENIED,
				create: DENIED,
				temporary: DENIED,
				migrations: DENIED,
				setRole: DENIED,
			});
		});

		it("lets the audit-admin role read and delete audit entries, and nothing else", async () => {
			const { database, context, passwords } = await setUp(server);
			const auditAdmin = connectAs(database, context.names.auditAdmin, passwords.auditAdmin);
			const outcomes = {
				select: await attempt(auditAdmin, "select * from audit_log"),
				delete: await attempt(auditAdmin, "delete from audit_log"),
				insert: await attempt(
					auditAdmin,
					"insert into audit_log (action, actor) values ('setup.token_printed', 'app')",
				),
				update: await attempt(auditAdmin, "update audit_log set actor = 'owner'"),
				settings: await attempt(auditAdmin, "select * from settings"),
				create: await attempt(auditAdmin, "create table extra (id int)"),
			};
			await auditAdmin.close();

			expect(outcomes).toEqual({
				select: "ok",
				delete: "ok",
				insert: DENIED,
				update: DENIED,
				settings: DENIED,
				create: DENIED,
			});
		});

		it("leaves effective privileges that match the matrix, even where PUBLIC had more", async () => {
			const database = await createDatabase(server.adminUrl);
			created.push({ server, database });
			const admin = new SQL(adminOn(server, database), { max: 1 });
			await admin.unsafe("grant create on schema public to public");
			await admin.close();
			const owner = await openDatabase(database.url);
			opened.push(owner);
			const context = await checkOwnerRole(owner);
			await migrateDatabase(owner);
			await setUpRoles(owner, context, { app: password(), auditAdmin: password() });

			const check = new SQL(adminOn(server, database), { max: 1 });
			const rows = await check.unsafe(
				`select r.role, t.table_name, p.privilege, has_table_privilege(r.role, 'public.' || t.table_name, p.privilege) as granted
				from (values ($1), ($2)) as r(role),
					(values ('settings'), ('owner'), ('audit_log')) as t(table_name),
					(values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
				order by 1, 2, 3`,
				[context.names.app, context.names.auditAdmin],
			);
			const [schema] = await check.unsafe(
				`select has_schema_privilege($1, 'public', 'CREATE') as app_create,
					has_schema_privilege($2, 'public', 'CREATE') as admin_create,
					has_database_privilege($1, current_database(), 'TEMPORARY') as app_temporary,
					has_schema_privilege($1, 'drizzle', 'USAGE') as app_drizzle`,
				[context.names.app, context.names.auditAdmin],
			);
			await check.close();
			const granted = (
				rows as { role: string; table_name: string; privilege: string; granted: boolean }[]
			)
				.filter((row) => row.granted)
				.map(
					(row) =>
						`${row.role === context.names.app ? "app" : "audit-admin"} ${row.table_name} ${row.privilege}`,
				);

			expect(granted).toEqual([
				"app audit_log INSERT",
				"app audit_log SELECT",
				"app owner DELETE",
				"app owner INSERT",
				"app owner SELECT",
				"app owner UPDATE",
				"app settings DELETE",
				"app settings INSERT",
				"app settings SELECT",
				"app settings UPDATE",
				"audit-admin audit_log DELETE",
				"audit-admin audit_log SELECT",
			]);
			expect(schema).toEqual({
				app_create: false,
				admin_create: false,
				app_temporary: false,
				app_drizzle: false,
			});
		});

		it("quotes a database name with a quote and capitals in every statement", async () => {
			const { database, context, passwords } = await setUp(server, `Q"x${version}`);
			const app = connectAs(database, context.names.app, passwords.app);

			expect(context.names.app).toBe(`${database.name}_app`);
			expect(await attempt(app, "select count(*) from settings")).toBe("ok");
			await app.close();
		});

		it("never puts a password or verifier into the error of a statement that fails", async () => {
			const { owner, context } = await setUp(server);
			const passwords = { app: password(), auditAdmin: password() };
			const admin = new SQL(server.adminUrl, { max: 1 });
			// The role becomes a superuser's, so the owner role can no longer set its password.
			await admin.unsafe(`alter role ${quoteIdentifier(context.names.app)} superuser`);
			await admin.close();

			const error = await setUpRoles(owner, context, passwords).catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(RoleSetupError);
			expect((error as Error).message).toMatch(
				new RegExp(`^setting up the role "${context.names.app}" failed: `),
			);
			const text = `${(error as Error).message} ${(error as Error).stack} ${JSON.stringify(error)}`;
			expect(text).not.toContain(passwords.app.reveal());
			expect(text).not.toContain("SCRAM-SHA-256");
			const reset = new SQL(server.adminUrl, { max: 1 });
			await reset.unsafe(`alter role ${quoteIdentifier(context.names.app)} nosuperuser`);
			await reset.close();
		});

		it("refuses the app role with PostgreSQL's 28000 and an error naming the role", async () => {
			const { database, context, passwords } = await setUp(server);
			const url = withCredentials(database.url, context.names.app, passwords.app.reveal());
			const as = `the app role "${context.names.app}"`;
			if (server.containerId === undefined) {
				// An external server is never edited: the same handling, on a 28000 a client returns.
				const rejected = Object.assign(
					new Error(`no pg_hba.conf entry for user "${context.names.app}"`),
					{
						code: "ERR_POSTGRES_SERVER_ERROR",
						errno: "28000",
					},
				);
				expect(refusal(rejected, "COMRADARR_DATABASE_URL", as).message).toMatch(
					new RegExp(`^PostgreSQL refused ${escapeForPattern(as)} \\(28000: `),
				);
				return;
			}
			const file = inContainer(server, `psql -tAc 'show hba_file'`);
			const line = `host ${quoteIdentifier(database.name)} ${quoteIdentifier(context.names.app)} all reject`;
			inContainer(
				server,
				`sed -i '1i ${line.replaceAll("'", "'\\''")}' ${file} && psql -c 'select pg_reload_conf()'`,
			);
			try {
				const error = await openDatabase(url, { as }).catch((caught: unknown) => caught);

				expect(error).toBeInstanceOf(ConfigError);
				expect((error as Error).message).toMatch(
					new RegExp(`^PostgreSQL refused ${escapeForPattern(as)} \\(28000: `),
				);
			} finally {
				inContainer(server, `sed -i '1d' ${file} && psql -c 'select pg_reload_conf()'`);
			}
		});

		it.runIf(server.containerId !== undefined)(
			"keeps the plaintext password out of PostgreSQL's statement log",
			async () => {
				const database = await createDatabase(server.adminUrl);
				created.push({ server, database });
				const admin = new SQL(server.adminUrl, { max: 1 });
				await admin.unsafe(
					`alter database ${quoteIdentifier(database.name)} set log_statement = 'all'`,
				);
				await admin.close();
				const owner = await openDatabase(database.url);
				opened.push(owner);
				const context = await checkOwnerRole(owner);
				await migrateDatabase(owner);
				const passwords = { app: password(), auditAdmin: password() };
				await setUpRoles(owner, context, passwords);

				const log = Bun.spawnSync(["docker", "logs", server.containerId as string], {
					stdout: "pipe",
					stderr: "pipe",
				});
				const text = `${log.stdout}${log.stderr}`;

				expect(text).toContain(`ROLE ${quoteIdentifier(context.names.app)}`);
				expect(text).not.toContain(passwords.app.reveal());
				expect(text).not.toContain(passwords.auditAdmin.reveal());
			},
		);
	});
}

describe("scramVerifier", () => {
	it("draws a fresh salt each time", async () => {
		const secret = password();

		expect(await scramVerifier(secret)).not.toBe(await scramVerifier(secret));
	});
});

describe("quoteIdentifier", () => {
	it("doubles quotes inside the name", () => {
		expect(quoteIdentifier('a"b')).toBe('"a""b"');
	});
});

/** The server's admin role, connected to `database`. */
function adminOn(server: TestServer, database: TestDatabase): string {
	const url = new URL(server.adminUrl);
	url.pathname = `/${encodeURIComponent(database.name)}`;
	return url.toString();
}

const escapeForPattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
