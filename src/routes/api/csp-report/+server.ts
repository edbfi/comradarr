import { reportCspViolation } from "#lib/server/services/csp-report.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ request }) => reportCspViolation(request);
