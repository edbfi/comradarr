import { sql } from "drizzle-orm";
import type { Database } from "./client.ts";

/** The oldest PostgreSQL accepted (SPEC-setup.md, "Versions"). */
const OLDEST = 16;

/** The roles startup creates, named after the database (SPEC-setup.md, "Roles"). */
export type RoleNames = { readonly app: string; readonly auditAdmin: string };

/** What the owner role found, for the steps after the check. */
export type OwnerContext = {
	readonly database: string;
	readonly owner: string;
	readonly superuser: boolean;
	readonly names: RoleNames;
};

/** The owner role can't set up the database; each problem names what to fix. */
export class PreflightError extends Error {
	override readonly name = "PreflightError";

	constructor(readonly problems: readonly string[]) {
		super(`the owner role can't set up Comradarr's database: ${problems.join("; ")}`);
	}
}

/** The two roles' names for `database`. */
export const roleNames = (database: string): RoleNames => ({
	app: `${database}_app`,
	auditAdmin: `${database}_audit_admin`,
});

/** What is wrong with a server whose `server_version_num` is `versionNum`, if anything. */
export function versionProblem(versionNum: number): string | undefined {
	const major = Math.floor(versionNum / 10_000);
	return major < OLDEST
		? `PostgreSQL ${major} is too old: Comradarr needs ${OLDEST} or later`
		: undefined;
}

/** The problems with the role names derived from `database`, for the owner role `owner`. */
export function nameProblems(database: string, owner: string): string[] {
	return Object.values(roleNames(database)).flatMap((name) => {
		if (new TextEncoder().encode(name).length > 63) {
			return [
				`the role name "${name}" is longer than PostgreSQL's 63 bytes: use a shorter database name`,
			];
		}
		if (name === owner) {
			return [`the role name "${name}" is the owner role's own: give the owner role another name`];
		}
		return [];
	});
}

/** The attributes an existing role may not have, by the column that holds each. */
const ATTRIBUTES = {
	rolsuper: "SUPERUSER",
	rolcreatedb: "CREATEDB",
	rolcreaterole: "CREATEROLE",
	rolreplication: "REPLICATION",
	rolbypassrls: "BYPASSRLS",
} as const;

type ExistingRole = Record<keyof typeof ATTRIBUTES, boolean> & {
	rolname: string;
	administered: boolean;
	member_of: string[];
	owns_objects: boolean;
};

/**
 * Checks, before anything migrates or changes, that the owner role can set up the database (D17),
 * and names every missing requirement at once: the server's version, `CREATEROLE`, owning the
 * database, a `public` schema that exists and that the owner role controls, role names that fit
 * and differ from the owner's, and for a role that already exists under one of the names, that the
 * owner role administers it directly, that it has no attribute the owner role may not remove, owns
 * nothing in the database and belongs to no other role.
 */
export async function checkOwnerRole(db: Database): Promise<OwnerContext> {
	const [self] = await db.execute<{
		version: number;
		owner: string;
		database: string;
		superuser: boolean;
		createrole: boolean;
		owns: boolean;
		/** Null when the database has no public schema. */
		controls_public: boolean | null;
	}>(sql`
		select current_setting('server_version_num')::int as version,
			current_user as owner,
			current_database() as database,
			r.rolsuper as superuser,
			r.rolcreaterole as createrole,
			d.datdba = r.oid as owns,
			(select pg_has_role(current_user, nspowner, 'USAGE') from pg_namespace where nspname = 'public')
				as controls_public
		from pg_roles r, pg_database d
		where r.rolname = current_user and d.datname = current_database()
	`);
	if (self === undefined) throw new PreflightError(["the owner role can't read its own role"]);
	const { owner, database, superuser } = self;
	const names = roleNames(database);
	const problems: string[] = [];
	const version = versionProblem(self.version);
	if (version !== undefined) problems.push(version);
	if (!self.createrole && !superuser) {
		problems.push(`the owner role "${owner}" may not create roles: it needs CREATEROLE`);
	}
	if (!self.owns && !superuser) {
		problems.push(`the owner role "${owner}" doesn't own the database "${database}"`);
	} else if (self.controls_public === null) {
		problems.push(`the database "${database}" has no public schema, which Comradarr's tables use`);
	} else if (!self.controls_public && !superuser) {
		// A database created from a template upgraded from PostgreSQL 14 or older keeps a public
		// schema that belongs to the old superuser, so the owner role couldn't revoke CREATE on it.
		problems.push(
			`the owner role "${owner}" doesn't control the public schema: run ALTER SCHEMA public OWNER TO pg_database_owner as a superuser`,
		);
	}
	problems.push(...nameProblems(database, owner));

	const existing = await db.execute<ExistingRole>(sql`
		select r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
			exists (
				select 1 from pg_shdepend
				where refobjid = r.oid and deptype = 'o'
					and dbid = (select oid from pg_database where datname = current_database())
			) as owns_objects,
			-- Only a direct grant with ADMIN counts: an inherited one would also work on 16, but
			-- refusing it fails safe, and D17's owner role always holds ADMIN directly.
			exists (
				select 1 from pg_auth_members m
				where m.roleid = r.oid and m.member = (select oid from pg_roles where rolname = current_user)
					and m.admin_option
			) as administered,
			array(
				select g.rolname from pg_auth_members m join pg_roles g on g.oid = m.roleid
				where m.member = r.oid order by g.rolname
			) as member_of
		from pg_roles r
		where r.rolname in (${names.app}, ${names.auditAdmin})
		order by r.rolname = ${names.auditAdmin}
	`);
	for (const role of existing) {
		if (!superuser && !role.administered) {
			problems.push(`the role "${role.rolname}" exists, and the owner role can't administer it`);
			continue;
		}
		const held = Object.entries(ATTRIBUTES)
			.filter(([column]) => role[column as keyof typeof ATTRIBUTES])
			.map(([, attribute]) => attribute);
		if (!superuser && held.length > 0) {
			problems.push(
				`the role "${role.rolname}" has ${held.join(" and ")}, which the owner role may not remove`,
			);
		}
		if (role.owns_objects) {
			problems.push(
				`the role "${role.rolname}" owns objects in the database, which would let it change them`,
			);
		}
		if (role.member_of.length > 0) {
			problems.push(
				`the role "${role.rolname}" is a member of ${role.member_of.join(", ")}, which would give it more than Comradarr grants`,
			);
		}
	}
	if (problems.length > 0) throw new PreflightError(problems);
	return { database, owner, superuser, names };
}
