import assert from "node:assert/strict";
import test from "node:test";
import { createBoundedRequestThrottle } from "../server/utils/bounded-request-throttle.ts";

test("bounded request throttling applies per-key limits and resets expired buckets", () => {
	let now = 1_000;
	const throttle = createBoundedRequestThrottle({
		maxBuckets: 10,
		maxRequests: 2,
		now: () => now,
		windowMs: 60_000
	});

	assert.equal(throttle.attempt("203.0.113.10").allowed, true);
	assert.equal(throttle.attempt("203.0.113.10").allowed, true);
	assert.deepEqual(throttle.attempt("203.0.113.10"), {
		allowed: false,
		capacityLimited: false,
		retryAfterSeconds: 60
	});

	now += 60_000;
	assert.equal(throttle.attempt("203.0.113.10").allowed, true);
});

test("bounded request throttling fails closed at its bucket ceiling", () => {
	let now = 2_000;
	const throttle = createBoundedRequestThrottle({
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
	assert.equal(throttle.attempt("203.0.113.20").allowed, true);

	now += 60_000;
	assert.equal(throttle.attempt("203.0.113.22").allowed, true);
});

test("bounded request throttling rejects invalid limits", () => {
	assert.throws(() => createBoundedRequestThrottle({
		maxBuckets: 0,
		maxRequests: 5,
		windowMs: 60_000
	}), /maxBuckets must be a positive integer/u);
});
