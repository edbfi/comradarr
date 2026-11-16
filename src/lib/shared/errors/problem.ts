import { m } from "#lib/paraglide/messages.js";

/**
 * Each error type's status and messages: its title is `error_<type>_title` and its detail
 * `error_<type>_description`, in the viewer's language. The type is a stable id that callers read.
 */
const TYPES = {
	access_denied: {
		status: 403,
		title: m.error_access_denied_title,
		detail: m.error_access_denied_description,
	},
	setup_incomplete: {
		status: 503,
		title: m.error_setup_incomplete_title,
		detail: m.error_setup_incomplete_description,
	},
	internal_error: {
		status: 500,
		title: m.error_internal_error_title,
		detail: m.error_internal_error_description,
	},
};

export type ProblemType = keyof typeof TYPES;

/** Every error type, for tests that go through them all. */
export const PROBLEM_TYPES = Object.keys(TYPES) as ProblemType[];

/**
 * The one shape of every error the app answers in JSON (SPEC-setup.md, "The error format"):
 * `fields` holds per-field errors and `context` the domain's context, both left out when empty.
 */
export type Problem = {
	type: ProblemType;
	title: string;
	status: number;
	detail: string;
	requestId?: string;
	fields?: Record<string, string>;
	context?: Record<string, unknown>;
};

/** The error `type` in the viewer's language, with the request's id and anything else it carries. */
export function problem(
	type: ProblemType,
	extra: {
		requestId?: string;
		fields?: Record<string, string>;
		context?: Record<string, unknown>;
	} = {},
): Problem {
	const { status, title, detail } = TYPES[type];
	const { requestId, fields, context } = extra;
	return {
		type,
		title: title(),
		status,
		detail: detail(),
		...(requestId === undefined ? {} : { requestId }),
		...(fields === undefined || Object.keys(fields).length === 0 ? {} : { fields }),
		...(context === undefined || Object.keys(context).length === 0 ? {} : { context }),
	};
}
