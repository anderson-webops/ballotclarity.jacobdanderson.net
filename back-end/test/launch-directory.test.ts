import assert from "node:assert/strict";
import test from "node:test";
import { buildLaunchDirectorySnapshot } from "../src/launch-directory.js";
import { classifyRepresentative } from "../src/representative-classification.js";

test("buildLaunchDirectorySnapshot composes provider-fed launch data without pretending funding crosswalks are complete", async () => {
	let capturedGoogleCivicSignal: AbortSignal | null | undefined;
	const snapshot = await buildLaunchDirectorySnapshot({
		congressClient: {
			async getMember() {
				return null;
			},
			async listMembers() {
				return [
					{
						bioguideId: "W000790",
						district: undefined,
						name: "Warnock, Raphael G.",
						party: "Democratic",
						state: "Georgia",
						updatedAt: "2026-04-17T00:00:00Z",
						url: "https://api.congress.gov/v3/member/W000790?format=json"
					}
				];
			},
			async listMembersByState() {
				return [
					{
						bioguideId: "W000790",
						district: undefined,
						name: "Warnock, Raphael G.",
						party: "Democratic",
						state: "Georgia",
						updatedAt: "2026-04-17T00:00:00Z",
						url: "https://api.congress.gov/v3/member/W000790?format=json"
					}
				];
			}
		},
		fetchImpl: (async (_resource, init) => {
			capturedGoogleCivicSignal = init?.signal;
			return new Response(JSON.stringify({
				elections: [
					{
						electionDay: "2026-05-19",
						id: "ga-primary",
						name: "Georgia Primary Election",
						ocdDivisionId: "ocd-division/country:us/state:ga"
					},
					{
						electionDay: "2026-05-05",
						id: "in-primary",
						name: "Indiana Primary Election",
						ocdDivisionId: "ocd-division/country:us/state:in"
					}
				]
			}), {
				headers: {
					"Content-Type": "application/json"
				},
				status: 200
			});
		}) as typeof fetch,
		googleCivicApiKey: "test-key",
		openStatesClient: {
			async listPeopleByJurisdiction() {
				return [
					{
						districtLabel: "Representative 58",
						id: "ocd-person:test-house",
						jurisdictionName: "Georgia",
						name: "Park Cannon",
						officeTitle: "Representative",
						openstatesUrl: "https://openstates.org/person/example",
						party: "Democratic"
					}
				];
			},
			async lookupPeopleByCoordinates() {
				const classification = classifyRepresentative({
					districtLabel: "Senator 36",
					officeTitle: "Senator",
					stateName: "Georgia",
				});
				return [
					{
						districtLabel: "Senator 36",
						governmentLevel: classification.governmentLevel,
						id: "ocd-person:test-senator",
						name: "Nan Orrock",
						officeDisplayLabel: classification.officeDisplayLabel,
						officeType: classification.officeType,
						officeTitle: "Senator",
						openstatesUrl: "https://openstates.org/person/example-two",
						party: "Democratic",
						sourceSystem: "Open States"
					}
				];
			},
			async searchPeopleByName() {
				return [];
			}
		}
	});

	assert.equal(snapshot.upcomingElections.length, 1);
	assert.ok(capturedGoogleCivicSignal instanceof AbortSignal);
	assert.equal(snapshot.upcomingElections[0].id, "ga-primary");
	assert.equal(snapshot.federalRepresentatives[0].bioguideId, "W000790");
	assert.equal(snapshot.stateRepresentatives[0].name, "Park Cannon");
	assert.equal(snapshot.geoMatchedRepresentatives[0].name, "Nan Orrock");
	assert.match(snapshot.notes[1], /crosswalk/i);
});
