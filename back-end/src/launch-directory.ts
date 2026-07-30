import type { CongressClient, CongressMemberRecord } from "./congress.js";
import type { OpenStatesClient, OpenStatesRepresentativeRecord } from "./openstates.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { readProviderResponseJson, readProviderResponseText } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";
import { fetchGoogleCivic, shouldForceGoogleCivicIpv4 } from "./google-civic.js";
import { launchTargetProfile } from "./launch-profile.js";

interface GoogleCivicElectionRecord {
	electionDay?: string;
	id?: string;
	name?: string;
	ocdDivisionId?: string;
}

interface GoogleCivicElectionsResponse {
	elections?: GoogleCivicElectionRecord[];
}

export interface LaunchDirectoryElectionSummary {
	electionDay: string;
	id: string;
	name: string;
	ocdDivisionId?: string;
}

export interface LaunchDirectoryProviderStatus {
	detail: string;
	recordCount: number;
	status: "configured" | "degraded" | "pending-crosswalk" | "skipped";
	updatedAt: string;
}

export interface LaunchDirectorySnapshot {
	federalRepresentatives: CongressMemberRecord[];
	geoMatchedRepresentatives: OpenStatesRepresentativeRecord[];
	launchTarget: {
		displayName: string;
		name: string;
		phase: string;
		slug: string;
		state: string;
	};
	notes: string[];
	providerStatus: {
		congress: LaunchDirectoryProviderStatus;
		googleCivic: LaunchDirectoryProviderStatus;
		lda: LaunchDirectoryProviderStatus;
		openfec: LaunchDirectoryProviderStatus;
		openstates: LaunchDirectoryProviderStatus;
	};
	stateRepresentatives: OpenStatesRepresentativeRecord[];
	updatedAt: string;
	upcomingElections: LaunchDirectoryElectionSummary[];
}

interface BuildLaunchDirectorySnapshotOptions {
	congressClient?: CongressClient | null;
	fetchImpl?: typeof fetch;
	googleCivicApiKey?: string;
	googleCivicTimeoutMs?: number;
	launchLatitude?: number;
	launchLongitude?: number;
	openStatesClient?: OpenStatesClient | null;
}

const googleCivicIpRestrictionPattern = /ip address restriction/i;

function defaultLaunchDirectoryFile() {
	return resolve(process.cwd(), "data", "launch-directory.local.json");
}

function createSkippedStatus(detail: string): LaunchDirectoryProviderStatus {
	return {
		detail,
		recordCount: 0,
		status: "skipped",
		updatedAt: new Date().toISOString()
	};
}

async function fetchUpcomingElections(
	googleCivicApiKey: string | undefined,
	fetchImpl: typeof fetch,
	timeoutMs: number
) {
	if (!googleCivicApiKey) {
		return {
			items: [] as LaunchDirectoryElectionSummary[],
			status: createSkippedStatus("GOOGLE_CIVIC_API_KEY is not configured for launch-directory sync.")
		};
	}

	const requestUrl = new URL("https://www.googleapis.com/civicinfo/v2/elections");
	requestUrl.searchParams.set("key", googleCivicApiKey);
	let response = await fetchGoogleCivic(requestUrl, {
		fetchImpl,
		forceIPv4: shouldForceGoogleCivicIpv4(),
		signal: createFetchTimeoutSignal(timeoutMs)
	});

	if (!response.ok && response.status === 403) {
		const firstBody = await readProviderResponseText(response);

		if (googleCivicIpRestrictionPattern.test(firstBody) && fetchImpl === fetch) {
			response = await fetchGoogleCivic(requestUrl, {
				fetchImpl,
				forceIPv4: true,
				signal: createFetchTimeoutSignal(timeoutMs)
			});
		}
		else {
			throw new Error(`Google Civic elections lookup failed: ${response.status} ${firstBody}`.slice(0, 500));
		}
	}

	if (!response.ok) {
		const detail = await readProviderResponseText(response);

		throw new Error(`Google Civic elections lookup failed: ${response.status} ${detail}`.slice(0, 500));
	}

	const payload = await readProviderResponseJson<GoogleCivicElectionsResponse>(response);
	const items = (payload.elections ?? [])
		.filter(item => item.ocdDivisionId?.includes("/state:ga"))
		.map(item => ({
			electionDay: item.electionDay?.trim() || "",
			id: item.id?.trim() || "unknown-election",
			name: item.name?.trim() || "Unknown election",
			ocdDivisionId: item.ocdDivisionId?.trim() || undefined
		}))
		.sort((left, right) => left.electionDay.localeCompare(right.electionDay));

	return {
		items,
		status: {
			detail: items.length
				? `Google Civic returned ${items.length} Georgia election record${items.length === 1 ? "" : "s"} for the launch snapshot.`
				: "Google Civic returned no Georgia election records for the launch snapshot.",
			recordCount: items.length,
			status: "configured" as const,
			updatedAt: new Date().toISOString()
		}
	};
}

async function fetchOpenStatesLaunchData(
	openStatesClient: OpenStatesClient | null,
	launchLatitude: number,
	launchLongitude: number,
	updatedAt: string
) {
	if (!openStatesClient) {
		return {
			geoMatchedRepresentatives: [] as OpenStatesRepresentativeRecord[],
			stateRepresentatives: [] as OpenStatesRepresentativeRecord[],
			status: createSkippedStatus("OPENSTATES_API_KEY is not configured for launch-directory sync.")
		};
	}

	let stateRepresentatives: OpenStatesRepresentativeRecord[] = [];
	let geoMatchedRepresentatives: OpenStatesRepresentativeRecord[] = [];
	const notes: string[] = [];
	let degraded = false;

	try {
		stateRepresentatives = await openStatesClient.listPeopleByJurisdiction("Georgia", {
			maxPages: 1,
			perPage: 50
		});
		notes.push(`Open States returned ${stateRepresentatives.length} Georgia people records from the first launch-directory page.`);
	}
	catch (error) {
		degraded = true;
		notes.push(`Statewide Open States listing did not complete: ${error instanceof Error ? error.message : String(error)}.`);
	}

	try {
		geoMatchedRepresentatives = await openStatesClient.lookupPeopleByCoordinates(launchLatitude, launchLongitude).then(matches => matches.map(match => ({
			districtLabel: match.districtLabel,
			id: match.id,
			name: match.name,
			officeTitle: match.officeTitle,
			openstatesUrl: match.openstatesUrl,
			party: match.party
		})));
		notes.push(`Open States returned ${geoMatchedRepresentatives.length} launch-area matches at the configured Fulton/Atlanta probe point.`);
	}
	catch (error) {
		degraded = true;
		notes.push(`Launch-area Open States geo matching did not complete: ${error instanceof Error ? error.message : String(error)}.`);
	}

	return {
		geoMatchedRepresentatives,
		stateRepresentatives,
		status: {
			detail: notes.join(" "),
			recordCount: stateRepresentatives.length,
			status: degraded ? "degraded" : "configured",
			updatedAt
		} satisfies LaunchDirectoryProviderStatus
	};
}

export async function buildLaunchDirectorySnapshot({
	congressClient = null,
	fetchImpl = fetch,
	googleCivicApiKey = process.env.GOOGLE_CIVIC_API_KEY?.trim(),
	googleCivicTimeoutMs = resolveFetchTimeoutMs(process.env.GOOGLE_CIVIC_FETCH_TIMEOUT_MS),
	launchLatitude = Number(process.env.LAUNCH_PROFILE_LATITUDE || 33.7490),
	launchLongitude = Number(process.env.LAUNCH_PROFILE_LONGITUDE || -84.3880),
	openStatesClient = null
}: BuildLaunchDirectorySnapshotOptions = {}): Promise<LaunchDirectorySnapshot> {
	const updatedAt = new Date().toISOString();
	const [googleCivic, federalRepresentatives, openStates] = await Promise.all([
		fetchUpcomingElections(googleCivicApiKey, fetchImpl, resolveFetchTimeoutMs(googleCivicTimeoutMs)),
		congressClient
			? congressClient.listMembersByState("GA")
			: Promise.resolve([] as CongressMemberRecord[]),
		fetchOpenStatesLaunchData(openStatesClient, launchLatitude, launchLongitude, updatedAt)
	]);

	return {
		federalRepresentatives,
		geoMatchedRepresentatives: openStates.geoMatchedRepresentatives,
		launchTarget: {
			displayName: launchTargetProfile.displayName,
			name: launchTargetProfile.name,
			phase: launchTargetProfile.phase,
			slug: launchTargetProfile.slug,
			state: launchTargetProfile.state
		},
		notes: [
			"The launch directory snapshot is an ingestion artifact for future district and representative pages. It is not yet the public read model.",
			"OpenFEC and LDA remain pending because candidate-to-finance and influence crosswalks still need deliberate editorial mapping before they should drive public pages."
		],
		providerStatus: {
			congress: congressClient
				? {
						detail: `Congress.gov returned ${federalRepresentatives.length} Georgia member record${federalRepresentatives.length === 1 ? "" : "s"}.`,
						recordCount: federalRepresentatives.length,
						status: "configured",
						updatedAt
					}
				: createSkippedStatus("CONGRESS_API_KEY or DATA_API_KEY is not configured for launch-directory sync."),
			googleCivic: googleCivic.status,
			lda: {
				detail: "LDA.gov is configured for diagnostics, but public influence pages still need a curated candidate-to-filing crosswalk before this source should flow into public page models.",
				recordCount: 0,
				status: process.env.LDA_API_KEY?.trim() ? "pending-crosswalk" : "skipped",
				updatedAt
			},
			openfec: {
				detail: "OpenFEC is configured for diagnostics, but public funding pages still need a curated candidate-to-committee crosswalk before this source should replace editorial summaries.",
				recordCount: 0,
				status: (process.env.OPENFEC_API_KEY?.trim() || process.env.DATA_API_KEY?.trim()) ? "pending-crosswalk" : "skipped",
				updatedAt
			},
			openstates: openStates.status
		},
		stateRepresentatives: openStates.stateRepresentatives,
		updatedAt,
		upcomingElections: googleCivic.items
	};
}

export function writeLaunchDirectorySnapshot(snapshot: LaunchDirectorySnapshot, outputPath = process.env.LAUNCH_DIRECTORY_FILE || defaultLaunchDirectoryFile()) {
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
	return outputPath;
}

export function readLaunchDirectorySnapshot(inputPath = process.env.LAUNCH_DIRECTORY_FILE || defaultLaunchDirectoryFile()) {
	return JSON.parse(readFileSync(inputPath, "utf8")) as LaunchDirectorySnapshot;
}
