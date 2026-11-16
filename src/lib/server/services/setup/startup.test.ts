import { afterEach, describe, expect, it, vi } from "vitest";
import { startUp } from "./startup.ts";

afterEach(() => vi.restoreAllMocks());

describe("startUp", () => {
	it("writes its failure entry out before it throws, so a slow reader still gets it", async () => {
		let written = false;
		vi.spyOn(process.stdout, "write").mockImplementation((_chunk, ...rest: unknown[]) => {
			const done = rest.find((arg) => typeof arg === "function") as (() => void) | undefined;
			setTimeout(() => {
				written = true;
				done?.();
			}, 50);
			return true;
		});
		const key = crypto.getRandomValues(new Uint8Array(32)).toBase64();

		const failure = await startUp({ COMRADARR_SECRET_KEY: key, COMRADARR_LOG_DEBUG: "maybe" }).then(
			() => "started",
			() => (written ? "thrown after the write" : "thrown before the write"),
		);

		expect(failure).toBe("thrown after the write");
	});
});
