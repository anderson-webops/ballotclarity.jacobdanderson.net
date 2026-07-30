import type { LocationDistrictMatch } from "./types/civic.js";
import process from "node:process";
import { readProviderResponseJson } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";

interface CensusGeocoderResponse {
	result?: {
		addressMatches?: CensusAddressMatch[];
	};
}

interface CensusAddressMatch {
	matchedAddress?: string;
	coordinates?: {
		x?: number;
		y?: number;
	};
	addressComponents?: {
		state?: string;
		zip?: string;
	};
	geographies?: Record<string, CensusGeographyItem[] | undefined>;
}

interface CensusGeographyItem {
	NAME?: string;
	GEOID?: string;
	COUNTY?: string;
	STATE?: string;
	BASENAME?: string;
	SLDU?: string;
	SLDL?: string;
}

export interface CensusAddressLookupResult {
	benchmark: string;
	countyFips?: string;
	districtMatches: LocationDistrictMatch[];
	latitude?: number;
	longitude?: number;
	normalizedAddress: string;
	state?: string;
	vintage: string;
	zip5?: string;
}

export interface CensusGeocoderClient {
	lookupAddress: (address: string) => Promise<CensusAddressLookupResult | null>;
}

interface CensusGeocoderClientOptions {
	benchmark?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	vintage?: string;
}

const defaultBenchmark = "Public_AR_Current";
const defaultVintage = "Current_Current";
const geocoderUrl = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

function inferDistrictType(layerName: string) {
	const normalized = layerName.toLowerCase();

	if (normalized.includes("congressional district"))
		return "congressional";

	if (normalized.includes("state legislative districts - upper"))
		return "state-senate";

	if (normalized.includes("state legislative districts - lower"))
		return "state-house";

	if (normalized.includes("counties"))
		return "county";

	if (normalized.includes("incorporated places"))
		return "place";

	return null;
}

function districtTypeRank(districtType: string) {
	switch (districtType) {
		case "county":
			return 1;
		case "congressional":
			return 2;
		case "state-senate":
			return 3;
		case "state-house":
			return 4;
		case "place":
			return 5;
		default:
			return 99;
	}
}

function inferDistrictCode(layerName: string, geography: CensusGeographyItem) {
	const districtType = inferDistrictType(layerName);

	switch (districtType) {
		case "congressional":
			return geography.BASENAME || geography.GEOID || "";
		case "state-senate":
			return geography.SLDU || geography.BASENAME || geography.GEOID || "";
		case "state-house":
			return geography.SLDL || geography.BASENAME || geography.GEOID || "";
		case "county":
			return geography.COUNTY || geography.GEOID || "";
		case "place":
			return geography.GEOID || geography.BASENAME || "";
		default:
			return "";
	}
}

export function buildDistrictMatches(geographies: Record<string, CensusGeographyItem[] | undefined> | undefined) {
	if (!geographies)
		return [];

	const districtMatches: LocationDistrictMatch[] = [];

	for (const [layerName, items] of Object.entries(geographies)) {
		const districtType = inferDistrictType(layerName);

		if (!districtType || !items?.length)
			continue;

		const geography = items[0];
		const label = geography.NAME?.trim() || `${layerName} ${geography.BASENAME || geography.GEOID || ""}`.trim();
		const districtCode = inferDistrictCode(layerName, geography);

		districtMatches.push({
			districtCode,
			districtType,
			id: `${districtType}:${districtCode || geography.GEOID || label}`,
			label,
			sourceSystem: "U.S. Census Geocoder"
		});
	}

	return districtMatches.sort((left, right) => {
		return districtTypeRank(left.districtType) - districtTypeRank(right.districtType)
			|| left.label.localeCompare(right.label);
	});
}

export function createCensusGeocoderClient({
	benchmark = process.env.CENSUS_GEOCODER_BENCHMARK?.trim() || defaultBenchmark,
	fetchImpl = fetch,
	timeoutMs = resolveFetchTimeoutMs(process.env.CENSUS_GEOCODER_FETCH_TIMEOUT_MS),
	vintage = process.env.CENSUS_GEOCODER_VINTAGE?.trim() || defaultVintage
}: CensusGeocoderClientOptions = {}): CensusGeocoderClient {
	const resolvedTimeoutMs = resolveFetchTimeoutMs(timeoutMs);

	return {
		async lookupAddress(address: string) {
			const requestUrl = new URL(geocoderUrl);
			requestUrl.searchParams.set("address", address);
			requestUrl.searchParams.set("benchmark", benchmark);
			requestUrl.searchParams.set("vintage", vintage);
			requestUrl.searchParams.set("format", "json");

			const response = await fetchImpl(requestUrl, {
				headers: {
					Accept: "application/json"
				},
				signal: createFetchTimeoutSignal(resolvedTimeoutMs),
			});

			if (!response.ok)
				throw new Error(`Census geocoder lookup failed: ${response.status} ${response.statusText}`);

			const payload = await readProviderResponseJson<CensusGeocoderResponse>(response);
			const match = payload.result?.addressMatches?.[0];

			if (!match)
				return null;

			return {
				benchmark,
				countyFips: match.geographies?.Counties?.[0]?.COUNTY,
				districtMatches: buildDistrictMatches(match.geographies),
				latitude: match.coordinates?.y,
				longitude: match.coordinates?.x,
				normalizedAddress: match.matchedAddress?.trim() || address.trim(),
				state: match.addressComponents?.state,
				vintage,
				zip5: match.addressComponents?.zip
			};
		}
	};
}
