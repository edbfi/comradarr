import { ConfigError } from "./config-error.ts";

export type LogDebugEnv = { readonly COMRADARR_LOG_DEBUG?: string | undefined };

/** Whether debug log entries are written: `true` or `false`, off when unset or empty. */
export function readLogDebug(env: LogDebugEnv): boolean {
	const value = env.COMRADARR_LOG_DEBUG || undefined;
	if (value === undefined || value === "false") return false;
	if (value === "true") return true;
	throw new ConfigError("COMRADARR_LOG_DEBUG", "COMRADARR_LOG_DEBUG must be true or false");
}
