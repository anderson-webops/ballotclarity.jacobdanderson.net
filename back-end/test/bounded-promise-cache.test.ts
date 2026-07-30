import assert from "node:assert/strict";
import test from "node:test";
import {
	createBoundedPromiseCache,
	resolveBoundedCacheInteger,
} from "../src/bounded-promise-cache.js";

test("bounded promise cache deduplicates, expires, and evicts least-recently-used entries", async () => {
	let now = 1_000;
	const calls = new Map<string, number>();
	const cache = createBoundedPromiseCache<string, string>({
		maxEntries: 2,
		now: () => now,
		ttlMs: 100,
	});
	const resolve = (key: string) => cache.getOrCreate(key, async () => {
		calls.set(key, (calls.get(key) ?? 0) + 1);
		return key;
	});

	assert.equal(await resolve("one"), "one");
	assert.equal(await resolve("two"), "two");
	assert.equal(await resolve("one"), "one");
	assert.equal(calls.get("one"), 1);

	await resolve("three");
	await resolve("two");
	assert.equal(calls.get("two"), 2);

	now += 100;
	await resolve("one");
	assert.equal(calls.get("one"), 2);
});

test("bounded promise cache removes failed work so it can be retried", async () => {
	let attempts = 0;
	const cache = createBoundedPromiseCache<string, string>({
		maxEntries: 1,
		ttlMs: 100,
	});
	const resolve = () => cache.getOrCreate("key", async () => {
		attempts += 1;

		if (attempts === 1)
			throw new Error("temporary failure");

		return "recovered";
	});

	await assert.rejects(resolve(), /temporary failure/u);
	assert.equal(await resolve(), "recovered");
	assert.equal(attempts, 2);
});

test("bounded cache integer resolver accepts only positive safe integers", () => {
	assert.equal(resolveBoundedCacheInteger("1000", 10), 1000);
	assert.equal(resolveBoundedCacheInteger("0", 10), 10);
	assert.equal(resolveBoundedCacheInteger(Number.POSITIVE_INFINITY, 10), 10);
});
