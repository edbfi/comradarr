import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogging } from "./logger.ts";
import { logRequest, pathWithoutValues } from "./request-line.ts";

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
		lines.push(String(chunk));
		const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
		done?.();
		return true;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	configureLogging({ debug: false });
});

const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("pathWithoutValues", () => {
	it("keeps the path and the parameters' names, and drops their values", () => {
		expect(pathWithoutValues(new URL("http://x/content?page=2&q=the%20office&flag"))).toBe(
			"/content?page=&q=&flag=",
		);
		expect(pathWithoutValues(new URL("http://x/setup"))).toBe("/setup");
	});
});

describe("logRequest", () => {
	const request = {
		method: "GET",
		url: new URL("http://x/setup?token=abc"),
		status: 200,
		size: 512,
		ms: 12.345,
		clientAddress: "192.0.2.7",
	};

	it("writes one info entry with the method, path, status, size, time and client address", () => {
		logRequest(request);

		expect(entries()).toEqual([
			expect.objectContaining({
				level: "info",
				source: "http",
				message: "request",
				metadata: {
					method: "GET",
					path: "/setup?token=[redacted]",
					status: 200,
					size: 512,
					ms: 12,
					clientAddress: "192.0.2.7",
				},
			}),
		]);
	});

	it("writes /healthz at debug, which is off unless debug logging is on", () => {
		logRequest({ ...request, url: new URL("http://x/healthz") });
		expect(entries()).toEqual([]);

		configureLogging({ debug: true });
		logRequest({ ...request, url: new URL("http://x/healthz") });
		expect(entries()).toEqual([expect.objectContaining({ level: "debug", message: "request" })]);
	});
});
