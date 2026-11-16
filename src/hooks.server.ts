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
import { accessDenied } from "#lib/server/security/access-denied.ts";
import { crossOriginAllowed } from "#lib/server/security/cross-origin.ts";
import { securityHeaders, withSecurityHeaders } from "#lib/server/security/headers.ts";
import { firstRunRedirect, gateAnswer } from "#lib/server/services/setup/first-run.ts";
import { currentOrigin, startUp } from "#lib/server/services/setup/startup.ts";
import { answerCaughtError } from "#lib/server/services/unexpected-error.ts";
import { building, dev } from "$app/env";
import * as env from "$app/env/private";

export const init: ServerInit = async () => {
	if (!building) await startUp(env, { dev });
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

/** The security headers on every response from here on, an early return from a later stage too. */
const headers: Handle = async ({ event, resolve }) =>
	withSecurityHeaders(await resolve(event), securityHeaders(event.request, currentOrigin()));

/**
 * The cross-origin check on every state-changing request, which replaces SvelteKit's own form
 * check; a refusal is returned, never thrown, so it keeps the language and the headers.
 */
const crossOrigin: Handle = ({ event, resolve }) =>
	crossOriginAllowed(
		{
			method: event.request.method,
			headers: event.request.headers,
			isSubRequest: event.isSubRequest,
		},
		currentOrigin(),
	)
		? resolve(event)
		: accessDenied(event.request, event.locals.requestId);

/**
 * The setup gate, the last stage: until first run is complete, every request but its current step,
 * `/healthz` and the CSP report endpoint is held back, returned so it keeps the headers.
 */
const setupGate: Handle = ({ event, resolve }) => {
	const step = firstRunRedirect(event.url.pathname);
	return step === undefined
		? resolve(event)
		: gateAnswer(event.request, step, event.locals.requestId);
};

export const handle = sequence(requestId, language, headers, crossOrigin, setupGate);

/**
 * Every error SvelteKit catches passes here: one nobody expected goes through the logger,
 * redacted, never to `console.error`, and is answered as the error format's `internal_error` in
 * the viewer's language; every answer carries the request's id. The id can be
 * missing although the type says otherwise: an error before `handle` runs, such as in `reroute`,
 * reaches this hook too.
 */
export const handleError: HandleServerError = ({ kind, error, event }) =>
	answerCaughtError({ kind, error, requestId: event.locals.requestId, url: event.url });
