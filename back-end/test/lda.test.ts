import assert from "node:assert/strict";
import test from "node:test";
import { createLdaClient } from "../src/lda.js";

test("LDA.gov contribution requests use bounded abort signals", async () => {
	let capturedSignal: AbortSignal | null | undefined;
	const client = createLdaClient({
		apiKey: "test-lda-key",
		fetchImpl: (async (_resource, init) => {
			capturedSignal = init?.signal;
			return new Response(JSON.stringify({
				count: 0,
				results: []
			}), {
				headers: {
					"Content-Type": "application/json"
				},
				status: 200
			});
		}) as typeof fetch,
		timeoutMs: 5_000
	});

	assert.ok(client);
	const reports = await client.listContributionReports({
		filingYear: 2026
	});

	assert.deepEqual(reports, []);
	assert.ok(capturedSignal instanceof AbortSignal);
});
