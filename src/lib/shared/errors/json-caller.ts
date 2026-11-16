/**
 * A caller that asks for JSON and not for a page, which gets an error in the error format instead
 * of a page (SPEC-setup.md, "The error format"). A browser that accepts anything gets the page.
 */
export function wantsJson(request: Request): boolean {
	const accept = request.headers.get("accept") ?? "";
	return accept.includes("application/json") && !accept.includes("text/html");
}
