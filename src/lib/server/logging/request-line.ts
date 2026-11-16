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
