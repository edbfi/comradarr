import { defineEnvVars, type EnvVarConfig } from "@sveltejs/kit/env";
import type { DatabaseUrlEnv } from "#lib/server/config/database-url.ts";
import type { LogDebugEnv } from "#lib/server/config/log-debug.ts";
import type { SecretKeyVariable } from "#lib/server/config/secret-key.ts";

// Optional and never throwing: SvelteKit's own validation would otherwise print its own message,
// which may hold a value, before the app checks it (SPEC-secrets.md, "Declaring the variables").
const optional = (value: string | undefined) => value;

/** Private and read when the app starts, never inlined into the build. */
export const variables = defineEnvVars({
	COMRADARR_SECRET_KEY: {
		schema: optional,
		description: "The master key: 32 bytes in canonical standard base64.",
	},
	COMRADARR_SECRET_KEY_FILE: {
		schema: optional,
		description: "The path of a file holding the master key, such as a Docker secret.",
	},
	COMRADARR_DATABASE_URL: {
		schema: optional,
		description: "The URL of the PostgreSQL role that owns Comradarr's database (D17).",
	},
	COMRADARR_DATABASE_URL_FILE: {
		schema: optional,
		description: "The path of a file holding the database URL, such as a Docker secret.",
	},
	COMRADARR_LOG_DEBUG: {
		schema: optional,
		description: "Whether debug log entries are written: true or false (off by default).",
	},
} satisfies Record<
	SecretKeyVariable | keyof DatabaseUrlEnv | keyof LogDebugEnv,
	EnvVarConfig<string | undefined>
>);
