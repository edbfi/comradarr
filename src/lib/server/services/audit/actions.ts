import { auditAction, auditActionsInDatabase } from "#lib/server/db/audit.ts";
import type { Database } from "#lib/server/db/client.ts";

/**
 * Every audit action code (SPEC-setup.md, "The audit trail"): the `audit_action` enum's values,
 * whose list is the schema's in `db/audit.ts`. The list only grows: a migration may add a code,
 * never remove or rename one, and a migration never uses a code that it or another migration in
 * the same release adds, since PostgreSQL won't use an enum value in the transaction that adds it.
 */
export const AUDIT_ACTIONS = auditAction.enumValues;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** How a claim attempt ended; `sign-in` adds `rate_limited`. */
export type ClaimOutcome = "granted" | "invalid" | "wrong_token" | "expired_token" | "failed";

/** Each action's context, of a fixed shape; it never holds a secret. */
export type AuditContexts = {
	/** A bootstrap token was printed: when it expires, never the token. */
	"setup.token_printed": { expiresAt: string };
	/** A claim attempt while the instance was unclaimed, and how it ended. */
	"setup.claim_attempted": { outcome: ClaimOutcome };
	/** The claim created the owner. */
	"setup.owner_created": { username: string };
	/** First run completed. */
	"setup.first_run_completed": Record<string, never>;
};

/**
 * Stops startup when the database's `audit_action` type lacks a code in `actions`, naming each:
 * the schema's list moved on without the migration that adds it.
 */
export async function checkAuditActions(
	db: Database,
	actions: readonly string[] = AUDIT_ACTIONS,
): Promise<void> {
	const known = new Set(await auditActionsInDatabase(db));
	const missing = actions.filter((action) => !known.has(action));
	if (missing.length > 0) {
		throw new Error(
			`the database's audit_action type lacks ${missing.join(", ")}; a migration must add each code in services/audit/actions.ts`,
		);
	}
}
