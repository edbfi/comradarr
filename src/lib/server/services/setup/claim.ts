import type { Database } from "#lib/server/db/client.ts";
import { insertOwner } from "#lib/server/db/owner.ts";
import { serverMessage } from "#lib/server/db/server-message.ts";
import { writeSetting } from "#lib/server/db/settings.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import {
	checkPassword,
	checkUsername,
	hashPassword,
	type PasswordError,
	type UsernameError,
} from "#lib/server/security/password.ts";
import type { ClaimOutcome } from "#lib/server/services/audit/actions.ts";
import {
	type AuditRequest,
	recordAudit,
	writeAuditEntry,
} from "#lib/server/services/audit/record.ts";
import {
	FIRST_RUN_COMPLETE,
	FIRST_RUN_STEP_KEY,
	isClaimed,
	markClaimed,
	useToken,
	withClaimInProgress,
} from "./first-run.ts";

export type ClaimInput = { token: string; username: string; password: string };

export type ClaimResult =
	| { status: "claimed" }
	/** The instance is claimed already: the claim no longer exists. */
	| { status: "not-found" }
	| { status: "invalid"; username?: UsernameError; password?: PasswordError }
	/** A wrong or expired token: one answer for both; the audit trail tells them apart. */
	| { status: "token" }
	| { status: "failed" };

const log = createLogger("setup");

/**
 * Claims the instance for its one owner (SPEC-setup.md, "The claim"), in this order:
 * 1. the fields, checked with nothing awaited, so a field error leaves the token unused;
 * 2. the token, checked and used up with no `await` between, so a wrong guess costs no hash;
 * 3. the hash of the password;
 * 4. one transaction that creates the owner, moves the step pointer and writes the grant's three
 *    audit entries, so a claim never completes unaudited.
 * Every attempt while unclaimed is audited; any outcome but the grant, on its own. If anything
 * after the token fails while the instance is still unclaimed, first run prints a new token. The
 * claim stores nothing but the owner row, the pointer and the audit entries. Nobody is signed in
 * yet, so the client address is who acts.
 */
export async function claimInstance(
	db: Database,
	input: ClaimInput,
	request: AuditRequest,
): Promise<ClaimResult> {
	if (isClaimed()) return { status: "not-found" };
	const attempt = (outcome: ClaimOutcome) =>
		({
			action: "setup.claim_attempted",
			actor: "nobody",
			context: { outcome },
			request,
		}) as const;
	return withClaimInProgress(async () => {
		const username = checkUsername(input.username);
		const password = checkPassword(
			input.password,
			username.ok ? username.username : input.username.trim(),
		);
		if (!username.ok || !password.ok) {
			await recordAudit(db, attempt("invalid"));
			return {
				status: "invalid",
				...(username.ok ? {} : { username: username.error }),
				...(password.ok ? {} : { password: password.error }),
			};
		}
		const use = useToken(input.token);
		if (use !== "used") {
			await recordAudit(db, attempt(use === "expired" ? "expired_token" : "wrong_token"));
			return { status: "token" };
		}
		try {
			const passwordHash = await hashPassword(password.password);
			const now = new Date();
			await db.transaction(async (tx) => {
				await insertOwner(tx, { username: username.username, passwordHash, createdAt: now });
				await writeSetting(tx, FIRST_RUN_STEP_KEY, FIRST_RUN_COMPLETE, now);
				await writeAuditEntry(tx, attempt("granted"));
				await writeAuditEntry(tx, {
					action: "setup.owner_created",
					actor: "nobody",
					context: { username: username.username },
					request,
				});
				await writeAuditEntry(tx, {
					action: "setup.first_run_completed",
					actor: "nobody",
					context: {},
					request,
				});
			});
		} catch (error) {
			// PostgreSQL's own reason: Drizzle's message repeats the insert's values.
			log.error("the claim failed", { reason: serverMessage(error) });
			await recordAudit(db, attempt("failed"));
			return { status: "failed" };
		}
		markClaimed();
		return { status: "claimed" };
	});
}
