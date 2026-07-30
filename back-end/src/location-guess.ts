import type { Request } from "express";
import type { LocationGuessCapability, LocationGuessMode } from "./types/civic.js";
import { validateHeaderName } from "node:http";
import process from "node:process";
import { containsControlCharacters } from "./text-validation.js";

export interface LocationGuessInput {
	city?: string;
	country?: string;
	postalCode?: string;
	region?: string;
	rawQuery: string;
}

interface ProxyHeaderConfig {
	cityHeaders: string[];
	countryHeaders: string[];
	postalCodeHeaders: string[];
	regionHeaders: string[];
}

const postalCodePattern = /^\d{5}(?:-\d{4})?$/u;
const maximumProxyHeaderNamesPerField = 16;
const truthyEnvPattern = /^(?:1|true|yes|on)$/iu;

export interface LocationGuessServiceOptions {
	mode?: LocationGuessMode | null;
	proxyHeaders?: Partial<ProxyHeaderConfig>;
	trustProxyHeaders?: boolean;
}

export interface LocationGuessService {
	buildGuess: (request: Request) => LocationGuessInput | null;
	publicConfig: LocationGuessCapability;
	varyHeaders: string[];
}

function normalizeMode(value?: string | null): LocationGuessMode {
	const normalized = (value || "").trim();

	switch (normalized) {
		case "browser_geolocation":
		case "geoip_provider":
		case "proxy_headers":
			return normalized as LocationGuessMode;
		default:
			return "disabled";
	}
}

function isValidHeaderName(value: string) {
	try {
		validateHeaderName(value);
		return true;
	}
	catch {
		return false;
	}
}

function parseHeaderList(value?: string | null) {
	return (value || "")
		.split(",")
		.map(item => item.trim())
		.filter(item => item.length <= 128 && isValidHeaderName(item))
		.slice(0, maximumProxyHeaderNamesPerField);
}

function readHeaderList(
	envPlural: string,
	envSingular: string,
	override?: string[]
) {
	if (override)
		return parseHeaderList(override.join(","));

	const envValue = process.env[envPlural] ?? process.env[envSingular];

	return parseHeaderList(envValue);
}

function readRequestHeader(request: Request, names: string[]) {
	for (const name of names) {
		const value = request.header(name)?.trim();

		if (value)
			return value;
	}

	return undefined;
}

function normalizeGeoHeaderValue(value: string | undefined, maximumLength: number) {
	const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";

	if (!normalized || normalized.length > maximumLength || containsControlCharacters(normalized))
		return undefined;

	return normalized;
}

function buildProxyHeaderGuess(request: Request, proxyHeaders: ProxyHeaderConfig) {
	const country = normalizeGeoHeaderValue(readRequestHeader(request, proxyHeaders.countryHeaders), 2)?.toUpperCase();
	const rawPostalCode = normalizeGeoHeaderValue(readRequestHeader(request, proxyHeaders.postalCodeHeaders), 10);
	const postalCode = rawPostalCode && postalCodePattern.test(rawPostalCode) ? rawPostalCode : undefined;
	const city = normalizeGeoHeaderValue(readRequestHeader(request, proxyHeaders.cityHeaders), 120);
	const region = normalizeGeoHeaderValue(readRequestHeader(request, proxyHeaders.regionHeaders), 64);

	if (country && country !== "US")
		return null;

	if (postalCode) {
		return {
			city,
			country,
			postalCode,
			rawQuery: postalCode,
			region
		} satisfies LocationGuessInput;
	}

	if (city && region) {
		return {
			city,
			country,
			rawQuery: `${city}, ${region}`,
			region
		} satisfies LocationGuessInput;
	}

	return null;
}

export function buildLocationGuessNotePrefix(guess: LocationGuessInput) {
	if (guess.postalCode && guess.city && guess.region)
		return `Ballot Clarity made a best-effort location guess from your IP address and started with ZIP code ${guess.postalCode} near ${guess.city}, ${guess.region}.`;

	if (guess.postalCode)
		return `Ballot Clarity made a best-effort location guess from your IP address and started with ZIP code ${guess.postalCode}.`;

	if (guess.city && guess.region)
		return `Ballot Clarity made a best-effort location guess from your IP address and started with ${guess.city}, ${guess.region}.`;

	return "Ballot Clarity made a best-effort location guess from your IP address.";
}

export function createLocationGuessService(
	options: LocationGuessServiceOptions = {}
): LocationGuessService {
	const mode = normalizeMode(options.mode ?? process.env.LOCATION_GUESS_MODE);
	const proxyHeaders: ProxyHeaderConfig = {
		cityHeaders: readHeaderList(
			"LOCATION_GUESS_PROXY_CITY_HEADERS",
			"LOCATION_GUESS_PROXY_CITY_HEADER",
			options.proxyHeaders?.cityHeaders
		),
		countryHeaders: readHeaderList(
			"LOCATION_GUESS_PROXY_COUNTRY_HEADERS",
			"LOCATION_GUESS_PROXY_COUNTRY_HEADER",
			options.proxyHeaders?.countryHeaders
		),
		postalCodeHeaders: readHeaderList(
			"LOCATION_GUESS_PROXY_POSTAL_CODE_HEADERS",
			"LOCATION_GUESS_PROXY_POSTAL_CODE_HEADER",
			options.proxyHeaders?.postalCodeHeaders
		),
		regionHeaders: readHeaderList(
			"LOCATION_GUESS_PROXY_REGION_HEADERS",
			"LOCATION_GUESS_PROXY_REGION_HEADER",
			options.proxyHeaders?.regionHeaders
		)
	};
	const configuredVaryHeaders = Array.from(new Set([
		...proxyHeaders.postalCodeHeaders,
		...proxyHeaders.cityHeaders,
		...proxyHeaders.regionHeaders,
		...proxyHeaders.countryHeaders
	]));
	const trustProxyHeaders = options.trustProxyHeaders
		?? (options.proxyHeaders
			? true
			: truthyEnvPattern.test(process.env.LOCATION_GUESS_PROXY_HEADERS_TRUSTED?.trim() ?? ""));
	const canGuessOnLoad = mode === "proxy_headers"
		&& trustProxyHeaders
		&& (
			proxyHeaders.postalCodeHeaders.length > 0
			|| (proxyHeaders.cityHeaders.length > 0 && proxyHeaders.regionHeaders.length > 0)
		);
	const varyHeaders = canGuessOnLoad ? configuredVaryHeaders : [];

	return {
		buildGuess(request) {
			if (!canGuessOnLoad)
				return null;

			if (mode === "proxy_headers")
				return buildProxyHeaderGuess(request, proxyHeaders);

			return null;
		},
		publicConfig: {
			canGuessOnLoad,
			mode
		},
		varyHeaders
	};
}
