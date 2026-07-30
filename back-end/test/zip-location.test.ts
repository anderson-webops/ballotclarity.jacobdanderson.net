import assert from "node:assert/strict";
import test from "node:test";
import { createZipLocationService } from "../src/zip-location.js";

test("ZIP and reverse-geography requests use bounded abort signals", async () => {
	const capturedSignals: Array<AbortSignal | null | undefined> = [];
	const fetchImpl = (async (resource, init) => {
		capturedSignals.push(init?.signal);
		const requestUrl = new URL(String(resource));

		if (requestUrl.hostname === "api.zippopotam.us") {
			return new Response(JSON.stringify({
				"post code": "30303",
				"places": [
					{
						"latitude": "33.747923",
						"longitude": "-84.390278",
						"place name": "Atlanta",
						"state": "Georgia",
						"state abbreviation": "GA",
					},
				],
			}), {
				headers: {
					"Content-Type": "application/json",
				},
				status: 200,
			});
		}

		return new Response(JSON.stringify({
			result: {
				geographies: {
					Counties: [{ COUNTY: "121", NAME: "Fulton County" }],
					States: [{ NAME: "Georgia", STUSAB: "GA" }],
				},
			},
		}), {
			headers: {
				"Content-Type": "application/json",
			},
			status: 200,
		});
	}) as typeof fetch;
	const service = createZipLocationService({
		fetchImpl,
		timeoutMs: 5_000,
	});
	const result = await service.lookupZip("30303");

	assert.ok(result);
	assert.equal(capturedSignals.length, 2);
	assert.ok(capturedSignals.every(signal => signal instanceof AbortSignal));
});
