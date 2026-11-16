import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/server/db/client.ts", () => ({ probeDatabase: async () => undefined }));
vi.mock("#lib/server/services/setup/startup.ts", () => ({ currentDatabase: () => ({}) }));

const { GET } = await import("./+server.ts");

describe("GET /healthz", () => {
	it("answers the overall and the database's status as JSON that is never cached", async () => {
		// The handler reads nothing from the request event.
		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			status: "healthy",
			components: { database: "healthy" },
		});
	});
});
