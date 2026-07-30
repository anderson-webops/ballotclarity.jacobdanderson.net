import assert from "node:assert/strict";
import test from "node:test";
import {
	buildForwardedForHeader,
	getTrustedClientAddress,
	parseFrontendTrustProxySetting,
} from "../server/utils/proxy-address.ts";

test("forwarded address chains append the direct peer and discard invalid values", () => {
	const request = {
		headers: {
			"x-forwarded-for": "spoofed.example, 203.0.113.10, 198.51.100.4",
		},
		socket: {
			remoteAddress: "::ffff:127.0.0.1",
		},
	};

	assert.equal(
		buildForwardedForHeader(request),
		"203.0.113.10, 198.51.100.4, 127.0.0.1"
	);
});

test("trusted proxy resolution stops at the nearest untrusted address", () => {
	const request = {
		headers: {
			"x-forwarded-for": "203.0.113.99, 198.51.100.4",
		},
		socket: {
			remoteAddress: "127.0.0.1",
		},
	};

	assert.equal(getTrustedClientAddress(request, "loopback"), "198.51.100.4");
});

test("untrusted direct peers cannot replace their address with a forwarded header", () => {
	const request = {
		headers: {
			"x-forwarded-for": "203.0.113.99",
		},
		socket: {
			remoteAddress: "198.51.100.4",
		},
	};

	assert.equal(getTrustedClientAddress(request, "loopback"), "198.51.100.4");
	assert.equal(getTrustedClientAddress(request, "false"), "198.51.100.4");
});

test("frontend proxy trust rejects broad and invalid settings", () => {
	assert.deepEqual(parseFrontendTrustProxySetting("loopback, 10.0.0.0/8"), ["loopback", "10.0.0.0/8"]);
	assert.throws(() => parseFrontendTrustProxySetting("true"), /broad boolean/u);
	assert.throws(() => parseFrontendTrustProxySetting("not-a-range"), /invalid proxy range/u);
});
