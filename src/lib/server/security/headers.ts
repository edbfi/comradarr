/**
 * The powerful features the app doesn't use, denied to every page. Writing to the clipboard stays
 * allowed for the copy buttons later modules add (SPEC-setup.md, "Security headers").
 */
const DENIED_FEATURES = [
	"accelerometer",
	"autoplay",
	"browsing-topics",
	"camera",
	"display-capture",
	"encrypted-media",
	"fullscreen",
	"geolocation",
	"gyroscope",
	"hid",
	"idle-detection",
	"magnetometer",
	"microphone",
	"midi",
	"payment",
	"picture-in-picture",
	"publickey-credentials-get",
	"screen-wake-lock",
	"serial",
	"usb",
	"xr-spatial-tracking",
];

/** The headers every response that passes through `handle` gets (SPEC-setup.md). */
const ALWAYS = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	// Never `no-referrer`, which makes browsers send `Origin: null` on the app's own form posts.
	"Referrer-Policy": "same-origin",
	"Permissions-Policy": DENIED_FEATURES.map((feature) => `${feature}=()`).join(", "),
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
} as const;

/**
 * Never `includeSubDomains`: Sonarr or Radarr on a subdomain over plain HTTP would become
 * unreachable from that browser for a year. Never `preload`, which is the operator's decision.
 */
const HSTS = "max-age=31536000";

/**
 * The security headers for `request`. Strict transport is sent only over HTTPS, known when
 * `origin` (from `ORIGIN`) is https, or, without it, when the browser sent `Sec-Fetch-Site` to a
 * host that isn't localhost or a loopback address: browsers send it only to HTTPS and those hosts.
 */
export function securityHeaders(
	request: Request,
	origin: string | undefined,
): Record<string, string> {
	const https =
		origin === undefined
			? request.headers.has("sec-fetch-site") && !isLocalHost(request.headers.get("host") ?? "")
			: origin.startsWith("https:");
	return https ? { ...ALWAYS, "Strict-Transport-Security": HSTS } : { ...ALWAYS };
}

/** `localhost`, `*.localhost`, `127.0.0.0/8` or `[::1]`, with or without a port. */
function isLocalHost(host: string): boolean {
	const name = (host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0])
		?.toLowerCase()
		.replace(/\.$/, "");
	if (name === undefined || name === "") return false;
	return (
		name === "localhost" ||
		name.endsWith(".localhost") ||
		name === "[::1]" ||
		/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
	);
}

/**
 * `response` with `headers` set. A response whose headers can't change, such as one from
 * `Response.redirect` or `fetch`, is copied first.
 */
export function withSecurityHeaders(response: Response, headers: Record<string, string>): Response {
	try {
		for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value);
		return copy;
	}
}
