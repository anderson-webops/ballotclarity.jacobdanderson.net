import type {
	Contest,
	DistrictsResponse,
	DistrictSummary,
	LocationDistrictMatch,
	LocationRepresentativeMatch,
	NationwideLookupResultContext,
	RepresentativesResponse,
	Source
} from "~/types/civic";
import { buildDistrictMatchKeys, buildRepresentativeMatchKeys } from "./canonical-district";
import { buildNationwideRepresentativeSlug, toLookupSlug } from "./nationwide-slug";
import { classifyRepresentative } from "./representative-classification";

function deriveNationwideDistrictJurisdiction(districtType: string): Contest["jurisdiction"] {
	const normalizedType = districtType.toLowerCase();

	if (normalizedType.includes("congress") || normalizedType.includes("federal"))
		return "Federal";

	if (normalizedType.includes("state"))
		return "State";

	return "Local";
}

function buildDistrictSummary(
	match: LocationDistrictMatch,
	updatedAt: string
) {
	const slug = toLookupSlug(match.id || match.label);

	return {
		candidateCount: 0,
		href: `/districts/${slug}`,
		jurisdiction: deriveNationwideDistrictJurisdiction(match.districtType),
		office: match.districtType || "District",
		representativeCount: 0,
		slug,
		summary: `${match.sourceSystem ?? "Provider"} geographic match`,
		title: match.label,
		updatedAt
	} satisfies DistrictSummary;
}

function buildRepresentativeSummary(
	match: LocationRepresentativeMatch,
	updatedAt: string,
	locationLabel: string,
	stateName?: string
) {
	const classification = classifyRepresentative({
		districtLabel: match.districtLabel,
		governmentLevel: match.governmentLevel,
		officeSought: match.officeDisplayLabel,
		officeTitle: match.officeTitle,
		officeType: match.officeType,
		stateName,
	});
	const sources: Source[] = match.openstatesUrl
		? [
				{
					authority: "nonprofit-provider",
					date: updatedAt,
					id: `representative:${buildNationwideRepresentativeSlug(match)}`,
					note: "Representative record attached from current area results.",
					publisher: "Open States",
					sourceSystem: match.sourceSystem || "Open States",
					title: match.name,
					type: "official record",
					url: match.openstatesUrl
				}
			]
		: [];

	return {
		incumbent: true,
		governmentLevel: classification.governmentLevel,
		location: locationLabel,
		name: match.name,
		officeDisplayLabel: classification.officeDisplayLabel,
		officeholderLabel: "Current officeholder",
		officeType: classification.officeType,
		officeSought: match.officeTitle,
		onCurrentBallot: false,
		ballotStatusLabel: "Published ballot status unavailable in this area",
		party: match.party ?? "Unknown",
		profileImages: match.profileImages,
		provenance: {
			label: match.sourceSystem ? `${match.sourceSystem} representative match` : "Lookup results representative match",
			note: "Matched from current area results.",
			status: "crosswalked"
		},
		slug: buildNationwideRepresentativeSlug(match),
		summary: match.sourceSystem ? `Matched from ${match.sourceSystem}` : "Matched from current area results",
		districtLabel: match.districtLabel,
		districtSlug: toLookupSlug(match.districtLabel),
		fundingAvailable: false,
		fundingSummary: "No person-level funding record is attached to this representative yet.",
		href: `/representatives/${buildNationwideRepresentativeSlug(match)}`,
		openstatesUrl: match.openstatesUrl,
		influenceAvailable: false,
		influenceSummary: "No person-level influence record is attached to this representative yet.",
		sourceCount: sources.length,
		sources,
		updatedAt
	} satisfies RepresentativesResponse["representatives"][number];
}

function buildNationwideDirectoryUpdatedAt(context: NationwideLookupResultContext | null | undefined) {
	return context?.resolvedAt || new Date().toISOString();
}

export interface NationwideDirectoryBundle {
	districts: DistrictsResponse;
	representatives: RepresentativesResponse;
}

export interface NationwideDirectorySources {
	districts?: DistrictsResponse | null;
	representatives?: RepresentativesResponse | null;
}

export function buildNationwideDirectoryResponses(
	context: NationwideLookupResultContext | null | undefined
): NationwideDirectoryBundle {
	const updatedAt = buildNationwideDirectoryUpdatedAt(context);
	const districtMatches = context?.districtMatches ?? [];
	const representativeMatches = context?.representativeMatches ?? [];
	const locationLabel = context?.location?.displayName ?? context?.normalizedAddress ?? "Your area";
	const locationState = context?.location?.state;
	const districtBySlug = new Map<string, DistrictSummary>();
	const districtRepresentatives = new Map<string, string>();
	const districtKeyToSlug = new Map<string, string>();

	for (const district of districtMatches) {
		const districtSummary = buildDistrictSummary(district, updatedAt);
		if (!districtBySlug.has(districtSummary.slug))
			districtBySlug.set(districtSummary.slug, districtSummary);

		for (const key of buildDistrictMatchKeys(district, locationState))
			districtKeyToSlug.set(key, districtSummary.slug);
	}

	for (const representative of representativeMatches) {
		const districtSlug = buildRepresentativeMatchKeys(representative, locationState)
			.map(key => districtKeyToSlug.get(key))
			.find((slug): slug is string => Boolean(slug))
			?? toLookupSlug(representative.districtLabel);
		const districtSummary = districtBySlug.get(districtSlug);

		if (districtSummary)
			districtSummary.representativeCount += 1;

		districtRepresentatives.set(representative.id, districtSlug);
	}

	const districts = Array.from(districtBySlug.values());
	const representatives = representativeMatches.map((representative) => {
		const summary = buildRepresentativeSummary(representative, updatedAt, locationLabel, locationState);
		const districtSlug = districtRepresentatives.get(representative.id) ?? toLookupSlug(representative.districtLabel);

		return {
			...summary,
			districtSlug: districtSlug || summary.districtSlug
		};
	});

	return {
		districts: {
			mode: "nationwide",
			updatedAt,
			note: "Matched from current area results.",
			districts
		},
		representatives: {
			districts,
			mode: "nationwide",
			note: "Matched from current area results.",
			representatives,
			updatedAt
		}
	};
}

export function mergeNationwideDirectoryResponses(
	stored: NationwideDirectoryBundle,
	api: NationwideDirectorySources
): NationwideDirectoryBundle {
	const districtByCanonicalKey = new Map<string, DistrictSummary>();
	const districtKeyBySlug = new Map<string, string>();
	const representativeBySlug = new Map(
		stored.representatives.representatives.map(representative => [representative.slug, representative])
	);
	const apiDistricts = api.districts?.districts ?? api.representatives?.districts ?? [];
	const apiRepresentatives = api.representatives?.representatives ?? [];

	for (const district of [...stored.districts.districts, ...apiDistricts]) {
		const matchKeys = buildDistrictMatchKeys({
			districtCode: district.slug,
			districtType: district.office,
			id: district.slug,
			label: district.title,
			sourceSystem: "Directory response"
		}, undefined);
		const canonicalKey = matchKeys.find(key => districtByCanonicalKey.has(key))
			?? matchKeys[0]
			?? `slug:${district.slug}`;

		districtByCanonicalKey.set(canonicalKey, district);
		districtKeyBySlug.set(district.slug, canonicalKey);
	}

	for (const representative of apiRepresentatives)
		representativeBySlug.set(representative.slug, representative);

	const districtSlugByCanonicalKey = new Map(
		Array.from(districtByCanonicalKey, ([key, district]) => [key, district.slug])
	);
	const representatives = Array.from(representativeBySlug.values(), (representative) => {
		const canonicalDistrictKey = districtKeyBySlug.get(representative.districtSlug);
		const canonicalDistrictSlug = canonicalDistrictKey
			? districtSlugByCanonicalKey.get(canonicalDistrictKey)
			: null;

		return canonicalDistrictSlug && canonicalDistrictSlug !== representative.districtSlug
			? {
					...representative,
					districtSlug: canonicalDistrictSlug
				}
			: representative;
	});
	const representativeCountByDistrict = new Map<string, number>();

	for (const representative of representatives) {
		representativeCountByDistrict.set(
			representative.districtSlug,
			(representativeCountByDistrict.get(representative.districtSlug) ?? 0) + 1
		);
	}

	const districts = Array.from(districtByCanonicalKey.values()).map(district => ({
		...district,
		representativeCount: representativeCountByDistrict.get(district.slug) ?? 0
	}));
	const updatedAt = [
		stored.districts.updatedAt,
		stored.representatives.updatedAt,
		api.districts?.updatedAt,
		api.representatives?.updatedAt
	]
		.filter((value): value is string => Boolean(value))
		.sort()
		.at(-1) ?? "";

	return {
		districts: {
			districts,
			mode: "nationwide",
			note: "Combined from the saved area result and current reviewed directory records.",
			updatedAt
		},
		representatives: {
			districts,
			mode: "nationwide",
			note: "Combined from the saved area result and current reviewed directory records.",
			representatives,
			updatedAt
		}
	};
}
