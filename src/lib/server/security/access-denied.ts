import { getLocale } from "#lib/paraglide/runtime.js";
import { problem } from "#lib/shared/errors/problem.ts";

/**
 * The page's own policy: it is built here and never passes through SvelteKit's renderer, and it
 * has no scripts, styles or fonts to load, so it allows nothing (SPEC-setup.md, "The content
 * security policy").
 */
const POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * The 403 for a request the cross-origin check refused, in the viewer's language: the error format's
 * `access_denied`, with the request's id, for a caller that wants JSON; otherwise the "Access
 * denied" page. Until `sign-in` builds the error pages, the page is the title and its one line.
 * Its policy allows no style, so it sets its dark colour scheme with a meta tag.
 */
export function accessDenied(request: Request, requestId: string): Response {
	const refusal = problem("access_denied", { requestId });
	if (wantsJson(request)) {
		return Response.json(refusal, { status: 403, headers: { "cache-control": "no-store" } });
	}
	const html = `<!doctype html>
<html lang="${escapeHtml(getLocale())}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(refusal.title)}</title>
</head>
<body>
<h1>${escapeHtml(refusal.title)}</h1>
<p>${escapeHtml(refusal.detail)}</p>
</body>
</html>
`;
	return new Response(html, {
		status: 403,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": POLICY,
			"cache-control": "no-store",
		},
	});
}

/** A caller that asks for JSON and not for a page. */
function wantsJson(request: Request): boolean {
	const accept = request.headers.get("accept") ?? "";
	return accept.includes("application/json") && !accept.includes("text/html");
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
