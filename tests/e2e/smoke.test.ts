import { expect, test } from "@playwright/test";

test("/ serves the placeholder page, hydrated and styled, without console errors", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));

	const response = await page.goto("/");
	expect(response?.status()).toBe(200);

	const heading = page.getByRole("heading", { level: 1, name: "Comradarr is being rebuilt." });
	await expect(heading).toBeVisible();
	// Set by the root layout once the client has hydrated: server HTML alone doesn't pass.
	await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
	// Panda tokens: the dark-mode background and the h1 text style.
	await expect(page.locator("body")).toHaveCSS("background-color", "rgb(16, 28, 53)");
	await expect(heading).toHaveCSS("font-size", "32px");
	// DESIGN.md's typefaces, bundled with the app: the heading renders in Source Sans 3, and both
	// families load from the app's own address, never a remote font service.
	await expect(heading).toHaveCSS("font-family", /^"Source Sans 3 Variable"/);
	const fonts = await page.evaluate(async () => {
		await document.fonts.ready;
		return {
			// `load` finds the registered faces; `check` would pass with none registered at all.
			sans: await document.fonts
				.load('600 32px "Source Sans 3 Variable"')
				.then((faces) => faces.length > 0),
			mono: await document.fonts.load('400 16px "IBM Plex Mono"').then((faces) => faces.length > 0),
			sources: performance
				.getEntriesByType("resource")
				.map((entry) => entry.name)
				.filter((name) => name.endsWith(".woff2"))
				.map((name) => new URL(name).origin),
		};
	});
	expect(fonts.sans).toBe(true);
	expect(fonts.mono).toBe(true);
	expect(new Set(fonts.sources)).toEqual(new Set([new URL(page.url()).origin]));

	expect(errors).toEqual([]);
});

test("/healthz reports the overall and the database's status, also to HEAD", async ({
	request,
}) => {
	const response = await request.get("/healthz");
	expect(response.status()).toBe(200);
	expect(response.headers()["cache-control"]).toBe("no-store");
	expect(await response.json()).toEqual({
		status: "healthy",
		components: { database: "healthy" },
	});

	const head = await request.head("/healthz");
	expect(head.status()).toBe(200);
	expect(await head.text()).toBe("");
});
