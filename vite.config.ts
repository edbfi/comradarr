import { paraglideVitePlugin } from "@inlang/paraglide-js";
import pandacss from "@pandacss/vite";
import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes mode for the app's own components; libraries keep their own mode.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
			adapter: adapter(),
			// A nonce on the app's own scripts and style elements, on every page; no page is
			// prerendered, so each gets its own. Style attributes alone may be inline: SvelteKit,
			// Svelte and Ark UI render them on the server (SPEC-setup.md, "The content security
			// policy"). `report-uri` only: with `report-to` too, Chromium sends no report over
			// plain HTTP.
			csp: {
				mode: "nonce",
				directives: {
					"default-src": ["self"],
					"script-src": ["self"],
					"style-src": ["self"],
					"style-src-elem": ["self"],
					"style-src-attr": ["unsafe-inline"],
					"img-src": ["self", "data:"],
					"font-src": ["self"],
					"connect-src": ["self"],
					"frame-ancestors": ["none"],
					"frame-src": ["none"],
					"object-src": ["none"],
					"base-uri": ["self"],
					"form-action": ["self"],
					"report-uri": ["/api/csp-report"],
				},
			},
		}),
		// Static css() calls become class strings at build time, so no styling runtime ships.
		pandacss({ transform: true }),
		paraglideVitePlugin({ project: "./project.inlang" }),
	],
	// The dev server serves the generated Panda runtime.
	server: { fs: { allow: ["styled-system"] } },
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		// One PostgreSQL for the run, for the tests that need a database (SPEC-setup.md).
		globalSetup: ["tests/database.ts"],
		expect: { requireAssertions: true },
	},
});
