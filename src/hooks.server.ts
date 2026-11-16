import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence,
} from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { withRequestId } from "#lib/server/logging/logger.ts";
import {
	clientAddress,
	logRequest,
	sentStatusAndSize,
	thrownStatus,
} from "#lib/server/logging/request-line.ts";
import { startUp } from "#lib/server/services/setup/startup.ts";
import { answerCaughtError } from "#lib/server/services/unexpected-error.ts";
import { building } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await startUp(env);
};

/**
 * The first stage: the request's id, which every entry written while handling it carries, and one
 * log line when its response is ready, or as a 500 if a later stage threw (SPEC-setup.md,
 * "Logging").
 */
const requestId: Handle = ({ event, resolve }) => {
	const id = crypto.randomUUID();
	event.locals.requestId = id;
	const started = performance.now();
	return withRequestId(id, async () => {
		let response: Response | undefined;
		let thrown: unknown;
		try {
			response = await resolve(event);
			return response;
		} catch (error) {
			thrown = error;
			throw error;
		} finally {
			const sent =
				response === undefined
					? { status: thrownStatus(thrown), size: undefined }
					: sentStatusAndSize(event.request.headers.get("if-none-match"), response);
			logRequest({
				method: event.request.method,
				url: event.url,
				...sent,
				ms: performance.now() - started,
				clientAddress: clientAddress(event),
			});
		}
	});
};

/** Each request's language (SPEC-i18n.md); it refuses nothing. */
const language: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace("%lang%", locale) },
		),
	);

export const handle = sequence(requestId, language);

/**
 * Every error SvelteKit catches passes here: one nobody expected goes through the logger,
 * redacted, never to `console.error`, and every answer carries the request's id. The id can be
 * missing although the type says otherwise: an error before `handle` runs, such as in `reroute`,
 * reaches this hook too.
 */
export const handleError: HandleServerError = ({ kind, error, event }) =>
	answerCaughtError({ kind, error, requestId: event.locals.requestId, url: event.url });
