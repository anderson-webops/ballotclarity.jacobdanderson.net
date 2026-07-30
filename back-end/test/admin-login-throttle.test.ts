import assert from "node:assert/strict";
import test from "node:test";
import { createAdminLoginThrottle } from "../src/admin-login-throttle.js";

test("admin login throttling protects both accounts and source addresses", () => {
	const throttle = createAdminLoginThrottle({
		accountMaxAttempts: 2,
		ipMaxAttempts: 3,
		lockoutMs: 60_000,
		windowMs: 60_000,
	});

	const firstAccount = throttle.check("editor", "203.0.113.10");
	throttle.recordFailure(firstAccount.keys);
	const secondAccount = throttle.check("editor", "203.0.113.11");
	throttle.recordFailure(secondAccount.keys);

	assert.equal(throttle.check("editor", "203.0.113.12").allowed, false);

	const firstSpray = throttle.check("user-one", "203.0.113.20");
	throttle.recordFailure(firstSpray.keys);
	const secondSpray = throttle.check("user-two", "203.0.113.20");
	throttle.recordFailure(secondSpray.keys);
	const thirdSpray = throttle.check("user-three", "203.0.113.20");
	throttle.recordFailure(thirdSpray.keys);

	assert.equal(throttle.check("user-four", "203.0.113.20").allowed, false);
	assert.equal(throttle.check("user-four", "203.0.113.21").allowed, true);
});

test("admin login throttling fails closed without growing beyond its bucket cap", () => {
	const throttle = createAdminLoginThrottle({
		accountMaxAttempts: 5,
		ipMaxAttempts: 5,
		maxBuckets: 2,
		windowMs: 60_000,
	});
	const first = throttle.check("editor-one", "203.0.113.30");

	assert.equal(first.allowed, true);
	throttle.recordFailure(first.keys);

	const capacityLimited = throttle.check("editor-two", "203.0.113.31");

	assert.equal(capacityLimited.allowed, false);
	assert.equal(capacityLimited.capacityLimited, true);
	assert.ok(capacityLimited.retryAfterSeconds >= 1);

	throttle.recordFailure(capacityLimited.keys);
	assert.equal(throttle.check("editor-two", "203.0.113.31").capacityLimited, true);
});

test("admin login throttling rejects invalid direct limits", () => {
	assert.throws(
		() => createAdminLoginThrottle({ maxBuckets: Number.POSITIVE_INFINITY }),
		/maxBuckets must be a positive integer/u,
	);
	assert.throws(
		() => createAdminLoginThrottle({ accountMaxAttempts: 0 }),
		/accountMaxAttempts must be a positive integer/u,
	);
});
