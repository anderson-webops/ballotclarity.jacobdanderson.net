import type { ActiveNationwideLookupContext } from "./active-nationwide-lookup.js";
import type { CongressClient, CongressMemberDetail, CongressMemberRecord } from "./congress.js";
import type { LdaClient, LdaContributionReport } from "./lda.js";
import type { OpenFecCandidateSearchRecord, OpenFecClient, OpenFecCommitteeTotalsRecord } from "./openfec.js";
import type {
	EvidenceBlock,
	ExternalLink,
	LocationRepresentativeMatch,
	PersonProfileEnrichmentStatus,
	PersonProfileEnrichmentStatusItem,
	PersonProfileFunding,
	PersonProfileInfluence,
	PersonProfileOfficeContext,
	PersonProfileResponse,
	ProfileImage,
	RepresentativeSummary,
	Source,
	TrustBullet,
} from "./types/civic.js";
import process from "node:process";
import { buildNationwideRepresentativeSlug } from "./active-nationwide-lookup.js";
import { isCurrentCongressMemberRecord } from "./congress.js";
import { buildCongressProfileImages, uniqueProfileImages } from "./profile-images.js";

const currencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 0,
	style: "currency",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	year: "numeric",
});
const committeeSuffixPattern = /\b(?:inc|llc|committee|for|pac|campaign)\b/gi;
const districtNumberPattern = /\b(\d+)\b/;
const incumbentPattern = /incumbent/i;
const normalizedAddressStateCodePattern = /,\s*([A-Z]{2})\s*,\s*\d{5}(?:-\d{4})?\s*$/i;
const officeholderHonorificPattern = /\b(?:the|hon|honorable|rep|representative|cong|congressman|congresswoman|sen|senator|mr|mrs|ms|dr)\b/gi;
const personNameSuffixPattern = /\b(?:jr|sr|ii|iii|iv|v|md|phd|dds|esq)\b/gi;
const representativeOfficePattern = /representative/i;
const senatorLabelPrefixPattern = /^senator\s+/;
const senatorOfficePattern = /senator/i;
const openStatesSourcePattern = /open states/i;

const canonicalFirstNameAliases = new Map<string, string>([
	["andy", "andrew"],
	["bill", "william"],
	["billy", "william"],
	["bob", "robert"],
	["bobby", "robert"],
	["dan", "daniel"],
	["danny", "daniel"],
	["dave", "david"],
	["jon", "jonathan"],
	["joe", "joseph"],
	["jim", "james"],
	["jimmy", "james"],
	["kate", "katherine"],
	["katie", "katherine"],
	["liz", "elizabeth"],
	["matt", "matthew"],
	["mike", "michael"],
	["nick", "nicholas"],
	["pat", "patrick"],
	["rich", "richard"],
	["rob", "robert"],
	["sam", "samuel"],
	["steve", "steven"],
	["tom", "thomas"],
	["will", "william"],
]);

const stateNameToCode = new Map<string, string>([
	["alabama", "AL"],
	["alaska", "AK"],
	["arizona", "AZ"],
	["arkansas", "AR"],
	["california", "CA"],
	["colorado", "CO"],
	["connecticut", "CT"],
	["delaware", "DE"],
	["district-of-columbia", "DC"],
	["district of columbia", "DC"],
	["florida", "FL"],
	["georgia", "GA"],
	["hawaii", "HI"],
	["idaho", "ID"],
	["illinois", "IL"],
	["indiana", "IN"],
	["iowa", "IA"],
	["kansas", "KS"],
	["kentucky", "KY"],
	["louisiana", "LA"],
	["maine", "ME"],
	["maryland", "MD"],
	["massachusetts", "MA"],
	["michigan", "MI"],
	["minnesota", "MN"],
	["mississippi", "MS"],
	["missouri", "MO"],
	["montana", "MT"],
	["nebraska", "NE"],
	["nevada", "NV"],
	["new-hampshire", "NH"],
	["new jersey", "NJ"],
	["new-jersey", "NJ"],
	["new mexico", "NM"],
	["new-mexico", "NM"],
	["new york", "NY"],
	["new-york", "NY"],
	["north carolina", "NC"],
	["north-carolina", "NC"],
	["north dakota", "ND"],
	["north-dakota", "ND"],
	["ohio", "OH"],
	["oklahoma", "OK"],
	["oregon", "OR"],
	["pennsylvania", "PA"],
	["rhode island", "RI"],
	["rhode-island", "RI"],
	["south carolina", "SC"],
	["south-carolina", "SC"],
	["south dakota", "SD"],
	["south-dakota", "SD"],
	["tennessee", "TN"],
	["texas", "TX"],
	["utah", "UT"],
	["vermont", "VT"],
	["virginia", "VA"],
	["washington", "WA"],
	["west virginia", "WV"],
	["west-virginia", "WV"],
	["wisconsin", "WI"],
	["wyoming", "WY"],
]);

interface CreateRepresentativeModuleResolverOptions {
	cacheMaxEntries?: number;
	cacheTtlMs?: number;
	congressClient?: CongressClient | null;
	ldaClient?: LdaClient | null;
	now?: () => Date;
	openFecClient?: OpenFecClient | null;
}

type OfficeholderLayer = "federal" | "local" | "state";

interface FederalRepresentativeTarget {
	cacheKey: string;
	district?: string;
	name: string;
	office: "H" | "S";
	state: string;
}

interface LdaInfluenceAttachment {
	dataAsOf?: string;
	influence?: PersonProfileInfluence | null;
	influenceSummary: string;
	lobbyingContext: EvidenceBlock[];
	publicStatements: EvidenceBlock[];
	sources: Source[];
	whatWeKnow: TrustBullet[];
}

interface CongressAttachment {
	biography: EvidenceBlock[];
	dataAsOf?: string;
	legislativeContextStatus: PersonProfileEnrichmentStatusItem;
	methodologyNotes: string[];
	officeContext?: PersonProfileOfficeContext;
	officialWebsiteUrl?: string;
	officeContextStatus: PersonProfileEnrichmentStatusItem;
	profileImages?: ProfileImage[];
	sources: Source[];
	whatWeKnow: TrustBullet[];
}

interface CachedRepresentativeModuleAttachment {
	expiresAt: number;
	value: Promise<RepresentativeModuleAttachment>;
}

interface RepresentativeModuleAttachment {
	biography: EvidenceBlock[];
	dataAsOf?: string;
	enrichmentStatus: PersonProfileEnrichmentStatus;
	funding: PersonProfileFunding | null;
	fundingAvailable: boolean;
	fundingSummary: string;
	influence?: PersonProfileInfluence | null;
	influenceAvailable: boolean;
	influenceSummary: string;
	lobbyingContext: EvidenceBlock[];
	methodologyNotes: string[];
	officeContext?: PersonProfileOfficeContext;
	officialWebsiteUrl?: string;
	profileImages?: ProfileImage[];
	publicStatements: EvidenceBlock[];
	sources: Source[];
	statusNote?: string;
	whatWeKnow: TrustBullet[];
}

export interface RepresentativeModuleResolver {
	enrichLocationFinanceInfluenceAvailability: (context: ActiveNationwideLookupContext, currentDetail: string, currentStatus: "available" | "limited" | "unavailable") => Promise<{
		detail: string;
		status: "available" | "limited" | "unavailable";
	}>;
	enrichNationwideDistrictRepresentatives: (context: ActiveNationwideLookupContext, representatives: RepresentativeSummary[]) => Promise<RepresentativeSummary[]>;
	enrichNationwidePersonProfile: (context: ActiveNationwideLookupContext, response: PersonProfileResponse) => Promise<PersonProfileResponse>;
	enrichNationwideRepresentativeDirectory: (context: ActiveNationwideLookupContext, representatives: RepresentativeSummary[]) => Promise<RepresentativeSummary[]>;
}

function normalizeValue(value: string | null | undefined) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeText(value: string | null | undefined) {
	return String(value ?? "")
		.toLowerCase()
		.replace(officeholderHonorificPattern, " ")
		.replace(personNameSuffixPattern, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function canonicalizeFirstName(value: string | null | undefined) {
	const normalized = normalizeText(value);
	return canonicalFirstNameAliases.get(normalized) || normalized;
}

function normalizePersonNameSegment(value: string | null | undefined) {
	return normalizeText(value)
		.split(" ")
		.filter(Boolean);
}

function pickCanonicalGivenName(tokens: string[]) {
	for (const token of tokens) {
		if (token.length > 1)
			return canonicalizeFirstName(token);
	}

	return canonicalizeFirstName(tokens[0]);
}

function parsePersonName(value: string | null | undefined) {
	const raw = String(value ?? "")
		.toLowerCase()
		.replace(/\./g, " ")
		.trim();

	if (!raw) {
		return {
			canonicalGivenName: "",
			surname: "",
			tokens: [] as string[],
		};
	}

	if (raw.includes(",")) {
		const [surnamePart, givenPart] = raw.split(",", 2);
		const surnameTokens = normalizePersonNameSegment(surnamePart);
		const givenTokens = normalizePersonNameSegment(givenPart);

		return {
			canonicalGivenName: pickCanonicalGivenName(givenTokens),
			surname: surnameTokens.join(" "),
			tokens: [...surnameTokens, ...givenTokens],
		};
	}

	const tokens = normalizePersonNameSegment(raw);
	const surname = tokens.slice(-1).join(" ");
	const givenTokens = tokens.slice(0, -1);

	return {
		canonicalGivenName: pickCanonicalGivenName(givenTokens),
		surname,
		tokens,
	};
}

function surnamesReliablyMatch(left: string, right: string) {
	if (!left || !right)
		return false;

	return left === right || left.endsWith(` ${right}`) || right.endsWith(` ${left}`);
}

function formatCurrency(amount: number) {
	return currencyFormatter.format(amount || 0);
}

function formatDate(value: string | undefined) {
	if (!value)
		return "";

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function buildEnrichmentStatus(
	status: PersonProfileEnrichmentStatusItem["status"],
	reasonCode: PersonProfileEnrichmentStatusItem["reasonCode"],
	summary: string,
	sourceSystem?: string,
): PersonProfileEnrichmentStatusItem {
	return {
		reasonCode,
		sourceSystem,
		status,
		summary,
	};
}

function summarizeProviderError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/\s+/g, " ").trim().slice(0, 240);
}

function buildProviderErrorStatus(
	sourceSystem: string,
	summary: string,
	error: unknown,
): PersonProfileEnrichmentStatusItem {
	const errorSummary = summarizeProviderError(error);

	return buildEnrichmentStatus(
		"unavailable",
		"provider_error",
		errorSummary ? `${summary} ${errorSummary}` : summary,
		sourceSystem,
	);
}

function toStateCode(value: string | null | undefined) {
	const normalized = normalizeValue(value);

	if (!normalized)
		return "";

	if (normalized.length === 2)
		return normalized.toUpperCase();

	return stateNameToCode.get(normalized) || "";
}

function buildTrustBullet(id: string, text: string, sources: Source[], note?: string): TrustBullet {
	return { id, note, sources, text };
}

function buildReferenceLink(label: string, url: string | undefined, note?: string): ExternalLink | null {
	if (!url)
		return null;

	return {
		label,
		note,
		url,
	};
}

function formatOrdinal(value: number | undefined) {
	if (!Number.isFinite(value) || !value)
		return "";

	const numericValue = Math.abs(value);
	const remainder = numericValue % 100;

	if (remainder >= 11 && remainder <= 13)
		return `${numericValue}th`;

	switch (numericValue % 10) {
		case 1:
			return `${numericValue}st`;
		case 2:
			return `${numericValue}nd`;
		case 3:
			return `${numericValue}rd`;
		default:
			return `${numericValue}th`;
	}
}

function uniqueSources(sources: Source[]) {
	return Array.from(new Map(sources.map(source => [source.id, source])).values());
}

function mergeDate(...values: Array<string | undefined>) {
	return values.filter(Boolean).sort().slice(-1)[0];
}

function personSlug(match: LocationRepresentativeMatch) {
	return buildNationwideRepresentativeSlug(match);
}

function findRepresentativeMatch(context: ActiveNationwideLookupContext, representativeSlug: string) {
	const normalizedRepresentativeSlug = normalizeValue(representativeSlug);

	return context.representativeMatches.find((match) => {
		return normalizeValue(match.id) === normalizedRepresentativeSlug
			|| personSlug(match) === representativeSlug;
	}) ?? null;
}

function inferContextStateCode(context: ActiveNationwideLookupContext) {
	const explicitStateCode = toStateCode(context.location?.state);

	if (explicitStateCode)
		return explicitStateCode;

	const normalizedAddressMatch = context.normalizedAddress.match(normalizedAddressStateCodePattern);
	return normalizedAddressMatch?.[1]?.toUpperCase() || "";
}

function inferDistrictNumber(value: string | null | undefined) {
	return value?.match(districtNumberPattern)?.[1] ?? null;
}

function inferFederalRepresentativeTarget(context: ActiveNationwideLookupContext, match: LocationRepresentativeMatch): FederalRepresentativeTarget | null {
	const stateCode = inferContextStateCode(context);

	if (!stateCode)
		return null;

	if (representativeOfficePattern.test(match.officeTitle)) {
		const normalizedDistrictLabel = normalizeText(match.districtLabel);
		const hasCongressionalContext = context.districtMatches.some(district => normalizeValue(district.districtType).includes("congress"));
		const hasStateHouseContext = context.districtMatches.some((district) => {
			const normalizedType = normalizeValue(district.districtType);
			return normalizedType.includes("state-house") || normalizedType.includes("state-assembly");
		});

		if ((normalizedDistrictLabel.includes("state house") || normalizedDistrictLabel.includes("state assembly")) || (hasStateHouseContext && !hasCongressionalContext))
			return null;

		const explicitDistrictCode = inferDistrictNumber(match.districtLabel);

		if (explicitDistrictCode) {
			return {
				cacheKey: `federal:${stateCode}:house:${explicitDistrictCode}:${normalizeText(match.name)}`,
				district: explicitDistrictCode.padStart(2, "0"),
				name: match.name,
				office: "H",
				state: stateCode,
			};
		}

		const congressionalDistrict = context.districtMatches.find((district) => {
			return normalizeValue(district.districtType).includes("congress")
				&& normalizeText(district.label) === normalizeText(match.districtLabel);
		}) ?? context.districtMatches.find(district => normalizeValue(district.districtType).includes("congress"));

		if (!congressionalDistrict?.districtCode)
			return null;

		return {
			cacheKey: `federal:${stateCode}:house:${congressionalDistrict.districtCode}:${normalizeText(match.name)}`,
			district: String(congressionalDistrict.districtCode).padStart(2, "0"),
			name: match.name,
			office: "H",
			state: stateCode,
		};
	}

	if (senatorOfficePattern.test(match.officeTitle)) {
		const normalizedDistrictLabel = normalizeText(match.districtLabel).replace(senatorLabelPrefixPattern, "");
		const normalizedStateName = normalizeText(context.location?.state);

		if (!normalizedDistrictLabel || (normalizedDistrictLabel !== normalizedStateName && normalizedDistrictLabel !== stateCode.toLowerCase()))
			return null;

		return {
			cacheKey: `federal:${stateCode}:senate:${normalizeText(match.name)}`,
			name: match.name,
			office: "S",
			state: stateCode,
		};
	}

	return null;
}

function inferOfficeholderLayer(
	context: ActiveNationwideLookupContext,
	match: LocationRepresentativeMatch,
	target: FederalRepresentativeTarget | null,
): OfficeholderLayer {
	if (target)
		return "federal";

	const normalizedOffice = normalizeValue(match.officeTitle);

	if (
		normalizedOffice.includes("mayor")
		|| normalizedOffice.includes("county")
		|| normalizedOffice.includes("council")
		|| normalizedOffice.includes("clerk")
		|| normalizedOffice.includes("commission")
	) {
		return "local";
	}

	const matchedDistrict = context.districtMatches.find(district => normalizeText(district.label) === normalizeText(match.districtLabel));
	const normalizedDistrictType = normalizeValue(matchedDistrict?.districtType);

	if (normalizedDistrictType.includes("county") || normalizedDistrictType.includes("place") || normalizedDistrictType.includes("city"))
		return "local";

	return "state";
}

function namesReliablyMatch(left: string, right: string) {
	const leftName = parsePersonName(left);
	const rightName = parsePersonName(right);

	if (!leftName.tokens.length || !rightName.tokens.length)
		return false;

	if (!surnamesReliablyMatch(leftName.surname, rightName.surname))
		return false;

	if (!leftName.canonicalGivenName || !rightName.canonicalGivenName)
		return false;

	return leftName.canonicalGivenName === rightName.canonicalGivenName;
}

function rankCandidateMatch(candidate: OpenFecCandidateSearchRecord, target: FederalRepresentativeTarget) {
	let score = 0;

	if (candidate.office === target.office)
		score += 40;

	if (normalizeValue(candidate.state) === normalizeValue(target.state))
		score += 40;

	if (target.district && normalizeValue(candidate.district) === normalizeValue(target.district))
		score += 20;

	if (namesReliablyMatch(candidate.name, target.name))
		score += 100;

	if (incumbentPattern.test(candidate.incumbentChallengeFull || ""))
		score += 5;

	return score;
}

function pickBestCandidate(candidates: OpenFecCandidateSearchRecord[], target: FederalRepresentativeTarget) {
	const rankedCandidates = [...candidates]
		.map(candidate => ({ candidate, score: rankCandidateMatch(candidate, target) }))
		.sort((left, right) => right.score - left.score);

	return rankedCandidates[0]?.score >= 120 ? rankedCandidates[0].candidate : null;
}

function buildFundingLineItems(totals: OpenFecCommitteeTotalsRecord) {
	const candidates = [
		["Itemized individual donors", "OpenFEC receipt category", totals.individualItemizedContributions],
		["Unitemized individual donors", "OpenFEC receipt category", totals.individualUnitemizedContributions],
		["Other political committees", "OpenFEC receipt category", totals.otherPoliticalCommitteeContributions],
		["Party committees", "OpenFEC receipt category", totals.politicalPartyCommitteeContributions],
		["Authorized committee transfers", "OpenFEC receipt category", totals.transfersFromOtherAuthorizedCommittee],
		["Other receipts", "OpenFEC receipt category", totals.otherReceipts],
		["Candidate contributions", "OpenFEC receipt category", totals.candidateContribution],
	] as const;

	return candidates
		.filter(([, , amount]) => amount > 0)
		.sort((left, right) => right[2] - left[2])
		.slice(0, 4)
		.map(([name, category, amount]) => ({ amount, category, name }));
}

function buildOpenFecSources(candidate: OpenFecCandidateSearchRecord, committeeTotals: OpenFecCommitteeTotalsRecord): Source[] {
	const sourceDate = committeeTotals.coverageEndDate || new Date().toISOString();
	const sources: Source[] = [
		{
			authority: "official-government",
			date: sourceDate,
			id: `openfec:candidate:${candidate.candidateId}`,
			note: "Federal candidate record matched to this officeholder through state, office, district, and name crosswalk checks.",
			publisher: "OpenFEC",
			sourceSystem: "OpenFEC candidate search",
			title: candidate.name,
			type: "campaign filing",
			url: `https://www.fec.gov/data/candidate/${candidate.candidateId}/`,
		},
		{
			authority: "official-government",
			date: sourceDate,
			id: `openfec:committee:${committeeTotals.committeeId}:${committeeTotals.cycle}`,
			note: "Current finance totals are attached from the matched principal committee for this officeholder.",
			publisher: "OpenFEC",
			sourceSystem: "OpenFEC committee totals",
			title: committeeTotals.committeeName,
			type: "campaign filing",
			url: `https://www.fec.gov/data/committee/${committeeTotals.committeeId}/`,
		},
	];

	return uniqueSources(sources);
}

async function resolveFundingAttachment(
	openFecClient: OpenFecClient | null | undefined,
	target: FederalRepresentativeTarget | null,
	layer: OfficeholderLayer,
	currentYear: number,
	stateName: string,
): Promise<{
	attachment: {
		candidate: OpenFecCandidateSearchRecord;
		dataAsOf?: string;
		funding: PersonProfileFunding;
		fundingSummary: string;
		sources: Source[];
	} | null;
	status: PersonProfileEnrichmentStatusItem;
}> {
	if (!target) {
		if (layer === "state") {
			return {
				attachment: null,
				status: buildEnrichmentStatus(
					"unavailable",
					"no_state_finance_source",
					`No reviewed state campaign-finance source is configured for ${stateName || "this state"} legislative officeholders yet.`,
					"State finance source",
				),
			};
		}

		if (layer === "local") {
			return {
				attachment: null,
				status: buildEnrichmentStatus(
					"unavailable",
					"no_local_finance_source",
					"No reviewed local campaign-finance source is configured for this county or city officeholder yet.",
					"Local finance source",
				),
			};
		}

		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"federal_only_provider",
				"A finance record is currently available only for federal officeholders with a reliable OpenFEC match.",
				"OpenFEC",
			),
		};
	}

	if (!openFecClient) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"provider_unconfigured",
				"OpenFEC finance data is not available for this officeholder right now.",
				"OpenFEC",
			),
		};
	}

	const candidates = await openFecClient.searchCandidates({
		district: target.district,
		name: target.name,
		office: target.office,
		state: target.state,
	});
	const candidate = pickBestCandidate(candidates, target);

	if (!candidate) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"no_provider_match",
				"OpenFEC did not return a current candidate record that passed Ballot Clarity's state, office, district, and name crosswalk checks for this officeholder.",
				"OpenFEC",
			),
		};
	}

	const cycles = Array.from(new Set([
		...candidate.cycles,
		currentYear,
		currentYear - 1,
		currentYear - 2,
	])).sort((left, right) => right - left);
	const committeeId = candidate.principalCommittees[0]?.committeeId;

	if (!committeeId) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"no_committee_record",
				"OpenFEC matched this officeholder to a current candidate record, but that record did not expose a principal committee Ballot Clarity could use for current finance totals.",
				"OpenFEC",
			),
		};
	}

	let committeeTotals: OpenFecCommitteeTotalsRecord | null = null;

	for (const cycle of cycles) {
		committeeTotals = await openFecClient.getCommitteeTotals(committeeId, cycle);

		if (committeeTotals)
			break;
	}

	if (!committeeTotals) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"provider_returned_no_records",
				"OpenFEC matched this officeholder's current principal committee, but the recent cycles Ballot Clarity checked did not return a current totals record yet.",
				"OpenFEC",
			),
		};
	}

	const coverageLabel = [
		`${committeeTotals.cycle} cycle`,
		committeeTotals.coverageEndDate ? `through ${formatDate(committeeTotals.coverageEndDate)}` : "",
	].filter(Boolean).join(" ");
	const sources = buildOpenFecSources(candidate, committeeTotals);
	const totalRaised = committeeTotals.receipts;
	const totalSpent = committeeTotals.disbursements;
	const smallDonorShare = committeeTotals.receipts > 0
		? Math.min(1, committeeTotals.individualUnitemizedContributions / committeeTotals.receipts)
		: 0;
	const committeeName = candidate.principalCommittees[0]?.name || committeeTotals.committeeName;
	const coverageRangeLabel = coverageLabel;
	const receiptBreakdown = buildFundingLineItems(committeeTotals);
	const attachment = {
		candidate,
		dataAsOf: committeeTotals.coverageEndDate || candidate.principalCommittees[0]?.lastFileDate,
		funding: {
			cashOnHand: committeeTotals.lastCashOnHandEndPeriod || committeeTotals.cashOnHandBeginningPeriod,
			committeeName,
			coverageLabel: coverageRangeLabel,
			provenanceLabel: `OpenFEC principal committee totals (${coverageLabel})`,
			receiptBreakdown,
			smallDonorShare,
			sources,
			summary: `${committeeName} reported ${formatCurrency(totalRaised)} in receipts${totalSpent ? `, ${formatCurrency(totalSpent)} in disbursements,` : ""}${committeeTotals.lastCashOnHandEndPeriod ? ` and ${formatCurrency(committeeTotals.lastCashOnHandEndPeriod)} cash on hand` : ""} in the ${coverageLabel}.`,
			topFunders: receiptBreakdown,
			totalRaised,
			totalSpent,
		},
		fundingSummary: `OpenFEC finance summary attached for the ${coverageLabel}.`,
		sources,
	};

	return {
		attachment,
		status: buildEnrichmentStatus(
			"available",
			"attached",
			`OpenFEC matched this officeholder to ${committeeName} and attached current finance totals for the ${coverageLabel}.`,
			"OpenFEC",
		),
	};
}

function normalizeCommitteeName(value: string | undefined) {
	return normalizeText(value).replace(committeeSuffixPattern, " ").trim().replace(/\s+/g, " ");
}

function matchesCommitteePayee(payeeName: string | undefined, committeeName: string | undefined) {
	const normalizedPayee = normalizeCommitteeName(payeeName);
	const normalizedCommittee = normalizeCommitteeName(committeeName);

	if (!normalizedPayee || !normalizedCommittee)
		return false;

	return normalizedPayee === normalizedCommittee || normalizedPayee.includes(normalizedCommittee) || normalizedCommittee.includes(normalizedPayee);
}

function matchesContributionHonoree(honoreeName: string | undefined, targetName: string) {
	if (!honoreeName?.trim())
		return false;

	return namesReliablyMatch(honoreeName, targetName);
}

function buildLdaReportSource(report: LdaContributionReport, note: string): Source {
	return {
		authority: "official-government",
		date: report.postedAt || `${report.filingYear}-01-01`,
		id: `lda:${report.filingUuid}`,
		note,
		publisher: "LDA.gov",
		sourceSystem: "LDA.gov LD-203 contribution report",
		title: `${report.registrantName} contribution report`,
		type: "ethics filing",
		url: report.filingDocumentUrl || report.url,
	};
}

async function resolveInfluenceAttachment(
	ldaClient: LdaClient | null | undefined,
	target: FederalRepresentativeTarget | null,
	committeeName: string | undefined,
	layer: OfficeholderLayer,
	currentYear: number,
	stateName: string,
): Promise<{
	attachment: LdaInfluenceAttachment | null;
	status: PersonProfileEnrichmentStatusItem;
}> {
	if (!target) {
		if (layer === "state") {
			return {
				attachment: null,
				status: buildEnrichmentStatus(
					"unavailable",
					"no_state_disclosure_source",
					`No reviewed state lobbying or disclosure source is configured for this ${stateName || "state"} legislative officeholder yet.`,
					"State disclosure source",
				),
			};
		}

		if (layer === "local") {
			return {
				attachment: null,
				status: buildEnrichmentStatus(
					"unavailable",
					"no_local_disclosure_source",
					"No reviewed local lobbying, ethics, or disclosure source is configured for this county or city officeholder yet.",
					"Local disclosure source",
				),
			};
		}

		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"federal_only_provider",
				"Disclosure and lobbying records are currently available only for federal officeholders with a reliable federal match.",
				"LDA.gov",
			),
		};
	}

	if (!ldaClient) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"provider_unconfigured",
				"LDA.gov disclosure data is not available for this officeholder right now.",
				"LDA.gov",
			),
		};
	}

	const yearsToTry = [currentYear, currentYear - 1, currentYear - 2];
	let reports: LdaContributionReport[] = [];
	let resolvedYear = 0;
	let matchMode: "committee" | "honoree" = "committee";

	for (const year of yearsToTry) {
		if (committeeName) {
			const payeeReports = await ldaClient.listContributionReports({
				contributionPayee: committeeName,
				filingYear: year,
			});
			const payeeMatchedItems = payeeReports.flatMap(report => report.contributionItems.filter(item => matchesCommitteePayee(item.payeeName, committeeName)));

			if (payeeMatchedItems.length) {
				reports = payeeReports;
				resolvedYear = year;
				matchMode = "committee";
				break;
			}
		}

		const honoreeReports = await ldaClient.listContributionReports({
			contributionHonoree: target.name,
			filingYear: year,
		});
		const honoreeMatchedItems = honoreeReports.flatMap(report => report.contributionItems.filter(item => matchesContributionHonoree(item.honoreeName, target.name)));

		if (honoreeMatchedItems.length) {
			reports = honoreeReports;
			resolvedYear = year;
			matchMode = "honoree";
			break;
		}
	}

	if (!committeeName && !reports.length) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"requires_funding_match",
				"Ballot Clarity could not attach LD-203 contribution disclosures for this officeholder because it could not match the officeholder to a reliable federal campaign committee anchor, and the direct officeholder-name disclosure search did not return a usable match.",
				"LDA.gov",
			),
		};
	}

	if (!reports.length || !resolvedYear) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"provider_returned_no_records",
				"LDA.gov did not return any LD-203 contribution reports for the committee and officeholder crosswalks Ballot Clarity checked for this officeholder.",
				"LDA.gov",
			),
		};
	}

	const filteredReports = reports
		.map((report) => {
			const matchingItems = report.contributionItems.filter((item) => {
				return matchMode === "committee"
					? matchesCommitteePayee(item.payeeName, committeeName)
					: matchesContributionHonoree(item.honoreeName, target.name);
			});

			if (!matchingItems.length)
				return null;

			return {
				...report,
				contributionItems: matchingItems,
			};
		})
		.filter((report): report is LdaContributionReport => Boolean(report));

	const totalAmount = filteredReports.reduce((sum, report) => {
		return sum + report.contributionItems.reduce((reportSum, item) => reportSum + item.amount, 0);
	}, 0);
	const contributionCount = filteredReports.reduce((sum, report) => sum + report.contributionItems.length, 0);

	if (!contributionCount) {
		return {
			attachment: null,
			status: buildEnrichmentStatus(
				"unavailable",
				"provider_returned_no_records",
				"LDA.gov returned reports for this officeholder, but none of the contribution items survived Ballot Clarity's committee or officeholder matching rules.",
				"LDA.gov",
			),
		};
	}

	const registrantTotals = new Map<string, number>();

	for (const report of filteredReports) {
		const reportAmount = report.contributionItems.reduce((sum, item) => sum + item.amount, 0);
		registrantTotals.set(report.registrantName, (registrantTotals.get(report.registrantName) ?? 0) + reportAmount);
	}

	const topRegistrants = [...registrantTotals.entries()]
		.sort((left, right) => right[1] - left[1])
		.slice(0, 3)
		.map(([name, amount]) => ({ amount, name }));
	const sources = uniqueSources(filteredReports
		.slice(0, 6)
		.map(report => buildLdaReportSource(
			report,
			matchMode === "committee"
				? `LD-203 contribution report matched to ${committeeName}.`
				: `LD-203 contribution report matched to ${target.name}.`,
		)));
	const latestPostedAt = mergeDate(...filteredReports.map(report => report.postedAt));
	const matchLabel = matchMode === "committee" ? committeeName : target.name;
	const summary = `${contributionCount} LD-203 contribution item${contributionCount === 1 ? "" : "s"} across ${filteredReports.length} report${filteredReports.length === 1 ? "" : "s"} in ${resolvedYear} matched ${matchLabel}, totaling ${formatCurrency(totalAmount)}.${topRegistrants.length ? ` Largest reporting registrants: ${topRegistrants.map(item => `${item.name} (${formatCurrency(item.amount)})`).join(", ")}.` : ""}`;
	const attachment = {
		dataAsOf: latestPostedAt,
		influence: {
			contributionCount,
			coverageLabel: `${resolvedYear} LD-203 contribution reports`,
			filingYear: resolvedYear,
			matchMode,
			reportCount: filteredReports.length,
			topRegistrants,
			totalMatched: totalAmount,
		},
		influenceSummary: `LD-203 contribution disclosure context attached from ${resolvedYear} reports.`,
		lobbyingContext: [
			{
				id: `lda:${target.cacheKey}:${resolvedYear}`,
				sources,
				summary,
				title: "Lobbying-disclosure contribution reports",
			},
		],
		publicStatements: [],
		sources,
		whatWeKnow: [
			buildTrustBullet(
				"lda-contributions",
				matchMode === "committee"
					? `LD-203 contribution reports filed in ${resolvedYear} are attached to this officeholder through the matched federal committee ${committeeName}.`
					: `LD-203 contribution reports filed in ${resolvedYear} are attached to this officeholder through a direct officeholder-name crosswalk for ${target.name}.`,
				sources,
			),
		],
	};

	return {
		attachment,
		status: buildEnrichmentStatus(
			"available",
			"attached",
			matchMode === "committee"
				? `LDA.gov matched LD-203 contribution reports to the officeholder's current federal campaign committee ${committeeName}.`
				: `LDA.gov matched LD-203 contribution reports directly to ${target.name}'s officeholder record when committee-only matching was not sufficient.`,
			"LDA.gov",
		),
	};
}

function rankCongressMemberMatch(member: CongressMemberRecord, target: FederalRepresentativeTarget) {
	let score = 0;

	if (normalizeValue(member.state) === normalizeValue(target.state))
		score += 50;

	if (target.office === "S" && !member.district)
		score += 40;

	if (target.office === "H" && target.district && String(member.district || "").padStart(2, "0") === target.district)
		score += 40;

	if (namesReliablyMatch(member.name, target.name))
		score += 100;

	return score;
}

function pickBestCongressMember(members: CongressMemberRecord[], target: FederalRepresentativeTarget) {
	const rankedMembers = [...members]
		.map(member => ({ member, score: rankCongressMemberMatch(member, target) }))
		.sort((left, right) => right.score - left.score);

	return rankedMembers[0]?.score >= 140 ? rankedMembers[0].member : null;
}

function buildCongressSources(member: CongressMemberDetail): Source[] {
	const sourceDate = member.updatedAt || new Date().toISOString();
	const sources: Source[] = [];

	if (member.url) {
		sources.push({
			authority: "official-government",
			date: sourceDate,
			id: `congress:member:${member.bioguideId}`,
			note: "Congress.gov current member record matched to this officeholder profile.",
			publisher: "Congress.gov",
			sourceSystem: "Congress.gov member detail",
			title: member.directOrderName,
			type: "official record",
			url: member.url,
		});
	}

	if (member.officialWebsiteUrl) {
		sources.push({
			authority: "official-government",
			date: sourceDate,
			id: `congress:official-site:${member.bioguideId}`,
			note: "Official congressional office website linked from the Congress.gov member record.",
			publisher: "Congress.gov",
			sourceSystem: "Congress.gov member detail",
			title: `${member.directOrderName} official office site`,
			type: "official record",
			url: member.officialWebsiteUrl,
		});
	}

	return uniqueSources(sources);
}

function resolvePositiveInteger(value: number | string | null | undefined, fallback: number) {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildCongressTermOfficeContext(member: CongressMemberDetail): PersonProfileOfficeContext {
	const terms = [...member.terms].sort((left, right) =>
		right.congress - left.congress
		|| right.startYear - left.startYear
	);
	const term = terms[0];
	const firstTerm = terms
		.filter(item => typeof item.startYear === "number")
		.sort((left, right) => left.startYear - right.startYear)[0];

	return {
		currentTermEndLabel: term?.endYear ? String(term.endYear) : term ? "Present" : undefined,
		currentTermLabel: term ? `${term.congress}th Congress (${term.startYear}-${term.endYear || "present"})` : undefined,
		currentTermStartLabel: term ? String(term.startYear) : undefined,
		serviceStartLabel: firstTerm ? String(firstTerm.startYear) : undefined,
	};
}

async function resolveCongressAttachment(
	congressClient: CongressClient | null | undefined,
	target: FederalRepresentativeTarget | null,
): Promise<CongressAttachment | null> {
	if (!target || !congressClient)
		return null;

	const members = (await congressClient.listMembersByState(target.state)).filter(isCurrentCongressMemberRecord);
	const member = pickBestCongressMember(members, target);

	if (!member)
		return null;

	const detail = await congressClient.getMember(member.bioguideId);

	if (!detail)
		return null;

	const sources = buildCongressSources(detail);
	const term = [...detail.terms].sort((left, right) => right.congress - left.congress)[0];
	const termOfficeContext = buildCongressTermOfficeContext(detail);
	const profileImages = buildCongressProfileImages(detail);
	const officeTypeLabel = term?.memberType || (target.office === "S" ? "Senator" : "Representative");
	const districtLabel = target.office === "H" && term?.district
		? `${term.stateName || detail.state}'s ${formatOrdinal(term.district)} Congressional District`
		: term?.stateName || detail.state;
	const referenceLinks = [
		buildReferenceLink("Congress member record", detail.url, "Official Congress.gov member page for this officeholder."),
		buildReferenceLink("Sponsored legislation", detail.sponsoredLegislationUrl, "Current sponsored-legislation feed attached by Congress.gov."),
		buildReferenceLink("Cosponsored legislation", detail.cosponsoredLegislationUrl, "Current cosponsored-legislation feed attached by Congress.gov."),
		buildReferenceLink("Official office website", detail.officialWebsiteUrl, "Official office site linked from Congress.gov."),
	].filter((link): link is ExternalLink => Boolean(link));
	const officeSummaryParts = [
		`Congress.gov lists ${detail.directOrderName} as a current ${officeTypeLabel} from ${term?.stateName || detail.state}.`,
		districtLabel && target.office === "H" ? `District context: ${districtLabel}.` : "",
		detail.addressInformation?.officeAddress ? `Official office: ${detail.addressInformation.officeAddress}.` : "",
		detail.addressInformation?.phoneNumber ? `Official phone: ${detail.addressInformation.phoneNumber}.` : "",
		detail.officialWebsiteUrl ? `Official website: ${detail.officialWebsiteUrl}.` : "",
	].filter(Boolean);
	const legislativeSummaryParts = [
		typeof detail.sponsoredLegislationCount === "number" ? `Sponsored legislation count: ${detail.sponsoredLegislationCount}.` : "",
		typeof detail.cosponsoredLegislationCount === "number" ? `Cosponsored legislation count: ${detail.cosponsoredLegislationCount}.` : "",
		term ? `Current Congress tracked here: ${term.congress} (${term.startYear}-${term.endYear || "present"}).` : "",
	].filter(Boolean);

	return {
		biography: [
			{
				id: `congress:${detail.bioguideId}`,
				sources,
				summary: [...officeSummaryParts, ...legislativeSummaryParts].join(" "),
				title: "Congress.gov office context",
			},
		],
		dataAsOf: detail.updatedAt,
		legislativeContextStatus: buildEnrichmentStatus(
			"available",
			"attached",
			typeof detail.sponsoredLegislationCount === "number" || typeof detail.cosponsoredLegislationCount === "number"
				? `Congress.gov attached current legislative context for this officeholder, including sponsorship counts${term ? ` from the ${term.congress}th Congress` : ""}.`
				: "Congress.gov attached the current federal member record for this officeholder.",
			"Congress.gov",
		),
		methodologyNotes: [
			"Congress.gov is used on federal representative pages to attach official office context, current term context, and current legislative metadata when the officeholder crosswalk is reliable.",
		],
		officeContext: {
			...termOfficeContext,
			chamberLabel: term?.chamber || officeTypeLabel,
			districtLabel: districtLabel || undefined,
			jurisdictionLabel: term?.stateName || detail.state,
			officialOfficeAddress: detail.addressInformation?.officeAddress,
			officialPhone: detail.addressInformation?.phoneNumber,
			referenceLinks,
		},
		officialWebsiteUrl: detail.officialWebsiteUrl,
		officeContextStatus: buildEnrichmentStatus(
			"available",
			"attached",
			"Congress.gov confirmed the current federal office context for this officeholder and attached the official office website when available.",
			"Congress.gov",
		),
		sources,
		profileImages: profileImages.length ? profileImages : undefined,
		whatWeKnow: [
			buildTrustBullet(
				"congress-office-context",
				`${detail.directOrderName}'s current federal office context is attached from Congress.gov.`,
				sources,
			),
		],
	};
}

function buildStatusNote({
	layer,
	hasCongress,
	hasFunding,
	hasInfluence,
}: {
	layer: OfficeholderLayer;
	hasCongress: boolean;
	hasFunding: boolean;
	hasInfluence: boolean;
}) {
	if (hasFunding || hasInfluence) {
		return "This profile reflects the current officeholder record plus attached federal finance and disclosure records. Verify critical details against the provider record, FEC filings, LDA reports, and official election tools.";
	}

	if (hasCongress)
		return "This profile reflects the current officeholder record plus attached Congress.gov office context. Verify district-specific questions against your address or ZIP result and the official tools linked here.";

	if (layer === "state")
		return "This profile reflects a current state officeholder record with reviewed office and district context. State finance, disclosure, and legislative-activity modules still attach only where Ballot Clarity has a reviewed jurisdiction-specific source.";

	if (layer === "local")
		return "This profile reflects a current county or city officeholder record with reviewed official-source context. Local finance, disclosure, and issue modules still attach only where Ballot Clarity has a reviewed local source.";

	return "This profile reflects the current officeholder record Ballot Clarity could verify for this page. Verify critical details against the attached provider record and official election tools.";
}

function inferOfficeContextChamberLabel(match: LocationRepresentativeMatch) {
	switch (match.officeType) {
		case "us_senate":
			return "U.S. Senate";
		case "us_house":
			return "U.S. House";
		case "state_senate":
			return "State Senate";
		case "state_house":
			return "State House";
		case "county_commission":
			return "County commission";
		case "mayor":
			return "City government";
		case "county_official":
			return "County government";
		case "city_official":
			return "City government";
		default:
			return match.officeTitle;
	}
}

function buildOfficeContextStatus(
	congressAttachment: CongressAttachment | null,
	match: LocationRepresentativeMatch,
	officeholderLayer: OfficeholderLayer,
) {
	if (congressAttachment?.officeContextStatus)
		return congressAttachment.officeContextStatus;

	if (officeholderLayer === "state") {
		return buildEnrichmentStatus(
			"available",
			"attached",
			`${match.sourceSystem || "The current state officeholder source"} supplied the current chamber, district, party, and jurisdiction context for this state legislator.`,
			match.sourceSystem || "State officeholder record",
		);
	}

	if (officeholderLayer === "local") {
		return buildEnrichmentStatus(
			"available",
			"attached",
			`${match.sourceSystem || "The current local officeholder source"} supplied the current office title, jurisdiction, and official public-record context for this county or city officeholder.`,
			match.sourceSystem || "Local officeholder record",
		);
	}

	return buildEnrichmentStatus(
		"available",
		"attached",
		`${match.sourceSystem || "Ballot Clarity"} supplied the current office, party, and district context for this representative.`,
		match.sourceSystem || undefined,
	);
}

function buildLegislativeContextStatus(
	congressAttachment: CongressAttachment | null,
	congressErrorStatus: PersonProfileEnrichmentStatusItem | null,
	match: LocationRepresentativeMatch,
	officeholderLayer: OfficeholderLayer,
	contextStateName: string,
	target: FederalRepresentativeTarget | null,
) {
	if (congressAttachment?.legislativeContextStatus)
		return congressAttachment.legislativeContextStatus;

	if (congressErrorStatus)
		return congressErrorStatus;

	if (officeholderLayer === "state") {
		const sourceLabel = match.sourceSystem || "The current state officeholder source";
		const isIdentityOnlyProvider = openStatesSourcePattern.test(sourceLabel);
		return buildEnrichmentStatus(
			"unavailable",
			isIdentityOnlyProvider ? "identity_only_provider" : "no_state_legislative_source",
			isIdentityOnlyProvider
				? `${sourceLabel} currently supports identity, chamber, party, and district context for this officeholder, but Ballot Clarity does not yet have a reviewed ${contextStateName} legislative-activity, vote, or statements feed attached here.`
				: `${sourceLabel} supports this state officeholding identity and public record context, but Ballot Clarity does not yet have a reviewed ${contextStateName} legislative-activity, vote, or public-statements feed attached here.`,
			sourceLabel,
		);
	}

	if (officeholderLayer === "local") {
		return buildEnrichmentStatus(
			"unavailable",
			"no_local_legislative_source",
			"The current county or city officeholder record resolves identity and office context, but Ballot Clarity does not yet have a reviewed local issue, action, or disclosure feed attached here.",
			match.sourceSystem || "Local officeholder record",
		);
	}

	return buildEnrichmentStatus(
		"unavailable",
		target ? "no_provider_match" : "federal_only_provider",
		target
			? "Ballot Clarity could not verify an additional Congress.gov member record for this officeholder, so legislative context remains limited to the current officeholder identity record."
			: "Detailed Congress.gov activity is currently available only for federal officeholders. This page still shows the current office context.",
		"Congress.gov",
	);
}

function buildDerivedOfficeContext(
	response: PersonProfileResponse["person"],
	match: LocationRepresentativeMatch,
	attachment: RepresentativeModuleAttachment,
): PersonProfileOfficeContext | undefined {
	const referenceLinks = [
		...(attachment.officeContext?.referenceLinks ?? []),
		buildReferenceLink("Official office website", response.officialWebsiteUrl, "Official website carried on this public officeholder page."),
		buildReferenceLink("Provider record", response.openstatesUrl, "Provider-backed public record for this officeholder."),
	].filter((link): link is ExternalLink => Boolean(link));
	const mergedContext: PersonProfileOfficeContext = {
		...(attachment.officeContext ?? {}),
		chamberLabel: attachment.officeContext?.chamberLabel || inferOfficeContextChamberLabel(match),
		districtLabel: attachment.officeContext?.districtLabel || response.districtLabel,
		jurisdictionLabel: attachment.officeContext?.jurisdictionLabel || response.location,
		referenceLinks: referenceLinks.length ? referenceLinks : undefined,
	};

	return Object.values(mergedContext).some(Boolean) ? mergedContext : undefined;
}

function buildOfficeContextBlock(
	person: PersonProfileResponse["person"],
	officeContext: PersonProfileOfficeContext | undefined,
	sources: Source[],
): EvidenceBlock | null {
	if (!officeContext)
		return null;

	const summaryParts = [
		officeContext.jurisdictionLabel ? `Jurisdiction: ${officeContext.jurisdictionLabel}.` : "",
		officeContext.chamberLabel ? `Chamber: ${officeContext.chamberLabel}.` : "",
		officeContext.districtLabel ? `District or seat: ${officeContext.districtLabel}.` : "",
		officeContext.currentTermLabel ? `Current term context: ${officeContext.currentTermLabel}.` : "",
		officeContext.currentTermStartLabel ? `Current term starts: ${officeContext.currentTermStartLabel}.` : "",
		officeContext.currentTermEndLabel ? `Current term ends: ${officeContext.currentTermEndLabel}.` : "",
		officeContext.serviceStartLabel ? `Service history begins: ${officeContext.serviceStartLabel}.` : "",
		officeContext.officialOfficeAddress ? `Official office address: ${officeContext.officialOfficeAddress}.` : "",
		officeContext.officialPhone ? `Official phone: ${officeContext.officialPhone}.` : "",
	].filter(Boolean);

	if (!summaryParts.length)
		return null;

	return {
		id: `office-context:${person.slug}`,
		sources,
		summary: summaryParts.join(" "),
		title: "Office and jurisdiction context",
	};
}

export function createRepresentativeModuleResolver({
	cacheMaxEntries = resolvePositiveInteger(process.env.REPRESENTATIVE_MODULE_CACHE_MAX_ENTRIES, 1_000),
	cacheTtlMs = resolvePositiveInteger(process.env.REPRESENTATIVE_MODULE_CACHE_TTL_MS, 15 * 60 * 1000),
	congressClient = null,
	ldaClient = null,
	now = () => new Date(),
	openFecClient = null,
}: CreateRepresentativeModuleResolverOptions = {}): RepresentativeModuleResolver {
	const resolvedCacheMaxEntries = resolvePositiveInteger(cacheMaxEntries, 1_000);
	const resolvedCacheTtlMs = resolvePositiveInteger(cacheTtlMs, 15 * 60 * 1000);
	const attachmentCache = new Map<string, CachedRepresentativeModuleAttachment>();

	function pruneAttachmentCache(currentTime: number) {
		for (const [key, cached] of attachmentCache.entries()) {
			if (cached.expiresAt <= currentTime)
				attachmentCache.delete(key);
		}
	}

	function makeAttachmentCacheRoom() {
		while (attachmentCache.size >= resolvedCacheMaxEntries) {
			const oldestKey = attachmentCache.keys().next().value as string | undefined;

			if (!oldestKey)
				return;

			attachmentCache.delete(oldestKey);
		}
	}

	async function resolveAttachment(context: ActiveNationwideLookupContext, match: LocationRepresentativeMatch): Promise<RepresentativeModuleAttachment> {
		const target = inferFederalRepresentativeTarget(context, match);
		const officeholderLayer = inferOfficeholderLayer(context, match, target);
		const contextStateName = context.location?.state || inferContextStateCode(context) || "this jurisdiction";
		const cacheKey = target?.cacheKey || `nonfederal:${context.location?.state || "unknown"}:${personSlug(match)}`;
		const currentDate = now();
		const currentTime = currentDate.getTime();
		pruneAttachmentCache(currentTime);
		const cached = attachmentCache.get(cacheKey);

		if (cached) {
			attachmentCache.delete(cacheKey);
			attachmentCache.set(cacheKey, cached);
			return await cached.value;
		}

		const currentYear = currentDate.getUTCFullYear();
		const pending = (async () => {
			let congressAttachment: CongressAttachment | null = null;
			let congressErrorStatus: PersonProfileEnrichmentStatusItem | null = null;
			let fundingResult: Awaited<ReturnType<typeof resolveFundingAttachment>>;
			let influenceResult: Awaited<ReturnType<typeof resolveInfluenceAttachment>>;

			try {
				congressAttachment = await resolveCongressAttachment(congressClient, target);
			}
			catch (error) {
				congressErrorStatus = buildProviderErrorStatus(
					"Congress.gov",
					"Ballot Clarity could not attach additional Congress.gov office or legislative context for this officeholder because the provider request failed.",
					error,
				);
			}

			try {
				fundingResult = await resolveFundingAttachment(openFecClient, target, officeholderLayer, currentYear, contextStateName);
			}
			catch (error) {
				fundingResult = {
					attachment: null,
					status: buildProviderErrorStatus(
						"OpenFEC",
						"Ballot Clarity could not attach campaign-finance records for this officeholder because the OpenFEC request failed.",
						error,
					),
				};
			}

			try {
				influenceResult = await resolveInfluenceAttachment(
					ldaClient,
					target,
					fundingResult.attachment?.candidate.principalCommittees[0]?.name,
					officeholderLayer,
					currentYear,
					contextStateName,
				);
			}
			catch (error) {
				influenceResult = {
					attachment: null,
					status: buildProviderErrorStatus(
						"LDA.gov",
						"Ballot Clarity could not attach lobbying or disclosure context for this officeholder because the LDA.gov request failed.",
						error,
					),
				};
			}

			const fundingAttachment = fundingResult.attachment;
			const influenceAttachment = influenceResult.attachment;
			const funding = fundingAttachment?.funding ?? null;
			const lobbyingContext = influenceAttachment?.lobbyingContext ?? [];
			const publicStatements = influenceAttachment?.publicStatements ?? [];
			const sources = uniqueSources([
				...(congressAttachment?.sources ?? []),
				...(fundingAttachment?.sources ?? []),
				...(influenceAttachment?.sources ?? []),
			]);
			const whatWeKnow: TrustBullet[] = [
				...(congressAttachment?.whatWeKnow ?? []),
				...(influenceAttachment?.whatWeKnow ?? []),
				...(funding
					? [
							buildTrustBullet(
								"openfec-finance",
								`${funding.provenanceLabel || "OpenFEC finance summary"} is attached to this officeholder through a reliable federal crosswalk.`,
								funding.sources,
							),
						]
					: []),
			];
			const officeContextStatus = buildOfficeContextStatus(congressAttachment, match, officeholderLayer);
			const legislativeContextStatus = buildLegislativeContextStatus(
				congressAttachment,
				congressErrorStatus,
				match,
				officeholderLayer,
				contextStateName,
				target,
			);

			return {
				dataAsOf: mergeDate(
					congressAttachment?.dataAsOf,
					fundingAttachment?.dataAsOf,
					influenceAttachment?.dataAsOf,
				),
				enrichmentStatus: {
					funding: fundingResult.status,
					influence: influenceResult.status,
					legislativeContext: legislativeContextStatus,
					officeContext: officeContextStatus,
				},
				funding,
				fundingAvailable: Boolean(funding),
				fundingSummary: fundingResult.status.summary,
				influence: influenceAttachment?.influence ?? null,
				influenceAvailable: lobbyingContext.length > 0 || publicStatements.length > 0,
				influenceSummary: influenceResult.status.summary,
				lobbyingContext,
				methodologyNotes: [
					...(congressAttachment?.methodologyNotes ?? []),
					...(funding
						? ["Federal finance data is attached through an OpenFEC candidate and principal-committee crosswalk anchored to the current officeholder match."]
						: []),
					...(lobbyingContext.length
						? ["Influence context is attached through LD-203 contribution reports matched to the officeholder's current federal campaign committee."]
						: []),
					...(officeholderLayer === "state"
						? ["State officeholder pages attach reviewed identity and district context even when Ballot Clarity does not yet have a state-specific finance, disclosure, or legislative-activity feed for that jurisdiction."]
						: []),
					...(officeholderLayer === "local"
						? ["County and city officeholder pages attach reviewed official-source identity and office context even when Ballot Clarity does not yet have a local finance, disclosure, or issue feed for that jurisdiction."]
						: []),
				],
				officeContext: congressAttachment?.officeContext,
				officialWebsiteUrl: congressAttachment?.officialWebsiteUrl,
				profileImages: congressAttachment?.profileImages,
				publicStatements,
				sources,
				statusNote: buildStatusNote({
					layer: officeholderLayer,
					hasCongress: Boolean(congressAttachment),
					hasFunding: Boolean(funding),
					hasInfluence: lobbyingContext.length > 0 || publicStatements.length > 0,
				}),
				whatWeKnow,
				biography: congressAttachment?.biography ?? [],
			};
		})().catch((error) => {
			if (attachmentCache.get(cacheKey)?.value === pending)
				attachmentCache.delete(cacheKey);

			throw error;
		});

		makeAttachmentCacheRoom();
		attachmentCache.set(cacheKey, {
			expiresAt: currentTime + resolvedCacheTtlMs,
			value: pending
		});
		return await pending;
	}

	async function enrichRepresentatives(context: ActiveNationwideLookupContext, representatives: RepresentativeSummary[]) {
		return await Promise.all(representatives.map(async (representative) => {
			const match = findRepresentativeMatch(context, representative.slug);

			if (!match)
				return representative;

			const attachment = await resolveAttachment(context, match);
			const addedSources = uniqueSources([
				...representative.sources,
				...attachment.sources,
				...(attachment.funding?.sources ?? []),
				...attachment.lobbyingContext.flatMap(block => block.sources),
				...attachment.publicStatements.flatMap(block => block.sources),
			]);
			const profileImages = uniqueProfileImages([
				...(representative.profileImages ?? []),
				...(attachment.profileImages ?? []),
			]);

			return {
				...representative,
				fundingAvailable: attachment.fundingAvailable,
				fundingSummary: attachment.fundingSummary,
				influenceAvailable: attachment.influenceAvailable,
				influenceSummary: attachment.influenceSummary,
				profileImages: profileImages.length ? profileImages : undefined,
				sourceCount: addedSources.length,
				sources: addedSources,
			};
		}));
	}

	return {
		async enrichLocationFinanceInfluenceAvailability(context, currentDetail, currentStatus) {
			const enrichedRepresentatives = await enrichRepresentatives(
				context,
				context.representativeMatches.map(match => ({
					ballotStatusLabel: "Published ballot status unavailable in this area",
					districtLabel: match.districtLabel,
					districtSlug: "",
					fundingAvailable: false,
					fundingSummary: "",
					governmentLevel: match.governmentLevel,
					href: "",
					incumbent: true,
					influenceAvailable: false,
					influenceSummary: "",
					location: context.location?.displayName || context.normalizedAddress || "Your area",
					name: match.name,
					officeDisplayLabel: match.officeDisplayLabel,
					officeSought: match.officeTitle,
					officeholderLabel: "Current officeholder",
					officeType: match.officeType,
					onCurrentBallot: false,
					openstatesUrl: match.openstatesUrl,
					party: match.party ?? "Unknown",
					profileImages: match.profileImages,
					provenance: null,
					slug: personSlug(match),
					sourceCount: 0,
					sources: [],
					summary: "",
					updatedAt: context.resolvedAt,
				}) satisfies RepresentativeSummary),
			);
			const hasModules = enrichedRepresentatives.some(
				representative => representative.fundingAvailable || representative.influenceAvailable,
			);

			if (!hasModules)
				return { detail: currentDetail, status: currentStatus };

			return {
				detail: "Some matched representative pages now include person-level funding and influence modules through reliable federal crosswalks. Open the representative directory or a person page to inspect those records.",
				status: "available",
			};
		},
		async enrichNationwideDistrictRepresentatives(context, representatives) {
			return await enrichRepresentatives(context, representatives);
		},
		async enrichNationwidePersonProfile(context, response) {
			const match = findRepresentativeMatch(context, response.person.slug);

			if (!match)
				return response;

			const attachment = await resolveAttachment(context, match);
			const addedSources = uniqueSources([
				...response.person.sources,
				...attachment.sources,
				...(attachment.funding?.sources ?? []),
				...attachment.lobbyingContext.flatMap(block => block.sources),
				...attachment.publicStatements.flatMap(block => block.sources),
			]);
			const officeContext = buildDerivedOfficeContext(response.person, match, attachment);
			const derivedOfficeContextBlock = !attachment.biography.length
				? buildOfficeContextBlock(response.person, officeContext, addedSources)
				: null;
			const hasAttachedFederalModules = Boolean(attachment.funding) || attachment.lobbyingContext.length > 0 || attachment.publicStatements.length > 0;
			const biography = [
				...response.person.biography,
				...(derivedOfficeContextBlock && !response.person.biography.some(block => block.id === derivedOfficeContextBlock.id)
					? [derivedOfficeContextBlock]
					: []),
				...attachment.biography,
				...(hasAttachedFederalModules
					? [
								{
									id: `federal-crosswalk:${response.person.slug}`,
									sources: attachment.sources,
									summary: "Ballot Clarity attached federal finance or disclosure records to this officeholder through a structured crosswalk from area results.",
									title: "Federal finance and disclosure crosswalk",
								} satisfies EvidenceBlock,
						]
					: []),
			];
			const whatWeKnow = uniqueSources([
				...response.person.whatWeKnow.flatMap(item => item.sources),
				...attachment.whatWeKnow.flatMap(item => item.sources),
			]).length
				? [...response.person.whatWeKnow, ...attachment.whatWeKnow]
				: response.person.whatWeKnow;
			const whatWeDoNotKnow = [
				...response.person.whatWeDoNotKnow,
				...(attachment.enrichmentStatus.funding.status === "unavailable"
					? [buildTrustBullet(
							"funding-unavailable",
							attachment.enrichmentStatus.funding.summary,
							addedSources,
						)]
					: []),
				...(attachment.enrichmentStatus.influence.status === "unavailable"
					? [buildTrustBullet(
							"influence-unavailable",
							attachment.enrichmentStatus.influence.summary,
							addedSources,
						)]
					: []),
			];
			const profileImages = uniqueProfileImages([
				...(response.person.profileImages ?? []),
				...(match.profileImages ?? []),
				...(attachment.profileImages ?? []),
			]);

			return {
				...response,
				person: {
					...response.person,
					biography,
					enrichmentStatus: attachment.enrichmentStatus,
					freshness: {
						...response.person.freshness,
						dataLastUpdatedAt: attachment.dataAsOf || response.person.freshness.dataLastUpdatedAt,
						statusNote: attachment.statusNote || response.person.freshness.statusNote,
					},
					funding: attachment.funding,
					influence: attachment.influence ?? response.person.influence ?? null,
					lobbyingContext: attachment.lobbyingContext,
					methodologyNotes: [
						...response.person.methodologyNotes,
						...attachment.methodologyNotes,
					],
					officeContext: officeContext ?? response.person.officeContext,
					officialWebsiteUrl: attachment.officialWebsiteUrl || response.person.officialWebsiteUrl,
					profileImages: profileImages.length ? profileImages : undefined,
					publicStatements: attachment.publicStatements,
					sourceCount: addedSources.length,
					sources: addedSources,
					whatWeDoNotKnow,
					whatWeKnow,
				},
				updatedAt: response.updatedAt,
			};
		},
		async enrichNationwideRepresentativeDirectory(context, representatives) {
			return await enrichRepresentatives(context, representatives);
		},
	};
}
