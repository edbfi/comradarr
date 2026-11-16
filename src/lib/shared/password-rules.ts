/**
 * The owner's password rules the browser can check as the person types, which the server's
 * `checkPassword` applies too, so the page never shows a rule as met that the server then refuses
 * (SPEC-setup.md, "Owner credentials"). The list of common passwords stays on the server.
 */

export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;

/** The app's name, which a password may not contain, in any case. */
const APP_NAME = "comradarr";

/** Each rule, met or not. */
export type PasswordRulesMet = {
	/** 15 to 128 code points. */
	length: boolean;
	/** Not one unit of up to 4 repeated, nor one straight run up or down. */
	pattern: boolean;
	/** Without the app's name. */
	appName: boolean;
	/** Without the username, once it has 4 or more code points. */
	username: boolean;
};

/** One step of a straight run: the next code point, with digits running on from 9 to 0. */
const DIGIT_WRAP: Record<string, string> = { "9": "0" };
const follows = (a: string, b: string) =>
	DIGIT_WRAP[a] === b || b.codePointAt(0) === (a.codePointAt(0) ?? 0) + 1;

/**
 * Whether the whole password, as code points, is one unit of up to 4 repeated (a last repeat may
 * be cut short) or one straight run up or down: what an online guesser tries first.
 */
function isPattern(chars: string[]): boolean {
	for (let unit = 1; unit <= 4; unit++) {
		if (chars.every((char, i) => i < unit || char === chars[i - unit])) return true;
	}
	const pairs = chars.slice(1).map((char, i) => [chars[i], char] as const);
	return pairs.every(([a, b]) => follows(a, b)) || pairs.every(([a, b]) => follows(b, a));
}

/**
 * The password's length in code points after NFC, and which rules it meets, for `username` as the
 * server stores it (trimmed and NFC). Case is ignored; it is lower-cased code point by code point
 * for the pattern, since the whole string's lower case can end in a final "ς" or turn "İ" into two
 * code points, which would hide a repeat.
 */
export function passwordRules(
	raw: string,
	username: string,
): { length: number; met: PasswordRulesMet } {
	const password = raw.normalize("NFC");
	const chars = [...password];
	const lower = password.toLowerCase();
	// The username's length is counted as written: lower-casing can lengthen it ("İ" becomes two).
	const name = username.trim().normalize("NFC");
	return {
		length: chars.length,
		met: {
			length: chars.length >= MIN_PASSWORD_LENGTH && chars.length <= MAX_PASSWORD_LENGTH,
			pattern: !isPattern(chars.map((char) => char.toLowerCase())),
			appName: !lower.includes(APP_NAME),
			username: [...name].length < 4 || !lower.includes(name.toLowerCase()),
		},
	};
}
