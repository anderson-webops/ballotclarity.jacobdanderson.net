import assert from "node:assert/strict";
import test from "node:test";
import { createCensusGeocoderClient } from "../src/census-geocoder.js";
import { ProviderResponseTooLargeError } from "../src/fetch-response.js";

test("createCensusGeocoderClient maps district geography from the Census response", async () => {
	let capturedSignal: AbortSignal | null | undefined;
	const fetchImpl = (async (_resource, init) => {
		capturedSignal = init?.signal;
		return new Response(JSON.stringify({
			result: {
				addressMatches: [
					{
						addressComponents: {
							state: "GA",
							zip: "30303"
						},
						coordinates: {
							x: -84.390278,
							y: 33.747923
						},
						geographies: {
							"119th Congressional Districts": [
								{
									BASENAME: "5",
									GEOID: "1305",
									NAME: "Congressional District 5"
								}
							],
							"2024 State Legislative Districts - Upper": [
								{
									BASENAME: "36",
									GEOID: "13036",
									NAME: "State Senate District 36",
									SLDU: "036"
								}
							],
							"2024 State Legislative Districts - Lower": [
								{
									BASENAME: "58",
									GEOID: "13058",
									NAME: "State House District 58",
									SLDL: "058"
								}
							],
							"Counties": [
								{
									COUNTY: "121",
									GEOID: "13121",
									NAME: "Fulton County"
								}
							]
						},
						matchedAddress: "55 TRINITY AVE SW, ATLANTA, GA, 30303"
					}
				]
			}
		}), {
			headers: {
				"Content-Type": "application/json"
			},
			status: 200
		});
	}) as typeof fetch;
	const client = createCensusGeocoderClient({
		benchmark: "Public_AR_Current",
		fetchImpl,
		timeoutMs: 5_000,
		vintage: "Current_Current"
	});

	const result = await client.lookupAddress("55 Trinity Ave SW, Atlanta, GA 30303");

	assert.ok(result);
	assert.equal(result.normalizedAddress, "55 TRINITY AVE SW, ATLANTA, GA, 30303");
	assert.equal(result.countyFips, "121");
	assert.equal(result.zip5, "30303");
	assert.equal(result.districtMatches.length, 4);
	assert.equal(result.districtMatches[0].label, "Fulton County");
	assert.equal(result.districtMatches[1].label, "Congressional District 5");
	assert.equal(result.districtMatches[2].label, "State Senate District 36");
	assert.equal(result.districtMatches[3].label, "State House District 58");
	assert.ok(capturedSignal instanceof AbortSignal);
});

test("createCensusGeocoderClient rejects an oversized provider response before parsing it", async () => {
	const client = createCensusGeocoderClient({
		fetchImpl: (async () => new Response("{}", {
			headers: {
				"Content-Length": String((5 * 1024 * 1024) + 1),
				"Content-Type": "application/json",
			},
			status: 200,
		})) as typeof fetch,
	});

	await assert.rejects(
		client.lookupAddress("55 Trinity Ave SW, Atlanta, GA 30303"),
		ProviderResponseTooLargeError,
	);
});
