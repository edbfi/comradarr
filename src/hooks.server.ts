import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence,
} from "@sveltejs/kit/hooks";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { withRequestId } from "#lib/server/logging/logger.ts";
import { logRequest } from "#lib/server/logging/request-line.ts";
import { startUp } from "#lib/server/services/setup/startup.ts";
import { reportUnexpectedError } from "#lib/server/services/unexpected-error.ts";
import { building } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await startUp(env);
};

/**
 * The first stage: the request's id, which every entry written while handling it carries, and one
 * log line when its response is ready (SPEC-setup.md, "Logging").
 */
const requestId: Handle = ({ event, resolve }) => {
	const id = crypto.randomUUID();
	event.locals.requestId = id;
	const started = performance.now();
	return withRequestId(id, async () => {
		const response = await resolve(event);
		const length = response.headers.get("content-length");
		logRequest({
			method: event.request.method,
			url: event.url,
			status: response.status,
			size: length === null ? undefined : Number(length),
			ms: performance.now() - started,
			clientAddress: event.getClientAddress(),
		});
		return response;
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
 * Every error SvelteKit catches passes here. One nobody expected goes through the logger, redacted,
 * never to `console.error`; the others (`error()` and SvelteKit's own, such as a 404) keep their
 * status and message. Each answer carries the request's id.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	const requestId = event.locals.requestId ?? crypto.randomUUID();
	if (kind !== "unknown") return { requestId };
	return reportUnexpectedError({ error, requestId, url: event.url });
};
