import { m } from "#lib/paraglide/messages.js";
import { createLogger, withRequestId } from "#lib/server/logging/logger.ts";
import { pathWithoutValues } from "#lib/server/logging/request-line.ts";

const log = createLogger("http");

/**
 * SvelteKit's `handleError` for an error nobody expected in a load, an action or an endpoint: the
 * error goes to the log as one redacted entry with the request's id, and the answer holds only a
 * generic message and that id. Without it, SvelteKit prints the error with `console.error`,
 * unredacted and not as JSON (SPEC-setup.md, "Logging").
 */
export function reportUnexpectedError(input: { error: unknown; requestId: string; url: URL }): {
	message: string;
	requestId: string;
} {
	withRequestId(input.requestId, () =>
		log.error("unexpected error", { error: input.error, path: pathWithoutValues(input.url) }),
	);
	return { message: m.error_internal_error_title(), requestId: input.requestId };
}
