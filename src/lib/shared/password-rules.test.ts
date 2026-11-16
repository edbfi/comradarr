import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordRules } from "./password-rules.ts";

const ALL_MET = { length: true, pattern: true, appName: true, username: true };

describe("passwordRules", () => {
	it("counts code points after NFC, so the page shows the count the server checks", () => {
		expect(MIN_PASSWORD_LENGTH).toBe(15);
		expect(MAX_PASSWORD_LENGTH).toBe(128);
		// "é" written as "e" plus a combining accent: two code units, one code point after NFC.
		expect(passwordRules("é".repeat(3), "owner").length).toBe(3);
		expect(passwordRules("😀😀", "owner").length).toBe(2);
	});

	it("meets every rule for a long password with neither the app's name nor the username", () => {
		expect(passwordRules("violet harbour lanterns", "owner")).toEqual({ length: 23, met: ALL_MET });
	});

	it.each([
		["a".repeat(14), { length: false, pattern: false }],
		["shorter than15", { length: false }],
		[`${"😀".repeat(128)}x`, { length: false }],
		["abcdefghijklmnop", { pattern: false }],
		["the comradarr password", { appName: false }],
		["the ComRadarr password", { appName: false }],
		["violet owner harbour lanterns", { username: false }],
	])("marks the rules %j breaks", (password, broken) => {
		expect(passwordRules(password, "owner").met).toEqual({ ...ALL_MET, ...broken });
	});

	it("reads the username as the server stores it: trimmed and NFC, from 4 code points", () => {
		expect(passwordRules("violet owner harbour lanterns", "  Owner  ").met.username).toBe(false);
		expect(passwordRules("violet bob harbour lanterns", "bob").met.username).toBe(true);
		expect(passwordRules("violet åse harbour lanterns", "åse").met.username).toBe(true);
		expect(passwordRules("violet åsen harbour lanterns", "Åsen").met.username).toBe(false);
	});
});
