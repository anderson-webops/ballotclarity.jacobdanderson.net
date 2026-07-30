import type { OpenStatesClient } from "./openstates.js";
import type { LocationRepresentativeMatch } from "./types/civic.js";
import process from "node:process";
import { buildDistrictMatches } from "./census-geocoder.js";
import { readProviderResponseJson } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";

interface ZipLocationApiPlace {
	latitude?: string;
	longitude?: string;
	state?: string;
}

interface ZipLocationApiPlaceLabels {
	"place name"?: string;
	"state abbreviation"?: string;
}

interface ZipLocationApiResponseBase {
	places?: Array<ZipLocationApiPlace & ZipLocationApiPlaceLabels>;
}

interface ZipLocationApiResponseLabels {
	"post code"?: string;
}

type ZipLocationApiResponse = ZipLocationApiResponseBase & ZipLocationApiResponseLabels;

interface CensusCoordinatesResponse {
	result?: {
		geographies?: Record<string, Array<{
			COUNTY?: string;
			NAME?: string;
			STUSAB?: string;
		}> | undefined>;
	};
}

export interface ZipLocationMatch {
	id: string;
	countyFips?: string;
	countyName?: string;
	districtMatches: ReturnType<typeof buildDistrictMatches>;
	latitude?: number;
	longitude?: number;
	locality?: string;
	postalCode: string;
	representativeMatches: LocationRepresentativeMatch[];
	sourceSystem: string;
	stateAbbreviation?: string;
	stateName?: string;
}

export interface ZipLocationLookup {
	matches: ZipLocationMatch[];
	postalCode: string;
}

export interface ZipLocationService {
	lookupZip: (zipCode: string) => Promise<ZipLocationLookup | null>;
}

interface ZipLocationServiceOptions {
	benchmark?: string;
	fetchImpl?: typeof fetch;
	openStatesClient?: OpenStatesClient | null;
	timeoutMs?: number;
	vintage?: string;
}

const defaultBenchmark = "Public_AR_Current";
const defaultVintage = "Current_Current";
const zippopotamUrl = "https://api.zippopotam.us/us";
const censusCoordinatesUrl = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";

function toNumber(value: string | undefined) {
	if (!value)
		return undefined;

	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeKey(value: string | number | undefined) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function buildMatchId(
	postalCode: string,
	locality: string | undefined,
	stateAbbreviation: string | undefined,
	latitude: number | undefined,
	longitude: number | undefined
) {
	return [
		"zip",
		normalizeKey(postalCode),
		normalizeKey(locality),
		normalizeKey(stateAbbreviation),
		normalizeKey(latitude),
		normalizeKey(longitude)
	].filter(Boolean).join(":");
}

async function lookupCoordinatesContext(
	fetchImpl: typeof fetch,
	latitude: number | undefined,
	longitude: number | undefined,
	benchmark: string,
	vintage: string,
	timeoutMs: number
) {
	if (latitude === undefined || longitude === undefined) {
		return {
			countyFips: undefined,
			countyName: undefined,
			districtMatches: [],
			stateAbbreviation: undefined,
			stateName: undefined
		};
	}

	const requestUrl = new URL(censusCoordinatesUrl);
	requestUrl.searchParams.set("x", String(longitude));
	requestUrl.searchParams.set("y", String(latitude));
	requestUrl.searchParams.set("benchmark", benchmark);
	requestUrl.searchParams.set("vintage", vintage);
	requestUrl.searchParams.set("format", "json");

	const response = await fetchImpl(requestUrl, {
		headers: {
			Accept: "application/json"
		},
		signal: createFetchTimeoutSignal(timeoutMs),
	});

	if (!response.ok)
		throw new Error(`Census reverse-geography lookup failed: ${response.status} ${response.statusText}`);

	const payload = await readProviderResponseJson<CensusCoordinatesResponse>(response);
	const geographies = payload.result?.geographies;
	const county = geographies?.Counties?.[0];
	const state = geographies?.States?.[0];

	return {
		countyFips: county?.COUNTY,
		countyName: county?.NAME,
		districtMatches: buildDistrictMatches(geographies),
		stateAbbreviation: state?.STUSAB,
		stateName: state?.NAME
	};
}

async function resolveRepresentativeMatchesSafely(
	openStatesClient: OpenStatesClient | null | undefined,
	latitude: number | undefined,
	longitude: number | undefined
) {
	if (!openStatesClient || latitude === undefined || longitude === undefined)
		return [];

	try {
		return await openStatesClient.lookupPeopleByCoordinates(latitude, longitude);
	}
	catch {
		return [];
	}
}

export function createZipLocationService({
	benchmark = process.env.CENSUS_GEOCODER_BENCHMARK?.trim() || defaultBenchmark,
	fetchImpl = fetch,
	openStatesClient = null,
	timeoutMs = resolveFetchTimeoutMs(process.env.ZIP_LOCATION_FETCH_TIMEOUT_MS),
	vintage = process.env.CENSUS_GEOCODER_VINTAGE?.trim() || defaultVintage
}: ZipLocationServiceOptions = {}): ZipLocationService {
	const resolvedTimeoutMs = resolveFetchTimeoutMs(timeoutMs);

	return {
		async lookupZip(zipCode: string) {
			const response = await fetchImpl(`${zippopotamUrl}/${encodeURIComponent(zipCode)}`, {
				headers: {
					Accept: "application/json"
				},
				signal: createFetchTimeoutSignal(resolvedTimeoutMs),
			});

			if (response.status === 404)
				return null;

			if (!response.ok)
				throw new Error(`ZIP lookup failed: ${response.status} ${response.statusText}`);

			const payload = await readProviderResponseJson<ZipLocationApiResponse>(response);
			const postalCode = payload["post code"];

			if (!postalCode || !payload.places?.length)
				return null;

			const matches = (await Promise.all(payload.places.map(async (place) => {
				const latitude = toNumber(place.latitude);
				const longitude = toNumber(place.longitude);
				const geoContext = await lookupCoordinatesContext(
					fetchImpl,
					latitude,
					longitude,
					benchmark,
					vintage,
					resolvedTimeoutMs
				)
					.catch(() => ({
						countyFips: undefined,
						countyName: undefined,
						districtMatches: [] as ReturnType<typeof buildDistrictMatches>,
						stateAbbreviation: undefined,
						stateName: undefined
					}));
				const locality = place["place name"]?.trim();
				const stateAbbreviation = geoContext.stateAbbreviation || place["state abbreviation"]?.trim();
				const stateName = geoContext.stateName || place.state?.trim();

				return {
					countyFips: geoContext.countyFips,
					countyName: geoContext.countyName,
					districtMatches: geoContext.districtMatches,
					id: buildMatchId(postalCode, locality, stateAbbreviation, latitude, longitude),
					latitude,
					longitude,
					locality,
					postalCode,
					representativeMatches: await resolveRepresentativeMatchesSafely(openStatesClient, latitude, longitude),
					sourceSystem: "Zippopotam.us + U.S. Census Geocoder",
					stateAbbreviation,
					stateName
				} satisfies ZipLocationMatch;
			}))).filter((match, index, items) => items.findIndex(item => item.id === match.id) === index);

			return {
				matches,
				postalCode
			};
		}
	};
}
