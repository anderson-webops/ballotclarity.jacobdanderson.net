import assert from "node:assert/strict";
import test from "node:test";
import { createOpenFecClient } from "../src/openfec.js";

test("createOpenFecClient treats committee totals 404 responses as an empty cycle instead of a fatal provider error", async () => {
	let capturedSignal: AbortSignal | null | undefined;
	const client = createOpenFecClient({
		apiKey: "test-openfec-key",
		async fetchImpl(_resource, init) {
			capturedSignal = init?.signal;
			return new Response("Not found", {
				status: 404,
				statusText: "Not Found",
			});
		},
	});

	assert.ok(client);

	const totals = await client.getCommitteeTotals("C00000001", 2026);

	assert.equal(totals, null);
	assert.ok(capturedSignal instanceof AbortSignal);
});
