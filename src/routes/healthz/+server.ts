import { checkHealth, healthResponse } from "#lib/server/services/health.ts";
import { currentDatabase } from "#lib/server/services/setup/startup.ts";
import type { RequestHandler } from "./$types";

// HEAD is answered from GET, without the body (SvelteKit).
export const GET: RequestHandler = async () => healthResponse(await checkHealth(currentDatabase()));
