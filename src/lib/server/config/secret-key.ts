import {
	readSecretVariable,
	type SecretVariableCheck,
	SecretVariableError,
} from "./secret-variable.ts";

/** The two variables a master key can come from (SPEC-secrets.md, "The master key"). */
export type SecretKeyEnv = {
	readonly COMRADARR_SECRET_KEY?: string | undefined;
	readonly COMRADARR_SECRET_KEY_FILE?: string | undefined;
};

export type SecretKeyVariable = keyof SecretKeyEnv;

/** The ways reading the key's text can fail. */
export type SecretKeyCheck = SecretVariableCheck;

/**
 * Reading the key's text failed `check`. The message names the variable(s) and never holds a
 * variable's value, so a key set as the file's path by mistake is never echoed.
 */
export class SecretKeyError extends Error {
	override readonly name = "SecretKeyError";

	constructor(
		readonly check: SecretKeyCheck,
		message: string,
	) {
		super(message);
	}
}

/**
 * Returns the master key's text and the variable it came from. Exactly one variable must be
 * set, and an empty one counts as unset. A file is read once, must be at most 4 KiB, and loses
 * one trailing LF or CRLF; checking the text is left to `decodeKeyText`.
 */
export async function readSecretKey(
	env: SecretKeyEnv,
): Promise<{ text: string; variable: SecretKeyVariable }> {
	try {
		return await readSecretVariable(env, "COMRADARR_SECRET_KEY", "COMRADARR_SECRET_KEY_FILE");
	} catch (error) {
		if (error instanceof SecretVariableError) throw new SecretKeyError(error.check, error.message);
		throw error;
	}
}
