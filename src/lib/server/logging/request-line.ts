import { isHttpError, isRedirect } from "@sveltejs/kit";
import { createLogger } from "./logger.ts";

const log = createLogger("http");

/** What one request's log line records (SPEC-setup.md, "Logging"). */
export type RequestLine = {
	readonly method: string;
	readonly url: URL;
	readonly status: number;
	/** The response's size in bytes, when it declares one. */
	readonly size: number | undefined;
	readonly ms: number;
	readonly clientAddress: string;
};

/**
 * The status and size the client gets. SvelteKit turns a 200 whose `ETag` matches the request's
 * `If-None-Match` (a `W/` prefix ignored) into a 304 with no body after `handle` returns, so the
 * line follows the same rule (`@sveltejs/kit`, `runtime/server/respond.js`).
 */
export function sentStatusAndSize(
	ifNoneMatch: string | null,
	response: Response,
): { status: number; size: number | undefined } {
	const etag = response.headers.get("etag");
	const asked = ifNoneMatch?.startsWith('W/"') ? ifNoneMatch.slice(2) : ifNoneMatch;
	if (response.status === 200 && etag !== null && asked === etag) return { status: 304, size: 0 };
	const length = response.headers.get("content-length");
	return { status: response.status, size: length === null ? undefined : Number(length) };
}

/**
 * The client's address, or `unknown`: adapter-bun throws when `ADDRESS_HEADER` names a header the
 * request lacks, and a log line must never fail the response it records.
 */
export function clientAddress(event: { getClientAddress: () => string }): string {
	try {
		return event.getClientAddress();
	} catch {
		return "unknown";
	}
}

/**
 * The status SvelteKit answers with when a `handle` stage throws: an `error()` keeps its status and
 * a `redirect()` its 3xx; anything else is a 500.
 */
export function thrownStatus(thrown: unknown): number {
	if (isHttpError(thrown) || isRedirect(thrown)) return thrown.status;
	return 500;
}

/** The URL's path with its parameters' names but none of their values. */
export function pathWithoutValues(url: URL): string {
	const names = [...url.searchParams.keys()];
	return names.length === 0
		? url.pathname
		: `${url.pathname}?${names.map((name) => `${name}=`).join("&")}`;
}

/**
 * Logs one request when its response is ready: info, except `/healthz` at debug, since probes
 * would drown the log. Bodies are never logged.
 */
export function logRequest(request: RequestLine): void {
	const level = request.url.pathname === "/healthz" ? "debug" : "info";
	log[level]("request", {
		method: request.method,
		path: pathWithoutValues(request.url),
		status: request.status,
		size: request.size,
		ms: Math.round(request.ms),
		clientAddress: request.clientAddress,
	});
}
