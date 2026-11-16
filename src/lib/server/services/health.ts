import { sql } from "drizzle-orm";
import type { Database } from "#lib/server/db/client.ts";

/** A component's status, and the overall one: the worst of its components'. */
export type Status = "healthy" | "degraded" | "unavailable";

/** The health check's answer: no versions, timings or errors (SPEC-setup.md, "Health"). */
export type Health = { status: Status; components: Record<string, Status> };

const ORDER: Status[] = ["healthy", "degraded", "unavailable"];

/** How long the database may take to answer before it counts as unavailable. */
const DATABASE_TIMEOUT_MS = 2000;

/**
 * Checks each component and returns the overall status, the worst of theirs. `setup` has one, the
 * database (critical, so it is healthy or unavailable); later modules add theirs.
 */
export async function checkHealth(
	db: Database,
	{ timeoutMs = DATABASE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Health> {
	const components = { database: await databaseStatus(db, timeoutMs) };
	const worst = Object.values(components).reduce<Status>(
		(status, component) => (ORDER.indexOf(component) > ORDER.indexOf(status) ? component : status),
		"healthy",
	);
	return { status: worst, components };
}

/** `select 1` on the app role's pool, within the limit. */
async function databaseStatus(db: Database, timeoutMs: number): Promise<Status> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<Status>((resolve) => {
		timer = setTimeout(() => resolve("unavailable"), timeoutMs);
	});
	const answered = db.execute(sql`select 1`).then(
		(): Status => "healthy",
		(): Status => "unavailable",
	);
	try {
		return await Promise.race([answered, timedOut]);
	} finally {
		clearTimeout(timer);
	}
}

/** The `/healthz` answer: 200 while healthy or degraded, 503 once unavailable, never cached. */
export function healthResponse(health: Health): Response {
	return Response.json(health, {
		status: health.status === "unavailable" ? 503 : 200,
		headers: { "cache-control": "no-store" },
	});
}
