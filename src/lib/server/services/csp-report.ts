import { createLogger } from "#lib/server/logging/logger.ts";

const log = createLogger("csp");

/** The largest report read; the rest of a larger body is never read. */
const MAX_BYTES = 16 * 1024;

/** How long each logged string may be. */
const MAX_TEXT = 200;

/**
 * The CSP report endpoint (SPEC-setup.md, "The CSP report endpoint"): it takes only
 * `application/csp-report`, reads at most 16 KB whatever the declared length, and logs each
 * violation at warning with bounded context. It answers 204 to everything that reaches it,
 * accepted or not, so a prober learns nothing.
 */
export async function reportCspViolation(request: Request): Promise<Response> {
	const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
	if (type === "application/csp-report") {
		const report = parseReport(await readAtMost(request, MAX_BYTES));
		if (report !== undefined) log.warn("content security policy violation", report);
	}
	return new Response(null, { status: 204 });
}

/** The body as text, or undefined when it is larger than `limit` bytes. */
async function readAtMost(request: Request, limit: number): Promise<string | undefined> {
	const reader = request.body?.getReader();
	if (reader === undefined) return undefined;
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.length;
			if (length > limit) return undefined;
			chunks.push(value);
		}
	} catch {
		return undefined;
	} finally {
		await reader.cancel().catch(() => {});
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The violation's bounded context, or undefined for anything that isn't a CSP report. */
function parseReport(text: string | undefined): Record<string, string | number> | undefined {
	if (text === undefined) return undefined;
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return undefined;
	}
	const report = (body as { "csp-report"?: unknown } | null)?.["csp-report"];
	if (typeof report !== "object" || report === null || Array.isArray(report)) return undefined;
	const field = (name: string) => {
		const value = (report as Record<string, unknown>)[name];
		return typeof value === "string" ? value.slice(0, MAX_TEXT) : undefined;
	};
	const line = (report as Record<string, unknown>)["line-number"];
	const context: Record<string, string | number> = {};
	const directive = field("effective-directive") ?? field("violated-directive");
	if (directive !== undefined) context.directive = directive;
	const blocked = field("blocked-uri");
	if (blocked !== undefined) context.blocked = (originOf(blocked) ?? blocked).slice(0, MAX_TEXT);
	const page = URL.parse(field("document-uri") ?? "");
	if (page !== null) context.page = page.pathname.slice(0, MAX_TEXT);
	if (typeof line === "number" && Number.isInteger(line)) context.line = line;
	// A report with nothing this endpoint reads is not worth a warning.
	return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Where a blocked address came from, never its path or query: its origin, or, for one without
 * (an extension's or a `data:` address), its scheme and host. Undefined for a keyword such as
 * `inline` or `eval`. The parser can lengthen a host into punycode, so the caller cuts the result.
 */
function originOf(value: string): string | undefined {
	const url = URL.parse(value);
	if (url === null) return undefined;
	if (url.origin !== "null") return url.origin;
	const scheme = url.protocol.slice(0, -1);
	return url.host === "" ? scheme : `${scheme}://${url.host}`;
}
