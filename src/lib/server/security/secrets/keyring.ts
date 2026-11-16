import {
	readSecretKey,
	type SecretKeyCheck,
	type SecretKeyEnv,
	SecretKeyError,
	type SecretKeyVariable,
} from "#lib/server/config/secret-key.ts";
import { decodeKeyText, type KeyCheck, KeyTextError } from "./key-text.ts";
import { Secret } from "./secret.ts";

/**
 * What the master key derives (SPEC-secrets.md, "Derivation"): the cipher's keys, and the password
 * of each database role startup creates (D17; SPEC-setup.md, "Roles").
 */
export type Keyring = {
	readonly keyId: string;
	readonly aesKey: CryptoKey;
	readonly rolePasswords: { readonly app: Secret; readonly auditAdmin: Secret };
};

/** The checks loading the master key can fail: reading its text, then the text itself. */
export type KeyringCheck = SecretKeyCheck | KeyCheck;

/**
 * Loading the master key failed `check`. The message is one line naming the variable and the
 * check, and never holds key text. The error has no other fields, not even a `cause`: Bun prints
 * an uncaught error's own fields and its whole `cause` chain.
 */
export class KeyringError extends Error {
	override readonly name = "KeyringError";

	constructor(
		readonly check: KeyringCheck,
		message: string,
	) {
		super(message);
	}
}

const AES_INFO = "edbfi:secrets:v1:aes-256-gcm";
const KEY_ID_INFO = "edbfi:secrets:v1:key-id";
const APP_ROLE_INFO = "edbfi:database-role:v1:app";
const AUDIT_ADMIN_ROLE_INFO = "edbfi:database-role:v1:audit-admin";
const FIX =
	"if Comradarr has run before, set the key it ran with; otherwise generate one with: openssl rand -base64 32";
const SUBJECT: Record<SecretKeyVariable, string> = {
	COMRADARR_SECRET_KEY: "COMRADARR_SECRET_KEY",
	COMRADARR_SECRET_KEY_FILE: "the key in the file COMRADARR_SECRET_KEY_FILE names",
};

let loaded: Keyring | undefined;
let latestLoad = 0;

/**
 * Reads and checks the master key, then derives the cipher's keys and keeps them for
 * `currentKeyring`. Any failure leaves no keyring loaded; when loads overlap, only the one started
 * last can store its keyring.
 */
export async function loadKeyring(env: SecretKeyEnv): Promise<void> {
	loaded = undefined;
	const load = ++latestLoad;

	let subject = "";
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		const { text, variable } = await readSecretKey(env);
		subject = SUBJECT[variable];
		bytes = decodeKeyText(text);
	} catch (error) {
		// Losing a variable looks like a first install, so the existing key comes first. A key
		// that can't be read may be valid and in use: a new one would lose every stored secret.
		if (error instanceof SecretKeyError) {
			const message = error.check === "missing" ? `${error.message}; ${FIX}` : error.message;
			throw new KeyringError(error.check, message);
		}
		// A key in use reaches these checks too, by a typo, so the fix puts it first.
		if (error instanceof KeyTextError) {
			throw new KeyringError(error.check, `${subject} ${error.message}; ${FIX}`);
		}
		throw error;
	}

	// The HKDF key stays here: whoever holds it can derive the AES key's bytes with `deriveBits`.
	const base = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
		"deriveKey",
		"deriveBits",
	]);
	const [aesKey, keyIdBits, appBits, auditAdminBits] = await Promise.all([
		crypto.subtle.deriveKey(hkdf(AES_INFO), base, { name: "AES-GCM", length: 256 }, false, [
			"encrypt",
			"decrypt",
		]),
		crypto.subtle.deriveBits(hkdf(KEY_ID_INFO), base, 128),
		crypto.subtle.deriveBits(hkdf(APP_ROLE_INFO), base, 256),
		crypto.subtle.deriveBits(hkdf(AUDIT_ADMIN_ROLE_INFO), base, 256),
	]);
	const keyId = base64url(keyIdBits);
	const rolePasswords = Object.freeze({
		app: new Secret(base64url(appBits)),
		auditAdmin: new Secret(base64url(auditAdminBits)),
	});
	if (load === latestLoad) loaded = Object.freeze({ keyId, aesKey, rolePasswords });
}

/** The keyring of the latest successful load; throws if none is loaded. */
export function currentKeyring(): Keyring {
	if (loaded === undefined) {
		throw new Error("no master key is loaded; loadKeyring must succeed first");
	}
	return loaded;
}

const base64url = (bits: ArrayBuffer) =>
	new Uint8Array(bits).toBase64({ alphabet: "base64url", omitPadding: true });

/** HKDF-SHA-256 with an empty salt and `info` as its label. */
function hkdf(info: string): HkdfParams {
	return {
		name: "HKDF",
		hash: "SHA-256",
		salt: new Uint8Array(0),
		info: new TextEncoder().encode(info),
	};
}
