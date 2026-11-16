import { describe, expect, it } from "vitest";
import { securityHeaders, withSecurityHeaders } from "./headers.ts";

const HSTS = "Strict-Transport-Security";

const PERMISSIONS =
	"accelerometer=(), autoplay=(), camera=(), display-capture=(), " +
	"encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), " +
	"magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), " +
	"publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), " +
	"xr-spatial-tracking=()";

function request(host: string, headers: Record<string, string> = {}): Request {
	return new Request(`http://${host}/`, { headers: { host, ...headers } });
}

const fetchMetadata = { "sec-fetch-site": "same-origin" };

describe("securityHeaders", () => {
	it("always sets framing, sniffing, referrer, permissions, opener and resource headers", () => {
		expect(securityHeaders(request("192.168.1.20:3000"), undefined)).toEqual({
			"X-Frame-Options": "DENY",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "same-origin",
			"Permissions-Policy": PERMISSIONS,
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Resource-Policy": "same-origin",
		});
	});

	it("denies camera, microphone, geolocation and every other powerful feature, but not the clipboard", () => {
		const denied = PERMISSIONS.split(", ").map((entry) => {
			expect(entry).toMatch(/^[a-z-]+=\(\)$/);
			return entry.slice(0, -3);
		});

		expect(denied).toEqual(expect.arrayContaining(["camera", "microphone", "geolocation", "usb"]));
		expect(denied).not.toContain("clipboard-write");
	});

	it("sends HSTS when ORIGIN is https, without includeSubDomains", () => {
		const headers = securityHeaders(request("comradarr.example"), "https://comradarr.example");
		expect(headers[HSTS]).toBe("max-age=31536000");
	});

	it("sends no HSTS when ORIGIN is http, whatever the browser sent", () => {
		const headers = securityHeaders(
			request("comradarr.example", fetchMetadata),
			"http://comradarr.example",
		);
		expect(headers[HSTS]).toBeUndefined();
	});

	it("without ORIGIN, sends HSTS when the browser sent Sec-Fetch-Site to a real host name", () => {
		// Browsers send Sec-Fetch-Site only over HTTPS and to localhost and loopback addresses.
		const headers = securityHeaders(request("comradarr.example:8443", fetchMetadata), undefined);
		expect(headers[HSTS]).toBe("max-age=31536000");
	});

	it("without ORIGIN, sends no HSTS over plain HTTP, where browsers send no Sec-Fetch-Site", () => {
		expect(securityHeaders(request("192.168.1.20:3000"), undefined)[HSTS]).toBeUndefined();
	});

	it.each(["localhost:5173", "app.localhost", "127.0.0.1:3000", "127.8.9.10", "[::1]:3000"])(
		"without ORIGIN, sends no HSTS to %s, which gets Sec-Fetch-Site over plain HTTP too",
		(host) => {
			expect(securityHeaders(request(host, fetchMetadata), undefined)[HSTS]).toBeUndefined();
		},
	);
});

describe("withSecurityHeaders", () => {
	it("adds the headers to a response, keeping its own", () => {
		const response = withSecurityHeaders(
			new Response("ok", { headers: { "content-type": "text/plain" } }),
			{ "X-Frame-Options": "DENY" },
		);
		expect(response.headers.get("content-type")).toBe("text/plain");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});

	it("copies a response whose headers can't change, such as a redirect", async () => {
		const response = withSecurityHeaders(Response.redirect("http://a.test/setup", 303), {
			"X-Frame-Options": "DENY",
		});
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("http://a.test/setup");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});
});
