import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeNationwideLookupResultForStorage } from "../src/utils/civic-storage-privacy.ts";

function buildResult(inputKind: "address" | "zip", query: string) {
	return {
		actions: [
			{
				description: "Open the official tool.",
				id: "official-tool",
				kind: "official-verification" as const,
				location: {
					coverageLabel: "Current area",
					displayName: "Fulton County, Georgia",
					lookupInput: "55 Trinity Ave SW, Atlanta, GA 30303",
					slug: "fulton-county-georgia",
					state: "Georgia",
				},
				title: "Official tool",
			},
		],
		availability: null,
		ballotContentPreviews: [{ id: "private-request-result" }],
		districtMatches: [],
		election: null,
		electionLogistics: {
			dropOffSites: [],
			earlyVoteSites: [],
			electionDay: "2026-11-03",
			mailOnly: false,
			name: "General election",
			pollingLocations: [{ address: "Address-specific polling place", id: "polling:0", name: "Poll" }],
		},
		fromCache: false,
		guideAvailability: "not-published" as const,
		guideContent: null,
		inputKind,
		location: {
			coverageLabel: "Current area",
			displayName: "Fulton County, Georgia",
			lookupInput: "55 Trinity Ave SW, Atlanta, GA 30303",
			slug: "fulton-county-georgia",
			state: "Georgia",
		},
		lookupQuery: query,
		normalizedAddress: query,
		note: "Civic results ready.",
		representativeMatches: [],
		result: "resolved" as const,
		selectionOptions: [],
	};
}

test("durable civic storage removes exact-address and address-specific provider data", () => {
	const sanitized = sanitizeNationwideLookupResultForStorage(
		buildResult("address", "55 Trinity Ave SW, Atlanta, GA 30303")
	);
	const serialized = JSON.stringify(sanitized);

	assert.ok(sanitized);
	assert.equal(sanitized.lookupQuery, "");
	assert.equal(sanitized.normalizedAddress, "");
	assert.equal(sanitized.location?.lookupInput, undefined);
	assert.equal(sanitized.actions[0]?.location?.lookupInput, undefined);
	assert.deepEqual(sanitized.ballotContentPreviews, []);
	assert.equal(sanitized.electionLogistics, null);
	assert.doesNotMatch(serialized, /55 Trinity|Address-specific polling place/u);
});

test("durable civic storage may retain an exact five-digit ZIP for navigation", () => {
	const sanitized = sanitizeNationwideLookupResultForStorage(buildResult("zip", "30303"));

	assert.equal(sanitized?.lookupQuery, "30303");
	assert.equal(sanitized?.normalizedAddress, "30303");
});
