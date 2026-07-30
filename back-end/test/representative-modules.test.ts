import type { ActiveNationwideLookupContext } from "../src/active-nationwide-lookup.js";
import type { PersonProfileResponse } from "../src/types/civic.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRepresentative } from "../src/representative-classification.js";
import { createRepresentativeModuleResolver } from "../src/representative-modules.js";

const testClassification = classifyRepresentative({
	districtLabel: "Representative UT-3",
	officeTitle: "Representative",
	stateName: "Utah",
});

const testContext: ActiveNationwideLookupContext = {
	actions: [],
	detectedFromIp: false,
	districtMatches: [
		{
			districtCode: "3",
			districtType: "congressional",
			id: "congressional:3",
			label: "Congressional District 3",
			sourceSystem: "U.S. Census Geocoder",
		},
	],
	electionLogistics: null,
	guideAvailability: "not-published",
	inputKind: "zip",
	location: {
		coverageLabel: "Civic results available",
		displayName: "Provo, Utah",
		lookupInput: "84604",
		lookupMode: "zip-preview",
		requiresOfficialConfirmation: true,
		slug: "provo-ut",
		state: "UT",
	},
	normalizedAddress: "ZIP code 84604, Provo, UT, 84604",
	representativeMatches: [
		{
			districtLabel: "Representative UT-3",
			governmentLevel: testClassification.governmentLevel,
			id: "ocd-person:test-mike-kennedy",
			name: "Mike Kennedy",
			officeDisplayLabel: testClassification.officeDisplayLabel,
			officeType: testClassification.officeType,
			officeTitle: "Representative",
			party: "Republican",
			sourceSystem: "Open States",
		},
	],
	resolvedAt: "2026-04-18T18:45:00.000Z",
	result: "resolved",
};

const testProfileResponse: PersonProfileResponse = {
	note: "Representative profile loaded from your saved lookup results.",
	person: {
		ballotStatusLabel: "Not on the current published local guide",
		biography: [],
		comparison: null,
		contestSlug: "",
		districtLabel: "Representative UT-3",
		districtSlug: "congressional-3",
		freshness: {
			contentLastVerifiedAt: "2026-04-18T18:45:00.000Z",
			dataLastUpdatedAt: "2026-04-18T18:45:00.000Z",
			nextReviewAt: "2026-04-25T18:45:00.000Z",
			status: "up-to-date",
			statusLabel: "Up to date",
			statusNote: "Representative identity resolved from your saved lookup results.",
		},
		funding: null,
		governmentLevel: testClassification.governmentLevel,
		incumbent: true,
		keyActions: [],
		location: "Provo, Utah",
		lobbyingContext: [],
		methodologyNotes: [],
		name: "Mike Kennedy",
		officeDisplayLabel: testClassification.officeDisplayLabel,
		officeSought: "Representative",
		officeholderLabel: "Current officeholder",
		officeType: testClassification.officeType,
		onCurrentBallot: false,
		party: "Republican",
		provenance: {
			asOf: "2026-04-18T18:45:00.000Z",
			label: "Open States",
			note: "Representative identity attached from the active nationwide lookup.",
			source: "lookup",
			status: "direct",
		},
		publicStatements: [],
		slug: "mike-kennedy",
		sourceCount: 0,
		sources: [],
		summary: "Current officeholder record resolved from nationwide lookup providers.",
		topIssues: [],
		updatedAt: "2026-04-18T18:45:00.000Z",
		whatWeDoNotKnow: [],
		whatWeKnow: [],
	},
	updatedAt: "2026-04-18T18:45:00.000Z",
};

test("representative module enrichment degrades provider failures into structured unavailable states instead of throwing", async () => {
	const resolver = createRepresentativeModuleResolver({
		now: () => new Date("2026-04-18T18:45:00.000Z"),
		openFecClient: {
			async getCommitteeTotals() {
				throw new Error("OpenFEC request failed: 500 Internal Server Error - synthetic totals outage");
			},
			async searchCandidates() {
				return [
					{
						candidateId: "H4UT03260",
						cycles: [2024, 2026],
						district: "03",
						incumbentChallengeFull: "Incumbent",
						name: "KENNEDY, MIKE",
						office: "H",
						principalCommittees: [
							{
								committeeId: "C00864488",
								lastFileDate: "2026-04-15",
								name: "MIKE KENNEDY FOR UTAH",
								party: "Republican",
							},
						],
						state: "UT",
					},
				];
			},
		},
	});

	const enriched = await resolver.enrichNationwidePersonProfile(testContext, testProfileResponse);

	assert.equal(enriched.person.slug, "mike-kennedy");
	assert.equal(enriched.person.funding, null);
	assert.equal(enriched.person.enrichmentStatus?.funding.status, "unavailable");
	assert.equal(enriched.person.enrichmentStatus?.funding.reasonCode, "provider_error");
	assert.match(
		enriched.person.enrichmentStatus?.funding.summary || "",
		/OpenFEC request failed: 500 Internal Server Error/,
	);
});

test("representative module enrichment bounds and expires its provider attachment cache", async () => {
	let currentTime = Date.parse("2026-04-18T18:45:00.000Z");
	let searches = 0;
	const resolver = createRepresentativeModuleResolver({
		cacheMaxEntries: 1,
		cacheTtlMs: 1_000,
		now: () => new Date(currentTime),
		openFecClient: {
			async getCommitteeTotals() {
				return null;
			},
			async searchCandidates() {
				searches += 1;
				return [];
			}
		}
	});

	await resolver.enrichNationwidePersonProfile(testContext, testProfileResponse);
	await resolver.enrichNationwidePersonProfile(testContext, testProfileResponse);
	assert.equal(searches, 1);

	const secondContext: ActiveNationwideLookupContext = {
		...testContext,
		districtMatches: [{
			...testContext.districtMatches[0],
			districtCode: "4",
			id: "congressional:4",
			label: "Congressional District 4"
		}],
		representativeMatches: [{
			...testContext.representativeMatches[0],
			districtLabel: "Representative UT-4",
			id: "ocd-person:test-jane-example",
			name: "Jane Example"
		}]
	};
	const secondProfile: PersonProfileResponse = {
		...testProfileResponse,
		person: {
			...testProfileResponse.person,
			districtLabel: "Representative UT-4",
			slug: "jane-example"
		}
	};

	await resolver.enrichNationwidePersonProfile(secondContext, secondProfile);
	assert.equal(searches, 2);

	await resolver.enrichNationwidePersonProfile(testContext, testProfileResponse);
	assert.equal(searches, 3);

	currentTime += 1_001;
	await resolver.enrichNationwidePersonProfile(testContext, testProfileResponse);
	assert.equal(searches, 4);
});
