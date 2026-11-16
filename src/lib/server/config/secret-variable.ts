import { open } from "node:fs/promises";

/** The ways reading a secret from its variable or its file can fail. */
export type SecretVariableCheck = "missing" | "both-set" | "unreadable" | "too-large";

/**
 * Reading a secret failed `check`. The message names the variable(s) and never holds a variable's
 * value, so a secret set as the file's path by mistake is never echoed.
 */
export class SecretVariableError extends Error {
	override readonly name = "SecretVariableError";

	constructor(
		readonly check: SecretVariableCheck,
		message: string,
	) {
		super(message);
	}
}

const MAX_BYTES = 4096;

/**
 * Returns a secret's text and the variable it came from: the value of `value`, or the text of the
 * file `file` names, such as a Docker secret. Exactly one must be set, and an empty one counts as
 * unset. A file is read once, must be at most 4 KiB, and loses one trailing LF or CRLF; checking
 * the text is the caller's.
 */
export async function readSecretVariable<V extends string, F extends string>(
	env: Readonly<Partial<Record<V | F, string | undefined>>>,
	value: V,
	file: F,
): Promise<{ text: string; variable: V | F }> {
	const text = env[value] || undefined;
	const path = env[file] || undefined;
	if (text !== undefined && path !== undefined) {
		throw new SecretVariableError("both-set", `${value} and ${file} are both set; set only one`);
	}
	if (text !== undefined) return { text, variable: value };
	if (path === undefined) {
		throw new SecretVariableError("missing", `neither ${value} nor ${file} is set`);
	}
	const bytes = await readAtMost(path, file);
	// A leading BOM and invalid bytes stay in the text, so the caller's format check refuses them.
	const decoded = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
	return { text: decoded.replace(/\r?\n$/, ""), variable: file };
}

/** Reads the file at `path`, refusing one over `MAX_BYTES` without reading the rest. */
async function readAtMost(path: string, variable: string): Promise<Uint8Array> {
	// One byte more than the limit, so a full buffer means the file is too large. Size checks
	// can't be trusted here: devices, pipes and procfs report none, and a directory passes.
	const buffer = new Uint8Array(MAX_BYTES + 1);
	let length = 0;
	try {
		// A named pipe with no writer blocks here until one opens it; a non-blocking open would
		// instead fail a pipe whose writer is slow, so that limit is accepted.
		const handle = await open(path, "r");
		try {
			// A short read isn't the end of the file: pipes return their data in chunks.
			while (length < buffer.length) {
				const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
				if (bytesRead === 0) break;
				length += bytesRead;
			}
		} finally {
			await handle.close();
		}
	} catch (error) {
		throw new SecretVariableError(
			"unreadable",
			`${variable} names a file that can't be read (${errorCode(error)})`,
		);
	}
	if (length > MAX_BYTES) {
		throw new SecretVariableError("too-large", `${variable} names a file over 4 KiB`);
	}
	return buffer.subarray(0, length);
}

/** A system error's code, such as `ENOENT`; its message can hold the path, so it's never used. */
function errorCode(error: unknown): string {
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	return typeof code === "string" && /^E[A-Z0-9]+$/.test(code) ? code : "unknown error";
}
