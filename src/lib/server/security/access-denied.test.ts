import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { accessDenied } from "./access-denied.ts";

const POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The refusal for a request from a browser that prefers `language` and accepts `accept`. */
async function refusal(language: string, accept: string): Promise<Response> {
	const request = new Request("http://comradarr.example/", {
		method: "POST",
		headers: { "accept-language": language, accept },
	});
	let response: Response | undefined;
	await paraglideMiddleware(request, ({ request: translated }) => {
		response = accessDenied(translated, "req-7");
		return response;
	});
	if (response === undefined) throw new Error("no response");
	return response;
}

describe("accessDenied", () => {
	it.each([
		["en", "Access denied", "The request was refused because it didn't come from this site."],
		["da", "Adgang nægtet", "Anmodningen blev afvist, fordi den ikke kom fra dette websted."],
	])(
		"is a 403 page in the viewer's language (%s), with its own fixed policy and no style",
		async (language, title, description) => {
			const response = await refusal(language, "text/html,application/xhtml+xml");

			expect(response.status).toBe(403);
			expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
			expect(response.headers.get("content-security-policy")).toBe(POLICY);
			expect(response.headers.get("cache-control")).toBe("no-store");
			const html = await response.text();
			expect(html).toContain(`<html lang="${language}">`);
			expect(html).toContain('<meta name="color-scheme" content="dark">');
			expect(html).toContain(`<title>${title}</title>`);
			expect(html).toContain(`<h1>${title}</h1>`);
			expect(html).toContain(`<p>${description.replace("'", "&#39;")}</p>`);
			expect(html).not.toMatch(/<script|<link|<style|style=/);
		},
	);

	it.each([
		["en", "Access denied", "The request was refused because it didn't come from this site."],
		["da", "Adgang nægtet", "Anmodningen blev afvist, fordi den ikke kom fra dette websted."],
	])(
		"is the error format for a caller that wants JSON (%s), with the request id",
		async (language, title, detail) => {
			const response = await refusal(language, "application/json");

			expect(response.status).toBe(403);
			expect(response.headers.get("content-type")).toMatch(/^application\/json/);
			expect(response.headers.get("cache-control")).toBe("no-store");
			expect(await response.json()).toEqual({
				type: "access_denied",
				title,
				status: 403,
				detail,
				requestId: "req-7",
			});
		},
	);

	it("is a page for a browser that accepts anything, or that wants JSON and a page alike", async () => {
		for (const accept of ["*/*", "application/json, text/html"]) {
			const response = await refusal("en", accept);
			expect(response.headers.get("content-type"), accept).toBe("text/html; charset=utf-8");
		}
	});
});
