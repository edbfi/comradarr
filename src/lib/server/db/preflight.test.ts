import { SQL } from "bun";
import { afterAll, describe, expect, inject, it } from "vitest";
import {
	createDatabase,
	dropDatabase,
	type TestDatabase,
	type TestServer,
} from "../../../../tests/database.ts";
import { type Database, openDatabase } from "./client.ts";
import { checkOwnerRole, nameProblems, PreflightError, versionProblem } from "./preflight.ts";

const servers = inject("testDatabaseServers");
const created: { server: TestServer; database: TestDatabase }[] = [];
const opened: Database[] = [];

afterAll(async () => {
	for (const db of opened) await db.$client.close();
	for (const { server, database } of created) await dropDatabase(server.adminUrl, database);
});

async function ownerOf(server: TestServer, attributes?: string) {
	const database = await createDatabase(server.adminUrl, undefined, attributes);
	created.push({ server, database });
	const db = await openDatabase(database.url);
	opened.push(db);
	return { database, db };
}

/** Runs `statement` as the server's superuser. */
async function asAdmin(server: TestServer, statement: string) {
	await asAdminOn(server.adminUrl, statement);
}

/** Runs `statement` as the superuser, on the database `adminUrl` names. */
async function asAdminOn(adminUrl: string, statement: string) {
	const admin = new SQL(adminUrl, { max: 1 });
	try {
		await admin.unsafe(statement);
	} finally {
		await admin.close();
	}
}

const problemsOf = async (db: Database) =>
	checkOwnerRole(db).then(
		() => [],
		(error: unknown) => {
			if (error instanceof PreflightError) return error.problems;
			throw error;
		},
	);

for (const version of [18, 16] as const) {
	describe(`checkOwnerRole on PostgreSQL ${version}`, () => {
		const server = servers[version];

		it("passes D17's owner role, and returns the database and the role names", async () => {
			const { database, db } = await ownerOf(server);

			expect(await checkOwnerRole(db)).toEqual({
				database: database.name,
				owner: database.name,
				superuser: false,
				names: { app: `${database.name}_app`, auditAdmin: `${database.name}_audit_admin` },
			});
		});

		it("names every missing requirement at once", async () => {
			const { database, db } = await ownerOf(server, "");
			await asAdmin(server, `alter database "${database.name}" owner to current_user`);

			expect(await problemsOf(db)).toEqual([
				`the owner role "${database.name}" may not create roles: it needs CREATEROLE`,
				`the owner role "${database.name}" doesn't own the database "${database.name}"`,
			]);
		});

		it("refuses an existing role it can't administer", async () => {
			const { database, db } = await ownerOf(server);
			await asAdmin(server, `create role "${database.name}_app" login`);

			expect(await problemsOf(db)).toEqual([
				`the role "${database.name}_app" exists, and the owner role can't administer it`,
			]);
			await asAdmin(server, `drop role "${database.name}_app"`);
		});

		it("refuses an existing role with an attribute it may not remove", async () => {
			const { database, db } = await ownerOf(server);
			const role = `${database.name}_audit_admin`;
			await asAdmin(server, `create role "${role}" login createdb bypassrls`);
			await asAdmin(server, `grant "${role}" to "${database.name}" with admin option`);

			expect(await problemsOf(db)).toEqual([
				`the role "${role}" has CREATEDB and BYPASSRLS, which the owner role may not remove`,
			]);
			await asAdmin(server, `drop role "${role}"`);
		});

		it("refuses a public schema the owner role doesn't control", async () => {
			const { database, db } = await ownerOf(server);
			const admin = new URL(server.adminUrl);
			admin.pathname = `/${database.name}`;
			await asAdminOn(admin.toString(), "alter schema public owner to current_user");

			expect(await problemsOf(db)).toEqual([
				`the owner role "${database.name}" doesn't control the public schema: run ALTER SCHEMA public OWNER TO pg_database_owner as a superuser`,
			]);
		});

		it("refuses an existing role that owns something", async () => {
			const { database, db } = await ownerOf(server);
			const role = `${database.name}_app`;
			await asAdmin(server, `create role "${role}" login`);
			await asAdmin(server, `grant "${role}" to "${database.name}" with admin option`);
			const admin = new URL(server.adminUrl);
			admin.pathname = `/${database.name}`;
			await asAdminOn(
				admin.toString(),
				`create table leftover (id int); alter table leftover owner to "${role}"`,
			);

			expect(await problemsOf(db)).toEqual([
				`the role "${role}" owns objects in the database, which would let it change them`,
			]);
			await asAdminOn(admin.toString(), "drop table leftover");
			await asAdmin(server, `drop role "${role}"`);
		});

		it("refuses an existing role that belongs to another role", async () => {
			const { database, db } = await ownerOf(server);
			const role = `${database.name}_app`;
			await asAdmin(server, `create role "${role}" login`);
			await asAdmin(server, `grant "${role}" to "${database.name}" with admin option`);
			await asAdmin(server, `grant pg_read_all_data to "${role}"`);

			expect(await problemsOf(db)).toEqual([
				`the role "${role}" is a member of pg_read_all_data, which would give it more than Comradarr grants`,
			]);
			await asAdmin(server, `drop role "${role}"`);
		});
	});
}

describe("versionProblem", () => {
	it("accepts 16 and later, and refuses 15 naming both versions", () => {
		expect(versionProblem(160000)).toBeUndefined();
		expect(versionProblem(180001)).toBeUndefined();
		expect(versionProblem(150008)).toBe("PostgreSQL 15 is too old: Comradarr needs 16 or later");
	});
});

describe("nameProblems", () => {
	it("refuses a role name over PostgreSQL's 63 bytes", () => {
		const database = "d".repeat(52);

		expect(nameProblems(database, "owner")).toEqual([
			`the role name "${database}_audit_admin" is longer than PostgreSQL's 63 bytes: use a shorter database name`,
		]);
	});

	it("counts bytes, not characters", () => {
		expect(nameProblems("ø".repeat(26), "owner")).toHaveLength(1);
		expect(nameProblems("o".repeat(26), "owner")).toEqual([]);
	});

	it("refuses a role name that is the owner role's own", () => {
		expect(nameProblems("comradarr", "comradarr_app")).toEqual([
			`the role name "comradarr_app" is the owner role's own: give the owner role another name`,
		]);
	});
});
