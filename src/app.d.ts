// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		/** What an unexpected error's answer holds: a generic message and the request's id. */
		interface Error {
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

export {};
