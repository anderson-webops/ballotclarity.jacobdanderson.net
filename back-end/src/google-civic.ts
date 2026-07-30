import type {
	BallotContentPreview,
	BallotContentPreviewCandidate,
	BallotContentPreviewContest,
	ElectionLogistics,
	LocationLookupAction,
	OfficialResource,
	ProfileImage,
} from "./types/civic.js";
import { Buffer } from "node:buffer";
import { lookup as dnsLookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import process from "node:process";
import {
	ProviderResponseTooLargeError,
	readProviderResponseJson,
	resolveProviderResponseMaxBytes,
} from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";
import { buildProfileImage } from "./profile-images.js";
import { normalizePublicHref } from "./public-href.js";

interface GoogleCivicAddress {
	locationName?: string;
	line1?: string;
	line2?: string;
	line3?: string;
	city?: string;
	state?: string;
	zip?: string;
}

interface GoogleCivicElection {
	id?: number | string;
	electionDay?: string;
	name?: string;
}

interface GoogleCivicAdministrationBody {
	absenteeVotingInfoUrl?: string;
	ballotInfoUrl?: string;
	electionInfoUrl?: string;
	electionNoticeUrl?: string;
	electionRegistrationConfirmationUrl?: string;
	electionRegistrationUrl?: string;
	electionRulesUrl?: string;
	votingLocationFinderUrl?: string;
}

interface GoogleCivicState {
	electionAdministrationBody?: GoogleCivicAdministrationBody;
}

interface GoogleCivicCandidate {
	candidateUrl?: string;
	email?: string;
	name?: string;
	orderOnBallot?: number;
	party?: string;
	phone?: string;
	photoUrl?: string;
}

interface GoogleCivicContest {
	ballotTitle?: string;
	candidates?: GoogleCivicCandidate[];
	district?: {
		name?: string;
		scope?: string;
	};
	id?: string;
	office?: string;
	referendumBallotResponses?: string[];
	referendumBrief?: string;
	referendumEffectOfAbstain?: string;
	referendumPassageThreshold?: string;
	referendumSubtitle?: string;
	referendumText?: string;
	referendumTitle?: string;
	referendumUrl?: string;
	sources?: Array<{
		name?: string;
		official?: boolean;
	}>;
	type?: string;
}

interface GoogleCivicLocation {
	address?: GoogleCivicAddress;
	name?: string;
	pollingHours?: string;
	sources?: Array<{
		name?: string;
	}>;
}

interface GoogleCivicErrorResponse {
	error?: {
		errors?: Array<{
			message?: string;
			reason?: string;
		}>;
		message?: string;
	};
}

interface GoogleCivicVoterInfoResponse {
	contests?: GoogleCivicContest[];
	dropOffLocations?: GoogleCivicLocation[];
	earlyVoteSites?: GoogleCivicLocation[];
	election?: GoogleCivicElection;
	mailOnly?: boolean;
	normalizedInput?: GoogleCivicAddress;
	otherElections?: GoogleCivicElection[];
	pollingLocations?: GoogleCivicLocation[];
	state?: GoogleCivicState[];
}

interface GoogleCivicElectionsResponse {
	elections?: GoogleCivicElection[];
}

export interface OfficialAddressMatch {
	actions: LocationLookupAction[];
	ballotContentPreviews: BallotContentPreview[];
	logistics: ElectionLogistics | null;
	note: string;
	verified: boolean;
}

export interface GoogleCivicClient {
	lookupVoterInfo: (address: string) => Promise<OfficialAddressMatch | null>;
}

interface GoogleCivicClientOptions {
	apiKey?: string;
	fetchImpl?: typeof fetch;
	forceIPv4?: boolean;
	timeoutMs?: number;
}

interface LookupOptions {
	all?: boolean;
	family?: number | "IPv4" | "IPv6";
	hints?: number;
}

interface LookupAddress {
	address: string;
	family: number;
}

interface LookupCallback {
	(error: NodeJS.ErrnoException | null, address: string, family: number): void;
	(error: NodeJS.ErrnoException | null, addresses: LookupAddress[]): void;
}

interface DnsLookupFn {
	(hostname: string, options: LookupOptions, callback: LookupCallback): void;
}

const lookupBaseUrl = "https://www.googleapis.com/civicinfo/v2/voterinfo";
const electionsBaseUrl = "https://www.googleapis.com/civicinfo/v2/elections";
const truthyEnvPattern = /^(?:1|true|yes|on)$/i;
const electionUnknownPattern = /election unknown/i;
const addressParsePattern = /address.*parse|unparseable/i;
const fallbackAddressTokenSplitPattern = /[,\s]+/;
const electionLookbackWindowMs = 45 * 24 * 60 * 60 * 1000;
const electionRetryLimit = 6;
const regionDisplayNames = typeof Intl.DisplayNames === "function"
	? new Intl.DisplayNames(["en"], { type: "region" })
	: null;

function normalizeGoogleCivicError(errorPayload: GoogleCivicErrorResponse | null | undefined) {
	const reason = errorPayload?.error?.errors?.[0]?.reason?.trim();
	const message = errorPayload?.error?.message?.trim();

	if (reason === "invalid" && electionUnknownPattern.test(message || "")) {
		return "Google Civic did not return election-specific voter information for this address in the current election context. Ballot Clarity will fall back to stored district geography and other official links where available.";
	}

	if (reason === "badRequest" || addressParsePattern.test(message || "")) {
		return "Google Civic could not parse the submitted address. Use a full street address with city, state, and ZIP code.";
	}

	return message
		|| "The configured Google Civic provider did not return a verified address match for this lookup, so Ballot Clarity is falling back to the current public guide.";
}

function normalizeAddress(address: GoogleCivicAddress | undefined) {
	if (!address)
		return null;

	const locality = [address.city, address.state, address.zip].filter(Boolean).join(", ");

	return [
		address.locationName,
		address.line1,
		address.line2,
		address.line3,
		locality
	]
		.map(part => part?.trim())
		.filter(Boolean)
		.join(", ");
}

function buildElectionLogisticsSites(
	locations: GoogleCivicLocation[] | undefined,
	siteType: "drop-off" | "early-vote" | "polling",
) {
	return (locations ?? [])
		.map((location, index) => {
			const address = normalizeAddress(location.address);
			const name = location.name?.trim() || location.address?.locationName?.trim() || `${siteType} site ${index + 1}`;
			const sourceLabel = (location.sources ?? []).map(source => source.name?.trim()).filter(Boolean).join(", ");
			const note = [location.pollingHours?.trim(), sourceLabel].filter(Boolean).join(" · ");

			if (!name && !address)
				return null;

			return {
				address: address || name,
				id: `${siteType}:${index}`,
				name: name || address || `${siteType} site ${index + 1}`,
				note: note || undefined,
			};
		})
		.filter((site): site is NonNullable<typeof site> => Boolean(site));
}

function buildCandidateImage(candidate: GoogleCivicCandidate): ProfileImage | null {
	const imageUrl = candidate.photoUrl?.trim();
	const name = candidate.name?.trim();

	if (!imageUrl || !name)
		return null;

	return buildProfileImage({
		alt: `Photo of ${name}`,
		priority: 30,
		sourceKind: "provider",
		sourceLabel: "Google Civic candidate photo",
		sourceSystem: "Google Civic Information API",
		sourceUrl: candidate.candidateUrl?.trim() || undefined,
		url: imageUrl,
	});
}

function buildCandidatePreviews(contests: GoogleCivicContest[] | undefined) {
	return (contests ?? []).flatMap((contest, contestIndex) => {
		const office = contest.office?.trim() || undefined;

		return (contest.candidates ?? []).map((candidate, candidateIndex) => {
			const name = candidate.name?.trim();

			if (!name)
				return null;

			const profileImages = [buildCandidateImage(candidate)].filter((image): image is ProfileImage => Boolean(image));

			return {
				candidateUrl: normalizePublicHref(candidate.candidateUrl) || undefined,
				email: candidate.email?.trim() || undefined,
				id: `google-civic:candidate:${contestIndex}:${candidateIndex}`,
				name,
				office,
				party: candidate.party?.trim() || undefined,
				phone: candidate.phone?.trim() || undefined,
				profileImages: profileImages.length ? profileImages : undefined,
			};
		}).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
	});
}

function buildBallotContentCandidate(
	candidate: GoogleCivicCandidate,
	contestIndex: number,
	candidateIndex: number,
): BallotContentPreviewCandidate | null {
	const name = candidate.name?.trim();

	if (!name)
		return null;

	const profileImages = [buildCandidateImage(candidate)].filter((image): image is ProfileImage => Boolean(image));

	return {
		candidateUrl: normalizePublicHref(candidate.candidateUrl) || undefined,
		email: candidate.email?.trim() || undefined,
		id: `google-civic:ballot-candidate:${contestIndex}:${candidateIndex}`,
		name,
		orderOnBallot: typeof candidate.orderOnBallot === "number" ? candidate.orderOnBallot : undefined,
		party: candidate.party?.trim() || undefined,
		phone: candidate.phone?.trim() || undefined,
		profileImages: profileImages.length ? profileImages : undefined,
	};
}

function buildBallotContentContest(contest: GoogleCivicContest, contestIndex: number): BallotContentPreviewContest | null {
	const candidates = (contest.candidates ?? [])
		.map((candidate, candidateIndex) => buildBallotContentCandidate(candidate, contestIndex, candidateIndex))
		.filter((candidate): candidate is BallotContentPreviewCandidate => Boolean(candidate));
	const referendumTitle = contest.referendumTitle?.trim();
	const referendumBrief = contest.referendumBrief?.trim();
	const referendumText = contest.referendumText?.trim();
	const referendumUrl = normalizePublicHref(contest.referendumUrl);
	const title = contest.ballotTitle?.trim()
		|| contest.office?.trim()
		|| referendumTitle
		|| `Ballot contest ${contestIndex + 1}`;
	const sourceLabels = Array.from(new Set((contest.sources ?? [])
		.map(source => source.name?.trim())
		.filter((source): source is string => Boolean(source))));
	const referendum = referendumTitle || referendumBrief || referendumText || referendumUrl
		? {
				brief: referendumBrief || undefined,
				effectOfAbstain: contest.referendumEffectOfAbstain?.trim() || undefined,
				passageThreshold: contest.referendumPassageThreshold?.trim() || undefined,
				responses: (contest.referendumBallotResponses ?? []).map(response => response.trim()).filter(Boolean),
				subtitle: contest.referendumSubtitle?.trim() || undefined,
				text: referendumText || undefined,
				title: referendumTitle || undefined,
				url: referendumUrl || undefined,
			}
		: undefined;

	if (!candidates.length && !referendum)
		return null;

	return {
		ballotTitle: contest.ballotTitle?.trim() || undefined,
		candidates,
		districtName: contest.district?.name?.trim() || undefined,
		id: contest.id?.trim() || `google-civic:contest:${contestIndex}`,
		office: contest.office?.trim() || undefined,
		referendum,
		sourceLabels,
		title,
		type: contest.type?.trim() || undefined,
	};
}

function buildBallotContentPreview(payload: GoogleCivicVoterInfoResponse): BallotContentPreview | null {
	const contests = (payload.contests ?? [])
		.map(buildBallotContentContest)
		.filter((contest): contest is BallotContentPreviewContest => Boolean(contest));

	if (!contests.length)
		return null;

	const candidateCount = contests.reduce((count, contest) => count + contest.candidates.length, 0);
	const measureCount = contests.filter(contest => Boolean(contest.referendum)).length;

	return {
		candidateCount,
		contestCount: contests.length,
		contests,
		disclaimer: "This is provider-returned ballot preview data from Google Civic/Voting Information Project. Ballot Clarity has not locally reviewed every contest, candidate, or measure in this preview. Verify your exact ballot with the linked official voter or ballot tool before relying on it.",
		generatedAt: new Date().toISOString(),
		id: "google-civic:voterinfo:ballot-preview",
		measureCount,
		officialOnly: true,
		providerId: "google-civic",
		providerLabel: "Google Civic Information API",
		sourceAuthority: "commercial-provider",
		status: "official_source_unverified",
		verificationResourceLabel: "Use the official voter or ballot tool linked with this lookup to confirm your exact ballot.",
	};
}

function buildElectionLogistics(payload: GoogleCivicVoterInfoResponse): ElectionLogistics | null {
	const pollingLocations = buildElectionLogisticsSites(payload.pollingLocations, "polling");
	const earlyVoteSites = buildElectionLogisticsSites(payload.earlyVoteSites, "early-vote");
	const dropOffLocations = buildElectionLogisticsSites(payload.dropOffLocations, "drop-off");
	const candidatePreviews = buildCandidatePreviews(payload.contests);
	const additionalElectionNames = (payload.otherElections ?? [])
		.map(item => item.name?.trim())
		.filter((item): item is string => Boolean(item));
	const normalizedAddress = normalizeAddress(payload.normalizedInput);

	if (
		!payload.election?.name
		&& !payload.election?.electionDay
		&& !normalizedAddress
		&& !pollingLocations.length
		&& !earlyVoteSites.length
		&& !dropOffLocations.length
		&& !candidatePreviews.length
		&& !additionalElectionNames.length
		&& !payload.mailOnly
	) {
		return null;
	}

	return {
		additionalElectionNames,
		candidatePreviews: candidatePreviews.length ? candidatePreviews : undefined,
		dropOffLocations,
		earlyVoteSites,
		electionDay: payload.election?.electionDay?.trim() || undefined,
		electionName: payload.election?.name?.trim() || undefined,
		mailOnly: payload.mailOnly === true,
		normalizedAddress: normalizedAddress || undefined,
		officialSourceNote: "Structured election administration details returned by Google Civic for this address. Verify final hours, locations, ballot-handling rules, and the exact ballot you receive with the linked official voter or ballot tools.",
		pollingLocations,
	};
}

function hasStructuredElectionDetails(payload: GoogleCivicVoterInfoResponse) {
	return Boolean(
		payload.election?.name
		|| payload.election?.electionDay
		|| payload.pollingLocations?.length
		|| payload.earlyVoteSites?.length
		|| payload.dropOffLocations?.length
		|| payload.contests?.some(contest => contest.candidates?.length)
		|| payload.mailOnly
		|| payload.otherElections?.length
		|| payload.state?.[0]?.electionAdministrationBody,
	);
}

function buildElectionSearchTerms(payload: GoogleCivicVoterInfoResponse, address: string) {
	const normalizedStateCode = payload.normalizedInput?.state?.trim().toUpperCase() || "";
	const normalizedStateName = normalizedStateCode
		? regionDisplayNames?.of(normalizedStateCode)?.toLowerCase().trim() || ""
		: "";
	const normalizedCity = payload.normalizedInput?.city?.trim().toLowerCase() || "";
	const fallbackAddressTokens = String(address)
		.toLowerCase()
		.split(fallbackAddressTokenSplitPattern)
		.map(token => token.trim())
		.filter(token => token.length > 2);

	return Array.from(new Set([
		normalizedStateCode.toLowerCase(),
		normalizedStateName,
		normalizedCity,
		...fallbackAddressTokens,
	].filter(Boolean)));
}

function isUpcomingElection(election: GoogleCivicElection) {
	const electionDay = election.electionDay?.trim();

	if (!electionDay)
		return true;

	const timestamp = Date.parse(electionDay);

	if (Number.isNaN(timestamp))
		return true;

	return timestamp >= (Date.now() - electionLookbackWindowMs);
}

function selectFallbackElectionCandidates(
	elections: GoogleCivicElection[] | undefined,
	payload: GoogleCivicVoterInfoResponse,
	address: string,
) {
	const searchTerms = buildElectionSearchTerms(payload, address);
	const upcomingElections = (elections ?? [])
		.filter(election => Boolean(election?.id))
		.filter(isUpcomingElection)
		.sort((left, right) => String(left.electionDay || "").localeCompare(String(right.electionDay || "")));
	const jurisdictionMatches = upcomingElections.filter((election) => {
		const name = election.name?.toLowerCase() || "";
		return searchTerms.some(term => name.includes(term));
	});

	return (jurisdictionMatches.length ? jurisdictionMatches : upcomingElections).slice(0, electionRetryLimit);
}

function buildVoterInfoRequestUrl(address: string, apiKey: string, electionId?: number | string) {
	const requestUrl = new URL(lookupBaseUrl);
	requestUrl.searchParams.set("address", address);
	requestUrl.searchParams.set("key", apiKey);
	requestUrl.searchParams.set("officialOnly", "true");
	requestUrl.searchParams.set("returnAllAvailableData", "true");

	if (electionId !== undefined)
		requestUrl.searchParams.set("electionId", String(electionId));

	return requestUrl;
}

async function requestGoogleCivicJson<T>(
	resource: URL,
	{
		fetchImpl,
		forceIPv4,
		timeoutMs,
	}: Pick<GoogleCivicClientOptions, "fetchImpl" | "forceIPv4" | "timeoutMs">,
) {
	const response = await fetchGoogleCivic(resource, {
		fetchImpl,
		forceIPv4,
		signal: createFetchTimeoutSignal(resolveFetchTimeoutMs(timeoutMs)),
	});

	if (response.status === 400 || response.status === 404) {
		const errorPayload: GoogleCivicErrorResponse = await readProviderResponseJson<GoogleCivicErrorResponse>(response)
			.catch((error: unknown) => {
				if (error instanceof SyntaxError)
					return {} satisfies GoogleCivicErrorResponse;

				throw error;
			});

		return {
			errorPayload,
			ok: false as const,
			response,
		};
	}

	if (!response.ok)
		throw new Error(`Google Civic lookup failed: ${response.status} ${response.statusText}`);

	return {
		ok: true as const,
		payload: await readProviderResponseJson<T>(response),
		response,
	};
}

function pushOfficialAction(actions: LocationLookupAction[], id: string, title: string, url: string | undefined, description: string) {
	const safeUrl = normalizePublicHref(url);

	if (!safeUrl)
		return;

	actions.push({
		badge: "Official",
		description,
		id,
		kind: "official-verification",
		title,
		url: safeUrl
	});
}

function buildOfficialActions(payload: GoogleCivicVoterInfoResponse) {
	const body = payload.state?.[0]?.electionAdministrationBody;
	const actions: LocationLookupAction[] = [];

	pushOfficialAction(actions, "google-civic:election-info", "Official election information", body?.electionInfoUrl, "Open the election information page returned by Google Civic for this address.");
	pushOfficialAction(actions, "google-civic:sample-ballot", "Official ballot information", body?.ballotInfoUrl, "Open the official ballot or sample-ballot page returned for this address.");
	pushOfficialAction(actions, "google-civic:polling-finder", "Official polling-place finder", body?.votingLocationFinderUrl, "Open the official polling-place or voting-location finder returned for this address.");
	pushOfficialAction(actions, "google-civic:registration", "Registration and voter status", body?.electionRegistrationConfirmationUrl || body?.electionRegistrationUrl, "Confirm registration status or voter details in the official election system.");
	pushOfficialAction(actions, "google-civic:absentee", "Mail ballot information", body?.absenteeVotingInfoUrl, "Open the official absentee or vote-by-mail information returned for this address.");
	pushOfficialAction(actions, "google-civic:rules", "Official election rules", body?.electionRulesUrl || body?.electionNoticeUrl, "Open official election rules or notices associated with this address.");

	return actions;
}

function actionToOfficialResource(action: LocationLookupAction | undefined): OfficialResource | undefined {
	if (!action?.url)
		return undefined;

	return {
		authority: "official-government",
		label: action.title,
		note: action.description,
		sourceLabel: action.badge || "Official election verification",
		sourceSystem: "Google Civic official election link",
		url: action.url,
	};
}

function attachVerificationResource(
	previews: BallotContentPreview[],
	actions: LocationLookupAction[],
) {
	const ballotVerificationAction = actions.find(action => /ballot|voter|registration/i.test(`${action.title} ${action.description}`))
		?? actions.find(action => action.kind === "official-verification");
	const verificationResource = actionToOfficialResource(ballotVerificationAction);

	return previews.map(preview => ({
		...preview,
		verificationResource,
		verificationResourceLabel: verificationResource
			? `Verify with ${verificationResource.label}.`
			: preview.verificationResourceLabel,
	}));
}

function buildVerifiedBallotContentPreviews(payload: GoogleCivicVoterInfoResponse, actions: LocationLookupAction[]) {
	const ballotContentPreview = buildBallotContentPreview(payload);

	return ballotContentPreview
		? attachVerificationResource([ballotContentPreview], actions)
		: [];
}

export function shouldForceGoogleCivicIpv4(value = process.env.GOOGLE_CIVIC_FORCE_IPV4) {
	return truthyEnvPattern.test(value?.trim() ?? "");
}

export function createGoogleCivicLookup(lookupImpl: DnsLookupFn = dnsLookup as DnsLookupFn) {
	return (hostname: string, options: LookupOptions, callback: LookupCallback) => {
		lookupImpl(hostname, {
			all: options.all === true,
			family: 4,
			hints: options.hints
		}, callback as never);
	};
}

async function fetchGoogleCivicWithPreferredIpv4(resource: URL, headers: Record<string, string>, signal?: AbortSignal) {
	const maxResponseBytes = resolveProviderResponseMaxBytes();
	const response = await new Promise<{
		headers: Record<string, string | string[] | undefined>;
		statusCode: number;
		statusMessage: string;
		text: string;
	}>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("The operation was aborted.", "AbortError"));
			return;
		}

		let cleanupAbortListener = () => {};
		const request = httpsRequest(resource, {
			family: 4,
			headers,
		}, (response) => {
			const chunks: Buffer[] = [];
			const declaredLength = Number(response.headers["content-length"]);
			let receivedBytes = 0;

			response.on("error", (error) => {
				cleanupAbortListener();
				reject(error);
			});

			if (Number.isSafeInteger(declaredLength) && declaredLength > maxResponseBytes) {
				response.destroy(new ProviderResponseTooLargeError(maxResponseBytes, declaredLength));
				return;
			}

			response.on("data", (chunk) => {
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				receivedBytes += buffer.byteLength;

				if (receivedBytes > maxResponseBytes) {
					response.destroy(new ProviderResponseTooLargeError(maxResponseBytes, receivedBytes));
					return;
				}

				chunks.push(buffer);
			});
			response.on("end", () => {
				cleanupAbortListener();
				resolve({
					headers: response.headers,
					statusCode: response.statusCode ?? 500,
					statusMessage: response.statusMessage ?? "Unknown error",
					text: Buffer.concat(chunks).toString("utf8")
				});
			});
		});

		const abortRequest = () => {
			request.destroy(new DOMException("The operation was aborted.", "AbortError"));
		};

		signal?.addEventListener("abort", abortRequest, { once: true });
		cleanupAbortListener = () => signal?.removeEventListener("abort", abortRequest);
		request.on("error", (error) => {
			cleanupAbortListener();
			reject(error);
		});
		request.end();
	});

	return new Response(response.text, {
		headers: toResponseHeaders(response.headers),
		status: response.statusCode,
		statusText: response.statusMessage
	});
}

function toResponseHeaders(headers: Record<string, string | string[] | undefined>) {
	const responseHeaders = new Headers();

	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const item of value)
				responseHeaders.append(name, item);

			continue;
		}

		if (value !== undefined)
			responseHeaders.set(name, value);
	}

	return responseHeaders;
}

export async function fetchGoogleCivic(
	resource: URL,
	{
		fetchImpl = fetch,
		forceIPv4 = shouldForceGoogleCivicIpv4(),
		headers = {
			Accept: "application/json"
		},
		signal
	}: {
		fetchImpl?: typeof fetch;
		forceIPv4?: boolean;
		headers?: Record<string, string>;
		signal?: AbortSignal;
	} = {}
) {
	if (!forceIPv4 || fetchImpl !== fetch) {
		return fetchImpl(resource, {
			headers,
			signal
		});
	}

	return fetchGoogleCivicWithPreferredIpv4(resource, headers, signal);
}

export function createGoogleCivicClient(
	fetchOrOptions: typeof fetch | GoogleCivicClientOptions = fetch,
	apiKey = process.env.GOOGLE_CIVIC_API_KEY?.trim(),
	forceIPv4 = shouldForceGoogleCivicIpv4()
): GoogleCivicClient | null {
	const options = typeof fetchOrOptions === "function"
		? {
				apiKey,
				fetchImpl: fetchOrOptions,
				forceIPv4,
				timeoutMs: resolveFetchTimeoutMs(process.env.GOOGLE_CIVIC_FETCH_TIMEOUT_MS),
			}
		: {
				apiKey: process.env.GOOGLE_CIVIC_API_KEY?.trim(),
				fetchImpl: fetch,
				forceIPv4: shouldForceGoogleCivicIpv4(),
				timeoutMs: resolveFetchTimeoutMs(process.env.GOOGLE_CIVIC_FETCH_TIMEOUT_MS),
				...fetchOrOptions
			};
	options.timeoutMs = resolveFetchTimeoutMs(options.timeoutMs);

	const resolvedApiKey = options.apiKey?.trim();

	if (!resolvedApiKey)
		return null;

	return {
		async lookupVoterInfo(address: string) {
			const initialLookup = await requestGoogleCivicJson<GoogleCivicVoterInfoResponse>(
				buildVoterInfoRequestUrl(address, resolvedApiKey),
				{
					fetchImpl: options.fetchImpl,
					forceIPv4: options.forceIPv4,
					timeoutMs: options.timeoutMs,
				},
			);

			if (!initialLookup.ok && !electionUnknownPattern.test(initialLookup.errorPayload?.error?.message || "")) {
				return {
					actions: [],
					ballotContentPreviews: [],
					logistics: null,
					note: normalizeGoogleCivicError(initialLookup.errorPayload),
					verified: false,
				};
			}

			let payload = initialLookup.ok ? initialLookup.payload : null;

			if (
				(!payload && !initialLookup.ok)
				|| (payload && payload.normalizedInput && !hasStructuredElectionDetails(payload))
			) {
				const electionsLookup = await requestGoogleCivicJson<GoogleCivicElectionsResponse>(
					new URL(`${electionsBaseUrl}?key=${encodeURIComponent(resolvedApiKey)}`),
					{
						fetchImpl: options.fetchImpl,
						forceIPv4: options.forceIPv4,
						timeoutMs: options.timeoutMs,
					},
				);

				if (electionsLookup.ok) {
					const fallbackCandidates = selectFallbackElectionCandidates(
						electionsLookup.payload.elections,
						payload ?? { normalizedInput: undefined },
						address,
					);

					for (const election of fallbackCandidates) {
						const electionLookup = await requestGoogleCivicJson<GoogleCivicVoterInfoResponse>(
							buildVoterInfoRequestUrl(address, resolvedApiKey, election.id),
							{
								fetchImpl: options.fetchImpl,
								forceIPv4: options.forceIPv4,
								timeoutMs: options.timeoutMs,
							},
						);

						if (electionLookup.ok && hasStructuredElectionDetails(electionLookup.payload)) {
							payload = electionLookup.payload;
							break;
						}
					}
				}
			}

			if (!payload) {
				return {
					actions: [],
					ballotContentPreviews: [],
					logistics: null,
					note: normalizeGoogleCivicError(initialLookup.ok ? null : initialLookup.errorPayload),
					verified: false,
				};
			}

			const normalizedAddress = normalizeAddress(payload.normalizedInput);
			const pollingLocation = normalizeAddress(payload.pollingLocations?.[0]?.address);
			const actions = buildOfficialActions(payload);
			const logistics = buildElectionLogistics(payload);
			const otherElectionCount = payload.otherElections?.length ?? 0;
			const earlyVoteCount = payload.earlyVoteSites?.length ?? 0;
			const dropOffCount = payload.dropOffLocations?.length ?? 0;

			return {
				actions,
				ballotContentPreviews: buildVerifiedBallotContentPreviews(payload, actions),
				logistics,
				note: [
					normalizedAddress ? `Google Civic accepted the address as ${normalizedAddress}.` : "Google Civic accepted the submitted address.",
					payload.election?.name ? `The current official election record is ${payload.election.name}${payload.election.electionDay ? ` on ${payload.election.electionDay}` : ""}.` : "",
					!payload.election?.name ? "Google Civic did not return an election-specific record for this address, but it did accept the address format." : "",
					pollingLocation ? `The provider returned a polling location at ${pollingLocation}.` : "",
					earlyVoteCount ? `${earlyVoteCount} early-vote site${earlyVoteCount === 1 ? "" : "s"} returned.` : "",
					dropOffCount ? `${dropOffCount} ballot drop-off location${dropOffCount === 1 ? "" : "s"} returned.` : "",
					payload.mailOnly ? "This precinct is marked as mail-only." : "",
					otherElectionCount ? `${otherElectionCount} additional election${otherElectionCount === 1 ? "" : "s"} also matched this address.` : ""
				].filter(Boolean).join(" "),
				verified: true
			};
		}
	};
}
