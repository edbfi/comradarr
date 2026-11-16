import { describe, expect, it } from "vitest";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import da from "../../../../messages/da.json";
import en from "../../../../messages/en.json";
import { PROBLEM_TYPES, type ProblemType, problem } from "./problem.ts";

/** `problem(type, …)` as a viewer who prefers `language` gets it. */
async function inLanguage(language: string, build: () => unknown): Promise<unknown> {
	const request = new Request("http://x/", { headers: { "accept-language": language } });
	let built: unknown;
	await paraglideMiddleware(request, () => {
		built = build();
		return new Response();
	});
	return built;
}

describe("problem", () => {
	it.each(PROBLEM_TYPES)("takes %s's title and detail from its message keys", (type) => {
		expect(en).toHaveProperty(`error_${type}_title`);
		expect(en).toHaveProperty(`error_${type}_description`);
		expect(da).toHaveProperty(`error_${type}_title`);
		expect(da).toHaveProperty(`error_${type}_description`);
	});

	it.each([
		["en", en],
		["da", da],
	] as const)("is in the viewer's language (%s)", async (language, messages) => {
		const built = await inLanguage(language, () => problem("access_denied", { requestId: "r-1" }));

		expect(built).toEqual({
			type: "access_denied",
			title: messages.error_access_denied_title,
			status: 403,
			detail: messages.error_access_denied_description,
			requestId: "r-1",
		});
	});

	it.each([
		["access_denied", 403],
		["internal_error", 500],
	] as [ProblemType, number][])("gives %s the status %i", (type, status) => {
		expect(problem(type).status).toBe(status);
	});

	it("keeps fields and context only when they hold something", () => {
		expect(problem("internal_error", { fields: {}, context: {} })).not.toHaveProperty("fields");
		expect(problem("internal_error", { fields: {}, context: {} })).not.toHaveProperty("context");
		expect(problem("internal_error")).not.toHaveProperty("requestId");

		const full = problem("internal_error", { fields: { name: "x" }, context: { id: 1 } });

		expect(full.fields).toEqual({ name: "x" });
		expect(full.context).toEqual({ id: 1 });
	});
});
