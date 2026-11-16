/**
 * PostgreSQL's own message for a failed statement. Drizzle wraps it in an error whose message
 * repeats the query and its parameters, which can hold what a statement sets, so the message comes
 * from the innermost cause.
 */
export function serverMessage(error: unknown): string {
	let inner = error;
	while (inner instanceof Error && inner.cause instanceof Error) inner = inner.cause;
	return inner instanceof Error ? inner.message : "unknown error";
}
