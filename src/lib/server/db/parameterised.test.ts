import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every query is parameterised (SPEC-setup.md, "Parameterised queries only"). This searches the
 * app's code for SQL built from strings; a value interpolated in Drizzle's or Bun's `sql` tagged
 * template is a parameter and passes.
 */
const UNSAFE: { pattern: RegExp; says: string }[] = [
	{ pattern: /\bsql\.raw\s*\(/g, says: "sql.raw" },
	{ pattern: /\.unsafe\s*\(/g, says: "a client's unsafe" },
	// `.execute()` with no argument runs a Drizzle query builder; any argument but a `sql` tagged
	// template is text handed to the database.
	{ pattern: /\.execute\s*\((?!\s*(?:\)|sql\s*`))/g, says: "SQL text passed to execute" },
	{ pattern: /\bsql\s*`[^`]*`\s*\+/g, says: "text joined to a sql template" },
];

/** The files whose statements can't take parameters, each reviewed: the reviewed migrations. */
const EXEMPT = new Set(["src/lib/server/db/migrate.ts"]);

/**
 * The problems in one file's text, as `line: what`, matched across lines, since the formatter
 * moves a long `sql` template onto the line after `execute(`.
 */
function problems(text: string): string[] {
	const found = UNSAFE.flatMap(({ pattern, says }) =>
		[...text.matchAll(pattern)].map((match) => ({
			line: text.slice(0, match.index).split("\n").length,
			says,
		})),
	);
	return found
		.sort(
			(a, b) =>
				a.line - b.line ||
				UNSAFE.findIndex((u) => u.says === a.says) - UNSAFE.findIndex((u) => u.says === b.says),
		)
		.map(({ line, says }) => `${line}: ${says}`);
}

describe("SQL built from strings", () => {
	it("appears nowhere in the app's code but the exempt files", async () => {
		const root = new URL("../../../../", import.meta.url).pathname;
		const found: string[] = [];
		for await (const path of new Bun.Glob("src/**/*.{ts,svelte}").scan({ cwd: root })) {
			if (path.endsWith(".test.ts") || EXEMPT.has(path)) continue;
			const text = await readFile(`${root}${path}`, "utf8");
			found.push(...problems(text).map((problem) => `${relative(".", path)}:${problem}`));
		}

		expect(found).toEqual([]);
	});

	// The samples are source text, so their `${…}` is written escaped in template literals.
	it("passes a value interpolated in a sql tagged template", () => {
		expect(problems(`await db.execute(sql\`select * from owner where id = \${id}\`);`)).toEqual([]);
		expect(problems("await db.insert(settings).values(row).execute();")).toEqual([]);
		expect(
			problems(`await db.execute(\n\tsql\`select * from owner where id = \${id}\`,\n);`),
		).toEqual([]);
		expect(problems(`const rows = await client\`select 1 where \${value}\`;`)).toEqual([]);
	});

	it("finds each way of building SQL from strings", () => {
		expect(problems('await db.execute(sql.raw("select * from " + table));')).toEqual([
			"1: sql.raw",
			"1: SQL text passed to execute",
		]);
		expect(problems(`await client.unsafe(\`select * from \${table}\`);`)).toEqual([
			"1: a client's unsafe",
		]);
		expect(problems('await db.execute("delete from owner where id = " + id);')).toEqual([
			"1: SQL text passed to execute",
		]);
		expect(problems("const query = sql`select * from owner` + where;")).toEqual([
			"1: text joined to a sql template",
		]);
	});
});
