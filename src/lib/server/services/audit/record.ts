import { auditLog } from "#lib/server/db/audit.ts";
import type { Database } from "#lib/server/db/client.ts";
import { serverMessage } from "#lib/server/db/server-message.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { redact } from "#lib/server/logging/redact.ts";
import type { AuditAction, AuditContexts } from "./actions.ts";

const log = createLogger("audit");

/** How much of a user agent an entry keeps, in characters. */
const USER_AGENT_LIMIT = 512;

/** The request an entry came from: who sent it, with what, and its id, which its log lines carry. */
export type AuditRequest = {
	readonly clientAddress: string | undefined;
	readonly userAgent: string | null;
	readonly requestId: string;
};

/**
 * One entry: an action with its context, and who acted. The owner and nobody act through a
 * request; the app acts on its own, at startup or on a timer, so its entries have no request.
 */
export type AuditEntry = {
	[A in AuditAction]: { action: A; context: AuditContexts[A] };
}[AuditAction] &
	({ actor: "app" } | { actor: "owner" | "nobody"; request: AuditRequest });

/** What writes an entry: the app role's pool, or the claim's transaction. */
export type AuditWriter = Pick<Database, "insert">;

/**
 * Writes `entry` with `db`, and throws if it fails, so the claim's transaction rolls back with it
 * (SPEC-setup.md, "The audit trail"). The time is the database's; the context passes through the
 * log redaction, so no secret reaches it; the user agent is cut to 512 characters.
 */
export async function writeAuditEntry(db: AuditWriter, entry: AuditEntry): Promise<void> {
	const request = entry.actor === "app" ? undefined : entry.request;
	const userAgent = request?.userAgent ?? null;
	await db.insert(auditLog).values({
		action: entry.action,
		actor: entry.actor,
		context: redact(entry.context),
		clientAddress: request?.clientAddress ?? null,
		userAgent: userAgent === null ? null : [...userAgent].slice(0, USER_AGENT_LIMIT).join(""),
		requestId: request?.requestId ?? null,
	});
}

/**
 * Writes `entry` on its own. A failed write is logged as an error and not thrown, so the request
 * or the timer goes on as it would have. The log entry holds the database's own message, not
 * Drizzle's, which repeats the insert's parameters: the request's fields would reach the log.
 */
export async function recordAudit(db: AuditWriter, entry: AuditEntry): Promise<void> {
	try {
		await writeAuditEntry(db, entry);
	} catch (error) {
		log.error("writing an audit entry failed", {
			action: entry.action,
			reason: serverMessage(error),
		});
	}
}
