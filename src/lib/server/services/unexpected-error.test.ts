import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerCaughtError, reportUnexpectedError } from "./unexpected-error.ts";

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

afterEach(() => vi.restoreAllMocks());

describe("reportUnexpectedError", () => {
	it("logs the error as one redacted entry with the request id, and answers generically", () => {
		const error = new Error("fetch http://owner:hunter2@db.internal/x failed");

		const answer = reportUnexpectedError({
			error,
			requestId: "req-9",
			url: new URL("http://x/setup?token=abc"),
		});

		expect(answer).toEqual({ message: "Something went wrong", requestId: "req-9" });
		expect(lines).toHaveLength(1);
		const entry = JSON.parse(lines[0] as string) as Record<string, unknown>;
		expect(entry).toMatchObject({
			level: "error",
			source: "http",
			message: "unexpected error",
			requestId: "req-9",
			metadata: { path: "/setup?token=[redacted]" },
		});
		expect(JSON.stringify(entry)).not.toContain("hunter2");
		expect((entry.metadata as { error: { message: string } }).error.message).toBe(
			"fetch http://[redacted]@db.internal/x failed",
		);
	});
});

describe("answerCaughtError", () => {
	const url = new URL("http://x/missing");

	it("leaves an error the app or SvelteKit raised unlogged, adding only the request id", () => {
		expect(answerCaughtError({ kind: "framework", error: {}, requestId: "req-1", url })).toEqual({
			requestId: "req-1",
		});
		expect(answerCaughtError({ kind: "app", error: {}, requestId: "req-2", url })).toEqual({
			requestId: "req-2",
		});
		expect(lines).toEqual([]);
	});

	it("reports an unknown error, and makes up an id when the request has none", () => {
		const answer = answerCaughtError({
			kind: "unknown",
			error: new Error("boom"),
			requestId: undefined,
			url,
		});

		expect(answer.requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] as string)).toMatchObject({ requestId: answer.requestId });
	});
});
