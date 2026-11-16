import { describe, expect, it } from "vitest";
import { wantsJson } from "./json-caller.ts";

const asking = (accept?: string) =>
	wantsJson(new Request("http://x/", accept === undefined ? {} : { headers: { accept } }));

describe("wantsJson", () => {
	it("is true for a caller that asks for JSON and not for a page", () => {
		expect(asking("application/json")).toBe(true);
		expect(asking("application/json, text/plain")).toBe(true);
	});

	it("is false for a browser, one that accepts anything, or no Accept at all", () => {
		expect(asking("text/html,application/xhtml+xml")).toBe(false);
		expect(asking("application/json, text/html")).toBe(false);
		expect(asking("*/*")).toBe(false);
		expect(asking()).toBe(false);
	});
});
