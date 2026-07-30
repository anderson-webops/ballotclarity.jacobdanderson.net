import type { AddressEnrichmentResult } from "./address-enrichment.js";
import type { OfficialAddressMatch } from "./google-civic.js";
import type {
	BallotContentPreview,
	CoverageResponse,
	GuideContentSummary,
	Jurisdiction,
	JurisdictionSummary,
	LocationLookupAction,
	LocationLookupInputKind,
	LocationLookupResponse,
	LocationLookupSelectionOption,
	LocationRepresentativeMatch,
	LocationSelection,
	OfficialResource,
} from "./types/civic.js";
import { getOfficialToolsForState, getStateNameForAbbreviation } from "./official-election-tools.js";
import { containsControlCharacters } from "./text-validation.js";

const zipCodePattern = /^\d{5}(?:-\d{4})?$/;
const numericFragmentPattern = /^[\d-]+$/;
export const locationLookupInputMaxLength = 300;
const myVoterPagePattern = /my voter page/i;
const pollingPlacePattern = /polling-place|precinct/i;
const congressSourcePattern = /congress/i;
const openStatesSourcePattern = /open states/i;
const officialSourcePattern = /official/i;

function normalizePlaceName(value: string | undefined) {
	return (value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\b(?:county|city|parish|borough|township|town)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export interface LookupGeoContext {
	countyFips?: string;
	countyName?: string;
	locality?: string;
	normalizedAddress?: string;
	postalCode?: string;
	sourceSystem?: string;
	stateAbbreviation?: string;
	stateName?: string;
}

function buildCoverageSelection(summary: JurisdictionSummary): LocationSelection {
	return {
		coverageLabel: `Current published election area: ${summary.displayName}`,
		displayName: summary.displayName,
		lookupMode: "zip-preview",
		requiresOfficialConfirmation: true,
		slug: summary.slug,
		state: summary.state
	};
}

function buildZipNationwideSelection(
	rawQuery: string,
	geoContext: LookupGeoContext | null | undefined
): LocationSelection | null {
	const state = geoContext?.stateName
		|| getStateNameForAbbreviation(geoContext?.stateAbbreviation)
		|| geoContext?.stateAbbreviation;
	const displayName = geoContext?.locality && state
		? `${geoContext.locality}, ${state}`
		: state
			? `${rawQuery}, ${state}`
			: geoContext?.postalCode || rawQuery;

	if (!displayName)
		return null;

	return {
		coverageLabel: "Civic results available",
		displayName,
		lookupInput: geoContext?.postalCode || rawQuery,
		lookupMode: "zip-preview",
		requiresOfficialConfirmation: false,
		slug: displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
		state: state || ""
	};
}

function findOfficialVerificationResource(jurisdiction: Jurisdiction | null, coverage: CoverageResponse) {
	const candidates = [
		...(jurisdiction?.officialResources ?? []),
		...(coverage.launchTarget?.officialResources ?? [])
	];

	return candidates.find(resource => myVoterPagePattern.test(resource.label))
		?? candidates.find(resource => pollingPlacePattern.test(resource.label))
		?? candidates.find(resource => resource.authority === "official-government");
}

function buildCoverageActions(jurisdictionSummaries: JurisdictionSummary[]): LocationLookupAction[] {
	return jurisdictionSummaries.map(summary => ({
		badge: "Approximate",
		description: `Open the current ${summary.displayName} election overview. ZIP-only lookups can cross district or city boundaries, so verify the final ballot in the official tools before relying on district-specific contest pages.`,
		electionSlug: summary.nextElectionSlug,
		id: `coverage:${summary.slug}`,
		kind: "ballot-guide",
		location: buildCoverageSelection(summary),
		title: summary.displayName
	}));
}

function buildOfficialVerificationAction(resource: OfficialResource | undefined): LocationLookupAction | undefined {
	if (!resource)
		return undefined;

	return {
		badge: "Official",
		description: resource.note || "Use the official election-office tool to verify your precinct, polling place, and sample ballot before relying on an approximate coverage guide.",
		id: "official-verification",
		kind: "official-verification",
		title: resource.label,
		url: resource.url
	};
}

function dedupeActions(actions: Array<LocationLookupAction | undefined>) {
	const seen = new Set<string>();
	const unique: LocationLookupAction[] = [];

	for (const action of actions) {
		if (!action)
			continue;

		const key = action.url || `${action.kind}:${action.title}:${action.electionSlug || action.id}`;

		if (seen.has(key))
			continue;

		seen.add(key);
		unique.push(action);
	}

	return unique;
}

function buildOfficialVerificationActions(resources: OfficialResource[]) {
	return dedupeActions(resources.map(buildOfficialVerificationAction));
}

function actionToOfficialResource(action: LocationLookupAction | undefined): OfficialResource | undefined {
	if (!action?.url)
		return undefined;

	return {
		authority: "official-government",
		label: action.title,
		note: action.description,
		sourceLabel: action.badge || "Official election verification",
		sourceSystem: "Ballot Clarity official verification action",
		url: action.url,
	};
}

function attachOfficialVerificationToBallotPreviews(
	previews: BallotContentPreview[] | undefined,
	actions: LocationLookupAction[]
) {
	if (!previews?.length)
		return undefined;

	const verificationAction = actions.find(action => /ballot|voter|registration/i.test(`${action.title} ${action.description}`))
		?? actions.find(action => action.kind === "official-verification");
	const verificationResource = actionToOfficialResource(verificationAction);

	return previews.map(preview => preview.verificationResource || !verificationResource
		? preview
		: {
				...preview,
				verificationResource,
				verificationResourceLabel: `Verify with ${verificationResource.label}.`,
			});
}

export function findSupportedCoverageSummaries(jurisdictionSummaries: JurisdictionSummary[], geoContext: LookupGeoContext | null | undefined) {
	if (!geoContext?.stateAbbreviation)
		return [];

	const geoState = normalizePlaceName(
		geoContext.stateName
		|| getStateNameForAbbreviation(geoContext.stateAbbreviation)
		|| geoContext.stateAbbreviation
	);
	const matchingStateSummaries = jurisdictionSummaries.filter((summary) => {
		const summaryState = normalizePlaceName(summary.state);
		return Boolean(summaryState && geoState && summaryState === geoState);
	});

	return matchingStateSummaries.filter((summary) => {
		const summaryNames = [
			normalizePlaceName(summary.name),
			normalizePlaceName(summary.displayName)
		].filter(Boolean);
		const countyName = normalizePlaceName(geoContext.countyName);
		const locality = normalizePlaceName(geoContext.locality);

		if (countyName && summaryNames.some(name => name.includes(countyName) || countyName.includes(name)))
			return true;

		if (locality && summaryNames.some(name => name.includes(locality) || locality.includes(name)))
			return true;

		return !countyName && !locality && matchingStateSummaries.length === 1;
	});
}

function describeDetectedLocation(
	inputKind: LocationLookupInputKind,
	rawQuery: string,
	geoContext: LookupGeoContext | null | undefined
) {
	if (inputKind === "zip") {
		if (geoContext?.locality && (geoContext.stateName || geoContext.stateAbbreviation))
			return `ZIP code ${geoContext.postalCode || rawQuery} appears to be in ${geoContext.locality}, ${geoContext.stateName || geoContext.stateAbbreviation}.`;

		if (geoContext?.stateName || geoContext?.stateAbbreviation)
			return `ZIP code ${geoContext.postalCode || rawQuery} appears to be in ${geoContext.stateName || geoContext.stateAbbreviation}.`;

		return `ZIP code ${rawQuery} is outside Ballot Clarity's current supported coverage.`;
	}

	if (geoContext?.countyName && (geoContext.stateName || geoContext.stateAbbreviation))
		return `This address appears to be in ${geoContext.countyName}, ${geoContext.stateName || geoContext.stateAbbreviation}.`;

	if (geoContext?.stateName || geoContext?.stateAbbreviation)
		return `This address appears to be in ${geoContext.stateName || geoContext.stateAbbreviation}.`;

	return "This address is outside Ballot Clarity's current supported coverage.";
}

function buildUnsupportedNote(
	rawQuery: string,
	inputKind: LocationLookupInputKind,
	geoContext: LookupGeoContext | null | undefined,
	hasOfficialActions: boolean
) {
	const locationSentence = describeDetectedLocation(inputKind, rawQuery, geoContext);
	const officialSentence = hasOfficialActions
		? "Ballot Clarity could not map this lookup into a confirmed local result. Use the official voter or election tools below for the correct ballot, voter-status, and polling-place information."
		: "Ballot Clarity could not map this lookup into a confirmed local result. Enter a full street address for a more precise lookup, or use the official voter or election tool for this state.";

	return `${locationSentence} ${officialSentence}`.trim();
}

function uniqueStrings(values: Array<string | undefined>) {
	return Array.from(new Set(values.map(value => String(value || "").trim()).filter(Boolean)));
}

function summarizeRepresentativeSources(matches: LocationRepresentativeMatch[] | undefined) {
	const normalizedSources = matches
		? uniqueStrings(matches.map((match) => {
				if (congressSourcePattern.test(match.sourceSystem))
					return "Congress.gov";

				if (openStatesSourcePattern.test(match.sourceSystem))
					return "Open States";

				if (officialSourcePattern.test(match.sourceSystem))
					return "reviewed official local officeholder sources";

				return match.sourceSystem;
			}))
		: [];

	if (!normalizedSources.length)
		return "current public records";

	if (normalizedSources.length === 1)
		return normalizedSources[0];

	if (normalizedSources.length === 2)
		return `${normalizedSources[0]} and ${normalizedSources[1]}`;

	return `${normalizedSources.slice(0, -1).join(", ")}, and ${normalizedSources.at(-1)}`;
}

function describeRepresentativeAttachment(
	matches: LocationRepresentativeMatch[] | undefined,
	inputKind: LocationLookupInputKind,
) {
	if (!matches?.length)
		return "";

	const sourceSummary = summarizeRepresentativeSources(matches);
	return `Ballot Clarity attached ${matches.length} current official match${matches.length === 1 ? "" : "es"} for this ${inputKind} from ${sourceSummary}.`;
}

function buildGuideUnavailableNote(
	rawQuery: string,
	inputKind: LocationLookupInputKind,
	geoContext: LookupGeoContext | null | undefined,
	hasOfficialActions: boolean,
	addressEnrichment?: AddressEnrichmentResult | null
) {
	const locationSentence = describeDetectedLocation(inputKind, rawQuery, geoContext);
	const publishedGuideSentence = `Ballot Clarity matched this ${inputKind === "zip" ? "location" : "address"} and loaded the civic results available for this area.`;
	const districtSentence = addressEnrichment?.districtMatches?.length
		? `Census geography matched ${addressEnrichment.districtMatches.map(match => match.label).join(", ")}.`
		: "";
	const representativeSentence = describeRepresentativeAttachment(addressEnrichment?.representativeMatches, inputKind);
	const officialSentence = hasOfficialActions
		? "Official election tools are included below for the current ballot, voter-status, and polling-place details."
		: "Use the relevant official election tool for current ballot, voter-status, and polling-place details.";

	return [
		locationSentence,
		publishedGuideSentence,
		districtSentence,
		representativeSentence,
		officialSentence
	].filter(Boolean).join(" ");
}

function buildPublishedZipGuideNote(
	rawQuery: string,
	geoContext: LookupGeoContext | null | undefined,
	hasOfficialActions: boolean,
	addressEnrichment?: AddressEnrichmentResult | null,
	guideContent?: GuideContentSummary | null,
) {
	const locationSentence = describeDetectedLocation("zip", rawQuery, geoContext);
	const guideSentence = guideContent?.verifiedContestPackage
		? "Ballot Clarity matched a single guide area for this ZIP and loaded a verified local guide for it."
		: guideContent?.publishedGuideShell
			? "Ballot Clarity matched a single published election area for this ZIP and loaded the election overview for it. Official election links are current, and verified contest pages are still under local review."
			: "Ballot Clarity matched a single guide area for this ZIP and loaded the civic results available for this area.";
	const districtSentence = addressEnrichment?.districtMatches?.length
		? `Census geography matched ${addressEnrichment.districtMatches.map(match => match.label).join(", ")}.`
		: "";
	const representativeSentence = describeRepresentativeAttachment(addressEnrichment?.representativeMatches, "zip");
	const officialSentence = hasOfficialActions
		? "Official election tools are included below for ballot confirmation, voter-status, and polling-place details."
		: "Use the relevant official election tool for ballot confirmation, voter-status, and polling-place details.";

	return [
		locationSentence,
		guideSentence,
		districtSentence,
		representativeSentence,
		officialSentence
	].filter(Boolean).join(" ");
}

function buildZipSelectionNote(
	rawQuery: string,
	selectionOptions: LocationLookupSelectionOption[],
	hasOfficialActions: boolean
) {
	const officialSentence = hasOfficialActions
		? "Official election tools stay visible below while you choose the right matched area."
		: "Choose the right matched area below to continue with district and ballot lookup.";

	return `ZIP code ${rawQuery} matched ${selectionOptions.length} possible civic areas in the current provider data. Choose the correct area below so Ballot Clarity can load the right districts, representatives, and any published guide coverage for this ZIP. ${officialSentence}`;
}

function buildAvailabilitySummary(
	inputKind: LocationLookupInputKind,
	guideAvailability: "published" | "not-published",
	addressEnrichment?: AddressEnrichmentResult | null,
	selectionOptions?: LocationLookupSelectionOption[],
	guideContent?: GuideContentSummary | null,
	hasOfficialLogistics = false,
	providerBallotPreviewCount = 0,
) {
	const representativeCount = addressEnrichment?.representativeMatches?.length ?? 0;
	const hasRepresentatives = representativeCount > 0;
	const hasGuide = guideAvailability === "published";
	const hasGuideShell = hasGuide && Boolean(guideContent?.publishedGuideShell);
	const hasVerifiedContestPackage = hasGuide && Boolean(guideContent?.verifiedContestPackage);
	const hasPublishedShellOnly = hasGuideShell && !hasVerifiedContestPackage;
	const selectionRequired = inputKind === "zip" && Boolean(selectionOptions?.length);
	const officialLogisticsAvailable = hasOfficialLogistics
		|| Boolean(hasGuide && guideContent?.officialLogistics.status === "verified_local");
	const hasProviderBallotPreview = providerBallotPreviewCount > 0;
	const financeInfluenceDetail = hasVerifiedContestPackage
		? "Funding and influence pages are available through the local guide and any linked person profiles for this area."
		: hasPublishedShellOnly
			? "Representative funding and influence pages may still be available through linked person profiles, but contest pages in this local guide are still under review."
			: selectionRequired
				? "Choose one of the matched areas below to see whether any person-level funding or influence records are attached to this lookup."
				: hasRepresentatives
					? "No person-level funding or influence records are attached to this lookup yet. Ballot Clarity only shows those modules when a matched candidate or representative profile has reliable linked data."
					: "No person-level funding or influence records are attached to this lookup yet.";
	const nationwideDetail = hasGuide
		? "Results, district context, and official election links remain available alongside the local guide for this lookup."
		: selectionRequired
			? "Civic results for this area are available for this ZIP after you choose one of the matched areas below."
			: inputKind === "zip"
				? "Civic results and official election links are available for this ZIP."
				: "Results, district context, and official election links are available for this address.";
	const representativeSourceSummary = summarizeRepresentativeSources(addressEnrichment?.representativeMatches);

	return {
		nationwideCivicResults: {
			detail: nationwideDetail,
			label: "Civic results for your area",
			status: "available"
		},
		officialLogistics: {
			detail: hasGuide && guideContent
				? guideContent.officialLogistics.detail
				: officialLogisticsAvailable
					? "Official election logistics or verification tools are attached for this lookup."
					: "No official election logistics are attached to this lookup yet.",
			label: "Official logistics",
			status: officialLogisticsAvailable ? "available" : "unavailable"
		},
		ballotCandidates: {
			detail: hasVerifiedContestPackage
				? inputKind === "zip"
					? "Ballot Clarity has verified local contest and candidate coverage for the matched ZIP area."
					: "Ballot Clarity has verified local contest and candidate coverage for this area."
				: hasProviderBallotPreview
					? `A provider returned ${providerBallotPreviewCount} ballot preview ${providerBallotPreviewCount === 1 ? "set" : "sets"} for this lookup, but Ballot Clarity has not locally reviewed it as the official ballot package. Verify it with the linked state or local voter tool.`
					: hasPublishedShellOnly
						? guideContent?.candidates.detail ?? "Candidate pages are available for this local guide, but they are still under local review."
						: "Ballot candidate pages are not published for this area yet.",
			label: "Ballot candidate data",
			status: hasVerifiedContestPackage ? "available" : hasProviderBallotPreview || hasPublishedShellOnly ? "limited" : "unavailable"
		},
		financeInfluence: {
			detail: financeInfluenceDetail,
			label: "Finance and influence",
			status: hasVerifiedContestPackage ? "available" : hasPublishedShellOnly ? "limited" : "unavailable"
		},
		guideShell: {
			detail: hasGuide && guideContent
				? guideContent.guideShell.detail
				: hasGuide
					? "An election overview is available for this area."
					: "No published election overview is available for this area yet.",
			label: "Election overview",
			status: hasGuide ? "available" : "unavailable"
		},
		verifiedContestPackage: {
			detail: hasGuide && guideContent
				? guideContent.contests.detail
				: hasGuide
					? "Contest pages for this guide still need local verification."
					: "No verified local contest pages are published for this area yet.",
			label: "Verified contest pages",
			status: hasVerifiedContestPackage ? "available" : "unavailable"
		},
		fullLocalGuide: {
			detail: hasGuide && guideContent
				? guideContent.summary
				: hasGuide
					? inputKind === "zip"
						? "A published election overview is available for the matched ZIP area."
						: "A published election overview is available for this lookup."
					: "A full local contest and measure guide is not published for this area yet.",
			label: "Local guide coverage",
			status: hasVerifiedContestPackage ? "available" : hasPublishedShellOnly ? "limited" : "unavailable"
		},
		representatives: {
			detail: hasRepresentatives
				? `Current representative data is available for this lookup from ${representativeSourceSummary} (${representativeCount} match${representativeCount === 1 ? "" : "es"}).`
				: selectionRequired
					? "This ZIP matched more than one possible area. Choose one below to load the correct representative records."
					: inputKind === "zip"
						? "Representative data is not available for the matched ZIP area yet."
						: "Current representative data is not available for this lookup yet.",
			label: "Representative data",
			status: hasRepresentatives ? "available" : "unavailable"
		}
	} satisfies NonNullable<LocationLookupResponse["availability"]>;
}

export function classifyLookupInput(raw: string): LocationLookupInputKind {
	if (zipCodePattern.test(raw))
		return "zip";

	return "address";
}

export function validateLookupInput(raw: string) {
	if (raw.length > locationLookupInputMaxLength)
		return `Location lookup input must be ${locationLookupInputMaxLength} characters or fewer.`;

	if (containsControlCharacters(raw))
		return "Location lookup input must be a single line without control characters.";

	if (raw.length < 3)
		return "Enter at least a street address or ZIP code fragment to continue.";

	if (numericFragmentPattern.test(raw) && !zipCodePattern.test(raw))
		return "Enter a full 5-digit ZIP code or a street address to continue.";

	return null;
}

export function buildLocationLookupResponse(
	rawQuery: string,
	jurisdiction: Jurisdiction | null,
	jurisdictionSummaries: JurisdictionSummary[],
	location: LocationSelection | null,
	electionSlug: string | undefined,
	coverageMode: "empty" | "snapshot",
	coverage: CoverageResponse,
	geoContext?: LookupGeoContext | null,
	officialLookup?: OfficialAddressMatch | null,
	addressEnrichment?: AddressEnrichmentResult | null,
	selectionOptions?: LocationLookupSelectionOption[],
	selectionId?: string,
	guideContent?: GuideContentSummary | null,
): LocationLookupResponse {
	const inputKind = classifyLookupInput(rawQuery);
	const stateOfficialActions = buildOfficialVerificationActions(
		getOfficialToolsForState(geoContext?.stateAbbreviation)
	);
	const supportedCoverageSummaries = findSupportedCoverageSummaries(jurisdictionSummaries, geoContext);

	if (inputKind === "zip") {
		if (!geoContext) {
			return {
				actions: stateOfficialActions,
				inputKind,
				lookupQuery: rawQuery,
				note: buildUnsupportedNote(rawQuery, inputKind, geoContext, Boolean(stateOfficialActions.length)),
				result: "unsupported"
			};
		}

		const autoSelectedCoverage = supportedCoverageSummaries.length === 1
			? supportedCoverageSummaries[0]
			: null;
		const hasPublishedGuide = Boolean(autoSelectedCoverage);
		const officialVerification = hasPublishedGuide
			? buildOfficialVerificationAction(findOfficialVerificationResource(jurisdiction, coverage))
			: undefined;
		const actions = dedupeActions([
			...(supportedCoverageSummaries.length > 1 ? buildCoverageActions(supportedCoverageSummaries) : []),
			...stateOfficialActions,
			...(officialVerification ? [officialVerification] : [])
		]);
		const guideAvailability = hasPublishedGuide ? "published" : "not-published";
		const nationwideSelection = selectionOptions?.length
			? undefined
			: autoSelectedCoverage
				? buildCoverageSelection(autoSelectedCoverage)
				: buildZipNationwideSelection(rawQuery, geoContext) || undefined;

		return {
			actions,
			availability: buildAvailabilitySummary(
				inputKind,
				guideAvailability,
				addressEnrichment,
				selectionOptions,
				guideContent,
				Boolean(officialLookup?.logistics || actions.length),
			),
			districtMatches: addressEnrichment?.districtMatches,
			electionLogistics: officialLookup?.logistics ?? null,
			electionSlug: autoSelectedCoverage?.nextElectionSlug,
			fromCache: addressEnrichment?.fromCache,
			guideAvailability,
			guideContent: hasPublishedGuide ? guideContent ?? null : null,
			inputKind,
			location: nationwideSelection,
			lookupQuery: rawQuery,
			note: selectionOptions?.length
				? buildZipSelectionNote(rawQuery, selectionOptions, Boolean(actions.length))
				: guideAvailability === "published"
					? buildPublishedZipGuideNote(rawQuery, geoContext, Boolean(actions.length), addressEnrichment, guideContent)
					: buildGuideUnavailableNote(rawQuery, inputKind, geoContext, Boolean(actions.length), addressEnrichment),
			normalizedAddress: addressEnrichment?.normalizedAddress || geoContext.postalCode || rawQuery,
			representativeMatches: addressEnrichment?.representativeMatches,
			selectionId,
			selectionOptions,
			result: "resolved"
		};
	}

	if (!supportedCoverageSummaries.length || !location || !electionSlug) {
		const officialActions = dedupeActions([
			...(officialLookup?.actions ?? []),
			...stateOfficialActions
		]);
		const ballotContentPreviews = attachOfficialVerificationToBallotPreviews(
			officialLookup?.ballotContentPreviews,
			officialActions
		);

		if (geoContext || officialLookup || addressEnrichment?.normalizedAddress || addressEnrichment?.districtMatches?.length || addressEnrichment?.representativeMatches?.length) {
			return {
				actions: officialActions,
				availability: buildAvailabilitySummary(
					inputKind,
					"not-published",
					addressEnrichment,
					undefined,
					null,
					Boolean(officialLookup?.logistics || officialActions.length),
					ballotContentPreviews?.length ?? 0,
				),
				ballotContentPreviews,
				fromCache: addressEnrichment?.fromCache,
				guideAvailability: "not-published",
				inputKind,
				districtMatches: addressEnrichment?.districtMatches,
				electionLogistics: officialLookup?.logistics ?? null,
				lookupQuery: rawQuery,
				note: buildGuideUnavailableNote(rawQuery, inputKind, geoContext, Boolean(officialActions.length), addressEnrichment),
				normalizedAddress: addressEnrichment?.normalizedAddress,
				representativeMatches: addressEnrichment?.representativeMatches,
				selectionId,
				result: "resolved"
			};
		}

		return {
			actions: officialActions,
			fromCache: addressEnrichment?.fromCache,
			inputKind,
			districtMatches: addressEnrichment?.districtMatches,
			lookupQuery: rawQuery,
			note: buildUnsupportedNote(rawQuery, inputKind, geoContext, Boolean(officialActions.length)),
			normalizedAddress: addressEnrichment?.normalizedAddress,
			representativeMatches: addressEnrichment?.representativeMatches,
			selectionId,
			result: "unsupported"
		};
	}

	const officialActions = dedupeActions([
		...(officialLookup?.actions ?? []),
		...stateOfficialActions
	]);
	const ballotContentPreviews = attachOfficialVerificationToBallotPreviews(
		officialLookup?.ballotContentPreviews,
		officialActions
	);

	return {
		actions: officialActions.length ? officialActions : undefined,
		availability: buildAvailabilitySummary(
			inputKind,
			"published",
			addressEnrichment,
			undefined,
			guideContent,
			Boolean(officialLookup?.logistics || officialActions.length),
			ballotContentPreviews?.length ?? 0,
		),
		ballotContentPreviews,
		electionSlug,
		electionLogistics: officialLookup?.logistics ?? null,
		fromCache: addressEnrichment?.fromCache,
		guideAvailability: "published",
		guideContent: guideContent ?? null,
		inputKind,
		districtMatches: addressEnrichment?.districtMatches,
		lookupQuery: rawQuery,
		location: {
			...location,
			lookupMode: officialLookup?.verified ? "address-verified" : "address-submitted",
			lookupInput: addressEnrichment?.normalizedAddress || rawQuery,
			requiresOfficialConfirmation: !officialLookup?.verified
		},
		note: [
			officialLookup?.note || (coverageMode === "snapshot"
				? guideContent?.verifiedContestPackage
					? "A full address is the right input for exact ballot matching. This area opens a verified local guide, but official election tools still remain the final authority for district-level ballot confirmation."
					: "A full address is the right input for exact ballot matching. This area opens an election overview with verified official election links, but verified contest pages are still under local review, so confirm the final ballot in the official election tools."
				: "A full address is the right input for exact ballot matching. This area may also open a local guide, but confirm the final ballot in the official election tools."),
			addressEnrichment?.districtMatches?.length
				? `Census geography matched ${addressEnrichment.districtMatches.map(match => match.label).join(", ")}.`
				: "",
			describeRepresentativeAttachment(addressEnrichment?.representativeMatches, "address"),
			addressEnrichment?.fromCache
				? "District geography came from the local lookup cache."
				: ""
		].filter(Boolean).join(" "),
		normalizedAddress: addressEnrichment?.normalizedAddress,
		representativeMatches: addressEnrichment?.representativeMatches,
		selectionId,
		result: "resolved"
	};
}
