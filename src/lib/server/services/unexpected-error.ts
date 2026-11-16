import { createLogger, withRequestId } from "#lib/server/logging/logger.ts";
import { pathWithoutValues } from "#lib/server/logging/request-line.ts";
import { type Problem, problem } from "#lib/shared/errors/problem.ts";

const log = createLogger("http");

/**
 * What SvelteKit's `handleError` answers for any error it caught: one the app raised with `error()`
 * or SvelteKit's own (a 404) keeps its status and message and is not logged, and gains only the
 * request's id; one nobody expected is reported. A request that never reached `handle` has no id
 * yet, so it gets one here.
 */
export function answerCaughtError(input: {
	kind: string;
	error: unknown;
	requestId: string | undefined;
	url: URL;
}): { requestId: string } | UnexpectedErrorAnswer {
	const requestId = input.requestId ?? crypto.randomUUID();
	if (input.kind !== "unknown") return { requestId };
	return reportUnexpectedError({ error: input.error, requestId, url: input.url });
}

/**
 * The answer to an unexpected error: the error format's `internal_error`, and the `message` that
 * SvelteKit adds to every error, which repeats the title.
 */
export type UnexpectedErrorAnswer = Problem & { requestId: string; message: string };

/**
 * SvelteKit's `handleError` for an error nobody expected in a load, an action or an endpoint: the
 * error goes to the log as one redacted entry with the request's id, and the answer holds only
 * `internal_error`, in the viewer's language, and that id. Without it, SvelteKit prints the error
 * with `console.error`, unredacted and not as JSON (SPEC-setup.md, "Logging", "The error format").
 */
export function reportUnexpectedError(input: {
	error: unknown;
	requestId: string;
	url: URL;
}): UnexpectedErrorAnswer {
	withRequestId(input.requestId, () =>
		log.error("unexpected error", { error: input.error, path: pathWithoutValues(input.url) }),
	);
	const answer = problem("internal_error", { requestId: input.requestId });
	return { ...answer, requestId: input.requestId, message: answer.title };
}
