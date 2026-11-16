import type { Problem } from "#lib/shared/errors/problem.ts";

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		/**
		 * What an error's answer holds: SvelteKit's status and message, and the request's id; an
		 * unexpected error's is also the error format's `internal_error` (SPEC-setup.md).
		 */
		interface Error extends Partial<Omit<Problem, "status">> {
			status: number;
			message: string;
			requestId?: string;
		}
		interface Locals {
			/** The request's id, which its log lines and audit entries carry. */
			requestId: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
