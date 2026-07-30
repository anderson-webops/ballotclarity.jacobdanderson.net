import type {
	DistrictRecordResponse,
	DistrictsResponse,
	ElectionLogistics,
	ElectionSummary,
	LocationDistrictMatch,
	LocationLookupAction,
	LocationLookupResponse,
	LocationRepresentativeMatch,
	LocationSelection,
	OfficialResource,
	PersonProfileResponse,
	ProfileImage,
	RepresentativesResponse,
	RepresentativeSummary,
	Source,
	TrustBullet,
} from "./types/civic.js";
import process from "node:process";
import { classifyRepresentative } from "./representative-classification.js";
import { openSecretJson, sealSecretJson } from "./secret-envelope.js";

export interface ActiveNationwideLookupContext {
	actions: LocationLookupAction[];
	detectedFromIp: boolean;
	districtMatches: LocationDistrictMatch[];
	electionSlug?: string;
	guideAvailability: "not-published" | "published";
	inputKind: "address" | "zip";
	location: LocationSelection | null;
	normalizedAddress: string;
	electionLogistics: ElectionLogistics | null;
	representativeMatches: LocationRepresentativeMatch[];
	selectionId?: string;
	resolvedAt: string;
	result: "resolved";
}

export const activeNationwideLookupCookieName = "ballot-clarity-nationwide-lookup";
const cookieMaxAgeSeconds = 60 * 60 * 24 * 7;
const activeLookupCookiePurpose = "ballot-clarity:active-lookup-cookie:v1";
const censusGeocoderDocsUrl = "https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html";
const openStatesUrl = "https://openstates.org";

type DistrictScope = "city" | "county" | "federal-house" | "label" | "state-house" | "state-senate";
type DistrictDescriptor = Pick<DistrictsResponse["districts"][number], "jurisdiction" | "office" | "title">;
const numericDistrictCodePattern = /\d+/;
const congressionalSlugPrefixPattern = /^congressional-/u;
const representativeStateDistrictPattern = /\b[A-Z]{2}\s*-\s*\d+\b/i;
const senatorPrefixPattern = /^senator-/u;
const stateDistrictCodePattern = /\b[A-Z]{2}\s*-\s*(\d+)\b/i;
const stateHouseSlugPrefixPattern = /^state-house-/u;
const stateSenateSlugPrefixPattern = /^state-senate-/u;
const representativePrefixPattern = /^representative-/u;

function normalizeValue(value: string | null | undefined) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function toLookupSlug(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function buildNationwideRepresentativeSlug(match: Pick<LocationRepresentativeMatch, "id" | "name">) {
	return toLookupSlug(match.name || match.id || "representative");
}

function buildNationwideRepresentativeRouteAliases(match: Pick<LocationRepresentativeMatch, "id" | "name">) {
	return Array.from(new Set([
		buildNationwideRepresentativeSlug(match),
		toLookupSlug(match.id || match.name || "representative"),
	]));
}

function titleCaseToken(value: string) {
	return value
		.split("-")
		.filter(Boolean)
		.map((segment) => {
			if (segment.length <= 2)
				return segment.toUpperCase();

			if (segment.startsWith("mc") && segment.length > 2)
				return `Mc${segment.charAt(2).toUpperCase()}${segment.slice(3)}`;

			return segment.charAt(0).toUpperCase() + segment.slice(1);
		})
		.join(" ");
}

function inferDistrictTitleFromSlug(slug: string) {
	const normalizedSlug = toLookupSlug(slug);

	if (normalizedSlug.startsWith("congressional-"))
		return `Congressional District ${normalizedSlug.replace(congressionalSlugPrefixPattern, "")}`;

	if (normalizedSlug.startsWith("state-senate-"))
		return `State Senate District ${normalizedSlug.replace(stateSenateSlugPrefixPattern, "")}`;

	if (normalizedSlug.startsWith("state-house-"))
		return `State House District ${normalizedSlug.replace(stateHouseSlugPrefixPattern, "")}`;

	if (normalizedSlug.endsWith("-county"))
		return titleCaseToken(normalizedSlug);

	if (normalizedSlug.endsWith("-city"))
		return titleCaseToken(normalizedSlug);

	return titleCaseToken(normalizedSlug);
}

function inferRepresentativeNameFromSlug(slug: string) {
	return titleCaseToken(toLookupSlug(slug));
}

function parseCookieHeader(cookieHeader: string | undefined) {
	return Object.fromEntries(
		String(cookieHeader || "")
			.split(";")
			.map(item => item.trim())
			.filter(Boolean)
			.map((item) => {
				const separatorIndex = item.indexOf("=");

				if (separatorIndex === -1)
					return [item, ""];

				return [item.slice(0, separatorIndex), item.slice(separatorIndex + 1)];
			})
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function isPresent<T>(value: T | null): value is T {
	return value !== null;
}

function sanitizeLocationSelection(value: unknown): LocationSelection | null {
	if (!isRecord(value))
		return null;

	const displayName = typeof value.displayName === "string" ? value.displayName : "";
	const slug = typeof value.slug === "string" ? value.slug : "";
	const state = typeof value.state === "string" ? value.state : "";

	if (!displayName || !slug || !state)
		return null;

	return {
		coverageLabel: typeof value.coverageLabel === "string" ? value.coverageLabel : "",
		displayName,
		lookupInput: typeof value.lookupInput === "string" ? value.lookupInput : undefined,
		lookupMode: value.lookupMode === "address-submitted" || value.lookupMode === "address-verified" || value.lookupMode === "coverage-selection" || value.lookupMode === "zip-preview"
			? value.lookupMode
			: undefined,
		requiresOfficialConfirmation: value.requiresOfficialConfirmation === true,
		slug,
		state,
	};
}

function sanitizeDistrictMatch(value: unknown): LocationDistrictMatch | null {
	if (!isRecord(value))
		return null;

	const districtCode = typeof value.districtCode === "string" ? value.districtCode : "";
	const districtType = typeof value.districtType === "string" ? value.districtType : "";
	const id = typeof value.id === "string" ? value.id : "";
	const label = typeof value.label === "string" ? value.label : "";
	const sourceSystem = typeof value.sourceSystem === "string" ? value.sourceSystem : "";

	if (!districtCode || !districtType || !id || !label || !sourceSystem)
		return null;

	return {
		districtCode,
		districtType,
		id,
		label,
		sourceSystem,
	};
}

function sanitizeProfileImage(value: unknown): ProfileImage | null {
	if (!isRecord(value))
		return null;

	const alt = typeof value.alt === "string" ? value.alt.trim() : "";
	const sourceLabel = typeof value.sourceLabel === "string" ? value.sourceLabel.trim() : "";
	const sourceSystem = typeof value.sourceSystem === "string" ? value.sourceSystem.trim() : "";
	const url = typeof value.url === "string" ? value.url.trim() : "";

	if (!alt || !sourceLabel || !sourceSystem || !url)
		return null;

	try {
		const parsedUrl = new URL(url);

		if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:")
			return null;
	}
	catch {
		return null;
	}

	return {
		alt,
		attribution: typeof value.attribution === "string" ? value.attribution.trim() || undefined : undefined,
		capturedAt: typeof value.capturedAt === "string" ? value.capturedAt.trim() || undefined : undefined,
		priority: typeof value.priority === "number" && Number.isFinite(value.priority) ? value.priority : 100,
		sourceKind: value.sourceKind === "archive" || value.sourceKind === "campaign" || value.sourceKind === "official" || value.sourceKind === "provider"
			? value.sourceKind
			: "provider",
		sourceLabel,
		sourceSystem,
		sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl.trim() || undefined : undefined,
		url,
	};
}

function sanitizeRepresentativeMatch(value: unknown): LocationRepresentativeMatch | null {
	if (!isRecord(value))
		return null;

	const districtLabel = typeof value.districtLabel === "string" ? value.districtLabel : "";
	const id = typeof value.id === "string" ? value.id : "";
	const name = typeof value.name === "string" ? value.name : "";
	const officeTitle = typeof value.officeTitle === "string" ? value.officeTitle : "";
	const sourceSystem = typeof value.sourceSystem === "string" ? value.sourceSystem : "";

	if (!districtLabel || !id || !name || !officeTitle || !sourceSystem)
		return null;

	const classification = classifyRepresentative({
		districtLabel,
		governmentLevel: value.governmentLevel === "federal" || value.governmentLevel === "state" || value.governmentLevel === "county" || value.governmentLevel === "city"
			? value.governmentLevel
			: null,
		officeSought: typeof value.officeDisplayLabel === "string" ? value.officeDisplayLabel : undefined,
		officeTitle,
		officeType: value.officeType === "us_senate"
			|| value.officeType === "us_house"
			|| value.officeType === "state_senate"
			|| value.officeType === "state_house"
			|| value.officeType === "county_commission"
			|| value.officeType === "county_official"
			|| value.officeType === "city_official"
			|| value.officeType === "mayor"
			|| value.officeType === "other"
			? value.officeType
			: null,
	});

	return {
		districtLabel,
		governmentLevel: classification.governmentLevel,
		id,
		name,
		officeDisplayLabel: typeof value.officeDisplayLabel === "string" && value.officeDisplayLabel
			? value.officeDisplayLabel
			: classification.officeDisplayLabel,
		officeType: classification.officeType,
		officeTitle,
		openstatesUrl: typeof value.openstatesUrl === "string" ? value.openstatesUrl : undefined,
		party: typeof value.party === "string" ? value.party : undefined,
		profileImages: Array.isArray(value.profileImages)
			? value.profileImages.map(sanitizeProfileImage).filter((item): item is ProfileImage => Boolean(item))
			: undefined,
		sourceSystem,
	};
}

function sanitizeLookupAction(value: unknown): LocationLookupAction | null {
	if (!isRecord(value))
		return null;

	const id = typeof value.id === "string" ? value.id : "";
	const kind = value.kind === "ballot-guide" || value.kind === "official-verification" ? value.kind : null;
	const title = typeof value.title === "string" ? value.title : "";
	const description = typeof value.description === "string" ? value.description : "";

	if (!id || !kind || !title || !description)
		return null;

	return {
		badge: typeof value.badge === "string" ? value.badge : undefined,
		description,
		electionSlug: typeof value.electionSlug === "string" ? value.electionSlug : undefined,
		id,
		kind,
		location: sanitizeLocationSelection(value.location) ?? undefined,
		title,
		url: typeof value.url === "string" ? value.url : undefined,
	};
}

function sanitizeActiveNationwideLookupContext(value: unknown): ActiveNationwideLookupContext | null {
	if (!isRecord(value) || value.result !== "resolved")
		return null;

	const guideAvailability = value.guideAvailability === "published" || value.guideAvailability === "not-published"
		? value.guideAvailability
		: null;

	if (!guideAvailability)
		return null;

	const guideContent = isRecord(value.guideContent) ? value.guideContent : null;

	if (guideAvailability === "published" && guideContent?.verifiedContestPackage === true && value.detectedFromIp !== true)
		return null;

	const districtMatches = Array.isArray(value.districtMatches)
		? value.districtMatches.map(sanitizeDistrictMatch).filter((item): item is LocationDistrictMatch => Boolean(item))
		: [];
	const representativeMatches = Array.isArray(value.representativeMatches)
		? value.representativeMatches.map(sanitizeRepresentativeMatch).filter((item): item is LocationRepresentativeMatch => Boolean(item))
		: [];

	if (!districtMatches.length && !representativeMatches.length)
		return null;

	return {
		actions: Array.isArray(value.actions)
			? value.actions.map(sanitizeLookupAction).filter((item): item is LocationLookupAction => Boolean(item))
			: [],
		detectedFromIp: value.detectedFromIp === true,
		districtMatches,
		electionSlug: typeof value.electionSlug === "string" ? value.electionSlug : undefined,
		electionLogistics: isRecord(value.electionLogistics) ? value.electionLogistics as unknown as ElectionLogistics : null,
		guideAvailability,
		inputKind: value.inputKind === "address" ? "address" : "zip",
		location: sanitizeLocationSelection(value.location),
		normalizedAddress: typeof value.normalizedAddress === "string" ? value.normalizedAddress : "",
		representativeMatches,
		selectionId: typeof value.selectionId === "string" ? value.selectionId : undefined,
		resolvedAt: typeof value.resolvedAt === "string" && value.resolvedAt
			? value.resolvedAt
			: new Date().toISOString(),
		result: "resolved",
	};
}

function readCompactString(tuple: unknown[], index: number) {
	const value = tuple[index];
	return typeof value === "string" ? value : "";
}

function readCompactOptionalString(tuple: unknown[], index: number) {
	const value = readCompactString(tuple, index);
	return value || undefined;
}

function expandCompactCookiePayload(value: unknown) {
	if (!isRecord(value) || value.v !== 2)
		return value;

	const locationTuple = Array.isArray(value.l) ? value.l : null;

	return {
		actions: Array.isArray(value.a)
			? value.a.map((item) => {
					if (!Array.isArray(item))
						return null;

					return {
						badge: readCompactOptionalString(item, 3),
						description: readCompactString(item, 4),
						id: readCompactString(item, 0),
						kind: "official-verification",
						title: readCompactString(item, 1),
						url: readCompactOptionalString(item, 2),
					};
				}).filter(isPresent)
			: [],
		detectedFromIp: value.d === 1,
		districtMatches: Array.isArray(value.dm)
			? value.dm.map((item) => {
					if (!Array.isArray(item))
						return null;

					return {
						districtCode: readCompactString(item, 3),
						districtType: readCompactString(item, 2),
						id: readCompactString(item, 0),
						label: readCompactString(item, 1),
						sourceSystem: readCompactString(item, 4),
					};
				}).filter(isPresent)
			: [],
		electionSlug: typeof value.es === "string" ? value.es : undefined,
		electionLogistics: null,
		guideAvailability: value.ga === "p" ? "published" : "not-published",
		inputKind: value.ik === "a" ? "address" : "zip",
		location: locationTuple
			? {
					displayName: readCompactString(locationTuple, 0),
					lookupMode: readCompactOptionalString(locationTuple, 3),
					requiresOfficialConfirmation: locationTuple[4] === 1,
					slug: readCompactString(locationTuple, 1),
					state: readCompactString(locationTuple, 2),
				}
			: null,
		normalizedAddress: typeof value.q === "string" ? value.q : "",
		representativeMatches: Array.isArray(value.rm)
			? value.rm.map((item) => {
					if (!Array.isArray(item))
						return null;

					return {
						districtLabel: readCompactString(item, 2),
						governmentLevel: readCompactOptionalString(item, 5),
						id: readCompactString(item, 0),
						name: readCompactString(item, 1),
						officeDisplayLabel: readCompactOptionalString(item, 7),
						officeTitle: readCompactString(item, 3),
						officeType: readCompactOptionalString(item, 6),
						openstatesUrl: readCompactOptionalString(item, 9),
						party: readCompactOptionalString(item, 4),
						profileImages: readCompactOptionalString(item, 10)
							? [
									{
										alt: `Portrait of ${readCompactString(item, 1)}`,
										priority: 20,
										sourceKind: "provider",
										sourceLabel: "Provider image",
										sourceSystem: readCompactOptionalString(item, 8) ?? "Lookup results representative match",
										url: readCompactString(item, 10),
									},
								]
							: undefined,
						sourceSystem: readCompactOptionalString(item, 8) ?? "Lookup results representative match",
					};
				}).filter(isPresent)
			: [],
		resolvedAt: typeof value.t === "string" ? value.t : "",
		result: "resolved",
		selectionId: typeof value.s === "string" ? value.s : undefined,
	};
}

function buildCookiePayload(context: ActiveNationwideLookupContext) {
	return {
		a: context.actions
			.filter(action => action.kind === "official-verification")
			.map(action => [
				action.id,
				action.title,
				action.url ?? "",
				action.badge ?? "",
				action.description,
			]),
		d: context.detectedFromIp ? 1 : 0,
		dm: context.districtMatches.map(match => [
			match.id,
			match.label,
			match.districtType,
			match.districtCode,
			match.sourceSystem,
		]),
		es: context.electionSlug,
		ga: context.guideAvailability === "published" ? "p" : "n",
		ik: context.inputKind === "address" ? "a" : "z",
		l: context.location
			? [
					context.location.displayName,
					context.location.slug,
					context.location.state,
					context.location.lookupMode ?? "",
					context.location.requiresOfficialConfirmation ? 1 : 0,
				]
			: null,
		q: context.inputKind === "zip" && /^\d{5}$/u.test(context.normalizedAddress)
			? context.normalizedAddress
			: "",
		r: context.result,
		rm: context.representativeMatches.map(match => [
			match.id,
			match.name,
			match.districtLabel,
			match.officeTitle,
			match.party ?? "",
			match.governmentLevel ?? "",
			match.officeType ?? "",
			match.officeDisplayLabel ?? "",
			match.sourceSystem,
			match.openstatesUrl ?? "",
			match.profileImages?.[0]?.url ?? "",
		]),
		s: context.selectionId,
		t: context.resolvedAt,
		v: 2,
	};
}

function normalizeDistrictCode(value: string | null | undefined) {
	const rawValue = String(value ?? "").trim();

	if (!rawValue)
		return "";

	const stateDistrictMatch = rawValue.match(stateDistrictCodePattern);

	if (stateDistrictMatch?.[1])
		return String(Number.parseInt(stateDistrictMatch[1], 10));

	const numericMatch = rawValue.match(numericDistrictCodePattern);

	if (numericMatch?.[0])
		return String(Number.parseInt(numericMatch[0], 10));

	return normalizeValue(rawValue);
}

function buildLabelFallbackKey(label: string, locationState: string | undefined) {
	return `label:${normalizeValue(locationState) || "unknown"}:${normalizeValue(label)}`;
}

function buildCanonicalKey(scope: DistrictScope, districtCode: string, locationState: string | undefined, label: string) {
	return `${scope}:${normalizeValue(locationState) || "unknown"}:${districtCode || normalizeValue(label)}`;
}

function deriveDistrictScopeFromMatch(match: LocationDistrictMatch): DistrictScope {
	const normalizedType = normalizeValue(match.districtType);
	const normalizedLabel = normalizeValue(match.label);

	if (normalizedType.includes("congress"))
		return "federal-house";

	if (normalizedType.includes("state-senate"))
		return "state-senate";

	if (normalizedType.includes("state-house") || normalizedType.includes("state-assembly"))
		return "state-house";

	if (normalizedType.includes("county") || normalizedLabel.includes("county"))
		return "county";

	if (normalizedType.includes("city") || normalizedLabel.endsWith("-city"))
		return "city";

	return "label";
}

function buildDistrictSlugFromMatch(match: LocationDistrictMatch) {
	const scope = deriveDistrictScopeFromMatch(match);
	const districtCode = normalizeDistrictCode(match.districtCode || match.label);

	if (scope === "federal-house" && districtCode)
		return `congressional-${districtCode}`;

	if (scope === "state-senate" && districtCode)
		return `state-senate-${districtCode}`;

	if (scope === "state-house" && districtCode)
		return `state-house-${districtCode}`;

	return toLookupSlug(match.label);
}

function deriveRepresentativeScope(match: LocationRepresentativeMatch, locationState: string | undefined): DistrictScope {
	const normalizedOfficeTitle = normalizeValue(match.officeTitle);
	const normalizedDistrictLabel = normalizeValue(match.districtLabel);
	const normalizedState = normalizeValue(locationState);
	const strippedDistrictLabel = normalizedDistrictLabel
		.replace(senatorPrefixPattern, "")
		.replace(representativePrefixPattern, "");

	if (normalizedDistrictLabel.includes("congress"))
		return "federal-house";

	if (normalizedOfficeTitle.includes("representative")) {
		if (representativeStateDistrictPattern.test(match.districtLabel))
			return "federal-house";

		return "state-house";
	}

	if (normalizedOfficeTitle.includes("senator")) {
		if (normalizedState && (strippedDistrictLabel === normalizedState || strippedDistrictLabel === `${normalizedState}-statewide`))
			return "label";

		return "state-senate";
	}

	if (normalizedDistrictLabel.includes("county"))
		return "county";

	if (normalizedDistrictLabel.endsWith("-city"))
		return "city";

	return "label";
}

function buildDistrictMatchKeys(match: LocationDistrictMatch, locationState: string | undefined) {
	const scope = deriveDistrictScopeFromMatch(match);
	const districtCode = normalizeDistrictCode(match.districtCode || match.label);

	return [
		buildCanonicalKey(scope, districtCode, locationState, match.label),
		buildLabelFallbackKey(match.label, locationState),
	];
}

function buildRepresentativeMatchKeys(match: LocationRepresentativeMatch, locationState: string | undefined) {
	const scope = deriveRepresentativeScope(match, locationState);
	const districtCode = normalizeDistrictCode(match.districtLabel);
	const keys = new Set<string>([
		buildLabelFallbackKey(match.districtLabel, locationState),
	]);

	keys.add(buildCanonicalKey(scope, districtCode, locationState, match.districtLabel));

	return [...keys];
}

function buildOfficialResource(action: LocationLookupAction): OfficialResource | null {
	if (action.kind !== "official-verification" || !action.url)
		return null;

	return {
		authority: "official-government",
		label: action.title,
		note: action.description,
		sourceLabel: action.badge || "Official election tool",
		sourceSystem: "Official election verification",
		url: action.url,
	};
}

function toSource({
	authority,
	date,
	id,
	note,
	publisher,
	sourceSystem,
	title,
	url,
}: {
	authority: Source["authority"];
	date: string;
	id: string;
	note: string;
	publisher: string;
	sourceSystem: string;
	title: string;
	url: string;
}) {
	return {
		authority,
		date,
		id,
		note,
		publisher,
		sourceSystem,
		title,
		type: "official record",
		url,
	} satisfies Source;
}

function buildTrustBullet(id: string, text: string, sources: Source[], note?: string): TrustBullet {
	return {
		id,
		note,
		sources,
		text,
	};
}

function deriveNationwideDistrictJurisdiction(districtType: string): "Federal" | "Local" | "State" {
	const normalizedType = districtType.toLowerCase();

	if (normalizedType.includes("congress") || normalizedType.includes("federal"))
		return "Federal";

	if (normalizedType.includes("state"))
		return "State";

	return "Local";
}

function deriveDistrictPipelineKind(district: DistrictDescriptor) {
	const normalizedOffice = normalizeValue(district.office);
	const normalizedTitle = normalizeValue(district.title);

	if (district.jurisdiction === "Federal")
		return "federal";

	if (district.jurisdiction === "State")
		return "state";

	if (normalizedOffice.includes("county") || normalizedTitle.includes("county"))
		return "county";

	if (normalizedOffice.includes("city") || normalizedTitle.includes("city"))
		return "city";

	return "other-local";
}

function buildDistrictRepresentativeAvailabilityNote(district: DistrictDescriptor, representativeCount: number) {
	if (representativeCount > 0)
		return `${representativeCount} current official${representativeCount === 1 ? "" : "s"} ${representativeCount === 1 ? "is" : "are"} linked to this district.`;

	const kind = deriveDistrictPipelineKind(district);

	if (kind === "county")
		return "No county officeholder data is connected for this area yet. This does not mean the county has no officials; it means Ballot Clarity has not attached a reviewed county officeholder source here yet.";

	if (kind === "city")
		return "City officeholder data is not yet available from the current provider set. This does not mean the city has no officials, only that Ballot Clarity cannot yet attach them here.";

	if (kind === "other-local")
		return "Local officeholder data is not yet attached for this area. Use official local election tools to verify offices and current officials.";

	return "No current official record is linked from the current provider set for this district yet.";
}

function buildDistrictCandidateAvailabilityNote(hasPublishedGuide: boolean) {
	return hasPublishedGuide
		? "Candidate records are attached to this district page from the local guide."
		: "Candidate and contest pages are not published for this district yet.";
}

export function buildNationwideDistrictRoleGuide(district: DistrictDescriptor) {
	const kind = deriveDistrictPipelineKind(district);

	if (kind === "federal") {
		return {
			decisionAreas: [
				"Federal legislation and oversight",
				"Appropriations and district project advocacy",
				"Constituent casework with federal agencies",
			],
			summary: "This district identifies the federal office area tied to these results.",
			whyItMatters: "Federal district matches help confirm the current U.S. House officeholder and the official election tools tied to that geography.",
		};
	}

	if (kind === "state") {
		return {
			decisionAreas: [
				"State budget and appropriations",
				"State statutory changes",
				"Committee oversight and constituent services",
			],
			summary: "This district identifies the state legislative office area tied to these results.",
			whyItMatters: "State legislative district matches help orient voters to the current officeholder, the district geography, and the official election tools tied to that area.",
		};
	}

	if (kind === "county") {
		return {
			decisionAreas: [
				"County administration and budgeting",
				"County services and local implementation",
				"Local verification through county election offices",
			],
			summary: "This county geography helps orient the results even when county officeholder records are not attached yet.",
			whyItMatters: "County matches help users reach the right official county election tools and verify the local government area for their results.",
		};
	}

	if (kind === "city") {
		return {
			decisionAreas: [
				"City governance and municipal services",
				"Council, mayoral, and local administrative context",
				"Official local verification through municipal or county election tools",
			],
			summary: "This city geography helps orient the results even when Ballot Clarity does not yet have city officeholder records for it.",
			whyItMatters: "City matches help users verify locality, official tools, and the local jurisdiction tied to this area.",
		};
	}

	return {
		decisionAreas: [
			"Jurisdiction verification",
			"District and office matching",
			"Official election tool discovery",
		],
		summary: "This district is part of the results for this area.",
		whyItMatters: "This district helps confirm geography, linked offices, and official election tools for the current area.",
	};
}

function buildUpdatedAt(context: ActiveNationwideLookupContext) {
	return context.resolvedAt || new Date().toISOString();
}

function buildDirectoryBundle(context: ActiveNationwideLookupContext) {
	const updatedAt = buildUpdatedAt(context);
	const locationLabel = context.location?.displayName || context.normalizedAddress || "Your area";
	const locationState = context.location?.state;
	const districtBySlug = new Map<string, DistrictsResponse["districts"][number]>();
	const districtRepresentatives = new Map<string, string>();
	const districtKeyToSlug = new Map<string, string>();

	for (const districtMatch of context.districtMatches) {
		const slug = buildDistrictSlugFromMatch(districtMatch);
		const summary = {
			candidateCount: 0,
			href: `/districts/${slug}`,
			jurisdiction: deriveNationwideDistrictJurisdiction(districtMatch.districtType),
			office: districtMatch.districtType || "District",
			representativeCount: 0,
			slug,
			summary: `${districtMatch.sourceSystem ?? "Provider"} geographic match`,
			title: districtMatch.label,
			updatedAt,
		} satisfies DistrictsResponse["districts"][number];

		if (!districtBySlug.has(slug))
			districtBySlug.set(slug, summary);

		for (const key of buildDistrictMatchKeys(districtMatch, locationState))
			districtKeyToSlug.set(key, slug);
	}

	for (const representative of context.representativeMatches) {
		const districtSlug = buildRepresentativeMatchKeys(representative, locationState)
			.map(key => districtKeyToSlug.get(key))
			.find((slug): slug is string => Boolean(slug))
			?? toLookupSlug(representative.districtLabel);
		const district = districtBySlug.get(districtSlug);

		if (district)
			district.representativeCount += 1;

		districtRepresentatives.set(representative.id, districtSlug);
	}

	const districts = Array.from(districtBySlug.values());
	const representatives = context.representativeMatches.map((representative) => {
		const slug = buildNationwideRepresentativeSlug(representative);
		const districtSlug = districtRepresentatives.get(representative.id) ?? toLookupSlug(representative.districtLabel);
		const sources = representative.openstatesUrl
			? [
					toSource({
						authority: "nonprofit-provider",
						date: updatedAt,
						id: `representative:${slug}`,
						note: "Representative record carried into this directory card from these area results.",
						publisher: "Open States",
						sourceSystem: representative.sourceSystem || "Open States",
						title: representative.name,
						url: representative.openstatesUrl,
					}),
				]
			: [];

		return {
			ballotStatusLabel: "Published ballot status unavailable in this area",
			districtLabel: representative.districtLabel,
			districtSlug,
			fundingAvailable: false,
			fundingSummary: "No person-level funding record is attached to this representative yet.",
			governmentLevel: representative.governmentLevel,
			href: `/representatives/${slug}`,
			incumbent: true,
			influenceAvailable: false,
			influenceSummary: "No person-level influence record is attached to this representative yet.",
			location: locationLabel,
			name: representative.name,
			officeDisplayLabel: representative.officeDisplayLabel,
			officeSought: representative.officeTitle,
			officeholderLabel: "Current officeholder",
			officeType: representative.officeType,
			onCurrentBallot: false,
			openstatesUrl: representative.openstatesUrl,
			party: representative.party ?? "Unknown",
			profileImages: representative.profileImages,
			provenance: {
				label: representative.sourceSystem ? `${representative.sourceSystem} representative match` : "Lookup results representative match",
				note: "Derived from area results rather than a published local ballot guide.",
				status: "crosswalked",
			},
			slug,
			sourceCount: sources.length,
			sources,
			summary: representative.sourceSystem ? `Matched from ${representative.sourceSystem}` : "Matched from area results",
			updatedAt,
		} satisfies RepresentativeSummary;
	});

	return {
		districts,
		representatives,
		updatedAt,
	};
}

function buildRepresentativeSources(context: ActiveNationwideLookupContext, representative: RepresentativeSummary, districtTitle: string | null, updatedAt: string) {
	const sources: Source[] = [
		toSource({
			authority: representative.openstatesUrl ? "nonprofit-provider" : "open-data",
			date: updatedAt,
			id: `representative:${representative.slug}`,
			note: "Representative record carried into this page from these area results.",
			publisher: representative.openstatesUrl ? "Open States" : "Lookup results provider",
			sourceSystem: representative.provenance?.label || "Lookup results representative match",
			title: representative.name,
			url: representative.openstatesUrl || openStatesUrl,
		}),
	];

	if (districtTitle) {
		sources.push(toSource({
			authority: "official-government",
			date: updatedAt,
			id: `district:${representative.districtSlug}`,
			note: "District geography attached from these area results.",
			publisher: "U.S. Census Geocoder",
			sourceSystem: "U.S. Census Geocoder",
			title: districtTitle,
			url: censusGeocoderDocsUrl,
		}));
	}

	for (const action of context.actions.filter(item => item.kind === "official-verification" && item.url)) {
		sources.push(toSource({
			authority: "official-government",
			date: updatedAt,
			id: `official:${action.id}`,
			note: action.description,
			publisher: action.badge || "Official election tool",
			sourceSystem: "Official election verification",
			title: action.title,
			url: action.url as string,
		}));
	}

	return Array.from(new Map(sources.map(source => [source.id, source])).values());
}

function buildFallbackRouteSource(id: string, title: string, updatedAt: string) {
	return toSource({
		authority: "ballot-clarity-source-record",
		date: updatedAt,
		id,
		note: "This public page is available, but entering an address or ZIP or opening a published local guide can attach fuller detail.",
		publisher: "Ballot Clarity public records",
		sourceSystem: "Ballot Clarity public records",
		title,
		url: "/coverage",
	});
}

export function buildActiveNationwideLookupContext(response: LocationLookupResponse) {
	if (
		response.result !== "resolved"
		|| (
			response.guideAvailability === "published"
			&& response.guideContent?.verifiedContestPackage
			&& !response.detectedFromIp
		)
	) {
		return null;
	}

	return sanitizeActiveNationwideLookupContext({
		...response,
		resolvedAt: new Date().toISOString(),
	});
}

export function buildActiveNationwideLookupCookie(
	response: LocationLookupResponse,
	secret = process.env.ACTIVE_LOOKUP_COOKIE_SECRET || ""
) {
	const context = buildActiveNationwideLookupContext(response);

	return context ? buildActiveNationwideLookupCookieFromContext(context, secret) : null;
}

export function buildActiveNationwideLookupCookieFromContext(
	context: ActiveNationwideLookupContext,
	secret = process.env.ACTIVE_LOOKUP_COOKIE_SECRET || ""
) {
	const sanitizedContext = sanitizeActiveNationwideLookupContext(context);

	if (!sanitizedContext || !secret.trim())
		return null;

	return sealSecretJson(buildCookiePayload(sanitizedContext), secret, activeLookupCookiePurpose);
}

export function readActiveNationwideLookupContext(
	cookieHeader: string | undefined,
	secret = process.env.ACTIVE_LOOKUP_COOKIE_SECRET || ""
) {
	const cookies = parseCookieHeader(cookieHeader);
	const rawValue = cookies[activeNationwideLookupCookieName];

	if (!rawValue || !secret.trim())
		return null;

	try {
		const payload = openSecretJson(
			decodeURIComponent(rawValue),
			secret,
			activeLookupCookiePurpose
		);

		return sanitizeActiveNationwideLookupContext(expandCompactCookiePayload(payload));
	}
	catch {
		return null;
	}
}

export function buildActiveNationwideLookupResponse(
	context: ActiveNationwideLookupContext
): LocationLookupResponse {
	return {
		actions: context.actions,
		detectedFromIp: context.detectedFromIp,
		districtMatches: context.districtMatches,
		electionLogistics: context.electionLogistics,
		electionSlug: context.electionSlug,
		fromCache: false,
		guideAvailability: context.guideAvailability,
		guideContent: null,
		inputKind: context.inputKind,
		location: context.location ?? undefined,
		lookupQuery: context.normalizedAddress,
		normalizedAddress: context.normalizedAddress,
		note: "Saved civic results are active for this browser.",
		representativeMatches: context.representativeMatches,
		result: "resolved",
		selectionId: context.selectionId,
		selectionOptions: [],
	};
}

export function clearActiveNationwideLookupCookie(response: {
	clearCookie: (name: string, options?: Record<string, unknown>) => void;
}) {
	response.clearCookie(activeNationwideLookupCookieName, {
		path: "/",
		sameSite: "strict",
		secure: process.env.NODE_ENV === "production",
	});
}

export function persistActiveNationwideLookupCookie(response: {
	cookie: (name: string, value: string, options?: Record<string, unknown>) => void;
}, value: string) {
	response.cookie(activeNationwideLookupCookieName, value, {
		httpOnly: true,
		maxAge: cookieMaxAgeSeconds * 1000,
		path: "/",
		sameSite: "strict",
		secure: process.env.NODE_ENV === "production",
	});
}

export function buildNationwideDistrictsResponse(context: ActiveNationwideLookupContext): DistrictsResponse {
	const directory = buildDirectoryBundle(context);

	return {
		districts: directory.districts,
		mode: "nationwide",
		note: "District pages for this area are available with official links where attached.",
		updatedAt: directory.updatedAt,
	};
}

export function buildNationwideRepresentativesResponse(context: ActiveNationwideLookupContext): RepresentativesResponse {
	const directory = buildDirectoryBundle(context);

	return {
		districts: directory.districts,
		mode: "nationwide",
		note: "Current representative records for this area are available with source links where attached.",
		representatives: directory.representatives,
		updatedAt: directory.updatedAt,
	};
}

export function buildRouteFallbackDistrictRecordResponse(districtSlug: string): DistrictRecordResponse {
	const updatedAt = new Date().toISOString();
	const district = {
		candidateCount: 0,
		description: "This district page is available, but it still needs an address or ZIP result or a local guide to attach representatives, official links, and contest details.",
		electionSlug: "nationwide-lookup",
		href: `/districts/${districtSlug}`,
		jurisdiction: deriveNationwideDistrictJurisdiction(districtSlug),
		office: inferDistrictTitleFromSlug(districtSlug),
		representativeCount: 0,
		roleGuide: buildNationwideDistrictRoleGuide({
			jurisdiction: deriveNationwideDistrictJurisdiction(districtSlug),
			office: inferDistrictTitleFromSlug(districtSlug),
			title: inferDistrictTitleFromSlug(districtSlug),
		}),
		slug: districtSlug,
		summary: "District details will attach here after you load current results for this area.",
		title: inferDistrictTitleFromSlug(districtSlug),
		updatedAt,
	};

	return {
		candidateAvailabilityNote: "Candidate and contest pages open here when a local guide is available for this district.",
		candidates: [],
		district,
		districtOriginLabel: "Address or ZIP needed",
		districtOriginNote: "Enter an address or ZIP to attach the exact geography, current officials, and official election links for this district.",
		election: {
			date: updatedAt,
			jurisdictionSlug: "",
			locationName: "Address or ZIP needed",
			name: "Address or ZIP needed",
			slug: "nationwide-lookup",
			updatedAt,
		},
		mode: "nationwide",
		note: "This district page is public, but fuller district detail depends on an address or ZIP result or a local guide.",
		officialResources: [],
		relatedContests: [],
		representativeAvailabilityNote: buildDistrictRepresentativeAvailabilityNote(district, 0),
		representatives: [],
		sources: [buildFallbackRouteSource(`district:${districtSlug}:fallback`, `${inferDistrictTitleFromSlug(districtSlug)} page availability`, updatedAt)],
		updatedAt,
	};
}

export function buildRouteFallbackPersonProfileResponse(representativeSlug: string): PersonProfileResponse {
	const updatedAt = new Date().toISOString();
	const name = inferRepresentativeNameFromSlug(representativeSlug);
	const sources = [buildFallbackRouteSource(`representative:${representativeSlug}:fallback`, `${name} page availability`, updatedAt)];

	return {
		note: "This representative page is public, even when fuller office details are not attached yet.",
		person: {
			ballotStatusLabel: "Current ballot status not yet attached",
			biography: [
				{
					id: `profile:${representativeSlug}`,
					sources,
					summary: "This public person page is available, but fuller office details are not attached yet.",
					title: "Public page identity",
				},
			],
			comparison: null,
			contestSlug: "",
			districtLabel: "District confirmation pending",
			districtSlug: "",
			freshness: {
				contentLastVerifiedAt: updatedAt,
				dataLastUpdatedAt: updatedAt,
				nextReviewAt: updatedAt,
				status: "up-to-date",
				statusLabel: "Public page",
				statusNote: "This page is available, but a current office record is not attached yet.",
			},
			funding: null,
			governmentLevel: null,
			incumbent: true,
			keyActions: [],
			lobbyingContext: [],
			location: "Public representative page",
			methodologyNotes: [
				"Representative pages stay public even when fuller office records are not attached yet.",
				"An address or ZIP lookup can still add district confirmation and official election links.",
			],
			name,
			officeDisplayLabel: "Office record pending provider crosswalk",
			officeholderLabel: "Current officeholder page",
			officeType: null,
			officeSought: "Office record pending provider crosswalk",
			onCurrentBallot: false,
			party: "Unknown",
			provenance: {
				asOf: updatedAt,
				label: "Representative page identity",
				note: "This page is live, but a current officeholder record was not attached on this request.",
				source: "nationwide",
				status: "inferred",
			},
			publicStatements: [],
			slug: representativeSlug,
			sourceCount: sources.length,
			sources,
			summary: "This representative page is public, but office, district, finance, and influence details are not attached yet.",
			topIssues: [],
			updatedAt,
			whatWeDoNotKnow: [
				buildTrustBullet(
					"provider-crosswalk-pending",
					"Current office, district confirmation, and person-level finance or influence records are not attached to this page yet.",
					sources,
				),
			],
			whatWeKnow: [
				buildTrustBullet(
					"profile-available",
					"This public page is live and shows an honest unavailable state instead of failing.",
					sources,
				),
			],
		},
		updatedAt,
	};
}

export function buildNationwideDistrictRecordResponse(context: ActiveNationwideLookupContext, districtSlug: string): DistrictRecordResponse | null {
	const directory = buildDirectoryBundle(context);
	const district = directory.districts.find(item => item.slug === districtSlug);

	if (!district)
		return null;

	const updatedAt = directory.updatedAt;
	const representatives = directory.representatives.filter(item => item.districtSlug === district.slug);
	const officialResources = context.actions
		.map(buildOfficialResource)
		.filter((item): item is OfficialResource => Boolean(item));
	const districtMatch = context.districtMatches.find((match) => {
		return buildDistrictSlugFromMatch(match) === district.slug;
	}) ?? null;
	const sources: Array<ReturnType<typeof toSource> | null> = [
		districtMatch
			? toSource({
					authority: districtMatch.sourceSystem.toLowerCase().includes("census") ? "official-government" : "open-data",
					date: updatedAt,
					id: `district:${district.slug}:match`,
					note: "Provider-backed district match carried into this page from this address or ZIP result.",
					publisher: districtMatch.sourceSystem,
					sourceSystem: districtMatch.sourceSystem,
					title: `${district.title} district match`,
					url: districtMatch.sourceSystem.toLowerCase().includes("census") ? censusGeocoderDocsUrl : openStatesUrl,
				})
			: null,
		...representatives.map(representative => toSource({
			authority: representative.openstatesUrl ? "nonprofit-provider" : "open-data",
			date: updatedAt,
			id: `representative:${representative.slug}`,
			note: "Representative record linked to this district from this address or ZIP result.",
			publisher: representative.provenance?.label || "Lookup results representative match",
			sourceSystem: representative.provenance?.label || "Lookup results representative match",
			title: representative.name,
			url: representative.openstatesUrl || openStatesUrl,
		})),
		...officialResources.map(resource => toSource({
			authority: resource.authority,
			date: updatedAt,
			id: `official:${resource.label}`,
			note: resource.note || "",
			publisher: resource.sourceLabel,
			sourceSystem: resource.sourceSystem,
			title: resource.label,
			url: resource.url,
		})),
	];
	const resolvedSources = sources.filter(isPresent);
	const representativeAvailabilityNote = buildDistrictRepresentativeAvailabilityNote(district, representatives.length);
	const hasPublishedGuide = false;

	return {
		candidateAvailabilityNote: buildDistrictCandidateAvailabilityNote(hasPublishedGuide),
		candidates: [],
		district: {
			...district,
			description: `${district.summary}. This page is based on results for this area.`,
			electionSlug: context.electionSlug || "nationwide-lookup",
			roleGuide: buildNationwideDistrictRoleGuide(district),
		},
		districtOriginLabel: "Lookup results record",
		districtOriginNote: context.inputKind === "zip"
			? "This district page was built from a ZIP-based lookup. A full street address is still the stronger input when local boundaries overlap."
			: "This district page was built from results for this area.",
		election: {
			date: updatedAt,
			jurisdictionSlug: "",
			locationName: context.location?.displayName || context.normalizedAddress || "Your area",
			name: "Civic results context",
			slug: context.electionSlug || "nationwide-lookup",
			updatedAt,
		} satisfies ElectionSummary,
		mode: "nationwide",
		note: "This district page keeps district context, linked officials, and official election links visible for this address or ZIP result.",
		officialResources,
		relatedContests: [],
		representativeAvailabilityNote,
		representatives,
		sources: Array.from(new Map(resolvedSources.map(source => [source.id, source])).values()),
		updatedAt,
	};
}

export function buildNationwidePersonProfileResponse(context: ActiveNationwideLookupContext, representativeSlug: string): PersonProfileResponse | null {
	const directory = buildDirectoryBundle(context);
	const representativeMatch = context.representativeMatches.find(match => buildNationwideRepresentativeRouteAliases(match).includes(representativeSlug)) ?? null;
	const representative = directory.representatives.find(item => item.slug === (representativeMatch ? buildNationwideRepresentativeSlug(representativeMatch) : representativeSlug));

	if (!representative)
		return null;

	const updatedAt = directory.updatedAt;
	const district = directory.districts.find(item => item.slug === representative.districtSlug) ?? null;
	const sources = buildRepresentativeSources(context, representative, district?.title ?? null, updatedAt);

	return {
		note: "Representative profile assembled from current area results.",
		person: {
			ballotStatusLabel: "Published ballot status unavailable in this area",
			biography: [
				{
					id: `provider:${representative.slug}`,
					sources,
					summary: representative.openstatesUrl
						? `${representative.name} is linked here through area results and the matched officeholder record.`
						: `${representative.name} is linked here through area results.`,
					title: "Office record",
				},
			],
			comparison: null,
			contestSlug: district?.slug || representative.districtSlug,
			districtLabel: representative.districtLabel,
			districtSlug: district?.slug || representative.districtSlug,
			freshness: {
				contentLastVerifiedAt: updatedAt,
				dataLastUpdatedAt: updatedAt,
				nextReviewAt: updatedAt,
				status: "up-to-date",
				statusLabel: "Area-result backed",
				statusNote: "This profile reflects the latest area results for this address or ZIP. Verify critical details against the attached provider record and official election tools.",
			},
			funding: null,
			governmentLevel: representative.governmentLevel,
			incumbent: true,
			keyActions: [],
			lobbyingContext: [],
			location: representative.location,
			methodologyNotes: [
				"This page is generated from address or ZIP results and should not be mistaken for a published local person record.",
				"Provider-backed representative matches can be crosswalked or approximate, especially for ZIP-based lookups.",
			],
			name: representative.name,
			officeDisplayLabel: representative.officeDisplayLabel,
			officeholderLabel: representative.officeholderLabel,
			officeType: representative.officeType,
			officeSought: representative.officeSought,
			onCurrentBallot: false,
			openstatesUrl: representative.openstatesUrl,
			party: representative.party,
			profileImages: representative.profileImages,
			provenance: {
				asOf: updatedAt,
				label: representative.provenance?.label || "Lookup results representative match",
				note: representative.provenance?.note || "Derived from address or ZIP results rather than a published local person record.",
				source: "lookup",
				status: representative.provenance?.status || "crosswalked",
			},
			publicStatements: [],
			slug: representative.slug,
			sourceCount: sources.length,
			sources,
			summary: representative.summary,
			topIssues: [],
			updatedAt,
			whatWeDoNotKnow: [
				buildTrustBullet(
					"guide-status",
					"Candidate-field and ballot-comparison records are not attached to this person page. Finance and influence modules appear only when Ballot Clarity can verify a reliable person-level linkage for them.",
					sources,
				),
				buildTrustBullet(
					"lookup-precision",
					context.inputKind === "zip"
						? "This record came from a ZIP-based lookup and should be treated as a likely match until verified against a full street address or official election tools."
						: "Provider-backed person matching can still be incomplete and should be verified against the linked provider record and official tools.",
					sources,
				),
			],
			whatWeKnow: [
				buildTrustBullet(
					"lookup-match",
					district
						? buildDistrictRepresentativeAvailabilityNote(district, 1)
						: "District context is attached from address or ZIP results when available.",
					sources,
				),
				buildTrustBullet(
					"official-tools",
					context.actions.some(action => action.kind === "official-verification")
						? "Official election tools remain attached for ballot confirmation, voter status, or polling-place verification."
						: "No official election tool links were attached for this result.",
					sources,
				),
			],
		},
		updatedAt,
	};
}
