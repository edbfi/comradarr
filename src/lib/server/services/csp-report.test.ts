import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportCspViolation } from "./csp-report.ts";

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		(rest.find((arg) => typeof arg === "function") as (() => void) | undefined)?.();
		return true;
	});
});

afterEach(() => vi.restoreAllMocks());

const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

const report = (body: unknown, type = "application/csp-report") =>
	new Request("http://x/api/csp-report", {
		method: "POST",
		headers: { "content-type": type },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});

const violation = {
	"csp-report": {
		"document-uri": "http://comradarr.local/setup?token=abc#x",
		"effective-directive": "style-src-elem",
		"violated-directive": "style-src-elem",
		"blocked-uri": "https://evil.test/a/b.css?q=1",
		"line-number": 12,
		"source-file": "http://comradarr.local/_app/x.js",
	},
};

describe("reportCspViolation", () => {
	it("logs a violation with bounded context and answers 204", async () => {
		const response = await reportCspViolation(report(violation));

		expect(response.status).toBe(204);
		expect(entries()).toEqual([
			expect.objectContaining({
				level: "warn",
				source: "csp",
				message: "content security policy violation",
				metadata: {
					directive: "style-src-elem",
					blocked: "https://evil.test",
					page: "/setup",
					line: 12,
				},
			}),
		]);
	});

	it("keeps a keyword such as inline as the blocked value, and cuts each string to 200 characters", async () => {
		await reportCspViolation(
			report({
				"csp-report": {
					"document-uri": "http://comradarr.local/",
					"effective-directive": "x".repeat(500),
					"blocked-uri": "inline",
				},
			}),
		);

		const metadata = entries()[0]?.metadata as Record<string, string>;
		expect(metadata.blocked).toBe("inline");
		expect(metadata.directive).toHaveLength(200);
	});

	it.each([
		["another content type", report(violation, "application/json")],
		["a body that isn't JSON", report("{nope")],
		["JSON without a report", report({ other: 1 })],
		["a body over 16 KB", report(JSON.stringify(violation) + " ".repeat(17_000))],
	])("answers 204 to %s and logs nothing", async (_, request) => {
		const response = await reportCspViolation(request);

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(lines).toEqual([]);
	});

	it("stops reading an oversized body at the cap, whatever its declared length", async () => {
		let pulled = 0;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1024;
				controller.enqueue(new Uint8Array(1024).fill(32));
			},
		});
		const request = new Request("http://x/api/csp-report", {
			method: "POST",
			headers: { "content-type": "application/csp-report", "content-length": "10" },
			body: endless,
			duplex: "half",
		} as RequestInit);

		expect((await reportCspViolation(request)).status).toBe(204);
		expect(pulled).toBeLessThan(64 * 1024);
	});
});
