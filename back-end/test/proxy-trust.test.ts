import assert from "node:assert/strict";
import test from "node:test";
import { parseTrustProxySetting } from "../src/proxy-trust.js";

test("proxy trust accepts explicit ranges and rejects broad trust", () => {
	assert.equal(parseTrustProxySetting("false"), false);
	assert.deepEqual(parseTrustProxySetting("loopback, 10.20.0.0/16"), [
		"loopback",
		"10.20.0.0/16",
	]);
	assert.deepEqual(parseTrustProxySetting("::1"), ["::1"]);
	assert.throws(() => parseTrustProxySetting("true"), /broad boolean/u);
	assert.throws(() => parseTrustProxySetting("1"), /hop-count/u);
	assert.throws(() => parseTrustProxySetting("not-a-range"), /invalid proxy range/u);
});
