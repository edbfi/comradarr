import type { Database } from "#lib/server/db/client.ts";
import { readSetting } from "#lib/server/db/settings.ts";
import {
	type BootstrapToken,
	formatToken,
	issueToken,
	isTokenValid,
	TOKEN_LIFETIME_MS,
	tokenMatches,
} from "#lib/server/security/bootstrap-token.ts";
import { recordAudit } from "#lib/server/services/audit/record.ts";
import { wantsJson } from "#lib/shared/errors/json-caller.ts";
import { problem } from "#lib/shared/errors/problem.ts";

/**
 * The settings key of first run's step pointer, stored and compared exactly: the claim writes it,
 * so a pointer means the instance is claimed, and nothing is inferred from an owner row existing
 * (SPEC-setup.md, "The step pointer"). The claim is the only step until `two-factor` adds the
 * next, so the claim moves it straight to `complete`.
 */
export const FIRST_RUN_STEP_KEY = "setup.first_run.step";
export const FIRST_RUN_COMPLETE = "complete";

/** What a typed token did: claimed the instance's token, matched none, or matched an expired one. */
export type TokenUse = "used" | "wrong" | "expired";

export type FirstRunOptions = {
	readonly db: Database;
	/** `ORIGIN`, parsed, so the banner can give the full link. */
	readonly origin: string | undefined;
	/** Where the banner goes: standard output, never the logs. */
	readonly print?: (banner: string) => void;
	readonly lifetimeMs?: number;
};

/** First run's state, in memory (one process, D19): startup loads it, the claim updates it. */
let claimed = false;
let complete = false;
let token: BootstrapToken | undefined;
/** The last token a renewal replaced or a claim used, so an old link counts as expired. */
let previous: BootstrapToken | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let claimsInProgress = 0;
let renewalWaiting = false;
/** Set by shutdown: no token is printed after it, even by a claim that fails meanwhile. */
let stopped = false;
let settings: Required<FirstRunOptions> | undefined;

/** Console output for whoever runs the server, in one write; it still reaches the container's. */
const toStandardOutput = (banner: string) => process.stdout.write(banner);

/**
 * Loads first run's state at startup, the step pointer from `settings`, and, while the instance is
 * unclaimed, prints a bootstrap token, and a new one every time it expires; once the instance is
 * claimed, none is printed again (SPEC-setup.md, "The bootstrap token"). It returns once the first
 * printing is audited.
 */
export async function startFirstRun(options: FirstRunOptions): Promise<void> {
	stopFirstRun();
	stopped = false;
	settings = {
		db: options.db,
		origin: options.origin,
		print: options.print ?? toStandardOutput,
		lifetimeMs: options.lifetimeMs ?? TOKEN_LIFETIME_MS,
	};
	const step = await readSetting(options.db, FIRST_RUN_STEP_KEY);
	claimed = step !== undefined;
	complete = step === FIRST_RUN_COMPLETE;
	token = undefined;
	previous = undefined;
	await renewToken();
}

/** Stops the token's timer, as shutdown does on its signal. */
export function stopFirstRun(): void {
	stopped = true;
	clearTimeout(timer);
	timer = undefined;
	renewalWaiting = false;
}

/** Whether the instance has been claimed. */
export function isClaimed(): boolean {
	return claimed;
}

/** Whether first run is complete, after which its steps answer "not found". */
export function isFirstRunComplete(): boolean {
	return complete;
}

/** The claim, first run's only step until `two-factor` adds the next. */
const CURRENT_STEP = "/setup";

/**
 * Paths the gate lets through before first run is complete, besides the current step: the health
 * check and the CSP report endpoint (SPEC-setup.md, "First run").
 */
const ALWAYS_OPEN = new Set(["/healthz", "/api/csp-report"]);

/**
 * The setup gate's decision for a request's path: until first run is complete, every path but the
 * current step and the open ones is sent to that step; once it is complete, none is.
 */
export function firstRunRedirect(path: string): string | undefined {
	if (complete || path === CURRENT_STEP || ALWAYS_OPEN.has(path)) return undefined;
	return CURRENT_STEP;
}

/**
 * The gate's answer to a request it holds back: a 303 to `step`, or, for a caller that asks for
 * JSON and not for a page, a 503 `setup_incomplete` in the error format, never a 401.
 */
export function gateAnswer(request: Request, step: string, requestId: string): Response {
	if (wantsJson(request)) {
		return Response.json(problem("setup_incomplete", { requestId }), {
			status: 503,
			headers: { "cache-control": "no-store" },
		});
	}
	return new Response(null, { status: 303, headers: { location: step } });
}

/**
 * Checks what someone typed against the current token and, if it matches and is still valid,
 * uses it up, with nothing awaited in between, so two claims can't both use one token. A match
 * with the current token past its lifetime, or with the last one a renewal replaced or a claim
 * used, is `expired`, so the audit trail can tell an old link from a guess.
 */
export function useToken(entry: string): TokenUse {
	if (token !== undefined && tokenMatches(token.value, entry)) {
		if (!isTokenValid(token, Date.now())) return "expired";
		previous = token;
		token = undefined;
		return "used";
	}
	if (previous !== undefined && tokenMatches(previous.value, entry)) return "expired";
	return "wrong";
}

/**
 * Records a claim its transaction committed: the instance is claimed, and first run complete
 * while the claim is its only step; no token is printed again.
 */
export function markClaimed(): void {
	claimed = true;
	complete = true;
	stopFirstRun();
}

/**
 * Runs a claim's work while holding back the token's renewal, so the token can't change under
 * it. Once the last claim in progress has finished, a new token is printed if one came due
 * meanwhile, or if a claim used the token up and the instance is still unclaimed.
 */
export async function withClaimInProgress<T>(work: () => Promise<T>): Promise<T> {
	claimsInProgress++;
	try {
		return await work();
	} finally {
		claimsInProgress--;
		if (claimsInProgress === 0 && (renewalWaiting || token === undefined)) {
			renewalWaiting = false;
			void renewToken();
		}
	}
}

/**
 * Issues a new token, prints its banner, schedules the next and audits the printing; never once
 * the instance is claimed or shutdown has begun. A failed audit write is logged, and the token
 * stands.
 */
async function renewToken(): Promise<void> {
	if (settings === undefined || claimed || stopped) return;
	clearTimeout(timer);
	if (token !== undefined) previous = token;
	token = issueToken(Date.now(), settings.lifetimeMs);
	const expiresAt = new Date(token.issuedAt + token.lifetimeMs);
	settings.print(banner(formatToken(token.value), expiresAt, settings.origin));
	timer = setTimeout(() => {
		if (claimsInProgress > 0) renewalWaiting = true;
		else void renewToken();
	}, settings.lifetimeMs);
	timer.unref?.();
	await recordAudit(settings.db, {
		action: "setup.token_printed",
		actor: "app",
		context: { expiresAt: expiresAt.toISOString() },
	});
}

const TITLE = " Comradarr setup ";
const RULE = "=".repeat(57);

/**
 * The banner: plain lines, not a log entry, with the token, its expiry in UTC and the link, which
 * carries the token in its fragment, so it never reaches the server or a proxy's log. The link is
 * a full address only with `ORIGIN`; otherwise it is the path to open at Comradarr's address.
 */
function banner(shown: string, expiresAt: Date, origin: string | undefined): string {
	const half = (RULE.length - TITLE.length) / 2;
	const link = `/setup#token=${shown}`;
	const expiry = `${expiresAt.toISOString().slice(0, 19).replace("T", " ")} UTC`;
	return [
		`${"=".repeat(Math.floor(half))}${TITLE}${"=".repeat(Math.ceil(half))}`,
		`Setup token: ${shown} (valid until ${expiry})`,
		origin === undefined
			? `Open ${link} at the address you reach Comradarr at, to claim it.`
			: `Open ${origin}${link} to claim this Comradarr.`,
		"This output is a setup secret: don't paste it into chats or issue trackers.",
		RULE,
		"",
	].join("\n");
}
