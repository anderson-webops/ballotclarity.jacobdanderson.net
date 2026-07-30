import assert from "node:assert/strict";
import test from "node:test";
import { createGoogleCivicClient, createGoogleCivicLookup, fetchGoogleCivic, shouldForceGoogleCivicIpv4 } from "../src/google-civic.js";

test("shouldForceGoogleCivicIpv4 parses supported truthy flags", () => {
	assert.equal(shouldForceGoogleCivicIpv4("true"), true);
	assert.equal(shouldForceGoogleCivicIpv4("TRUE"), true);
	assert.equal(shouldForceGoogleCivicIpv4("1"), true);
	assert.equal(shouldForceGoogleCivicIpv4("yes"), true);
	assert.equal(shouldForceGoogleCivicIpv4("on"), true);
	assert.equal(shouldForceGoogleCivicIpv4("false"), false);
	assert.equal(shouldForceGoogleCivicIpv4(undefined), false);
});

test("createGoogleCivicLookup forces IPv4 resolution", () => {
	let capturedHostname = "";
	let capturedOptions: { all?: boolean; family?: number | string; hints?: number } | null = null;
	let callbackFamily = 0;
	const lookup = createGoogleCivicLookup((hostname, options, callback) => {
		capturedHostname = hostname;
		capturedOptions = options;
		(callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(null, "203.0.113.10", 4);
	});

	lookup("www.googleapis.com", { family: 6, hints: 32 }, ((error: NodeJS.ErrnoException | null, _address: string, family: number) => {
		assert.equal(error, null);
		callbackFamily = family;
	}) as never);

	assert.equal(capturedHostname, "www.googleapis.com");
	assert.deepEqual(capturedOptions, {
		all: false,
		family: 4,
		hints: 32
	});
	assert.equal(callbackFamily, 4);
});

test("createGoogleCivicLookup preserves all-lookups when the caller requests multiple addresses", () => {
	let capturedOptions: { all?: boolean; family?: number | string; hints?: number } | null = null;
	let callbackAddresses: { address: string; family: number }[] = [];
	const lookup = createGoogleCivicLookup((_hostname, options, callback) => {
		capturedOptions = options;
		(callback as (error: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void)(null, [
			{
				address: "203.0.113.10",
				family: 4
			}
		]);
	});

	lookup("www.googleapis.com", { all: true, family: 6, hints: 16 }, ((error: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => {
		assert.equal(error, null);
		callbackAddresses = addresses;
	}) as never);

	assert.deepEqual(capturedOptions, {
		all: true,
		family: 4,
		hints: 16
	});
	assert.deepEqual(callbackAddresses, [
		{
			address: "203.0.113.10",
			family: 4
		}
	]);
});

test("fetchGoogleCivic uses an injected fetch implementation before the IPv4 transport path", async () => {
	let called = false;
	const expectedResponse = new Response("{\"ok\":true}", {
		headers: {
			"Content-Type": "application/json"
		},
		status: 200
	});
	const fetchImpl = (async (resource, init) => {
		called = true;
		assert.equal(resource instanceof URL, true);
		assert.equal((resource as URL).hostname, "www.googleapis.com");
		assert.deepEqual(init?.headers, {
			Accept: "application/json"
		});

		return expectedResponse;
	}) as typeof fetch;

	const response = await fetchGoogleCivic(new URL("https://www.googleapis.com/civicinfo/v2/elections"), {
		fetchImpl,
		forceIPv4: true
	});

	assert.equal(called, true);
	assert.equal(response, expectedResponse);
});

test("createGoogleCivicClient requests partial voterinfo data before treating the lookup as failed", async () => {
	const requestedUrls: URL[] = [];
	const client = createGoogleCivicClient({
		apiKey: "test-google-civic-key",
		fetchImpl: (async (resource) => {
			const requestUrl = resource as URL;

			requestedUrls.push(requestUrl);

			if (requestUrl.pathname.endsWith("/elections")) {
				return new Response(JSON.stringify({
					elections: [],
				}), {
					headers: {
						"Content-Type": "application/json",
					},
					status: 200,
				});
			}

			return new Response(JSON.stringify({
				kind: "civicinfo#voterInfoResponse",
				normalizedInput: {
					city: "Atlanta",
					line1: "55 Trinity Avenue Southwest",
					state: "GA",
					zip: "30303"
				}
			}), {
				headers: {
					"Content-Type": "application/json"
				},
				status: 200
			});
		}) as typeof fetch
	});

	assert.ok(client);

	const result = await client.lookupVoterInfo("55 Trinity Ave SW, Atlanta, GA 30303");

	assert.ok(result);
	assert.equal(requestedUrls.length, 2);
	assert.equal(requestedUrls[0].searchParams.get("returnAllAvailableData"), "true");
	assert.equal(requestedUrls[1].pathname.endsWith("/elections"), true);
	assert.equal(result.verified, true);
	assert.match(result.note, /did not return an election-specific record/i);
});

test("createGoogleCivicClient bounds provider requests with an abort signal", async () => {
	let capturedSignal: AbortSignal | null | undefined;
	const client = createGoogleCivicClient({
		apiKey: "test-google-civic-key",
		fetchImpl: (async (_resource, init) => {
			capturedSignal = init?.signal;
			return new Response(JSON.stringify({
				error: {
					errors: [{ reason: "badRequest" }],
					message: "Address could not be parsed",
				},
			}), {
				headers: {
					"Content-Type": "application/json",
				},
				status: 400,
			});
		}) as typeof fetch,
		timeoutMs: 5_000,
	});

	assert.ok(client);
	await client.lookupVoterInfo("55 Trinity Ave SW, Atlanta, GA 30303");
	assert.ok(capturedSignal instanceof AbortSignal);
});

test("createGoogleCivicClient converts election-unknown responses into a fallback note", async () => {
	const client = createGoogleCivicClient({
		apiKey: "test-google-civic-key",
		fetchImpl: (async () => {
			return new Response(JSON.stringify({
				error: {
					errors: [
						{
							reason: "invalid"
						}
					],
					message: "Election unknown"
				}
			}), {
				headers: {
					"Content-Type": "application/json"
				},
				status: 400
			});
		}) as typeof fetch
	});

	assert.ok(client);

	const result = await client.lookupVoterInfo("55 Trinity Ave SW, Atlanta, GA 30303");

	assert.ok(result);
	assert.equal(result.verified, false);
	assert.match(result.note, /did not return election-specific voter information/i);
});

test("createGoogleCivicClient returns structured polling, early-vote, and drop-off logistics when Google Civic provides them", async () => {
	const client = createGoogleCivicClient({
		apiKey: "test-google-civic-key",
		fetchImpl: (async () => {
			return new Response(JSON.stringify({
				contests: [
					{
						ballotTitle: "Mayor of Atlanta",
						candidates: [
							{
								candidateUrl: "https://example.org/jane-candidate",
								name: "Jane Candidate",
								orderOnBallot: 1,
								party: "Nonpartisan",
								photoUrl: "https://example.org/jane-candidate.jpg"
							}
						],
						office: "Mayor",
						sources: [
							{
								name: "Georgia Secretary of State"
							}
						]
					},
					{
						referendumBallotResponses: ["Yes", "No"],
						referendumBrief: "Authorizes a local public-safety bond.",
						referendumTitle: "Public Safety Bond",
						referendumUrl: "https://example.org/measure",
						type: "Referendum"
					}
				],
				dropOffLocations: [
					{
						address: {
							city: "Atlanta",
							line1: "125 Central Ave SW",
							state: "GA",
							zip: "30303"
						},
						name: "Fulton County Election Hub",
						sources: [
							{
								name: "Fulton County Elections"
							}
						]
					}
				],
				earlyVoteSites: [
					{
						address: {
							city: "Atlanta",
							line1: "560 Amsterdam Ave NE",
							state: "GA",
							zip: "30306"
						},
						name: "Atlanta Early Vote Center",
						sources: [
							{
								name: "Georgia Secretary of State"
							}
						]
					}
				],
				election: {
					electionDay: "2026-11-03",
					name: "2026 Georgia General Election"
				},
				kind: "civicinfo#voterInfoResponse",
				normalizedInput: {
					city: "Atlanta",
					line1: "55 Trinity Avenue Southwest",
					state: "GA",
					zip: "30303"
				},
				otherElections: [
					{
						electionDay: "2026-12-01",
						name: "2026 Atlanta Runoff Election"
					}
				],
				pollingLocations: [
					{
						address: {
							city: "Atlanta",
							line1: "55 Trinity Ave SW",
							state: "GA",
							zip: "30303"
						},
						name: "Atlanta City Hall Atrium",
						pollingHours: "7:00 AM - 7:00 PM",
						sources: [
							{
								name: "Google Civic"
							}
						]
					}
				]
			}), {
				headers: {
					"Content-Type": "application/json"
				},
				status: 200
			});
		}) as typeof fetch
	});

	assert.ok(client);

	const result = await client.lookupVoterInfo("55 Trinity Ave SW, Atlanta, GA 30303");

	assert.ok(result);
	assert.equal(result.verified, true);
	assert.equal(result.logistics?.electionName, "2026 Georgia General Election");
	assert.equal(result.logistics?.electionDay, "2026-11-03");
	assert.equal(result.logistics?.pollingLocations[0]?.name, "Atlanta City Hall Atrium");
	assert.match(result.logistics?.pollingLocations[0]?.note ?? "", /7:00 AM - 7:00 PM/);
	assert.equal(result.logistics?.earlyVoteSites[0]?.name, "Atlanta Early Vote Center");
	assert.equal(result.logistics?.dropOffLocations[0]?.name, "Fulton County Election Hub");
	assert.equal(result.logistics?.candidatePreviews?.[0]?.name, "Jane Candidate");
	assert.equal(result.logistics?.candidatePreviews?.[0]?.office, "Mayor");
	assert.equal(result.logistics?.candidatePreviews?.[0]?.profileImages?.[0]?.url, "https://example.org/jane-candidate.jpg");
	assert.deepEqual(result.logistics?.additionalElectionNames, ["2026 Atlanta Runoff Election"]);
	assert.equal(result.ballotContentPreviews.length, 1);
	assert.equal(result.ballotContentPreviews[0]?.contestCount, 2);
	assert.equal(result.ballotContentPreviews[0]?.candidateCount, 1);
	assert.equal(result.ballotContentPreviews[0]?.measureCount, 1);
	assert.equal(result.ballotContentPreviews[0]?.contests[0]?.title, "Mayor of Atlanta");
	assert.equal(result.ballotContentPreviews[0]?.contests[0]?.candidates[0]?.orderOnBallot, 1);
	assert.deepEqual(result.ballotContentPreviews[0]?.contests[1]?.referendum?.responses, ["Yes", "No"]);
	assert.match(result.ballotContentPreviews[0]?.disclaimer ?? "", /Verify your exact ballot/i);
});

test("createGoogleCivicClient retries voterinfo with a matching election id when the initial lookup returns only normalized address data", async () => {
	const requestedUrls: URL[] = [];
	const client = createGoogleCivicClient({
		apiKey: "test-google-civic-key",
		fetchImpl: (async (resource) => {
			const requestUrl = resource as URL;
			requestedUrls.push(requestUrl);

			if (requestUrl.pathname.endsWith("/voterinfo") && !requestUrl.searchParams.get("electionId")) {
				return new Response(JSON.stringify({
					kind: "civicinfo#voterInfoResponse",
					normalizedInput: {
						city: "Richmond",
						line1: "900 E Broad St",
						state: "VA",
						zip: "23219",
					},
				}), {
					headers: {
						"Content-Type": "application/json",
					},
					status: 200,
				});
			}

			if (requestUrl.pathname.endsWith("/elections")) {
				return new Response(JSON.stringify({
					elections: [
						{
							electionDay: "2026-11-03",
							id: 11201,
							name: "2026 Virginia General Election",
						},
						{
							electionDay: "2026-11-03",
							id: 22100,
							name: "2026 Oregon General Election",
						},
					],
				}), {
					headers: {
						"Content-Type": "application/json",
					},
					status: 200,
				});
			}

			assert.equal(requestUrl.pathname.endsWith("/voterinfo"), true);
			assert.equal(requestUrl.searchParams.get("electionId"), "11201");

			return new Response(JSON.stringify({
				dropOffLocations: [
					{
						address: {
							city: "Richmond",
							line1: "1209 E Cary St",
							state: "VA",
							zip: "23219",
						},
						name: "Richmond ballot drop-off",
					},
				],
				earlyVoteSites: [
					{
						address: {
							city: "Richmond",
							line1: "101 N 9th St",
							state: "VA",
							zip: "23219",
						},
						name: "Richmond early voting office",
					},
				],
				election: {
					electionDay: "2026-11-03",
					name: "2026 Virginia General Election",
				},
				normalizedInput: {
					city: "Richmond",
					line1: "900 E Broad St",
					state: "VA",
					zip: "23219",
				},
				pollingLocations: [
					{
						address: {
							city: "Richmond",
							line1: "900 E Broad St",
							state: "VA",
							zip: "23219",
						},
						name: "Richmond polling place",
					},
				],
			}), {
				headers: {
					"Content-Type": "application/json",
				},
				status: 200,
			});
		}) as typeof fetch,
	});

	assert.ok(client);

	const result = await client.lookupVoterInfo("900 E Broad St, Richmond, VA 23219");

	assert.ok(result);
	assert.equal(result.verified, true);
	assert.equal(requestedUrls.length, 3);
	assert.equal(requestedUrls[0].pathname.endsWith("/voterinfo"), true);
	assert.equal(requestedUrls[1].pathname.endsWith("/elections"), true);
	assert.equal(requestedUrls[2].searchParams.get("electionId"), "11201");
	assert.equal(result.logistics?.pollingLocations.length, 1);
	assert.equal(result.logistics?.earlyVoteSites.length, 1);
	assert.equal(result.logistics?.dropOffLocations.length, 1);
	assert.match(result.note, /2026 Virginia General Election/i);
});
