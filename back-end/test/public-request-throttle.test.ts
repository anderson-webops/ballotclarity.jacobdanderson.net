import assert from "node:assert/strict";
import test from "node:test";
import { createPublicRequestThrottle } from "../src/public-request-throttle.js";

test("public request throttling enforces per-key request limits", () => {
	let now = 1_000;
	const throttle = createPublicRequestThrottle({
		maxBuckets: 10,
		maxRequests: 2,
		now: () => now,
		windowMs: 60_000
	});

	assert.deepEqual(throttle.attempt("203.0.113.10"), {
		allowed: true,
		capacityLimited: false,
		retryAfterSeconds: 0
	});
	assert.equal(throttle.attempt("203.0.113.10").allowed, true);
	assert.deepEqual(throttle.attempt("203.0.113.10"), {
		allowed: false,
		capacityLimited: false,
		retryAfterSeconds: 60
	});

	now += 60_000;
	assert.equal(throttle.attempt("203.0.113.10").allowed, true);
});

test("public request throttling fails closed without growing beyond its bucket cap", () => {
	let now = 2_000;
	const throttle = createPublicRequestThrottle({
		maxBuckets: 2,
		maxRequests: 5,
		now: () => now,
		windowMs: 60_000
	});

	assert.equal(throttle.attempt("203.0.113.20").allowed, true);
	assert.equal(throttle.attempt("203.0.113.21").allowed, true);
	assert.deepEqual(throttle.attempt("203.0.113.22"), {
		allowed: false,
		capacityLimited: true,
		retryAfterSeconds: 60
	});
	assert.equal(throttle.attempt("203.0.113.22").capacityLimited, true);
	assert.equal(throttle.attempt("203.0.113.20").allowed, true);

	now += 60_000;
	assert.equal(throttle.attempt("203.0.113.22").allowed, true);
});

test("public request throttling rejects invalid direct limits", () => {
	assert.throws(
		() => createPublicRequestThrottle({ maxBuckets: Number.POSITIVE_INFINITY }),
		/maxBuckets must be a positive integer/u,
	);
	assert.throws(
		() => createPublicRequestThrottle({ maxRequests: 0 }),
		/maxRequests must be a positive integer/u,
	);
});
