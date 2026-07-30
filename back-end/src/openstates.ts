import type { LocationRepresentativeMatch, ProfileImage } from "./types/civic.js";
import process from "node:process";
import { readProviderResponseJson, readProviderResponseText } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";
import { uniqueProfileImages } from "./profile-images.js";
import { classifyRepresentative } from "./representative-classification.js";

interface OpenStatesPersonResponse {
	results?: OpenStatesPerson[];
	pagination?: {
		max_page?: number;
		page?: number;
		total_items?: number;
	};
}

interface OpenStatesPerson {
	id?: string;
	image?: string;
	name?: string;
	party?: string;
	openstates_url?: string;
	updated_at?: string;
	current_role?: {
		title?: string;
		district?: string;
		org_classification?: string;
		division_id?: string;
	};
	jurisdiction?: {
		name?: string;
	};
}

export interface OpenStatesRepresentativeRecord {
	currentRoleClassification?: string;
	currentRoleDistrict?: string;
	currentRoleDivisionId?: string;
	id: string;
	name: string;
	party?: string;
	districtLabel: string;
	jurisdictionName?: string;
	officeTitle: string;
	openstatesUrl?: string;
	updatedAt?: string;
	profileImages?: ProfileImage[];
}

export interface OpenStatesClient {
	listPeopleByJurisdiction: (jurisdiction: string, options?: { maxPages?: number; perPage?: number }) => Promise<OpenStatesRepresentativeRecord[]>;
	lookupPeopleByCoordinates: (latitude: number, longitude: number) => Promise<LocationRepresentativeMatch[]>;
	searchPeopleByName: (name: string, options?: { current?: boolean; jurisdiction?: string; perPage?: number }) => Promise<OpenStatesRepresentativeRecord[]>;
}

interface OpenStatesClientOptions {
	apiKey?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

function mapRepresentative(person: OpenStatesPerson): OpenStatesRepresentativeRecord {
	const officeTitle = person.current_role?.title?.trim()
		|| (person.current_role?.org_classification === "upper" ? "Senator" : "Representative");
	const district = person.current_role?.district?.trim() || "Unknown district";
	const jurisdictionName = person.jurisdiction?.name?.trim();
	const profileImages = uniqueProfileImages([
		person.image
			? {
					alt: `Portrait of ${person.name?.trim() || "representative"}`,
					capturedAt: person.updated_at?.trim() || undefined,
					priority: 20,
					sourceKind: "provider",
					sourceLabel: "Open States image",
					sourceSystem: "Open States",
					sourceUrl: person.openstates_url?.trim() || undefined,
					url: person.image,
				}
			: null,
	]);

	return {
		currentRoleClassification: person.current_role?.org_classification?.trim() || undefined,
		currentRoleDistrict: person.current_role?.district?.trim() || undefined,
		currentRoleDivisionId: person.current_role?.division_id?.trim() || undefined,
		districtLabel: jurisdictionName && district === jurisdictionName ? district : `${officeTitle} ${district}`,
		id: person.id?.trim() || `${officeTitle}:${person.name?.trim() || "unknown"}`,
		jurisdictionName,
		name: person.name?.trim() || "Unknown representative",
		officeTitle,
		openstatesUrl: person.openstates_url?.trim() || undefined,
		party: person.party?.trim() || undefined,
		profileImages: profileImages.length ? profileImages : undefined,
		updatedAt: person.updated_at?.trim() || undefined,
	};
}

function toLocationRepresentative(person: OpenStatesRepresentativeRecord): LocationRepresentativeMatch {
	const classification = classifyRepresentative({
		districtLabel: person.districtLabel,
		officeTitle: person.officeTitle,
		stateName: person.jurisdictionName,
	});

	return {
		districtLabel: person.districtLabel,
		governmentLevel: classification.governmentLevel,
		id: person.id,
		name: person.name,
		officeDisplayLabel: classification.officeDisplayLabel,
		officeType: classification.officeType,
		officeTitle: person.officeTitle,
		openstatesUrl: person.openstatesUrl,
		party: person.party,
		profileImages: person.profileImages,
		sourceSystem: "Open States"
	};
}

export function createOpenStatesClient({
	apiKey = process.env.OPENSTATES_API_KEY?.trim(),
	fetchImpl = fetch,
	timeoutMs = resolveFetchTimeoutMs(process.env.OPENSTATES_FETCH_TIMEOUT_MS)
}: OpenStatesClientOptions = {}): OpenStatesClient | null {
	const resolvedApiKey = apiKey?.trim();

	if (!resolvedApiKey)
		return null;

	const apiKeyValue = resolvedApiKey;
	const resolvedTimeoutMs = resolveFetchTimeoutMs(timeoutMs);

	async function fetchOpenStates(pathname: string, query: Record<string, string>) {
		const requestUrl = new URL(pathname, "https://v3.openstates.org");

		requestUrl.searchParams.set("apikey", apiKeyValue);

		for (const [key, value] of Object.entries(query))
			requestUrl.searchParams.set(key, value);

		const response = await fetchImpl(requestUrl, {
			headers: {
				Accept: "application/json"
			},
			signal: createFetchTimeoutSignal(resolvedTimeoutMs)
		});

		if (!response.ok) {
			const detail = await readProviderResponseText(response);

			throw new Error(`Open States lookup failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`.slice(0, 500));
		}

		return await readProviderResponseJson<OpenStatesPersonResponse>(response);
	}

	return {
		async lookupPeopleByCoordinates(latitude: number, longitude: number) {
			const payload = await fetchOpenStates("/people.geo", {
				lat: String(latitude),
				lng: String(longitude)
			});

			return (payload.results ?? []).map(mapRepresentative).map(toLocationRepresentative);
		},
		async listPeopleByJurisdiction(jurisdiction: string, options = {}) {
			const perPage = Math.min(Math.max(options.perPage ?? 50, 1), 50);
			const maxPages = Math.min(Math.max(options.maxPages ?? 10, 1), 10);
			const firstPage = await fetchOpenStates("/people", {
				jurisdiction,
				page: "1",
				per_page: String(perPage)
			});
			const people = [...(firstPage.results ?? [])];
			const lastPage = Math.min(firstPage.pagination?.max_page ?? 1, maxPages);

			for (let page = 2; page <= lastPage; page += 1) {
				const payload = await fetchOpenStates("/people", {
					jurisdiction,
					page: String(page),
					per_page: String(perPage)
				});

				people.push(...(payload.results ?? []));
			}

			return people.map(mapRepresentative);
		},
		async searchPeopleByName(name: string, options = {}) {
			const trimmedName = name.trim();

			if (!trimmedName)
				return [];

			const payload = await fetchOpenStates("/people", {
				...(options.current === false ? {} : { current: "true" }),
				...(options.jurisdiction ? { jurisdiction: options.jurisdiction } : {}),
				name: trimmedName,
				page: "1",
				per_page: String(Math.min(Math.max(options.perPage ?? 10, 1), 50)),
			});

			return (payload.results ?? []).map(mapRepresentative);
		}
	};
}
