import { sql } from "drizzle-orm";
import type { Secret } from "#lib/server/security/secrets/secret.ts";
import type { Database } from "./client.ts";
import type { OwnerContext } from "./preflight.ts";
import { serverMessage } from "./server-message.ts";

/** What a statement runs on: the database, or the transaction setting the roles up. */
type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The roles' passwords, which the master key derives (D17). */
export type RolePasswords = { readonly app: Secret; readonly auditAdmin: Secret };

/** Setting up a role or the privileges failed; the message never holds a password or verifier. */
export class RoleSetupError extends Error {
	override readonly name = "RoleSetupError";
}

/**
 * The privileges D7 gives each role on a table of the `public` schema: the app role reads and
 * writes every table but may only add and read audit entries; the audit-admin role may only read
 * and delete them. A table a later migration adds gets the app role's privileges without a rule.
 */
function grantsOn(table: string): { app: string[]; auditAdmin: string[] } {
	if (table === "audit_log") return { app: ["SELECT", "INSERT"], auditAdmin: ["SELECT", "DELETE"] };
	return { app: ["SELECT", "INSERT", "UPDATE", "DELETE"], auditAdmin: [] };
}

/** A PostgreSQL identifier, quoted, for the statements that can't take parameters. */
export function quoteIdentifier(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

const quoteLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`;

const base64 = (bytes: ArrayBuffer | Uint8Array) =>
	(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toBase64();

/**
 * The SCRAM-SHA-256 verifier PostgreSQL stores for `password` (RFC 5802, RFC 7677), with a fresh
 * random salt and PostgreSQL's 4096 iterations. Sending it instead of the password keeps the
 * password out of a server that logs its statements, as `psql`'s `\password` does. The derived
 * passwords are base64url, which SASLprep leaves as they are.
 */
export async function scramVerifier(password: Secret, iterations = 4096): Promise<string> {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password.reveal()),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const salted = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		key,
		256,
	);
	const hmac = await crypto.subtle.importKey(
		"raw",
		salted,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const clientKey = await crypto.subtle.sign("HMAC", hmac, encoder.encode("Client Key"));
	const storedKey = await crypto.subtle.digest("SHA-256", clientKey);
	const serverKey = await crypto.subtle.sign("HMAC", hmac, encoder.encode("Server Key"));
	return `SCRAM-SHA-256$${iterations}:${base64(salt)}$${base64(storedKey)}:${base64(serverKey)}`;
}

/**
 * Creates the app and audit-admin roles when missing and sets their passwords, expiry and
 * connection limit every time, then sets the privileges, in one transaction, as the owner role
 * after the pre-flight check and the migrations (D7, D16, D17). It first revokes from `PUBLIC` and
 * both roles every privilege on the `public` schema's tables and sequences, `CREATE` on the schema,
 * and `CREATE` and `TEMPORARY` on the database, which an older or upgraded database or an earlier
 * grant may have given; then it grants the matrix, and `checkPrivileges` refuses any effective
 * privilege left beyond it.
 */
export async function setUpRoles(
	db: Database,
	context: OwnerContext,
	passwords: RolePasswords,
): Promise<void> {
	const { names } = context;
	const app = quoteIdentifier(names.app);
	const auditAdmin = quoteIdentifier(names.auditAdmin);
	const database = quoteIdentifier(context.database);
	const verifiers = {
		app: await scramVerifier(passwords.app),
		auditAdmin: await scramVerifier(passwords.auditAdmin),
	};
	// A superuser owner may remove attributes; anyone else may not even name them (pre-flight
	// refused an existing role that has one).
	const attributes = context.superuser
		? " NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
		: "";
	let step = "";
	try {
		await db.transaction(async (tx) => {
			for (const role of ["app", "auditAdmin"] as const) {
				const name = names[role];
				step = `setting up the role "${name}"`;
				const [found] = await tx.execute(sql`select 1 from pg_roles where rolname = ${name}`);
				const verb = found === undefined ? "CREATE ROLE" : "ALTER ROLE";
				await tx.execute(
					sql.raw(
						`${verb} ${quoteIdentifier(name)} WITH LOGIN${found === undefined ? "" : attributes} VALID UNTIL 'infinity' CONNECTION LIMIT -1 PASSWORD ${quoteLiteral(verifiers[role])}`,
					),
				);
			}
			step = "setting the roles' privileges";
			// What PUBLIC or an earlier grant gave either role goes first, so only the matrix is left.
			const everyone = `PUBLIC, ${app}, ${auditAdmin}`;
			await tx.execute(sql.raw(`REVOKE CREATE ON SCHEMA public FROM ${everyone}`));
			await tx.execute(
				sql.raw(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${everyone}`),
			);
			await tx.execute(sql.raw(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${everyone}`));
			await tx.execute(sql.raw(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${everyone}`));
			await tx.execute(sql.raw(`GRANT CONNECT ON DATABASE ${database} TO ${app}, ${auditAdmin}`));
			await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${app}, ${auditAdmin}`));
			const tables = await tx.execute<{ tablename: string }>(
				sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
			);
			for (const { tablename } of tables) {
				const grants = grantsOn(tablename);
				const table = `public.${quoteIdentifier(tablename)}`;
				if (grants.app.length > 0) {
					await tx.execute(sql.raw(`GRANT ${grants.app.join(", ")} ON ${table} TO ${app}`));
				}
				if (grants.auditAdmin.length > 0) {
					await tx.execute(
						sql.raw(`GRANT ${grants.auditAdmin.join(", ")} ON ${table} TO ${auditAdmin}`),
					);
				}
			}
			step = "checking the roles' privileges";
			await checkPrivileges(tx, context);
		});
	} catch (error) {
		if (error instanceof RoleSetupError) throw error;
		throw new RoleSetupError(`${step} failed: ${serverMessage(error)}`);
	}
}

/** The table privileges PostgreSQL knows; `MAINTAIN` came with 17. */
const TABLE_PRIVILEGES = [
	"SELECT",
	"INSERT",
	"UPDATE",
	"DELETE",
	"TRUNCATE",
	"REFERENCES",
	"TRIGGER",
];

/**
 * Checks the roles' effective privileges against the matrix, whatever granted them, and throws
 * naming any the matrix doesn't give: a backstop after the revokes, for an ACL nobody expected.
 */
export async function checkPrivileges(db: Executor, context: OwnerContext): Promise<void> {
	const [server] = await db.execute<{ version: number }>(
		sql`select current_setting('server_version_num')::int as version`,
	);
	const privileges = [
		...TABLE_PRIVILEGES,
		...((server?.version ?? 0) >= 170000 ? ["MAINTAIN"] : []),
	];
	const values = sql.join(
		privileges.map((privilege) => sql`(${privilege})`),
		sql`, `,
	);
	for (const role of ["app", "auditAdmin"] as const) {
		const name = context.names[role];
		const tables = await db.execute<{ tablename: string; privilege: string }>(sql`
			select t.tablename, p.privilege
			from pg_tables t cross join (values ${values}) as p(privilege)
			where t.schemaname = 'public'
				and case
					-- A column grant gives these too, and has_table_privilege doesn't see one.
					when p.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
						then has_any_column_privilege(${name}, format('public.%I', t.tablename), p.privilege)
					else has_table_privilege(${name}, format('public.%I', t.tablename), p.privilege)
				end
			order by t.tablename, p.privilege
		`);
		const extra = tables
			.filter(({ tablename, privilege }) => !grantsOn(tablename)[role].includes(privilege))
			.map(({ tablename, privilege }) => `${privilege} on ${tablename}`);
		const [elsewhere] = await db.execute<{
			schema_create: boolean;
			database_create: boolean;
			temporary: boolean;
		}>(sql`
			select has_schema_privilege(${name}, 'public', 'CREATE') as schema_create,
				has_database_privilege(${name}, current_database(), 'CREATE') as database_create,
				has_database_privilege(${name}, current_database(), 'TEMPORARY') as temporary
		`);
		const sequences = await db.execute<{ sequencename: string; privilege: string }>(sql`
			select s.sequencename, p.privilege
			from pg_sequences s cross join (values ('UPDATE'), ('USAGE'), ('SELECT')) as p(privilege)
			where s.schemaname = 'public'
				and has_sequence_privilege(${name}, format('public.%I', s.sequencename), p.privilege)
			order by s.sequencename, p.privilege
		`);
		// The matrix gives no sequence privilege: the identity column needs none.
		extra.push(
			...sequences.map(
				({ sequencename, privilege }) => `${privilege} on the sequence ${sequencename}`,
			),
		);
		if (elsewhere?.schema_create) extra.push("CREATE on the public schema");
		if (elsewhere?.database_create) extra.push("CREATE on the database");
		if (elsewhere?.temporary) extra.push("TEMPORARY on the database");
		if (extra.length > 0) {
			throw new RoleSetupError(
				`the role "${name}" has privileges the matrix doesn't give it: ${extra.join(", ")}`,
			);
		}
	}
}
