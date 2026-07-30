import type { Options } from "express-rate-limit";
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedRateLimitStore } from "../src/bounded-rate-limit-store.js";

function initializeStore(store: BoundedRateLimitStore, windowMs: number) {
	store.init({ windowMs } as Options);
	return store;
}

test("bounded rate-limit store counts requests and resets expired buckets", () => {
	let now = 1_000;
	const store = initializeStore(new BoundedRateLimitStore({
		maxEntries: 2,
		now: () => now,
	}), 60_000);

	assert.equal(store.increment("client-a").totalHits, 1);
	assert.equal(store.increment("client-a").totalHits, 2);
	assert.equal(store.get("client-a")?.totalHits, 2);

	store.decrement("client-a");
	assert.equal(store.get("client-a")?.totalHits, 1);

	now += 60_000;
	assert.equal(store.get("client-a"), undefined);
	assert.equal(store.increment("client-a").totalHits, 1);
});

test("bounded rate-limit store fails closed when its bucket cap is full", () => {
	let now = 2_000;
	const store = initializeStore(new BoundedRateLimitStore({
		maxEntries: 1,
		now: () => now,
	}), 30_000);

	assert.equal(store.increment("client-a").totalHits, 1);
	const capacityResult = store.increment("client-b");
	assert.equal(capacityResult.totalHits, Number.MAX_SAFE_INTEGER);
	assert.equal(capacityResult.resetTime?.getTime(), 32_000);

	now += 30_000;
	assert.equal(store.increment("client-b").totalHits, 1);
	assert.equal(store.get("client-a"), undefined);
});

test("bounded rate-limit store rejects invalid bounds", () => {
	assert.throws(
		() => new BoundedRateLimitStore({ maxEntries: 0 }),
		/maxEntries must be a positive integer/u,
	);
});
