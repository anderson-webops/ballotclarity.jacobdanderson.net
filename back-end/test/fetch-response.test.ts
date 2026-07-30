import assert from "node:assert/strict";
import test from "node:test";
import {
	defaultProviderResponseMaxBytes,
	ProviderResponseTooLargeError,
	readProviderResponseJson,
	readProviderResponseText,
	resolveProviderResponseMaxBytes,
} from "../src/fetch-response.js";
import { resolveFetchTimeoutMs } from "../src/fetch-timeout.js";

test("provider response byte limits accept only positive safe integers", () => {
	assert.equal(resolveProviderResponseMaxBytes("1024"), 1024);
	assert.equal(resolveProviderResponseMaxBytes(256.9), 256);
	assert.equal(resolveProviderResponseMaxBytes("0"), defaultProviderResponseMaxBytes);
	assert.equal(resolveProviderResponseMaxBytes("not-a-number"), defaultProviderResponseMaxBytes);
	assert.equal(resolveProviderResponseMaxBytes(Number.MAX_SAFE_INTEGER + 1), defaultProviderResponseMaxBytes);
});

test("provider request deadlines reject unsafe runtime values", () => {
	assert.equal(resolveFetchTimeoutMs("15000"), 15_000);
	assert.equal(resolveFetchTimeoutMs(100.9), 100);
	assert.equal(resolveFetchTimeoutMs("0"), 15_000);
	assert.equal(resolveFetchTimeoutMs(Number.MAX_SAFE_INTEGER + 1), 15_000);
});

test("provider response reader rejects an oversized declared content length", async () => {
	const response = new Response("small", {
		headers: {
			"Content-Length": "1025",
		},
	});

	await assert.rejects(
		readProviderResponseText(response, 1024),
		(error: unknown) => {
			assert.ok(error instanceof ProviderResponseTooLargeError);
			assert.equal(error.maxBytes, 1024);
			assert.equal(error.receivedBytes, 1025);
			return true;
		},
	);
});

test("provider response reader rejects a streamed body that exceeds the byte ceiling", async () => {
	const response = new Response("x".repeat(1025));

	await assert.rejects(
		readProviderResponseText(response, 1024),
		ProviderResponseTooLargeError,
	);
});

test("provider response reader parses bounded JSON", async () => {
	const payload = await readProviderResponseJson<{ ok: boolean }>(
		new Response(JSON.stringify({ ok: true })),
		1024,
	);

	assert.deepEqual(payload, { ok: true });
});
