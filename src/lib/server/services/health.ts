import { type Database, probeDatabase } from "#lib/server/db/client.ts";
import { createLogger } from "#lib/server/logging/logger.ts";

/** A component's status, and the overall one: the worst of its components'. */
export type Status = "healthy" | "degraded" | "unavailable";

/** The health check's answer: no versions, timings or errors (SPEC-setup.md, "Health"). */
export type Health = { status: Status; components: Record<string, Status> };

const ORDER: Status[] = ["healthy", "degraded", "unavailable"];

/** How long the database may take to answer before it counts as unavailable. */
const DATABASE_TIMEOUT_MS = 2000;

const log = createLogger("health");

/**
 * The database's status as last logged. The log says why it became unavailable, and when it is
 * back, once each: probes come every few seconds, and each failure would drown the log.
 */
let reported: Status = "healthy";

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

async function databaseStatus(db: Database, timeoutMs: number): Promise<Status> {
	const reason = await probeDatabase(db, timeoutMs);
	const status: Status = reason === undefined ? "healthy" : "unavailable";
	if (status !== reported) {
		if (reason === undefined) log.info("the database is back");
		else log.warn("the database is unavailable", { reason });
		reported = status;
	}
	return status;
}

/** The `/healthz` answer: 200 while healthy or degraded, 503 once unavailable, never cached. */
export function healthResponse(health: Health): Response {
	return Response.json(health, {
		status: health.status === "unavailable" ? 503 : 200,
		headers: { "cache-control": "no-store" },
	});
}
