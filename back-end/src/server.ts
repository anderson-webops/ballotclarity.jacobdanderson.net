import type { ErrorRequestHandler, Request, Response } from "express";
import type { AddressEnrichmentService } from "./address-enrichment.js";
import type { AdminAuditActor } from "./admin-store.js";
import type { CongressClient, CongressMemberDetail, CongressMemberRecord } from "./congress.js";
import type { CoverageRepository } from "./coverage-repository.js";
import type { OpenStatesRepresentativeRecord } from "./openstates.js";
import type { PublicRequestThrottle } from "./public-request-throttle.js";
import type { SupplementalOfficeholderRecord } from "./supplemental-officeholders.js";
import type {
	AdminActivityItem,
	AdminContentItem,
	AdminCorrectionRequest,
	AdminCorrectionStatus,
	AdminPriority,
	AdminReviewStatus,
	AdminSourceHealth,
	AdminSourceMonitorItem,
	AdminUser,
	Candidate,
	Contest,
	ContestLinkSummary,
	ContestRecordResponse,
	CoverageResponse,
	CoverageSnapshotProvenance,
	DistrictRecordResponse,
	DistrictsResponse,
	Election,
	EvidenceBlock,
	ExternalLink,
	FundingSummary,
	GuidePackageDiagnosticsResponse,
	GuidePackageRecord,
	GuidePackageRecordResponse,
	GuidePackageReviewRecommendation,
	GuidePackageStatus,
	GuidePackageWorkflow,
	IssueTag,
	Jurisdiction,
	JurisdictionSummary,
	LocationDistrictMatch,
	LocationLookupSelectionOption,
	LocationRepresentativeMatch,
	Measure,
	MeasureArgument,
	MeasureChangeItem,
	MeasureFiscalItem,
	MeasureTimelineItem,
	OfficialResource,
	PersonProfileEnrichmentStatus,
	PersonProfileEnrichmentStatusItem,
	PersonProfileFunding,
	PersonProfileInfluence,
	PersonProfileOfficeContext,
	PersonProfileResponse,
	ProfileImage,
	PublicCorrectionsResponse,
	PublicStatusResponse,
	QuestionnaireResponse,
	RepresentativesResponse,
	RepresentativeSummary,
	SearchResponse,
	Source,
	SourceDirectoryItem,
	SourceRecordResponse,
	TrustBullet,
	VoteRecordSummary
} from "./types/civic.js";
import type { ZipLocationMatch, ZipLocationService } from "./zip-location.js";
import type { ZipLookupLogger } from "./zip-lookup-logger.js";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import cors from "cors";
import express from "express";
import {
	buildActiveNationwideLookupContext,
	buildActiveNationwideLookupCookie,
	buildActiveNationwideLookupResponse,
	buildNationwideDistrictRecordResponse,
	buildNationwideDistrictRoleGuide,
	buildNationwideDistrictsResponse,
	buildNationwidePersonProfileResponse,
	buildNationwideRepresentativeSlug,
	buildNationwideRepresentativesResponse,
	buildRouteFallbackDistrictRecordResponse,
	buildRouteFallbackPersonProfileResponse,
	clearActiveNationwideLookupCookie,
	persistActiveNationwideLookupCookie,
	readActiveNationwideLookupContext,
} from "./active-nationwide-lookup.js";
import { createAddressCacheRepository } from "./address-cache-repository.js";
import { createAddressEnrichmentService } from "./address-enrichment.js";
import { createAdminLoginThrottle } from "./admin-login-throttle.js";
import { createAdminRepository } from "./admin-repository.js";
import { parseAdminSessionToken } from "./admin-session-token.js";
import { normalizeAdminUsername } from "./admin-store.js";
import { buildBallotContentProviderSummary, getPublicBallotContentProviderOptions } from "./ballot-content-providers.js";
import { createBoundedPromiseCache, resolveBoundedCacheInteger } from "./bounded-promise-cache.js";
import { createCensusGeocoderClient } from "./census-geocoder.js";
import { createCongressClient, isCurrentCongressMemberRecord } from "./congress.js";
import { createCoverageRepository } from "./coverage-repository.js";
import { normalizeCorrectionSubmission } from "./feedback-submission.js";
import { createGoogleCivicClient } from "./google-civic.js";
import {
	buildDefaultGuidePackageSeed,
	buildGuidePackageId,
	buildGuidePackageList,
	buildGuidePackageRecord,
} from "./guide-packages.js";
import { buildCoverageResponse } from "./launch-profile.js";
import { createLdaClient } from "./lda.js";
import { buildLocationGuessNotePrefix, createLocationGuessService } from "./location-guess.js";
import { buildLocationLookupResponse, classifyLookupInput, findSupportedCoverageSummaries, validateLookupInput } from "./location-lookup.js";
import { createLogger, createRequestLoggingMiddleware } from "./logger.js";
import { getOfficialToolsForState, getStateAbbreviationForName, getStateNameForAbbreviation } from "./official-election-tools.js";
import { createOpenFecClient } from "./openfec.js";
import { createOpenStatesClient } from "./openstates.js";
import { buildCongressProfileImages, uniqueProfileImages } from "./profile-images.js";
import { buildProviderSummary } from "./provider-config.js";
import { parseTrustProxySetting } from "./proxy-trust.js";
import { createPublicRequestThrottle } from "./public-request-throttle.js";
import { buildCuratedPublicSourceRecords, mapAuthorityToPublisherType } from "./public-source-directory.js";
import { classifyRepresentative } from "./representative-classification.js";
import { createRepresentativeModuleResolver } from "./representative-modules.js";
import { createSourceAssetStore } from "./source-asset-store.js";
import {
	findSupplementalOfficeholderByRepresentativeSlug,
	findSupplementalOfficeholdersByDistrictSlug,
	listSupplementalOfficeholders,
	mergeRepresentativeMatchesWithSupplementalRecords,
} from "./supplemental-officeholders.js";
import { containsControlCharacters } from "./text-validation.js";
import { createZipLocationService } from "./zip-location.js";
import { createZipLookupLogger } from "./zip-lookup-logger.js";

interface CreateAppOptions {
	activeLookupCookieSecret?: string | null;
	adminApiKey?: string | null;
	adminDbPath?: string | null;
	adminLoginThrottle?: ReturnType<typeof createAdminLoginThrottle>;
	adminMfaEncryptionKey?: string | null;
	adminSessionSecret?: string | null;
	addressCacheEncryptionKey?: string | null;
	allowLegacyAdminActorHeadersForTesting?: boolean;
	addressEnrichmentService?: AddressEnrichmentService | null;
	bootstrapDisplayName?: string | null;
	bootstrapPassword?: string | null;
	bootstrapUsername?: string | null;
	coverageRepository?: CoverageRepository;
	contentSeed?: AdminContentItem[];
	congressClient?: CongressClient | null;
	correctionSeed?: AdminCorrectionRequest[];
	activitySeed?: AdminActivityItem[];
	googleCivicClient?: ReturnType<typeof createGoogleCivicClient>;
	guidePackageSeed?: GuidePackageWorkflow[];
	ldaClient?: ReturnType<typeof createLdaClient>;
	locationGuessOptions?: Parameters<typeof createLocationGuessService>[0];
	openFecClient?: ReturnType<typeof createOpenFecClient>;
	openStatesClient?: ReturnType<typeof createOpenStatesClient>;
	publicFeedbackThrottle?: PublicRequestThrottle;
	publicLookupThrottle?: PublicRequestThrottle;
	sourceMonitorSeed?: AdminSourceMonitorItem[];
	trustProxy?: string | null;
	zipLocationService?: ZipLocationService | null;
	zipLookupLogger?: ZipLookupLogger;
}

type AdminLoginThrottleState = ReturnType<ReturnType<typeof createAdminLoginThrottle>["check"]>;

function isAuthorizedAdminRequest(requestKey: string | undefined, configuredKey: string | null) {
	if (!requestKey || !configuredKey)
		return false;

	const left = Buffer.from(requestKey);
	const right = Buffer.from(configuredKey);

	if (left.length !== right.length)
		return false;

	return timingSafeEqual(left, right);
}

function summarizeMatchedDistricts(labels: string[]) {
	if (!labels.length)
		return "District matches will load after you choose this area.";

	if (labels.length === 1)
		return `Matched district: ${labels[0]}.`;

	return `Matched districts: ${labels.join(", ")}.`;
}

const localCorsOriginPattern = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i;
const exactZipLookupPattern = /^\d{5}$/u;
const routeSelectionIdPattern = /^\w[\w.:-]{0,255}$/u;
const contentSecurityPolicy = [
	"base-uri 'none'",
	"default-src 'none'",
	"form-action 'none'",
	"frame-ancestors 'none'",
	"object-src 'none'"
].join("; ");
const securityHeaders = {
	"Content-Security-Policy": contentSecurityPolicy,
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Origin-Agent-Cluster": "?1",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000",
	"X-Content-Type-Options": "nosniff",
	"X-Permitted-Cross-Domain-Policies": "none",
	"X-Frame-Options": "DENY"
};

function normalizeCorsOrigin(value: string | null | undefined) {
	if (!value)
		return "";

	try {
		return new URL(value).origin;
	}
	catch {
		return "";
	}
}

function buildConfiguredCorsOriginSet() {
	const configuredOrigins = new Set<string>();
	const rawOrigins = [
		process.env.NUXT_PUBLIC_SITE_URL,
		process.env.FRONTEND_ORIGIN,
		...(process.env.CORS_ALLOWED_ORIGINS || "")
			.split(",")
			.map(origin => origin.trim())
			.filter(Boolean)
	];

	for (const rawOrigin of rawOrigins) {
		const normalizedOrigin = normalizeCorsOrigin(rawOrigin);

		if (normalizedOrigin)
			configuredOrigins.add(normalizedOrigin);
	}

	return configuredOrigins;
}

function shouldAllowLocalCorsOrigins() {
	return (process.env.NODE_ENV || "development").trim().toLowerCase() !== "production";
}

function createCorsOriginResolver() {
	const configuredOrigins = buildConfiguredCorsOriginSet();

	return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
		if (!origin)
			return callback(null, true);

		const normalizedOrigin = normalizeCorsOrigin(origin);

		if (!normalizedOrigin)
			return callback(null, false);

		if (configuredOrigins.has(normalizedOrigin))
			return callback(null, true);

		if (shouldAllowLocalCorsOrigins() && localCorsOriginPattern.test(normalizedOrigin))
			return callback(null, true);

		return callback(null, false);
	};
}

function buildPublicThrottleKey(request: express.Request) {
	return request.ip
		|| request.socket.remoteAddress
		|| "unknown";
}

function buildZipSelectionOption(
	match: ZipLocationMatch,
	jurisdictionSummaries: JurisdictionSummary[]
): LocationLookupSelectionOption {
	const geoContext = {
		countyFips: match.countyFips,
		countyName: match.countyName,
		locality: match.locality,
		postalCode: match.postalCode,
		sourceSystem: match.sourceSystem,
		stateAbbreviation: match.stateAbbreviation,
		stateName: match.stateName
	};
	const supportedCoverageSummaries = findSupportedCoverageSummaries(jurisdictionSummaries, geoContext);
	const representativeCount = match.representativeMatches.length;
	const displayName = [match.locality, match.stateName || match.stateAbbreviation].filter(Boolean).join(", ")
		|| match.postalCode;
	const guideSentence = supportedCoverageSummaries.length
		? supportedCoverageSummaries.length === 1
			? "A local guide is available after you choose this area."
			: `${supportedCoverageSummaries.length} local guide areas still match this ZIP area.`
		: "No local guide is available for this area yet.";

	return {
		description: [
			summarizeMatchedDistricts(match.districtMatches.map(item => item.label)),
			representativeCount
				? `${representativeCount} representative match${representativeCount === 1 ? "" : "es"} will load for this area.`
				: "Representative data is not available for this area yet.",
			guideSentence
		].join(" "),
		districtMatches: match.districtMatches,
		guideAvailability: supportedCoverageSummaries.length ? "published" : "not-published",
		id: match.id,
		label: displayName,
		representativeMatches: match.representativeMatches
	};
}

function uniqueSources(sources: Source[]) {
	return Array.from(new Map(sources.map(source => [source.id, source])).values());
}

function uniqueById<T extends { id: string }>(items: T[]) {
	return Array.from(new Map(items.map(item => [item.id, item])).values());
}

function uniqueBySlug<T extends { slug: string }>(items: T[]) {
	return Array.from(new Map(items.map(item => [item.slug, item])).values());
}

function uniqueStrings(values: Array<string | null | undefined>) {
	return Array.from(new Set(values.map(value => String(value ?? "").trim()).filter(Boolean)));
}

const openStatesOfficeholderSnapshotPattern = /open states officeholder snapshot/i;

function uniqueExternalLinks(links: ExternalLink[]) {
	return Array.from(new Map(
		links
			.filter(link => link?.label?.trim() && link?.url?.trim())
			.map(link => [`${link.label.trim().toLowerCase()}:${link.url.trim()}`, link]),
	).values());
}

function buildSupplementalEnrichmentStatusItem(
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

function inferSupplementalChamberLabel(
	record: SupplementalOfficeholderRecord,
	classification: ReturnType<typeof classifyRepresentative>,
) {
	if (record.jurisdiction === "State") {
		if (classification.officeType === "state_senate")
			return "State Senate";

		if (classification.officeType === "state_house")
			return "State House";
	}

	if (classification.governmentLevel === "county")
		return "County commission";

	if (classification.governmentLevel === "city")
		return "City government";

	return undefined;
}

function buildLegacyAdminAuditActor(request: Request): AdminAuditActor | undefined {
	const username = request.header("x-admin-actor-username")?.trim().toLowerCase();
	const displayName = request.header("x-admin-actor-display-name")?.trim();
	const roleHeader = request.header("x-admin-actor-role")?.trim();
	const role = roleHeader === "admin" || roleHeader === "editor" ? roleHeader : undefined;

	if (!username && !displayName && !role)
		return undefined;

	return {
		displayName,
		role,
		username
	};
}

function getAdminAuditActor(response: Response): AdminAuditActor | undefined {
	return response.locals.adminActor as AdminAuditActor | undefined;
}

function requireAdminRole(response: Response) {
	const actor = getAdminAuditActor(response);

	if (actor?.role === "admin")
		return true;

	response.status(403).json({
		message: "Admin role required."
	});
	return false;
}

function requirePrivilegedAdminRole(response: Response) {
	if (!requireAdminRole(response))
		return false;

	if (response.locals.adminMfaVerified === true)
		return true;

	response.status(403).json({
		message: "Multi-factor authentication is required for this admin action."
	});
	return false;
}

function requireSelfServiceActor(response: Response, username: string) {
	const actor = getAdminAuditActor(response);

	if (actor?.username && actor.username === username)
		return true;

	response.status(403).json({
		message: "Admin self-service actions must target the authenticated account."
	});
	return false;
}

function isAdminCredentialVerificationError(error: unknown) {
	return error instanceof Error && (
		error.message === "Current password was not accepted."
		|| error.message === "The verification code was not accepted."
	);
}

function parseOptionalEnum<T extends string>(
	value: unknown,
	allowedValues: readonly T[],
	fieldLabel: string
): T | undefined {
	if (value === undefined)
		return undefined;

	if (typeof value !== "string" || !allowedValues.includes(value as T))
		throw new Error(`${fieldLabel} is invalid.`);

	return value as T;
}

function parseOptionalText(
	value: unknown,
	fieldLabel: string,
	maximumLength: number
): string | undefined;
function parseOptionalText(
	value: unknown,
	fieldLabel: string,
	maximumLength: number,
	options: { nullable: true }
): string | null | undefined;
function parseOptionalText(
	value: unknown,
	fieldLabel: string,
	maximumLength: number,
	options: { nullable?: boolean } = {}
) {
	if (value === undefined)
		return undefined;

	if (value === null && options.nullable)
		return null;

	if (typeof value !== "string")
		throw new Error(`${fieldLabel} must be text${options.nullable ? " or null" : ""}.`);

	if (value.includes("\0") || value.length > maximumLength)
		throw new Error(`${fieldLabel} must be ${maximumLength.toLocaleString("en-US")} characters or fewer and contain no invalid control characters.`);

	return value;
}

function parseOptionalBoolean(value: unknown, fieldLabel: string) {
	if (value === undefined)
		return undefined;

	if (typeof value !== "boolean")
		throw new Error(`${fieldLabel} must be true or false.`);

	return value;
}

function parseOptionalTimestamp(value: unknown, fieldLabel: string) {
	const parsed = parseOptionalText(value, fieldLabel, 64);

	if (parsed !== undefined && !Number.isFinite(Date.parse(parsed)))
		throw new Error(`${fieldLabel} must be a valid timestamp.`);

	return parsed;
}

function parseAdminUsername(value: unknown) {
	const username = parseOptionalText(value, "Admin username", 64)?.trim().toLowerCase() ?? "";

	return normalizeAdminUsername(username);
}

function parseAdminPassword(value: unknown, fieldLabel: string) {
	const password = parseOptionalText(value, fieldLabel, 256) ?? "";

	if (!password)
		throw new Error(`${fieldLabel} is required.`);

	return password;
}

function parseAdminMfaCode(value: unknown, options: { required?: boolean } = {}) {
	if ((value === undefined || value === "") && !options.required)
		return "";

	const code = (parseOptionalText(value, "Admin verification code", 32) ?? "").replace(/\s+/gu, "");

	if (!/^\d{6}$/u.test(code))
		throw new Error("Admin verification code must contain exactly six digits.");

	return code;
}

function parseAdminMfaSecret(value: unknown) {
	const secret = parseOptionalText(value, "Admin MFA secret", 64)?.trim().toUpperCase() ?? "";

	if (!/^[A-Z2-7]{32}$/u.test(secret))
		throw new Error("Admin MFA secret is invalid.");

	return secret;
}

const adminPriorities = ["high", "medium", "low"] as const satisfies readonly AdminPriority[];
const adminReviewStatuses = ["draft", "in-review", "needs-sources", "ready-to-publish", "published"] as const satisfies readonly AdminReviewStatus[];
const adminCorrectionStatuses = ["new", "researching", "resolved", "triaged"] as const satisfies readonly AdminCorrectionStatus[];
const adminSourceHealthValues = ["healthy", "incident", "review-soon", "stale"] as const satisfies readonly AdminSourceHealth[];
const guidePackageStatuses = ["draft", "in_review", "ready_to_publish", "published"] as const satisfies readonly GuidePackageStatus[];
const guidePackageReviewRecommendations = [
	"publish",
	"publish_with_warnings",
	"needs_revision",
	"do_not_publish"
] as const satisfies readonly GuidePackageReviewRecommendation[];

function buildAdminSessionResponse(user: AdminUser) {
	return {
		authenticated: true,
		configured: true,
		credentialsUpdatedAt: user.credentialsUpdatedAt,
		displayName: user.displayName,
		mfaEnabledAt: user.mfaEnabledAt,
		passwordChangeRequiredAt: user.passwordChangeRequiredAt,
		role: user.role,
		username: user.username
	};
}

function buildSupplementalOfficeContext(
	record: SupplementalOfficeholderRecord,
	classification: ReturnType<typeof classifyRepresentative>,
): PersonProfileOfficeContext | undefined {
	const enrichmentOfficeContext = record.enrichment?.officeContext;
	const referenceLinks = uniqueExternalLinks([
		...(enrichmentOfficeContext?.referenceLinks ?? []),
		...(record.officialWebsiteUrl
			? [
					{
						label: "Official office website",
						note: "Official public office page for this officeholder.",
						url: record.officialWebsiteUrl,
					} satisfies ExternalLink,
				]
			: []),
		...(record.openstatesUrl
			? [
					{
						label: "Provider record",
						note: "Provider-backed officeholder record Ballot Clarity used for identity and district context.",
						url: record.openstatesUrl,
					} satisfies ExternalLink,
				]
			: []),
	]);

	const mergedContext: PersonProfileOfficeContext = {
		chamberLabel: enrichmentOfficeContext?.chamberLabel || inferSupplementalChamberLabel(record, classification),
		committeeMemberships: uniqueStrings(enrichmentOfficeContext?.committeeMemberships ?? []),
		currentTermEndLabel: enrichmentOfficeContext?.currentTermEndLabel,
		currentTermLabel: enrichmentOfficeContext?.currentTermLabel,
		currentTermStartLabel: enrichmentOfficeContext?.currentTermStartLabel,
		districtLabel: enrichmentOfficeContext?.districtLabel || record.districtLabel,
		jurisdictionLabel: enrichmentOfficeContext?.jurisdictionLabel || (record.jurisdiction === "State" ? record.stateName : record.location),
		officialOfficeAddress: enrichmentOfficeContext?.officialOfficeAddress,
		officialPhone: enrichmentOfficeContext?.officialPhone,
		referenceLinks: referenceLinks.length ? referenceLinks : undefined,
		serviceStartLabel: enrichmentOfficeContext?.serviceStartLabel,
	};

	return Object.values(mergedContext).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))
		? mergedContext
		: undefined;
}

function mergeOfficeContext(
	baseContext: PersonProfileOfficeContext | undefined,
	supplementalContext: PersonProfileOfficeContext | undefined,
) {
	if (!baseContext && !supplementalContext)
		return undefined;

	const mergedContext: PersonProfileOfficeContext = {
		chamberLabel: supplementalContext?.chamberLabel || baseContext?.chamberLabel,
		committeeMemberships: uniqueStrings([
			...(baseContext?.committeeMemberships ?? []),
			...(supplementalContext?.committeeMemberships ?? []),
		]),
		currentTermEndLabel: supplementalContext?.currentTermEndLabel || baseContext?.currentTermEndLabel,
		currentTermLabel: supplementalContext?.currentTermLabel || baseContext?.currentTermLabel,
		currentTermStartLabel: supplementalContext?.currentTermStartLabel || baseContext?.currentTermStartLabel,
		districtLabel: supplementalContext?.districtLabel || baseContext?.districtLabel,
		jurisdictionLabel: supplementalContext?.jurisdictionLabel || baseContext?.jurisdictionLabel,
		officialOfficeAddress: supplementalContext?.officialOfficeAddress || baseContext?.officialOfficeAddress,
		officialPhone: supplementalContext?.officialPhone || baseContext?.officialPhone,
		referenceLinks: uniqueExternalLinks([
			...(baseContext?.referenceLinks ?? []),
			...(supplementalContext?.referenceLinks ?? []),
		]),
		serviceStartLabel: supplementalContext?.serviceStartLabel || baseContext?.serviceStartLabel,
	};

	return Object.values(mergedContext).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))
		? {
				...mergedContext,
				committeeMemberships: mergedContext.committeeMemberships?.length ? mergedContext.committeeMemberships : undefined,
				referenceLinks: mergedContext.referenceLinks?.length ? mergedContext.referenceLinks : undefined,
			}
		: undefined;
}

function buildRepresentativeProfileImages(...groups: Array<ProfileImage[] | undefined>) {
	const images = groups.flatMap(group => group ?? []);

	return uniqueProfileImages(images);
}

function buildSupplementalEnrichmentStatus(
	record: SupplementalOfficeholderRecord,
	officeContext: PersonProfileOfficeContext | undefined,
	funding: PersonProfileFunding | null,
	influence: PersonProfileInfluence | null,
	keyActions: VoteRecordSummary[],
	lobbyingContext: EvidenceBlock[],
	publicStatements: EvidenceBlock[],
	topIssues: IssueTag[],
): PersonProfileEnrichmentStatus {
	const sourceSystem = record.sources[0]?.sourceSystem || record.sourceSystem;
	const hasInfluence = Boolean(influence) || lobbyingContext.length > 0 || publicStatements.length > 0;
	const hasLegislativeContext = keyActions.length > 0 || topIssues.length > 0;
	const isStateRoute = record.jurisdiction === "State";
	const hasIdentityOnlyProviderSource = isStateRoute && openStatesOfficeholderSnapshotPattern.test(sourceSystem);

	return {
		funding: funding
			? buildSupplementalEnrichmentStatusItem(
					"available",
					"attached",
					isStateRoute
						? "Ballot Clarity attached a reviewed state campaign-finance summary to this state legislator record."
						: "Ballot Clarity attached a reviewed local campaign-finance summary to this officeholder record.",
					sourceSystem,
				)
			: buildSupplementalEnrichmentStatusItem(
					"unavailable",
					isStateRoute ? "no_state_finance_source" : "no_local_finance_source",
					isStateRoute
						? "Ballot Clarity does not currently have a reviewed state campaign-finance source configured for this jurisdiction."
						: "Ballot Clarity does not currently have a reviewed local campaign-finance source configured for this jurisdiction.",
					sourceSystem,
				),
		influence: hasInfluence
			? buildSupplementalEnrichmentStatusItem(
					"available",
					"attached",
					isStateRoute
						? "Ballot Clarity attached reviewed state disclosure or lobbying context to this state legislator record."
						: "Ballot Clarity attached reviewed local disclosure or influence context to this officeholder record.",
					sourceSystem,
				)
			: buildSupplementalEnrichmentStatusItem(
					"unavailable",
					isStateRoute ? "no_state_disclosure_source" : "no_local_disclosure_source",
					isStateRoute
						? "Ballot Clarity does not currently have a reviewed state disclosure or lobbying source configured for this jurisdiction."
						: "Ballot Clarity does not currently have a reviewed local disclosure or ethics source configured for this jurisdiction.",
					sourceSystem,
				),
		legislativeContext: hasLegislativeContext
			? buildSupplementalEnrichmentStatusItem(
					"available",
					"attached",
					isStateRoute
						? "Ballot Clarity attached reviewed legislative, committee, or public-action context to this state legislator record."
						: "Ballot Clarity attached reviewed public-action or issue context to this local officeholder record.",
					sourceSystem,
				)
			: hasIdentityOnlyProviderSource
				? buildSupplementalEnrichmentStatusItem(
						"unavailable",
						"identity_only_provider",
						"Current provider data supports identity, chamber, party, and district context for this officeholder, but Ballot Clarity does not yet have a reviewed state legislative-actions feed attached here.",
						sourceSystem,
					)
				: buildSupplementalEnrichmentStatusItem(
						"unavailable",
						isStateRoute ? "no_state_legislative_source" : "no_local_legislative_source",
						isStateRoute
							? "Ballot Clarity does not currently have a reviewed state legislative-actions or voting-context source attached for this jurisdiction."
							: "Ballot Clarity does not currently have a reviewed local public-actions or issue feed attached for this officeholder.",
						sourceSystem,
					),
		officeContext: officeContext
			? buildSupplementalEnrichmentStatusItem(
					"available",
					"attached",
					"Ballot Clarity attached structured office, district, and jurisdiction context to this public officeholder record.",
					sourceSystem,
				)
			: buildSupplementalEnrichmentStatusItem(
					"unavailable",
					hasIdentityOnlyProviderSource ? "identity_only_provider" : "provider_returned_no_records",
					"Ballot Clarity could not attach structured office-context details beyond the identity record for this officeholder.",
					sourceSystem,
				),
	};
}

function collectCandidateSources(candidate: Candidate) {
	return uniqueSources([
		...candidate.sources,
		...candidate.biography.flatMap(block => block.sources),
		...candidate.keyActions.flatMap(item => item.sources),
		...candidate.lobbyingContext.flatMap(block => block.sources),
		...candidate.publicStatements.flatMap(block => block.sources),
		...candidate.funding.sources,
		...candidate.whatWeKnow.flatMap(item => item.sources),
		...candidate.whatWeDoNotKnow.flatMap(item => item.sources),
		...candidate.comparison.whyRunning.sources,
		...candidate.comparison.topPriorities.flatMap(item => item.sources),
		...candidate.comparison.questionnaireResponses.flatMap(item => item.sources)
	]);
}

function collectMeasureSources(measure: Measure) {
	return uniqueSources([
		...measure.sources,
		...measure.currentPractice.flatMap(item => item.sources),
		...measure.proposedChanges.flatMap(item => item.sources),
		...measure.implementationTimeline.flatMap(item => item.sources),
		...measure.fiscalSummary.flatMap(item => item.sources),
		...measure.supportArguments.flatMap(item => item.sources),
		...measure.opposeArguments.flatMap(item => item.sources),
		...measure.whatWeKnow.flatMap(item => item.sources),
		...measure.whatWeDoNotKnow.flatMap(item => item.sources)
	]);
}

function collectContestSources(contest: Contest) {
	if (contest.type === "candidate")
		return uniqueSources((contest.candidates ?? []).flatMap(candidate => collectCandidateSources(candidate)));

	return uniqueSources((contest.measures ?? []).flatMap(measure => collectMeasureSources(measure)));
}

function routeFamilyFromCitation(citation: SourceDirectoryItem["citedBy"][number]) {
	if (citation.type === "page") {
		if (citation.href.startsWith("/representatives/") && citation.href.endsWith("/funding"))
			return "Representative funding pages";

		if (citation.href.startsWith("/representatives/") && citation.href.endsWith("/influence"))
			return "Representative influence pages";

		if (citation.href.startsWith("/representatives/"))
			return "Representative pages";

		if (citation.href.startsWith("/districts/"))
			return "District pages";

		return citation.label;
	}

	switch (citation.type) {
		case "candidate":
			return "Candidate pages";
		case "contest":
			return "Contest pages";
		case "election":
			return "Election pages";
		case "jurisdiction":
			return "Location pages";
		case "measure":
			return "Measure pages";
		default:
			return citation.label;
	}
}

function addSourceCitation(
	citations: Map<string, SourceDirectoryItem["citedBy"]>,
	sourceId: string,
	citation: SourceDirectoryItem["citedBy"][number],
) {
	const existing = citations.get(sourceId) ?? [];

	if (!existing.some(item => item.href === citation.href && item.id === citation.id))
		existing.push(citation);

	citations.set(sourceId, existing);
}

function mergeSourceCitations(
	...maps: Array<Map<string, SourceDirectoryItem["citedBy"]>>
) {
	const merged = new Map<string, SourceDirectoryItem["citedBy"]>();

	for (const map of maps) {
		for (const [sourceId, citations] of map.entries()) {
			for (const citation of citations)
				addSourceCitation(merged, sourceId, citation);
		}
	}

	return merged;
}

function isPublishedRouteSource(source: Source) {
	const sourceId = String(source.id || "").trim().toLowerCase();

	if (!sourceId)
		return false;

	if (sourceId.includes(":fallback"))
		return false;

	if (sourceId.startsWith("district:"))
		return sourceId.endsWith(":identity");

	return sourceId.startsWith("congress:member:")
		|| sourceId.startsWith("congress:official-site:")
		|| sourceId.startsWith("lda:")
		|| sourceId.startsWith("official:")
		|| sourceId.startsWith("openfec:candidate:")
		|| sourceId.startsWith("openfec:committee:")
		|| sourceId.startsWith("representative:")
		|| sourceId.startsWith("supplemental:");
}

function hasPublishedSourceUrl(source: Source) {
	return Boolean(source.url.trim());
}

function inferPublishedSourceGeographicScope(
	source: Source,
	citations: SourceDirectoryItem["citedBy"],
	coverageLocationName: string | null | undefined,
) {
	const sourceId = String(source.id || "").toLowerCase();

	if (sourceId.startsWith("openfec:"))
		return "United States federal campaign finance";

	if (sourceId.startsWith("lda:"))
		return "United States federal lobbying disclosures";

	if (sourceId.startsWith("congress:"))
		return "United States federal offices";

	if (sourceId.startsWith("district:"))
		return "Public district page";

	if (sourceId.startsWith("representative:"))
		return "Public representative page";

	if (sourceId.startsWith("supplemental:")) {
		return citations.some(citation => citation.href.startsWith("/districts/"))
			? "Reviewed district and officeholder page"
			: "Reviewed officeholder page";
	}

	if (sourceId.startsWith("official:"))
		return "Official verification source";

	return coverageLocationName ?? "Published public record";
}

function inferPublishedSourceReviewNote(source: Source) {
	const sourceId = String(source.id || "").toLowerCase();

	if (sourceId.startsWith("openfec:"))
		return "This finance record is intentionally published because Ballot Clarity attaches it to a public funding page.";

	if (sourceId.startsWith("lda:"))
		return "This disclosure record is intentionally published because Ballot Clarity attaches it to a public influence page.";

	if (sourceId.startsWith("congress:"))
		return "This official congressional record is intentionally published because Ballot Clarity attaches it to a public representative page.";

	if (sourceId.startsWith("district:"))
		return "This stable district-page provenance record is intentionally published as a standalone public source page.";

	if (sourceId.startsWith("representative:"))
		return "This stable representative-page provenance record is intentionally published as a standalone public source page.";

	if (sourceId.startsWith("supplemental:"))
		return "This reviewed officeholder provenance record is intentionally published because it anchors a stable public district or representative page.";

	if (sourceId.startsWith("official:"))
		return "This official verification record is intentionally published because Ballot Clarity links it from public district and representative pages.";

	return "This source record is intentionally published because it supports a stable public Ballot Clarity page.";
}

function inferPublishedSourceSummary(source: Source) {
	if (source.note?.trim())
		return source.note.trim();

	const sourceId = String(source.id || "").toLowerCase();

	if (sourceId.startsWith("district:"))
		return "Stable district provenance record published from Ballot Clarity public records.";

	if (sourceId.startsWith("representative:"))
		return "Stable representative provenance record published from Ballot Clarity public records.";

	if (sourceId.startsWith("official:"))
		return "Official verification record published because it is linked from a public Ballot Clarity page.";

	return "Published source record cited on Ballot Clarity.";
}

function inferPublishedSourceUsage(source: Source, citations: SourceDirectoryItem["citedBy"]) {
	const routeFamilies = Array.from(new Set(citations.map(routeFamilyFromCitation)));
	const routeSummary = routeFamilies.length
		? routeFamilies.join(", ")
		: "public Ballot Clarity pages";
	const citationCount = Math.max(citations.length, 1);

	if (String(source.id || "").toLowerCase().startsWith("official:"))
		return `Supports ${citationCount} public official-verification page${citationCount === 1 ? "" : "s"} across ${routeSummary}.`;

	return `Supports ${citationCount} published page${citationCount === 1 ? "" : "s"} across ${routeSummary}.`;
}

function buildSourceCitations(candidates: Candidate[], measures: Measure[], contests: Contest[]) {
	const citations = new Map<string, SourceDirectoryItem["citedBy"]>();

	for (const candidate of candidates) {
		for (const source of collectCandidateSources(candidate)) {
			addSourceCitation(citations, source.id, {
				href: `/candidate/${candidate.slug}`,
				id: candidate.slug,
				label: candidate.name,
				type: "candidate"
			});
		}
	}

	for (const measure of measures) {
		for (const source of collectMeasureSources(measure)) {
			addSourceCitation(citations, source.id, {
				href: `/measure/${measure.slug}`,
				id: measure.slug,
				label: measure.title,
				type: "measure"
			});
		}
	}

	for (const contest of contests) {
		for (const source of collectContestSources(contest)) {
			addSourceCitation(citations, source.id, {
				href: `/contest/${contest.slug}`,
				id: contest.slug,
				label: contest.office,
				type: "contest"
			});
		}
	}

	return citations;
}

function buildSourceDirectory(
	candidates: Candidate[],
	measures: Measure[],
	contests: Contest[],
	sources: Source[],
	additionalCitations: Map<string, SourceDirectoryItem["citedBy"]>,
	coverageLocationName: string | null | undefined,
	updatedAt: string
): SourceDirectoryItem[] {
	const citations = mergeSourceCitations(
		buildSourceCitations(candidates, measures, contests),
		additionalCitations,
	);
	const curatedSources = buildCuratedPublicSourceRecords(updatedAt);
	const publishedProvenanceSources = sources
		.map(source => ({
			...source,
			citationCount: (citations.get(source.id) ?? []).length,
			citedBy: citations.get(source.id) ?? [],
			geographicScope: inferPublishedSourceGeographicScope(source, citations.get(source.id) ?? [], coverageLocationName),
			limitations: [
				"This standalone record reflects a Ballot Clarity citation published on the pages listed below.",
				"Use the parent page context and the linked primary source before treating this citation as a complete account."
			],
			publicationKind: "published-provenance" as const,
			publisherType: mapAuthorityToPublisherType(source.authority),
			reviewNote: inferPublishedSourceReviewNote(source),
			routeFamilies: Array.from(new Set((citations.get(source.id) ?? []).map(routeFamilyFromCitation))),
			summary: inferPublishedSourceSummary(source),
			usedFor: inferPublishedSourceUsage(source, citations.get(source.id) ?? []),
		}))
		.filter(source => source.citationCount > 0 && hasPublishedSourceUrl(source))
		.sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title));

	return [...curatedSources, ...publishedProvenanceSources]
		.sort((left, right) => {
			if (left.publicationKind !== right.publicationKind)
				return left.publicationKind === "curated-global" ? -1 : 1;

			if (left.publicationKind === "curated-global" && right.publicationKind === "curated-global")
				return left.title.localeCompare(right.title);

			return right.date.localeCompare(left.date) || left.title.localeCompare(right.title);
		});
}

function buildSourceRecord(
	id: string,
	candidates: Candidate[],
	measures: Measure[],
	contests: Contest[],
	sources: Source[],
	additionalCitations: Map<string, SourceDirectoryItem["citedBy"]>,
	coverageLocationName: string | null | undefined,
	updatedAt: string
): SourceRecordResponse | null {
	const directoryItem = buildSourceDirectory(candidates, measures, contests, sources, additionalCitations, coverageLocationName, updatedAt).find(item => item.id === id);

	if (!directoryItem)
		return null;

	return {
		source: directoryItem,
		updatedAt: directoryItem.date
	};
}

function buildRepresentativeSummary(candidate: Candidate): RepresentativeSummary {
	const sources = collectCandidateSources(candidate);
	const classification = classifyRepresentative({
		districtLabel: candidate.officeSought,
		officeSought: candidate.officeSought,
		stateName: candidate.location.split(",").slice(-1)[0]?.trim() || candidate.location,
	});

	return {
		governmentLevel: classification.governmentLevel,
		location: candidate.location,
		districtLabel: candidate.officeSought,
		districtSlug: candidate.contestSlug,
		fundingAvailable: Boolean(candidate.funding),
		fundingSummary: candidate.funding.summary,
		href: `/representatives/${candidate.slug}`,
		officeholderLabel: candidate.incumbent ? "Current officeholder" : "Incumbent contender",
		officeDisplayLabel: classification.officeDisplayLabel,
		officeType: classification.officeType,
		influenceAvailable: candidate.lobbyingContext.length > 0 || candidate.publicStatements.length > 0,
		influenceSummary: candidate.lobbyingContext[0]?.summary ?? "No published influence-context note is attached to this profile yet.",
		incumbent: candidate.incumbent,
		onCurrentBallot: true,
		name: candidate.name,
		officeSought: candidate.officeSought,
		party: candidate.party,
		slug: candidate.slug,
		ballotStatusLabel: candidate.comparison.ballotStatus.label,
		profileImages: candidate.profileImages,
		provenance: {
			label: "Source-backed local person record",
			status: "direct",
			note: "Matched from Ballot Clarity's published local person record for this office."
		},
		sourceCount: sources.length,
		sources,
		summary: candidate.summary,
		updatedAt: candidate.updatedAt
	};
}

function buildSupplementalRepresentativeSummary(record: SupplementalOfficeholderRecord): RepresentativeSummary {
	const classification = classifyRepresentative({
		districtLabel: record.districtLabel,
		districtType: record.districtType,
		officeSought: record.officeSought,
		officeTitle: record.officeTitle,
		stateCode: record.stateCode,
		stateName: record.stateName,
	});
	const funding = record.enrichment?.funding ?? null;
	const influence = record.enrichment?.influence ?? null;
	const lobbyingContext = record.enrichment?.lobbyingContext ?? [];
	const publicStatements = record.enrichment?.publicStatements ?? [];
	const hasInfluenceContext = Boolean(influence || lobbyingContext.length || publicStatements.length);

	return {
		ballotStatusLabel: "Current officeholder record",
		districtLabel: record.districtLabel,
		districtSlug: record.districtSlug,
		fundingAvailable: Boolean(funding),
		fundingSummary: funding?.summary ?? (record.jurisdiction === "State"
			? `No reviewed state finance source is configured yet for ${record.stateName} officeholders.`
			: "No reviewed local finance source is configured yet for this officeholder."),
		governmentLevel: classification.governmentLevel,
		href: `/representatives/${record.slug}`,
		incumbent: true,
		influenceAvailable: hasInfluenceContext,
		influenceSummary: influence
			? `${influence.reportCount} reviewed disclosure report${influence.reportCount === 1 ? "" : "s"} with ${influence.contributionCount} contribution record${influence.contributionCount === 1 ? "" : "s"} attached.`
			: lobbyingContext[0]?.summary ?? publicStatements[0]?.summary ?? (record.jurisdiction === "State"
				? `No reviewed state disclosure or lobbying source is configured yet for ${record.stateName} officeholders.`
				: "No reviewed local disclosure or lobbying source is configured yet for this officeholder."),
		location: record.location,
		name: record.name,
		officeDisplayLabel: classification.officeDisplayLabel,
		officeSought: record.officeSought,
		officeholderLabel: "Current officeholder",
		officeType: classification.officeType,
		onCurrentBallot: false,
		openstatesUrl: record.openstatesUrl,
		party: record.party,
		profileImages: record.profileImages,
		provenance: {
			label: record.provenanceLabel,
			note: `${record.provenanceNote} This directory entry is a current officeholder record, not a verified current-ballot candidate claim.`,
			status: record.sourceSystem.toLowerCase().includes("official") ? "direct" : "crosswalked",
		},
		slug: record.slug,
		sourceCount: record.sources.length,
		sources: record.sources,
		summary: record.summary,
		updatedAt: record.updatedAt,
	};
}

const cityRoutePattern = /^([a-z0-9-]+)-city$/i;
const congressionalDistrictCodePattern = /^([A-Z]{2})-(\d+)$/i;
const congressionalDivisionPattern = /\/cd:(\d+)(?:\/|$)/i;
const congressionalRoutePattern = /^congressional-(\d+)$/i;
const countyRoutePattern = /^([a-z0-9-]+)-county$/i;
const districtNumberPattern = /\b(\d+)\b/;
const ocdPersonRoutePattern = /^ocd-person-/i;
const representativeOfficePattern = /representative/i;
const representativeRoutePattern = /^representative-(\d+)$/i;
const representativeStateRoutePattern = /^representative-([a-z]{2})-(\d+)$/i;
const reviewedPrefixPattern = /^reviewed\s+/i;
const routeDivisionStatePattern = /\/state:([a-z]{2})(?:\/|$)/i;
const senateChamberPattern = /senate/i;
const senatorOfficePattern = /senator/i;
const stateHouseDivisionPattern = /\/sldl:(\d+)(?:\/|$)/i;
const senatorRoutePattern = /^senator-(\d+)$/i;
const stateSenateDivisionPattern = /\/sldu:(\d+)(?:\/|$)/i;
const senatorStatewideCodeRoutePattern = /^([a-z]{2})-sen-statewide$/i;
const senatorStatewideNameRoutePattern = /^senator-([a-z0-9-]+)$/i;
const stateAbbreviationRouteTokenPattern = /^[a-z]{2}$/i;
const stateHouseRoutePattern = /^state-house-(\d+)$/i;
const stateSenateRoutePattern = /^state-senate-(\d+)$/i;
const directRouteOfficeholderHonorificPattern = /\b(?:the|hon|honorable|rep|representative|cong|congressman|congresswoman|sen|senator|mr|mrs|ms|dr)\b/gi;
const directRoutePersonNameSuffixPattern = /\b(?:jr|sr|ii|iii|iv|v|md|phd|dds|esq)\b/gi;

const directRouteCanonicalFirstNameAliases = new Map<string, string>([
	["andy", "andrew"],
	["bill", "william"],
	["billy", "william"],
	["bob", "robert"],
	["bobby", "robert"],
	["dan", "daniel"],
	["danny", "daniel"],
	["dave", "david"],
	["jim", "james"],
	["jimmy", "james"],
	["joe", "joseph"],
	["jon", "jonathan"],
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

function toLookupSlug(value: string | null | undefined) {
	return String(value ?? "")
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
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

function buildStateIdentityFromRouteToken(token: string) {
	const normalizedToken = toLookupSlug(token);

	if (!normalizedToken)
		return null;

	if (stateAbbreviationRouteTokenPattern.test(normalizedToken)) {
		const stateCode = normalizedToken.toUpperCase();
		const stateName = getStateNameForAbbreviation(stateCode) || titleCaseToken(normalizedToken);

		return {
			officialResources: getOfficialToolsForState(stateCode),
			stateCode,
			stateName,
		};
	}

	const stateName = titleCaseToken(normalizedToken);
	const stateCode = getStateAbbreviationForName(stateName);

	return {
		officialResources: getOfficialToolsForState(stateCode),
		stateCode,
		stateName,
	};
}

function buildSearchNameFromRepresentativeSlug(slug: string) {
	const normalizedSlug = toLookupSlug(slug);

	if (!normalizedSlug || ocdPersonRoutePattern.test(normalizedSlug))
		return "";

	return titleCaseToken(normalizedSlug);
}

function normalizeDirectRoutePersonText(value: string | null | undefined) {
	return String(value ?? "")
		.toLowerCase()
		.replace(directRouteOfficeholderHonorificPattern, " ")
		.replace(directRoutePersonNameSuffixPattern, " ")
		.replace(/\./g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function canonicalizeDirectRouteFirstName(value: string | null | undefined) {
	const normalized = normalizeDirectRoutePersonText(value);
	return directRouteCanonicalFirstNameAliases.get(normalized) || normalized;
}

function normalizeDirectRouteNameParts(value: string | null | undefined) {
	return normalizeDirectRoutePersonText(value)
		.split(" ")
		.filter(Boolean);
}

function pickCanonicalDirectRouteGivenName(tokens: string[]) {
	for (const token of tokens) {
		if (token.length > 1)
			return canonicalizeDirectRouteFirstName(token);
	}

	return canonicalizeDirectRouteFirstName(tokens[0]);
}

function parseDirectRoutePersonName(value: string | null | undefined) {
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
		const surnameTokens = normalizeDirectRouteNameParts(surnamePart);
		const givenTokens = normalizeDirectRouteNameParts(givenPart);

		return {
			canonicalGivenName: pickCanonicalDirectRouteGivenName(givenTokens),
			surname: surnameTokens.join(" "),
			tokens: [...surnameTokens, ...givenTokens],
		};
	}

	const tokens = normalizeDirectRouteNameParts(raw);
	const surname = tokens.slice(-1).join(" ");
	const givenTokens = tokens.slice(0, -1);

	return {
		canonicalGivenName: pickCanonicalDirectRouteGivenName(givenTokens),
		surname,
		tokens,
	};
}

function directRouteSurnamesReliablyMatch(left: string, right: string) {
	if (!left || !right)
		return false;

	return left === right || left.endsWith(` ${right}`) || right.endsWith(` ${left}`);
}

function directRouteNamesReliablyMatch(left: string | null | undefined, right: string | null | undefined) {
	const leftName = parseDirectRoutePersonName(left);
	const rightName = parseDirectRoutePersonName(right);

	if (!leftName.tokens.length || !rightName.tokens.length)
		return false;

	if (!directRouteSurnamesReliablyMatch(leftName.surname, rightName.surname))
		return false;

	if (!leftName.canonicalGivenName || !rightName.canonicalGivenName)
		return false;

	return leftName.canonicalGivenName === rightName.canonicalGivenName;
}

function buildRouteSource({
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

function buildOfficialToolSources(resources: OfficialResource[], updatedAt: string) {
	return resources.map(resource => buildRouteSource({
		authority: resource.authority,
		date: updatedAt,
		id: `official:${toLookupSlug(resource.label)}`,
		note: resource.note || "",
		publisher: resource.sourceLabel,
		sourceSystem: resource.sourceSystem,
		title: resource.label,
		url: resource.url,
	}));
}

function inferRepresentativeStateCode(record: OpenStatesRepresentativeRecord) {
	const divisionStateMatch = record.currentRoleDivisionId?.match(routeDivisionStatePattern);

	if (divisionStateMatch?.[1])
		return divisionStateMatch[1].toUpperCase();

	const districtStateMatch = record.currentRoleDistrict?.match(congressionalDistrictCodePattern);
	return districtStateMatch?.[1]?.toUpperCase() || "";
}

function buildRepresentativeOfficeContext(record: OpenStatesRepresentativeRecord) {
	const officeTitle = record.officeTitle || "Representative";
	const stateCode = inferRepresentativeStateCode(record);
	const stateName = getStateNameForAbbreviation(stateCode) || record.jurisdictionName || stateCode || "Unknown jurisdiction";
	const districtCodeMatch = record.currentRoleDistrict?.match(congressionalDistrictCodePattern);
	const congressionalDivisionMatch = record.currentRoleDivisionId?.match(congressionalDivisionPattern);
	const numericDistrictMatch = record.currentRoleDistrict?.match(districtNumberPattern);
	const stateHouseDivisionMatch = record.currentRoleDivisionId?.match(stateHouseDivisionPattern);
	const stateSenateDivisionMatch = record.currentRoleDivisionId?.match(stateSenateDivisionPattern);
	const hasCongressionalDistrictContext = Boolean(districtCodeMatch?.[2] || congressionalDivisionMatch?.[1]);
	const isSenator = senatorOfficePattern.test(officeTitle);
	const isRepresentative = representativeOfficePattern.test(officeTitle);
	const normalizedRoleClassification = toLookupSlug(record.currentRoleClassification);

	const stateLegislativeDistrictNumber = stateSenateDivisionMatch?.[1]
		|| stateHouseDivisionMatch?.[1]
		|| numericDistrictMatch?.[1]
		|| "";

	if ((stateSenateDivisionMatch?.[1] || (!hasCongressionalDistrictContext && normalizedRoleClassification === "upper" && stateLegislativeDistrictNumber)) && isSenator) {
		const districtNumber = String(Number.parseInt(stateLegislativeDistrictNumber, 10));

		return {
			districtLabel: `State Senate District ${districtNumber}`,
			districtSlug: `state-senate-${districtNumber}`,
			location: stateName,
			officeSought: `State Senate District ${districtNumber}`,
			stateCode,
			stateName,
		};
	}

	if ((stateHouseDivisionMatch?.[1] || (!hasCongressionalDistrictContext && normalizedRoleClassification === "lower" && stateLegislativeDistrictNumber)) && isRepresentative) {
		const districtNumber = String(Number.parseInt(stateLegislativeDistrictNumber, 10));

		return {
			districtLabel: `State House District ${districtNumber}`,
			districtSlug: `state-house-${districtNumber}`,
			location: stateName,
			officeSought: `State House District ${districtNumber}`,
			stateCode,
			stateName,
		};
	}

	if (isRepresentative && (districtCodeMatch?.[2] || congressionalDivisionMatch?.[1])) {
		const districtNumber = String(Number.parseInt(districtCodeMatch?.[2] || congressionalDivisionMatch?.[1] || "", 10));

		return {
			districtLabel: `Congressional District ${districtNumber}`,
			districtSlug: `congressional-${districtNumber}`,
			location: stateName,
			officeSought: `U.S. House, District ${districtNumber}`,
			stateCode,
			stateName,
		};
	}

	if (isSenator && stateCode) {
		return {
			districtLabel: stateName,
			districtSlug: `${stateCode.toLowerCase()}-sen-statewide`,
			location: stateName,
			officeSought: "U.S. Senate",
			stateCode,
			stateName,
		};
	}

	return {
		districtLabel: record.districtLabel,
		districtSlug: toLookupSlug(record.districtLabel),
		location: stateName,
		officeSought: officeTitle,
		stateCode,
		stateName,
	};
}

function buildRepresentativeLookupContext(record: OpenStatesRepresentativeRecord, representativeSlug: string, updatedAt: string) {
	const officeContext = buildRepresentativeOfficeContext(record);
	const officialResources = getOfficialToolsForState(officeContext.stateCode);
	const classification = classifyRepresentative({
		districtLabel: officeContext.districtLabel,
		officeSought: officeContext.officeSought,
		officeTitle: record.officeTitle,
		stateCode: officeContext.stateCode,
		stateName: officeContext.stateName,
	});

	return {
		actions: officialResources.map((resource, index) => ({
			badge: resource.sourceLabel,
			description: resource.note || "",
			id: `official:${officeContext.stateCode || "unknown"}:${index}`,
			kind: "official-verification" as const,
			title: resource.label,
			url: resource.url,
		})),
		detectedFromIp: false,
		districtMatches: officeContext.districtLabel
			? [
					{
						districtCode: officeContext.districtLabel.match(districtNumberPattern)?.[1] || officeContext.districtLabel,
						districtType: officeContext.officeSought,
						id: officeContext.districtSlug,
						label: officeContext.districtLabel,
						sourceSystem: "Open States",
					},
				]
			: [],
		electionLogistics: null,
		guideAvailability: "not-published" as const,
		inputKind: "address" as const,
		location: {
			coverageLabel: "Civic results available",
			displayName: officeContext.stateName,
			slug: toLookupSlug(officeContext.stateName),
			state: officeContext.stateName,
		},
		normalizedAddress: officeContext.stateCode || officeContext.stateName,
		representativeMatches: [
			{
				districtLabel: officeContext.districtLabel,
				governmentLevel: classification.governmentLevel,
				id: representativeSlug,
				name: record.name,
				officeDisplayLabel: classification.officeDisplayLabel,
				officeType: classification.officeType,
				officeTitle: record.officeTitle,
				openstatesUrl: record.openstatesUrl,
				party: record.party,
				profileImages: record.profileImages,
				sourceSystem: "Open States",
			},
		],
		resolvedAt: updatedAt,
		result: "resolved" as const,
	};
}

function buildRepresentativeProfileFromSupplementalOfficeholder(record: SupplementalOfficeholderRecord): PersonProfileResponse {
	const updatedAt = record.updatedAt || new Date().toISOString();
	const officialResources = getOfficialToolsForState(record.stateCode);
	const classification = classifyRepresentative({
		districtLabel: record.districtLabel,
		districtType: record.districtType,
		officeSought: record.officeSought,
		officeTitle: record.officeTitle,
		stateCode: record.stateCode,
		stateName: record.stateName,
	});
	const provenanceStatus = record.sourceSystem.toLowerCase().includes("official")
		? "direct"
		: "crosswalked";
	const funding = record.enrichment?.funding ?? null;
	const influence = record.enrichment?.influence ?? null;
	const keyActions = uniqueById(record.enrichment?.keyActions ?? []);
	const lobbyingContext = uniqueById(record.enrichment?.lobbyingContext ?? []);
	const publicStatements = uniqueById(record.enrichment?.publicStatements ?? []);
	const topIssues = uniqueBySlug(record.enrichment?.topIssues ?? []);
	const officeContext = buildSupplementalOfficeContext(record, classification);
	const profileImages = buildRepresentativeProfileImages(record.profileImages);
	const enrichmentStatus = buildSupplementalEnrichmentStatus(
		record,
		officeContext,
		funding,
		influence,
		keyActions,
		lobbyingContext,
		publicStatements,
		topIssues,
	);
	const sources = uniqueSources([
		...record.sources,
		...buildOfficialToolSources(officialResources, updatedAt),
		...(funding?.sources ?? []),
		...keyActions.flatMap(action => action.sources),
		...lobbyingContext.flatMap(block => block.sources),
		...publicStatements.flatMap(block => block.sources),
	]);
	const methodologyNotes = [
		record.jurisdiction === "State"
			? "This page uses a reviewed state officeholder record so the office and district context stay stable."
			: "This page uses a reviewed local officeholder source so the office and jurisdiction context stay stable.",
		"An address or ZIP lookup can still confirm whether this officeholder matches your exact area.",
		...(record.enrichment?.methodologyNotes ?? []),
	];

	return {
		note: "Representative profile assembled from reviewed officeholder records for this public page.",
		person: {
			ballotStatusLabel: "Current ballot status requires address or ZIP confirmation",
			biography: [
				{
					id: `provider:${record.slug}`,
					sources,
					summary: record.biographySummary,
					title: "Reviewed officeholder record",
				},
			],
			comparison: null,
			contestSlug: record.districtSlug,
			districtLabel: record.districtLabel,
			districtSlug: record.districtSlug,
			freshness: {
				contentLastVerifiedAt: updatedAt,
				dataLastUpdatedAt: updatedAt,
				nextReviewAt: updatedAt,
				status: "up-to-date",
				statusLabel: "Reviewed officeholder record",
				statusNote: record.jurisdiction === "State"
					? "This page is based on a reviewed current state officeholder record. An address or ZIP lookup can still confirm whether this officeholder matches your exact area."
					: "This page is based on a reviewed current local officeholder source. An address or ZIP lookup can still confirm whether this officeholder matches your exact area.",
			},
			funding,
			governmentLevel: classification.governmentLevel,
			incumbent: true,
			influence,
			keyActions,
			lobbyingContext,
			location: record.location,
			methodologyNotes,
			name: record.name,
			officeDisplayLabel: classification.officeDisplayLabel,
			officeholderLabel: "Current officeholder",
			officeContext,
			officeType: classification.officeType,
			officeSought: record.officeSought,
			onCurrentBallot: false,
			officialWebsiteUrl: record.officialWebsiteUrl,
			openstatesUrl: record.openstatesUrl,
			party: record.party || "Unknown",
			profileImages: profileImages.length ? profileImages : undefined,
			provenance: {
				asOf: updatedAt,
				label: record.provenanceLabel,
				note: record.provenanceNote,
				source: "nationwide",
				status: provenanceStatus,
			},
			publicStatements,
			slug: record.slug,
			sourceCount: sources.length,
			sources,
			summary: record.summary,
			topIssues,
			updatedAt,
			enrichmentStatus,
			whatWeDoNotKnow: [
				{
					id: "lookup-confirmation",
					note: "An address or ZIP lookup is still required for exact district confirmation.",
					sources,
					text: "This page identifies the officeholder, but an address or ZIP lookup is still needed to confirm whether this is your exact district and locality.",
				},
			],
			whatWeKnow: [
				{
					id: "reviewed-officeholder-record",
					note: record.provenanceNote,
					sources,
					text: record.summary,
				},
			],
		},
		updatedAt,
	};
}

function mergeRepresentativeProfileWithSupplementalOfficeholder(
	baseProfile: PersonProfileResponse,
	record: SupplementalOfficeholderRecord,
): PersonProfileResponse {
	const updatedAt = [baseProfile.updatedAt, record.updatedAt].filter(Boolean).sort().slice(-1)[0] || baseProfile.updatedAt;
	const classification = classifyRepresentative({
		districtLabel: record.districtLabel,
		districtType: record.districtType,
		officeSought: record.officeSought,
		officeTitle: record.officeTitle,
		stateCode: record.stateCode,
		stateName: record.stateName,
	});
	const normalizedReviewedSourceLabel = record.provenanceLabel.replace(reviewedPrefixPattern, "").toLowerCase();
	const funding = baseProfile.person.funding ?? record.enrichment?.funding ?? null;
	const influence = baseProfile.person.influence ?? record.enrichment?.influence ?? null;
	const keyActions = uniqueById([
		...baseProfile.person.keyActions,
		...(record.enrichment?.keyActions ?? []),
	]);
	const lobbyingContext = uniqueById([
		...baseProfile.person.lobbyingContext,
		...(record.enrichment?.lobbyingContext ?? []),
	]);
	const publicStatements = uniqueById([
		...baseProfile.person.publicStatements,
		...(record.enrichment?.publicStatements ?? []),
	]);
	const topIssues = uniqueBySlug([
		...baseProfile.person.topIssues,
		...(record.enrichment?.topIssues ?? []),
	]);
	const profileImages = buildRepresentativeProfileImages(
		baseProfile.person.profileImages,
		record.profileImages,
	);
	const officeContext = mergeOfficeContext(
		baseProfile.person.officeContext,
		buildSupplementalOfficeContext(record, classification),
	);
	const enrichmentStatus = buildSupplementalEnrichmentStatus(
		record,
		officeContext,
		funding,
		influence,
		keyActions,
		lobbyingContext,
		publicStatements,
		topIssues,
	);
	const mergedSources = uniqueSources([
		...baseProfile.person.sources,
		...record.sources,
		...(funding?.sources ?? []),
		...keyActions.flatMap(action => action.sources),
		...lobbyingContext.flatMap(block => block.sources),
		...publicStatements.flatMap(block => block.sources),
	]);
	const biographyBlockId = `supplemental:${record.slug}:context`;
	const biography = [
		...baseProfile.person.biography,
		...(!baseProfile.person.biography.some(block => block.id === biographyBlockId)
			? [{
					id: biographyBlockId,
					sources: record.sources,
					summary: record.biographySummary,
					title: record.jurisdiction === "State" ? "Reviewed state officeholder source" : "Reviewed local officeholder source",
				}]
			: []),
	];
	const methodologyNotes = Array.from(new Set([
		...baseProfile.person.methodologyNotes,
		record.jurisdiction === "State"
			? `A reviewed ${normalizedReviewedSourceLabel} also adds office context for this state legislator page.`
			: `A reviewed ${normalizedReviewedSourceLabel} also adds office context for this local officeholder page.`,
		...(record.enrichment?.methodologyNotes ?? []),
	]));
	const whatWeKnow = [
		...baseProfile.person.whatWeKnow,
		...(!baseProfile.person.whatWeKnow.some(item => item.id === `supplemental:${record.slug}:reviewed-source`)
			? [{
					id: `supplemental:${record.slug}:reviewed-source`,
					note: record.provenanceNote,
					sources: record.sources,
					text: record.summary,
				}]
			: []),
	];
	const provenanceLabel = baseProfile.person.provenance.label === record.provenanceLabel
		? baseProfile.person.provenance.label
		: `${baseProfile.person.provenance.label} + ${record.provenanceLabel}`;
	const provenanceNote = [
		baseProfile.person.provenance.note,
		`Ballot Clarity also attached ${normalizedReviewedSourceLabel} for additional officeholder context on this page.`,
	].filter(Boolean).join(" ");
	const statusLabel = record.jurisdiction === "State"
		? "Provider-backed + reviewed state source"
		: "Provider-backed + reviewed official source";
	const statusNote = record.jurisdiction === "State"
		? "This page combines a current state officeholder record with a reviewed state source. State finance, disclosure, and action records appear only where a reviewed source is available."
		: "This page combines a current officeholder record with a reviewed local source. Local finance, disclosure, and action records appear only where a reviewed source is available.";

	return {
		...baseProfile,
		person: {
			...baseProfile.person,
			biography,
			contestSlug: record.districtSlug,
			districtLabel: record.districtLabel,
			districtSlug: record.districtSlug,
			freshness: {
				...baseProfile.person.freshness,
				contentLastVerifiedAt: updatedAt,
				dataLastUpdatedAt: updatedAt,
				nextReviewAt: updatedAt,
				statusLabel,
				statusNote,
			},
			governmentLevel: classification.governmentLevel,
			funding,
			influence,
			keyActions,
			lobbyingContext,
			location: record.location,
			methodologyNotes,
			officialWebsiteUrl: baseProfile.person.officialWebsiteUrl || record.officialWebsiteUrl,
			officeContext,
			officeDisplayLabel: classification.officeDisplayLabel,
			officeSought: record.officeSought,
			officeType: classification.officeType,
			openstatesUrl: baseProfile.person.openstatesUrl || record.openstatesUrl,
			profileImages: profileImages.length ? profileImages : undefined,
			provenance: {
				...baseProfile.person.provenance,
				asOf: updatedAt,
				label: provenanceLabel,
				note: provenanceNote,
			},
			publicStatements,
			sourceCount: mergedSources.length,
			sources: mergedSources,
			summary: record.jurisdiction === "State"
				? `${record.name} is the current ${record.party ? `${record.party} ` : ""}${record.officeSought} for ${record.districtLabel}. This page also includes reviewed state officeholder context from official or reviewed sources.`
				: `${record.name} is the current ${record.officeSought} for ${record.districtLabel}. This page also includes reviewed local officeholder context from official sources.`,
			topIssues,
			updatedAt,
			whatWeKnow,
			enrichmentStatus,
		},
		updatedAt,
	};
}

function formatCongressLookupName(value: string) {
	const trimmed = value.trim();

	if (!trimmed.includes(","))
		return trimmed;

	const [lastName, firstName] = trimmed.split(",", 2).map(item => item.trim()).filter(Boolean);
	return [firstName, lastName].filter(Boolean).join(" ");
}

function mergeRepresentativeMatches(representativeMatches: LocationRepresentativeMatch[]) {
	const uniqueMatches = new Map<string, LocationRepresentativeMatch>();

	for (const match of representativeMatches) {
		const normalizedName = toLookupSlug(match.name);
		const normalizedDistrict = toLookupSlug(match.districtLabel);
		const normalizedOffice = toLookupSlug(match.officeTitle);
		const normalizedId = toLookupSlug(match.id);
		const keys = [
			normalizedId ? `id:${normalizedId}` : "",
			normalizedName ? `name:${normalizedName}:${normalizedOffice}:${normalizedDistrict}` : "",
			normalizedName ? `name:${normalizedName}` : "",
		].filter(Boolean);
		const existingKey = keys.find(key => uniqueMatches.has(key));

		if (!existingKey) {
			for (const key of keys)
				uniqueMatches.set(key, match);
			continue;
		}

		const existingMatch = uniqueMatches.get(existingKey) ?? match;
		const preferredMatch = existingMatch.openstatesUrl
			? existingMatch
			: match.openstatesUrl
				? match
				: existingMatch.sourceSystem === "Open States"
					? existingMatch
					: match.sourceSystem === "Open States"
						? match
						: existingMatch;
		const profileImages = buildRepresentativeProfileImages(
			existingMatch.profileImages,
			match.profileImages,
		);
		const mergedMatch = {
			...preferredMatch,
			profileImages: profileImages.length ? profileImages : undefined,
		};

		for (const key of keys)
			uniqueMatches.set(key, mergedMatch);
	}

	return Array.from(new Map(
		Array.from(uniqueMatches.values()).map(match => [toLookupSlug(match.name), match]),
	).values());
}

function normalizeRepresentativeOfficeKey(value: string) {
	const normalized = toLookupSlug(value);

	if (normalized.includes("senator"))
		return "senator";

	if (normalized.includes("representative"))
		return "representative";

	return normalized;
}

function extractRepresentativeDistrictCode(value: string) {
	const match = String(value ?? "").match(districtNumberPattern);
	return match?.[1] || "";
}

function representativeMatchesEquivalent(
	left: Pick<LocationRepresentativeMatch, "districtLabel" | "name" | "officeTitle">,
	right: Pick<LocationRepresentativeMatch, "districtLabel" | "name" | "officeTitle">,
) {
	if (normalizeRepresentativeOfficeKey(left.officeTitle) !== normalizeRepresentativeOfficeKey(right.officeTitle))
		return false;

	if (!directRouteNamesReliablyMatch(left.name, right.name))
		return false;

	const leftDistrictCode = extractRepresentativeDistrictCode(left.districtLabel);
	const rightDistrictCode = extractRepresentativeDistrictCode(right.districtLabel);

	if (leftDistrictCode || rightDistrictCode)
		return leftDistrictCode === rightDistrictCode;

	return true;
}

async function buildCongressRepresentativeMatchesFromDistrictContext(
	congressClient: CongressClient | null | undefined,
	stateCode: string,
	districtMatches: LocationDistrictMatch[],
	existingMatches: LocationRepresentativeMatch[],
) {
	if (!congressClient || !stateCode)
		return [];

	const stateMembers = (await congressClient.listMembersByState(stateCode)).filter(isCurrentCongressMemberRecord);
	const stateName = getStateNameForAbbreviation(stateCode) || stateCode;
	const congressionalDistrictMatch = districtMatches.find(district => toLookupSlug(district.districtType).includes("congress"));
	const congressionalDistrictNumber = congressionalDistrictMatch?.districtCode
		? String(Number.parseInt(String(congressionalDistrictMatch.districtCode), 10))
		: "";
	const normalizedExistingNames = new Set(existingMatches.map(match => toLookupSlug(match.name)));

	return stateMembers.flatMap((member) => {
		const directName = formatCongressLookupName(member.name);
		if (!directName)
			return [];

		const candidateMatch = typeof member.district === "number"
			? (() => {
					if (!congressionalDistrictNumber || String(member.district) !== congressionalDistrictNumber)
						return null;

					const classification = classifyRepresentative({
						districtLabel: `Congressional District ${congressionalDistrictNumber}`,
						officeSought: `U.S. House, District ${congressionalDistrictNumber}`,
						officeTitle: "Representative",
						stateCode,
						stateName,
					});

					return {
						districtLabel: `Congressional District ${congressionalDistrictNumber}`,
						governmentLevel: classification.governmentLevel,
						id: `congress:${member.bioguideId}`,
						name: directName,
						officeDisplayLabel: classification.officeDisplayLabel,
						officeType: classification.officeType,
						officeTitle: "Representative",
						party: member.party,
						sourceSystem: "Congress.gov",
					} satisfies LocationRepresentativeMatch;
				})()
			: (() => {
					const classification = classifyRepresentative({
						districtLabel: stateName,
						officeSought: "U.S. Senate",
						officeTitle: "Senator",
						stateCode,
						stateName,
					});

					return {
						districtLabel: stateName,
						governmentLevel: classification.governmentLevel,
						id: `congress:${member.bioguideId}`,
						name: directName,
						officeDisplayLabel: classification.officeDisplayLabel,
						officeType: classification.officeType,
						officeTitle: "Senator",
						party: member.party,
						sourceSystem: "Congress.gov",
					} satisfies LocationRepresentativeMatch;
				})();

		if (!candidateMatch)
			return [];

		if (normalizedExistingNames.has(toLookupSlug(candidateMatch.name)))
			return [];

		if (existingMatches.some(match => representativeMatchesEquivalent(match, candidateMatch)))
			return [];

		return [candidateMatch];
	});
}

async function augmentRepresentativeMatchesForLookup(
	congressClient: CongressClient | null | undefined,
	stateCode: string,
	districtMatches: LocationDistrictMatch[],
	representativeMatches: LocationRepresentativeMatch[],
) {
	const withSupplemental = mergeRepresentativeMatches(
		mergeRepresentativeMatchesWithSupplementalRecords(representativeMatches, districtMatches),
	);
	const congressionalFallbackMatches = await buildCongressRepresentativeMatchesFromDistrictContext(
		congressClient,
		stateCode,
		districtMatches,
		withSupplemental,
	);
	return mergeRepresentativeMatches([
		...withSupplemental,
		...congressionalFallbackMatches,
	]);
}

function buildRepresentativeProfileFromOpenStates(record: OpenStatesRepresentativeRecord): PersonProfileResponse {
	const updatedAt = record.updatedAt || new Date().toISOString();
	const officeContext = buildRepresentativeOfficeContext(record);
	const officialResources = getOfficialToolsForState(officeContext.stateCode);
	const classification = classifyRepresentative({
		districtLabel: officeContext.districtLabel,
		officeSought: officeContext.officeSought,
		officeTitle: record.officeTitle,
		stateCode: officeContext.stateCode,
		stateName: officeContext.stateName,
	});
	const sources = [
		buildRouteSource({
			authority: record.openstatesUrl ? "nonprofit-provider" : "open-data",
			date: updatedAt,
			id: `representative:${toLookupSlug(record.name)}`,
			note: "Current officeholder identity attached from the Open States person record matched to this public representative page.",
			publisher: "Open States",
			sourceSystem: "Open States",
			title: `${record.name} current officeholder record`,
			url: record.openstatesUrl || "https://openstates.org",
		}),
		...buildOfficialToolSources(officialResources, updatedAt),
	];

	return {
		note: "Representative profile assembled from current officeholder records for this public page.",
		person: {
			ballotStatusLabel: "Current ballot status requires address or ZIP confirmation",
			biography: [
				{
					id: `provider:${toLookupSlug(record.name)}`,
					sources,
					summary: `${record.name} is attached here from a current Open States officeholder record. Entering an address or ZIP can still confirm whether this officeholder matches your exact district and locality.`,
					title: "Provider-backed officeholder record",
				},
			],
			comparison: null,
			contestSlug: officeContext.districtSlug,
			districtLabel: officeContext.districtLabel,
			districtSlug: officeContext.districtSlug,
			freshness: {
				contentLastVerifiedAt: updatedAt,
				dataLastUpdatedAt: updatedAt,
				nextReviewAt: updatedAt,
				status: "up-to-date",
				statusLabel: "Provider-backed",
				statusNote: "This page is based on a current officeholder record. An address or ZIP lookup can still confirm whether this officeholder matches your exact area.",
			},
			funding: null,
			governmentLevel: classification.governmentLevel,
			incumbent: true,
			keyActions: [],
			lobbyingContext: [],
			location: officeContext.location,
			methodologyNotes: [
				"This page is based on a current public officeholder record.",
				"An address or ZIP lookup can still confirm whether this officeholder matches your exact area.",
			],
			name: record.name,
			officeDisplayLabel: classification.officeDisplayLabel,
			officeholderLabel: "Current officeholder",
			officeType: classification.officeType,
			officeSought: officeContext.officeSought,
			onCurrentBallot: false,
			openstatesUrl: record.openstatesUrl,
			party: record.party || "Unknown",
			profileImages: record.profileImages,
			provenance: {
				asOf: updatedAt,
				label: "Open States current officeholder record",
				note: "Matched to the current Open States officeholder record.",
				source: "nationwide",
				status: "crosswalked",
			},
			publicStatements: [],
			slug: buildNationwideRepresentativeSlug({ id: record.id, name: record.name }),
			sourceCount: sources.length,
			sources,
			summary: `${record.name} is the current ${record.party ? `${record.party} ` : ""}${officeContext.officeSought} for ${officeContext.districtLabel}.`,
			topIssues: [],
			updatedAt,
			whatWeDoNotKnow: [
				{
					id: "lookup-confirmation",
					note: "An address or ZIP lookup is still required for exact district confirmation.",
					sources,
					text: "This page identifies the officeholder, but an address or ZIP lookup is still needed to confirm whether this is your exact district and locality.",
				},
			],
			whatWeKnow: [
				{
					id: "provider-identity",
					note: "The Open States record anchors the identity, office, and public provider link on this page.",
					sources,
					text: `${record.name} is linked here from the current Open States officeholder record.`,
				},
			],
		},
		updatedAt,
	};
}

function rankDirectFederalMemberMatch(member: CongressMemberRecord, searchName: string) {
	let score = 0;

	if (directRouteNamesReliablyMatch(member.name, searchName))
		score += 100;

	if (member.district === undefined)
		score += 10;

	return score;
}

function buildRepresentativeOfficeContextFromCongressMember(member: CongressMemberDetail) {
	const latestTerm = [...member.terms].sort((left, right) => right.congress - left.congress)[0];
	const stateCode = latestTerm?.stateCode || getStateAbbreviationForName(member.state) || member.state.slice(0, 2).toUpperCase();
	const stateName = latestTerm?.stateName || getStateNameForAbbreviation(stateCode) || member.state || stateCode || "Unknown jurisdiction";
	const chamber = latestTerm?.chamber || "";

	if (senateChamberPattern.test(chamber) || latestTerm?.memberType === "Senator" || member.district === undefined) {
		return {
			districtLabel: stateName,
			districtSlug: `${stateCode.toLowerCase()}-sen-statewide`,
			location: stateName,
			officeSought: "U.S. Senate",
			stateCode,
			stateName,
		};
	}

	const districtNumber = String(Number.parseInt(String(latestTerm?.district ?? member.district ?? ""), 10));

	return {
		districtLabel: `Congressional District ${districtNumber}`,
		districtSlug: `congressional-${districtNumber}`,
		location: stateName,
		officeSought: `U.S. House, District ${districtNumber}`,
		stateCode,
		stateName,
	};
}

function buildCongressTermOfficeContext(member: CongressMemberDetail): PersonProfileOfficeContext {
	const terms = [...member.terms].sort((left, right) =>
		right.congress - left.congress
		|| right.startYear - left.startYear
	);
	const latestTerm = terms[0];
	const earliestTerm = terms
		.filter(term => typeof term.startYear === "number")
		.sort((left, right) => left.startYear - right.startYear)[0];

	return {
		currentTermEndLabel: latestTerm?.endYear ? String(latestTerm.endYear) : latestTerm ? "Present" : undefined,
		currentTermLabel: latestTerm ? `${latestTerm.congress}th Congress (${latestTerm.startYear}-${latestTerm.endYear || "present"})` : undefined,
		currentTermStartLabel: latestTerm ? String(latestTerm.startYear) : undefined,
		serviceStartLabel: earliestTerm ? String(earliestTerm.startYear) : undefined,
	};
}

function buildRepresentativeLookupContextFromCongressMember(
	member: CongressMemberDetail,
	representativeSlug: string,
	updatedAt: string,
) {
	const officeContext = buildRepresentativeOfficeContextFromCongressMember(member);
	const officialResources = getOfficialToolsForState(officeContext.stateCode);
	const officeTitle = officeContext.officeSought === "U.S. Senate" ? "Senator" : "Representative";
	const classification = classifyRepresentative({
		districtLabel: officeContext.districtLabel,
		officeSought: officeContext.officeSought,
		officeTitle,
		stateCode: officeContext.stateCode,
		stateName: officeContext.stateName,
	});

	return {
		actions: officialResources.map((resource, index) => ({
			badge: resource.sourceLabel,
			description: resource.note || "",
			id: `official:${officeContext.stateCode || "unknown"}:${index}`,
			kind: "official-verification" as const,
			title: resource.label,
			url: resource.url,
		})),
		detectedFromIp: false,
		districtMatches: [
			{
				districtCode: officeContext.districtLabel.match(districtNumberPattern)?.[1] || officeContext.stateCode,
				districtType: officeContext.officeSought,
				id: officeContext.districtSlug,
				label: officeContext.districtLabel,
				sourceSystem: "Congress.gov",
			},
		],
		electionLogistics: null,
		guideAvailability: "not-published" as const,
		inputKind: "address" as const,
		location: {
			coverageLabel: "Civic results available",
			displayName: officeContext.stateName,
			slug: toLookupSlug(officeContext.stateName),
			state: officeContext.stateName,
		},
		normalizedAddress: officeContext.stateCode || officeContext.stateName,
		representativeMatches: [
			{
				districtLabel: officeContext.districtLabel,
				governmentLevel: classification.governmentLevel,
				id: representativeSlug,
				name: member.directOrderName,
				officeDisplayLabel: classification.officeDisplayLabel,
				officeType: classification.officeType,
				officeTitle,
				party: member.party,
				profileImages: buildCongressProfileImages(member),
				sourceSystem: "Congress.gov",
			},
		],
		resolvedAt: updatedAt,
		result: "resolved" as const,
	};
}

function buildRepresentativeProfileFromCongressMember(
	member: CongressMemberDetail,
	representativeSlug: string,
): PersonProfileResponse {
	const updatedAt = member.updatedAt || new Date().toISOString();
	const officeContext = buildRepresentativeOfficeContextFromCongressMember(member);
	const officialResources = getOfficialToolsForState(officeContext.stateCode);
	const classification = classifyRepresentative({
		districtLabel: officeContext.districtLabel,
		officeSought: officeContext.officeSought,
		officeTitle: officeContext.officeSought === "U.S. Senate" ? "Senator" : "Representative",
		stateCode: officeContext.stateCode,
		stateName: officeContext.stateName,
	});
	const profileImages = buildCongressProfileImages(member);
	const termContext = buildCongressTermOfficeContext(member);
	const sources = [
		buildRouteSource({
			authority: "official-government",
			date: updatedAt,
			id: `congress:member:${member.bioguideId}`,
			note: "Current officeholder identity attached from the Congress.gov member record matched to this public representative page.",
			publisher: "Congress.gov",
			sourceSystem: "Congress.gov member detail",
			title: `${member.directOrderName} member record`,
			url: member.url || "https://api.congress.gov/",
		}),
		...buildOfficialToolSources(officialResources, updatedAt),
	];

	return {
		note: "Representative profile assembled from current federal officeholder records for this public page.",
		person: {
			ballotStatusLabel: "Current ballot status requires address or ZIP confirmation",
			biography: [
				{
					id: `provider:${representativeSlug}`,
					sources,
					summary: `${member.directOrderName} is attached here from a current Congress.gov officeholder record. Entering an address or ZIP can still confirm whether this officeholder matches your exact district and locality.`,
					title: "Provider-backed officeholder record",
				},
			],
			comparison: null,
			contestSlug: officeContext.districtSlug,
			districtLabel: officeContext.districtLabel,
			districtSlug: officeContext.districtSlug,
			freshness: {
				contentLastVerifiedAt: updatedAt,
				dataLastUpdatedAt: updatedAt,
				nextReviewAt: updatedAt,
				status: "up-to-date",
				statusLabel: "Provider-backed",
				statusNote: "This page is based on a current federal officeholder record. An address or ZIP lookup can still confirm whether this officeholder matches your exact area.",
			},
			funding: null,
			governmentLevel: classification.governmentLevel,
			incumbent: true,
			keyActions: [],
			lobbyingContext: [],
			location: officeContext.location,
			methodologyNotes: [
				"This page is based on a current federal officeholder record.",
				"When Open States representative lookup is unavailable, Ballot Clarity can still build a federal officeholder base record from Congress.gov and then attach finance and lobbying modules through the federal provider crosswalk.",
			],
			name: member.directOrderName,
			officeDisplayLabel: classification.officeDisplayLabel,
			officeholderLabel: "Current officeholder",
			officeContext: {
				...termContext,
				chamberLabel: officeContext.officeSought === "U.S. Senate" ? "Senate" : "House of Representatives",
				districtLabel: officeContext.districtLabel,
				jurisdictionLabel: officeContext.stateName,
			},
			officeType: classification.officeType,
			officeSought: officeContext.officeSought,
			onCurrentBallot: false,
			party: member.party || "Unknown",
			profileImages: profileImages.length ? profileImages : undefined,
			provenance: {
				asOf: updatedAt,
				label: "Congress.gov current officeholder record",
				note: "Matched to a current federal officeholder record.",
				source: "nationwide",
				status: "crosswalked",
			},
			publicStatements: [],
			slug: representativeSlug,
			sourceCount: sources.length,
			sources,
			summary: `${member.directOrderName} is the current ${member.party ? `${member.party} ` : ""}${officeContext.officeSought} for ${officeContext.districtLabel}.`,
			topIssues: [],
			updatedAt,
			whatWeDoNotKnow: [
				{
					id: "lookup-confirmation",
					note: "An address or ZIP lookup is still required for exact district confirmation.",
					sources,
					text: "This page identifies the officeholder, but an address or ZIP lookup is still needed to confirm whether this is your exact district and locality.",
				},
			],
			whatWeKnow: [
				{
					id: "provider-identity",
					note: "The Congress.gov current member record anchors the identity, office, and official links on this page.",
					sources,
					text: `${member.directOrderName} is linked here from the current Congress.gov member record.`,
				},
			],
		},
		updatedAt,
	};
}

interface PublicDistrictRouteIdentity {
	jurisdiction: Contest["jurisdiction"];
	locationName: string;
	office: string;
	officialResources: OfficialResource[];
	originLabel: string;
	originNote: string;
	representativeAvailabilityNote: string;
	slug: string;
	summary: string;
	title: string;
}

function buildPublicDistrictRouteIdentity(slug: string): PublicDistrictRouteIdentity | null {
	const normalizedSlug = toLookupSlug(slug);
	const updatedSlug = normalizedSlug;
	const congressionalMatch = normalizedSlug.match(congressionalRoutePattern);
	const representativeStateMatch = normalizedSlug.match(representativeStateRoutePattern);
	const representativeMatch = normalizedSlug.match(representativeRoutePattern);
	const senatorStatewideCodeMatch = normalizedSlug.match(senatorStatewideCodeRoutePattern);
	const senatorStatewideNameMatch = normalizedSlug.match(senatorStatewideNameRoutePattern);
	const senatorMatch = normalizedSlug.match(senatorRoutePattern);
	const stateSenateMatch = normalizedSlug.match(stateSenateRoutePattern);
	const stateHouseMatch = normalizedSlug.match(stateHouseRoutePattern);
	const countyMatch = normalizedSlug.match(countyRoutePattern);
	const cityMatch = normalizedSlug.match(cityRoutePattern);

	if (representativeStateMatch?.[1] && representativeStateMatch?.[2]) {
		const stateIdentity = buildStateIdentityFromRouteToken(representativeStateMatch[1]);
		const districtNumber = String(Number.parseInt(representativeStateMatch[2], 10));

		return {
			jurisdiction: "Federal",
			locationName: stateIdentity?.stateName || "State-specific district confirmation pending",
			office: `Congressional District ${districtNumber}`,
			officialResources: stateIdentity?.officialResources ?? [],
			originLabel: "Provider-qualified district page",
			originNote: "This district page identifies a congressional district and state, so Ballot Clarity can attach configured state-level official election tools.",
			representativeAvailabilityNote: "This page identifies the congressional district and state. Entering an address or ZIP can confirm whether it matches your exact area.",
			slug: updatedSlug,
			summary: "This public district page identifies a state-qualified congressional district.",
			title: `${stateIdentity?.stateName || representativeStateMatch[1].toUpperCase()} Congressional District ${districtNumber}`,
		};
	}

	if (congressionalMatch?.[1]) {
		const districtNumber = String(Number.parseInt(congressionalMatch[1], 10));

		return {
			jurisdiction: "Federal",
			locationName: "State-specific district confirmation pending",
			office: `Congressional District ${districtNumber}`,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This district page identifies a congressional district number. Entering an address or ZIP can attach the exact state and officeholder.",
			representativeAvailabilityNote: "The current officeholder cannot be confirmed from the district number alone. Enter an address or ZIP to attach the right state and representative.",
			slug: updatedSlug,
			summary: "This public district page identifies a congressional district number.",
			title: `Congressional District ${districtNumber}`,
		};
	}

	if (senatorStatewideCodeMatch?.[1]) {
		const stateIdentity = buildStateIdentityFromRouteToken(senatorStatewideCodeMatch[1]);

		return {
			jurisdiction: "Federal",
			locationName: stateIdentity?.stateName || senatorStatewideCodeMatch[1].toUpperCase(),
			office: "U.S. Senate",
			officialResources: stateIdentity?.officialResources ?? [],
			originLabel: "Provider-qualified district page",
			originNote: "This district page identifies a statewide U.S. Senate office area for the named state.",
			representativeAvailabilityNote: "This page identifies the statewide Senate office area. Entering an address or ZIP can confirm whether it matches your exact area.",
			slug: updatedSlug,
			summary: "This public district page identifies a statewide U.S. Senate office area.",
			title: `${stateIdentity?.stateName || senatorStatewideCodeMatch[1].toUpperCase()} statewide Senate seat`,
		};
	}

	if (senatorStatewideNameMatch?.[1]) {
		const stateIdentity = buildStateIdentityFromRouteToken(senatorStatewideNameMatch[1]);

		return {
			jurisdiction: "Federal",
			locationName: stateIdentity?.stateName || titleCaseToken(senatorStatewideNameMatch[1]),
			office: "U.S. Senate",
			officialResources: stateIdentity?.officialResources ?? [],
			originLabel: "Provider-qualified district page",
			originNote: "This district page identifies a statewide U.S. Senate office area for the named state.",
			representativeAvailabilityNote: "This page identifies the statewide Senate office area. Entering an address or ZIP can confirm whether it matches your exact area.",
			slug: updatedSlug,
			summary: "This public district page identifies a statewide U.S. Senate office area.",
			title: `${stateIdentity?.stateName || titleCaseToken(senatorStatewideNameMatch[1])} statewide Senate seat`,
		};
	}

	if (senatorMatch?.[1]) {
		const districtNumber = String(Number.parseInt(senatorMatch[1], 10));

		return {
			jurisdiction: "State",
			locationName: "State-specific district confirmation pending",
			office: `State Senate District ${districtNumber}`,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This district page identifies a state senate district number. State-specific officeholder details and official election links require a more precise area match.",
			representativeAvailabilityNote: "The exact state-specific officeholder cannot be confirmed from the district number alone. Enter an address or ZIP to attach the right officeholder.",
			slug: updatedSlug,
			summary: "This public district page identifies a state senate district number.",
			title: `State Senate District ${districtNumber}`,
		};
	}

	if (stateSenateMatch?.[1]) {
		const districtNumber = String(Number.parseInt(stateSenateMatch[1], 10));

		return {
			jurisdiction: "State",
			locationName: "State-specific district confirmation pending",
			office: `State Senate District ${districtNumber}`,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This district page identifies a state senate district number. State-specific officeholder details and election tools require a more precise area match.",
			representativeAvailabilityNote: "The current officeholder cannot be confirmed from the district number alone. Enter an address or ZIP to attach the right state and officeholder.",
			slug: updatedSlug,
			summary: "This public district page identifies a state senate district number.",
			title: `State Senate District ${districtNumber}`,
		};
	}

	if (representativeMatch?.[1]) {
		const districtNumber = String(Number.parseInt(representativeMatch[1], 10));

		return {
			jurisdiction: "State",
			locationName: "State-specific district confirmation pending",
			office: `State House District ${districtNumber}`,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This district page identifies a state house district number. State-specific officeholder details and official election links require a more precise area match.",
			representativeAvailabilityNote: "The exact state-specific officeholder cannot be confirmed from the district number alone. Enter an address or ZIP to attach the right officeholder.",
			slug: updatedSlug,
			summary: "This public district page identifies a state house district number.",
			title: `State House District ${districtNumber}`,
		};
	}

	if (stateHouseMatch?.[1]) {
		const districtNumber = String(Number.parseInt(stateHouseMatch[1], 10));

		return {
			jurisdiction: "State",
			locationName: "State-specific district confirmation pending",
			office: `State House District ${districtNumber}`,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This district page identifies a state house district number. State-specific officeholder details and election tools require a more precise area match.",
			representativeAvailabilityNote: "The current officeholder cannot be confirmed from the district number alone. Enter an address or ZIP to attach the right state and officeholder.",
			slug: updatedSlug,
			summary: "This public district page identifies a state house district number.",
			title: `State House District ${districtNumber}`,
		};
	}

	if (countyMatch?.[1]) {
		const title = titleCaseToken(normalizedSlug);

		return {
			jurisdiction: "Local",
			locationName: title,
			office: title,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This local government page identifies the county geography itself, even when reviewed county officeholder records are not attached yet.",
			representativeAvailabilityNote: "No county officeholder data is connected for this area yet. This does not mean the county has no officials, only that Ballot Clarity does not yet have a county officeholder source attached here.",
			slug: updatedSlug,
			summary: "This county page stays public so users can orient around the government area even when county officeholder records are not attached yet.",
			title,
		};
	}

	if (cityMatch?.[1]) {
		const title = titleCaseToken(normalizedSlug);

		return {
			jurisdiction: "Local",
			locationName: title,
			office: title,
			officialResources: [],
			originLabel: "Canonical district page",
			originNote: "This local government page identifies the city geography itself, even when reviewed city officeholder records are not attached yet.",
			representativeAvailabilityNote: "City officeholder data is not yet available from the current provider set. This does not mean the city has no officials, only that Ballot Clarity cannot yet attach them here.",
			slug: updatedSlug,
			summary: "This city page stays public so users can orient around the government area even when city officeholder records are not attached yet.",
			title,
		};
	}

	return null;
}

function buildPublicDistrictRecordFromSlug(slug: string): DistrictRecordResponse | null {
	const districtIdentity = buildPublicDistrictRouteIdentity(slug);

	if (!districtIdentity)
		return null;

	const supplementalOfficeholders = findSupplementalOfficeholdersByDistrictSlug(districtIdentity.slug);
	const updatedAt = new Date().toISOString();
	const resolvedUpdatedAt = supplementalOfficeholders[0]?.updatedAt || updatedAt;
	const resolvedOfficialResources = supplementalOfficeholders[0]?.stateCode
		? getOfficialToolsForState(supplementalOfficeholders[0].stateCode)
		: districtIdentity.officialResources;
	const representatives = supplementalOfficeholders.map(buildSupplementalRepresentativeSummary);
	const sources = [
		buildRouteSource({
			authority: "open-data",
			date: resolvedUpdatedAt,
			id: `district:${districtIdentity.slug}:identity`,
			note: supplementalOfficeholders.length
				? "This district record includes a stable district identity and reviewed officeholder records from Ballot Clarity's public officeholder sources."
				: "This district record includes a stable district identity that can be refined by entering an address or ZIP.",
			publisher: "Ballot Clarity public district records",
			sourceSystem: "Ballot Clarity public district records",
			title: `${districtIdentity.title} page identity`,
			url: "/coverage",
		}),
		...supplementalOfficeholders.flatMap(record => record.sources),
		...buildOfficialToolSources(resolvedOfficialResources, resolvedUpdatedAt),
	];
	const representativeAvailabilityNote = supplementalOfficeholders.length
		? districtIdentity.jurisdiction === "Local"
			? `${supplementalOfficeholders.length} reviewed local officeholder record${supplementalOfficeholders.length === 1 ? "" : "s"} ${supplementalOfficeholders.length === 1 ? "is" : "are"} attached to this district page. This is the current reviewed local officeholder data attached here, not a claim that all local offices are covered yet.`
			: `${supplementalOfficeholders.length} reviewed state officeholder record${supplementalOfficeholders.length === 1 ? "" : "s"} ${supplementalOfficeholders.length === 1 ? "is" : "are"} attached to this district page from the current public officeholder layer.`
		: districtIdentity.representativeAvailabilityNote;
	const districtOriginLabel = supplementalOfficeholders.length
		? supplementalOfficeholders[0]?.jurisdiction === "Local"
			? "Reviewed local officeholder record"
			: "Reviewed state officeholder record"
		: districtIdentity.originLabel;
	const districtOriginNote = supplementalOfficeholders.length
		? `${supplementalOfficeholders[0]?.provenanceNote || districtIdentity.originNote} Entering an address or ZIP can still add exact district confirmation and stronger locality-specific election tools.`
		: districtIdentity.originNote;
	const note = supplementalOfficeholders.length
		? "This district page includes reviewed officeholder records. Entering an address or ZIP can still add exact district confirmation and locality-specific official tools."
		: "This district page is available without a saved location. Entering an address or ZIP can refine it with exact district confirmation and official tools.";

	return {
		candidateAvailabilityNote: "Candidate and contest pages are not attached to this district yet, but official links and district details can still appear here.",
		candidates: [],
		district: {
			candidateCount: 0,
			description: supplementalOfficeholders.length
				? `${districtIdentity.summary} ${representativeAvailabilityNote}`
				: districtIdentity.summary,
			electionSlug: "nationwide-lookup",
			href: `/districts/${districtIdentity.slug}`,
			jurisdiction: districtIdentity.jurisdiction,
			office: districtIdentity.office,
			representativeCount: representatives.length,
			roleGuide: buildNationwideDistrictRoleGuide({
				jurisdiction: districtIdentity.jurisdiction,
				office: districtIdentity.office,
				title: districtIdentity.title,
			}),
			slug: districtIdentity.slug,
			summary: districtIdentity.summary,
			title: districtIdentity.title,
			updatedAt: resolvedUpdatedAt,
		},
		districtOriginLabel,
		districtOriginNote,
		election: {
			date: resolvedUpdatedAt,
			jurisdictionSlug: "",
			locationName: supplementalOfficeholders[0]?.location || districtIdentity.locationName,
			name: "Public district record",
			slug: "nationwide-lookup",
			updatedAt: resolvedUpdatedAt,
		},
		mode: "nationwide",
		note,
		officialResources: resolvedOfficialResources,
		relatedContests: [],
		representativeAvailabilityNote,
		representatives,
		sources,
		updatedAt: resolvedUpdatedAt,
	};
}

function buildPersonProfileFromCandidate(candidate: Candidate): PersonProfileResponse {
	const sources = collectCandidateSources(candidate);
	const classification = classifyRepresentative({
		districtLabel: candidate.officeSought,
		officeSought: candidate.officeSought,
		stateName: candidate.location.split(",").slice(-1)[0]?.trim() || candidate.location,
	});
	const funding: PersonProfileResponse["person"]["funding"] = candidate.funding
		? {
				...candidate.funding,
				provenanceLabel: "Source-backed published filing summary"
			}
		: null;

	return {
		note: "Representative profile assembled from Ballot Clarity's published local person record for this office.",
		person: {
			ballotStatusLabel: candidate.comparison.ballotStatus.label,
			contestSlug: candidate.contestSlug,
			comparison: candidate.comparison,
			districtLabel: candidate.officeSought,
			districtSlug: candidate.contestSlug,
			funding,
			governmentLevel: classification.governmentLevel,
			keyActions: candidate.keyActions,
			lobbyingContext: candidate.lobbyingContext,
			methodologyNotes: candidate.methodologyNotes,
			name: candidate.name,
			officeDisplayLabel: classification.officeDisplayLabel,
			officeSought: candidate.officeSought,
			officeholderLabel: candidate.incumbent ? "Current officeholder" : "Candidate",
			officeType: classification.officeType,
			onCurrentBallot: true,
			openstatesUrl: undefined,
			party: candidate.party,
			profileImages: candidate.profileImages,
			provenance: {
				asOf: candidate.updatedAt,
				label: "Source-backed local person record",
				note: "Derived from Ballot Clarity's published local person record for this office.",
				source: "guide",
				status: "direct"
			},
			publicStatements: candidate.publicStatements,
			whatWeKnow: candidate.whatWeKnow,
			whatWeDoNotKnow: candidate.whatWeDoNotKnow,
			topIssues: candidate.topIssues,
			biography: candidate.biography,
			incumbent: candidate.incumbent,
			location: candidate.location,
			slug: candidate.slug,
			sources,
			summary: candidate.summary,
			sourceCount: sources.length,
			updatedAt: candidate.updatedAt,
			freshness: candidate.freshness
		},
		updatedAt: candidate.updatedAt
	};
}

function buildDistrictSummary(contest: Contest, election: Election) {
	return {
		candidateCount: contest.candidates?.length ?? 0,
		href: `/districts/${contest.slug}`,
		jurisdiction: contest.jurisdiction,
		office: contest.office,
		representativeCount: (contest.candidates ?? []).filter(candidate => candidate.incumbent).length,
		slug: contest.slug,
		summary: contest.description,
		title: contest.office,
		updatedAt: election.updatedAt
	};
}

function buildSearchResponse(
	rawQuery: string,
	candidates: Candidate[],
	measures: Measure[],
	contests: Contest[],
	election: Election | null,
	jurisdiction: Jurisdiction | null,
	sourceDirectory: SourceDirectoryItem[],
	districts: ReturnType<typeof buildDistrictSummary>[]
): SearchResponse {
	const query = rawQuery.trim();
	const lowerQuery = query.toLowerCase();
	const suggestions = [
		"official election office",
		"district page",
		"representatives",
		"campaign finance",
		"source directory",
		"contest page"
	];

	if (query.length < 2) {
		return {
			groups: [],
			query,
			suggestions,
			total: 0
		};
	}

	const candidateResults = candidates
		.filter(candidate => [
			candidate.name,
			candidate.officeSought,
			candidate.summary,
			candidate.topIssues.map(issue => issue.label).join(" ")
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(candidate => ({
			href: `/candidate/${candidate.slug}`,
			id: candidate.slug,
			meta: `${candidate.officeSought} · ${candidate.party}`,
			sourceCount: candidate.sources.length,
			summary: candidate.ballotSummary,
			title: candidate.name,
			type: "candidate" as const,
			updatedAt: candidate.updatedAt
		}));

	const measureResults = measures
		.filter(measure => [
			measure.title,
			measure.summary,
			measure.plainLanguageExplanation,
			measure.yesMeaning,
			measure.noMeaning
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(measure => ({
			href: `/measure/${measure.slug}`,
			id: measure.slug,
			meta: measure.location,
			sourceCount: measure.sources.length,
			summary: measure.ballotSummary,
			title: measure.title,
			type: "measure" as const,
			updatedAt: measure.updatedAt
		}));

	const contestResults = contests
		.filter(contest => [
			contest.title,
			contest.office,
			contest.description,
			contest.roleGuide.summary,
			contest.roleGuide.whyItMatters,
			contest.type === "candidate"
				? (contest.candidates ?? []).map(candidate => candidate.name).join(" ")
				: (contest.measures ?? []).map(measure => measure.title).join(" ")
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(contest => ({
			href: `/contest/${contest.slug}`,
			id: contest.slug,
			meta: `${contest.jurisdiction} · ${contest.type === "candidate" ? `${contest.candidates?.length ?? 0} candidate${contest.candidates?.length === 1 ? "" : "s"}` : `${contest.measures?.length ?? 0} measure${contest.measures?.length === 1 ? "" : "s"}`}`,
			sourceCount: collectContestSources(contest).length,
			summary: contest.description,
			title: contest.office,
			type: "contest" as const,
			updatedAt: election?.updatedAt ?? ""
		}));

	const districtResults = districts
		.filter(district => [
			district.title,
			district.office,
			district.summary
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(district => ({
			href: district.href,
			id: district.slug,
			meta: `${district.jurisdiction} · ${district.candidateCount} candidate${district.candidateCount === 1 ? "" : "s"}`,
			summary: district.summary,
			title: district.title,
			type: "district" as const,
			updatedAt: district.updatedAt
		}));

	const electionResults = [election]
		.filter((item): item is Election => Boolean(item))
		.filter(election => [
			election.name,
			election.locationName,
			election.description
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(election => ({
			href: `/elections/${election.slug}`,
			id: election.slug,
			meta: `${jurisdiction?.displayName ?? election.locationName} · ${election.date}`,
			summary: election.description,
			title: election.name,
			type: "election" as const,
			updatedAt: election.updatedAt
		}));

	const jurisdictionResults = [jurisdiction]
		.filter((item): item is Jurisdiction => Boolean(item))
		.filter(jurisdiction => [
			jurisdiction.name,
			jurisdiction.displayName,
			jurisdiction.description
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(jurisdiction => ({
			href: `/locations/${jurisdiction.slug}`,
			id: jurisdiction.slug,
			meta: `${jurisdiction.jurisdictionType} · ${jurisdiction.state}`,
			summary: jurisdiction.description,
			title: jurisdiction.displayName,
			type: "jurisdiction" as const,
			updatedAt: jurisdiction.updatedAt
		}));

	const sourceResults = sourceDirectory
		.filter(source => [
			source.title,
			source.publisher,
			source.sourceSystem,
			source.type
		].join(" ").toLowerCase().includes(lowerQuery))
		.map(source => ({
			authority: source.authority,
			href: `/sources/${source.id}`,
			id: source.id,
			meta: `${source.publisher} · ${source.type}`,
			summary: source.note || `Cited ${source.citationCount} time${source.citationCount === 1 ? "" : "s"} in Ballot Clarity.`,
			title: source.title,
			type: "source" as const,
			updatedAt: source.date
		}));

	const groups = [
		{ items: jurisdictionResults, label: "Jurisdictions", type: "jurisdiction" as const },
		{ items: electionResults, label: "Elections", type: "election" as const },
		{ items: districtResults, label: "Districts", type: "district" as const },
		{ items: contestResults, label: "Contests", type: "contest" as const },
		{ items: candidateResults, label: "Candidates", type: "candidate" as const },
		{ items: measureResults, label: "Measures", type: "measure" as const },
		{ items: sourceResults, label: "Sources", type: "source" as const }
	].filter(group => group.items.length);

	return {
		groups,
		query,
		suggestions,
		total: groups.reduce((count, group) => count + group.items.length, 0)
	};
}

export async function createApp(options: CreateAppOptions = {}) {
	const app = express();
	const activeLookupCookieSecret = options.activeLookupCookieSecret ?? process.env.ACTIVE_LOOKUP_COOKIE_SECRET ?? "";
	const adminApiKey = options.adminApiKey ?? process.env.ADMIN_API_KEY ?? null;
	const adminSessionSecret = options.adminSessionSecret ?? process.env.ADMIN_SESSION_SECRET ?? null;
	const coverageRepository = options.coverageRepository ?? await createCoverageRepository();
	const guidePackageSeed = options.guidePackageSeed ?? buildDefaultGuidePackageSeed(coverageRepository);
	const adminRepository = await createAdminRepository({
		activitySeed: options.activitySeed,
		bootstrapDisplayName: options.bootstrapDisplayName,
		bootstrapPassword: options.bootstrapPassword,
		bootstrapUsername: options.bootstrapUsername,
		contentSeed: options.contentSeed,
		correctionSeed: options.correctionSeed,
		dbPath: options.adminDbPath,
		databaseUrl: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || null,
		guidePackageSeed,
		mfaEncryptionKey: options.adminMfaEncryptionKey ?? process.env.ADMIN_MFA_ENCRYPTION_KEY ?? null,
		sourceMonitorSeed: options.sourceMonitorSeed
	});
	const logger = createLogger("ballot-clarity-api");
	const publicFeedbackThrottle = options.publicFeedbackThrottle ?? createPublicRequestThrottle({
		fallbackMaxBuckets: 10_000,
		fallbackMaxRequests: 5,
		fallbackWindowMs: 10 * 60 * 1000,
		maxBucketsEnvName: "PUBLIC_FEEDBACK_RATE_LIMIT_MAX_BUCKETS",
		maxRequestsEnvName: "PUBLIC_FEEDBACK_RATE_LIMIT_MAX",
		windowMsEnvName: "PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_MS"
	});
	const publicLookupThrottle = options.publicLookupThrottle ?? createPublicRequestThrottle({
		fallbackMaxBuckets: 10_000,
		fallbackMaxRequests: 60,
		fallbackWindowMs: 10 * 60 * 1000,
		maxBucketsEnvName: "PUBLIC_LOOKUP_RATE_LIMIT_MAX_BUCKETS",
		maxRequestsEnvName: "PUBLIC_LOOKUP_RATE_LIMIT_MAX",
		windowMsEnvName: "PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_MS"
	});
	const zipLookupLogger = options.zipLookupLogger ?? createZipLookupLogger({
		onError(error) {
			logger.warn("zip_lookup_log.write_failed", {
				message: error instanceof Error ? error.message : "Unknown ZIP lookup log write failure."
			});
		}
	});
	const sourceAssetStore = createSourceAssetStore();
	const locationGuessService = createLocationGuessService(options.locationGuessOptions);
	const adminLoginThrottle = options.adminLoginThrottle ?? createAdminLoginThrottle();
	function checkAdminVerificationAttempt(
		request: Request,
		response: Response,
		username: string,
		workflow: "mfa_disable" | "mfa_enable" | "password_change"
	): AdminLoginThrottleState | null {
		const clientIp = buildPublicThrottleKey(request);
		const throttleState = adminLoginThrottle.check(username, clientIp);

		if (throttleState.allowed)
			return throttleState;

		logger.warn("admin.verification.throttled", {
			capacityLimited: throttleState.capacityLimited,
			ip: clientIp,
			requestId: response.locals.requestId,
			retryAfterSeconds: throttleState.retryAfterSeconds,
			username,
			workflow
		});
		response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
		response.status(429).json({
			message: "Too many failed admin verification attempts. Try again later.",
			retryAfterSeconds: throttleState.retryAfterSeconds
		});
		return null;
	}

	function recordAdminVerificationFailure(
		request: Request,
		response: Response,
		username: string,
		workflow: "mfa_disable" | "mfa_enable" | "password_change",
		throttleState: AdminLoginThrottleState
	) {
		adminLoginThrottle.recordFailure(throttleState.keys);
		logger.warn("admin.verification.failed", {
			ip: buildPublicThrottleKey(request),
			requestId: response.locals.requestId,
			username,
			workflow
		});
	}
	const googleCivicClient = options.googleCivicClient === undefined ? createGoogleCivicClient() : options.googleCivicClient;
	const ldaClient = options.ldaClient === undefined ? createLdaClient() : options.ldaClient;
	const congressClient = options.congressClient === undefined ? createCongressClient() : options.congressClient;
	const openStatesClient = options.openStatesClient === undefined ? createOpenStatesClient() : options.openStatesClient;
	const openFecClient = options.openFecClient === undefined ? createOpenFecClient() : options.openFecClient;
	const representativeModuleResolver = createRepresentativeModuleResolver({
		congressClient,
		ldaClient,
		openFecClient,
	});
	const zipLocationService = options.zipLocationService === undefined
		? createZipLocationService({ openStatesClient })
		: options.zipLocationService;
	const addressEnrichmentService = options.addressEnrichmentService === undefined
		? createAddressEnrichmentService(
				createCensusGeocoderClient(),
				openStatesClient,
				await createAddressCacheRepository(
					process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "",
					options.addressCacheEncryptionKey ?? process.env.ADDRESS_CACHE_ENCRYPTION_KEY ?? ""
				)
			)
		: options.addressEnrichmentService;
	const resolvedSourceInventory = resolveSources(coverageRepository.data.sources);

	function maxUpdatedAt(...values: Array<string | undefined>) {
		return values
			.filter((value): value is string => Boolean(value))
			.sort((left, right) => right.localeCompare(left))[0];
	}

	function resolveSource(source: Source): Source {
		return {
			...source,
			url: sourceAssetStore.resolve(source.url)
		};
	}

	function resolveSources(sources: Source[]) {
		return sources.map(resolveSource);
	}

	function getPrimaryElectionSlug() {
		return coverageRepository.data.election?.slug ?? null;
	}

	function getJurisdictionSummary(slug: string | null | undefined) {
		if (!slug)
			return coverageRepository.data.jurisdictionSummaries[0] ?? null;

		return coverageRepository.data.jurisdictionSummaries.find(item => item.slug === slug)
			?? coverageRepository.data.jurisdictionSummaries[0]
			?? null;
	}

	function buildFallbackJurisdictionSummary(election: Election): JurisdictionSummary {
		return {
			description: "Published jurisdiction details are not available for this election in the current snapshot.",
			displayName: election.locationName,
			jurisdictionType: "local",
			name: election.locationName,
			nextElectionName: election.name,
			nextElectionSlug: election.slug,
			slug: election.jurisdictionSlug,
			state: coverageRepository.data.location?.state ?? "",
			updatedAt: election.updatedAt
		};
	}

	function resolveOfficialResource(resource: OfficialResource): OfficialResource {
		return {
			...resource,
			url: sourceAssetStore.resolve(resource.url)
		};
	}

	function resolveEvidenceBlock(block: EvidenceBlock): EvidenceBlock {
		return {
			...block,
			sources: resolveSources(block.sources)
		};
	}

	function resolveVoteRecord(item: VoteRecordSummary): VoteRecordSummary {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveTrustBullet(item: TrustBullet): TrustBullet {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveFundingSummary(funding: FundingSummary): FundingSummary {
		return {
			...funding,
			sources: resolveSources(funding.sources)
		};
	}

	function resolveQuestionnaireResponse(item: QuestionnaireResponse): QuestionnaireResponse {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveMeasureChangeItem(item: MeasureChangeItem): MeasureChangeItem {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveMeasureTimelineItem(item: MeasureTimelineItem): MeasureTimelineItem {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveMeasureFiscalItem(item: MeasureFiscalItem): MeasureFiscalItem {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveMeasureArgument(item: MeasureArgument): MeasureArgument {
		return {
			...item,
			sources: resolveSources(item.sources)
		};
	}

	function resolveCandidate(candidate: Candidate): Candidate {
		return {
			...candidate,
			biography: candidate.biography.map(resolveEvidenceBlock),
			comparison: {
				...candidate.comparison,
				ballotStatus: {
					...candidate.comparison.ballotStatus,
					sources: resolveSources(candidate.comparison.ballotStatus.sources)
				},
				campaignWebsiteUrl: sourceAssetStore.resolve(candidate.comparison.campaignWebsiteUrl),
				contactChannels: candidate.comparison.contactChannels.map(channel => ({
					...channel,
					url: sourceAssetStore.resolve(channel.url)
				})),
				questionnaireResponses: candidate.comparison.questionnaireResponses.map(resolveQuestionnaireResponse),
				topPriorities: candidate.comparison.topPriorities.map(item => ({
					...item,
					sources: resolveSources(item.sources)
				})),
				whyRunning: {
					...candidate.comparison.whyRunning,
					sources: resolveSources(candidate.comparison.whyRunning.sources)
				}
			},
			funding: resolveFundingSummary(candidate.funding),
			keyActions: candidate.keyActions.map(resolveVoteRecord),
			lobbyingContext: candidate.lobbyingContext.map(resolveEvidenceBlock),
			publicStatements: candidate.publicStatements.map(resolveEvidenceBlock),
			sources: resolveSources(candidate.sources),
			whatWeDoNotKnow: candidate.whatWeDoNotKnow.map(resolveTrustBullet),
			whatWeKnow: candidate.whatWeKnow.map(resolveTrustBullet)
		};
	}

	function resolveMeasure(measure: Measure): Measure {
		return {
			...measure,
			argumentsAndConsiderations: measure.argumentsAndConsiderations.map(resolveEvidenceBlock),
			currentPractice: measure.currentPractice.map(resolveMeasureChangeItem),
			fiscalSummary: measure.fiscalSummary.map(resolveMeasureFiscalItem),
			implementationTimeline: measure.implementationTimeline.map(resolveMeasureTimelineItem),
			opposeArguments: measure.opposeArguments.map(resolveMeasureArgument),
			potentialImpacts: measure.potentialImpacts.map(resolveEvidenceBlock),
			proposedChanges: measure.proposedChanges.map(resolveMeasureChangeItem),
			sources: resolveSources(measure.sources),
			supportArguments: measure.supportArguments.map(resolveMeasureArgument),
			whatWeDoNotKnow: measure.whatWeDoNotKnow.map(resolveTrustBullet),
			whatWeKnow: measure.whatWeKnow.map(resolveTrustBullet)
		};
	}

	function resolveContest(contest: Contest): Contest {
		if (contest.type === "candidate") {
			return {
				...contest,
				candidates: (contest.candidates ?? []).map(resolveCandidate)
			};
		}

		return {
			...contest,
			measures: (contest.measures ?? []).map(resolveMeasure)
		};
	}

	function resolveElection(election: Election): Election {
		return {
			...election,
			contests: election.contests.map(resolveContest),
			officialResources: election.officialResources.map(resolveOfficialResource)
		};
	}

	async function getContentIndex() {
		const content = await adminRepository.listContent();

		return new Map(content.items.map(item => [`${item.entityType}:${item.entitySlug}`, item] as const));
	}

	async function listGuidePackageWorkflows() {
		return (await adminRepository.listGuidePackages()).packages;
	}

	async function listGuidePackageRecords() {
		const [workflows, content] = await Promise.all([
			listGuidePackageWorkflows(),
			adminRepository.listContent(),
		]);

		return workflows.map(workflow => buildGuidePackageRecord(workflow, coverageRepository, content.items));
	}

	async function getGuidePackageRecord(id: string) {
		const workflow = await adminRepository.getGuidePackage(id);

		if (!workflow)
			return null;

		const content = await adminRepository.listContent();
		return buildGuidePackageRecord(workflow, coverageRepository, content.items);
	}

	async function listPublishedGuidePackageRecords() {
		return (await listGuidePackageRecords()).filter(item => item.workflow.status === "published");
	}

	async function getPublishedGuidePackageByElectionSlug(electionSlug: string) {
		return (await listPublishedGuidePackageRecords()).find(item => item.workflow.electionSlug === electionSlug) ?? null;
	}

	async function getPublishedGuidePackageByJurisdictionSlug(jurisdictionSlug: string) {
		return (await listPublishedGuidePackageRecords()).find(item => item.workflow.jurisdictionSlug === jurisdictionSlug) ?? null;
	}

	async function listPublishedElectionSummaries() {
		const publishedPackages = await listPublishedGuidePackageRecords();
		return coverageRepository.data.electionSummaries.filter(summary =>
			publishedPackages.some(item => item.workflow.electionSlug === summary.slug));
	}

	async function listPublishedJurisdictionSummaries() {
		const publishedPackages = await listPublishedGuidePackageRecords();
		return coverageRepository.data.jurisdictionSummaries.filter(summary =>
			publishedPackages.some(item => item.workflow.jurisdictionSlug === summary.slug));
	}

	function applyCandidateContent(candidate: Candidate, contentIndex: Map<string, Awaited<ReturnType<typeof adminRepository.listContent>>["items"][number]>): Candidate | null {
		const content = contentIndex.get(`candidate:${candidate.slug}`);

		if (content && !content.published)
			return null;

		const resolvedCandidate = resolveCandidate(candidate);

		return {
			...resolvedCandidate,
			ballotSummary: content?.publicBallotSummary?.trim() || resolvedCandidate.ballotSummary,
			summary: content?.publicSummary?.trim() || resolvedCandidate.summary,
			updatedAt: maxUpdatedAt(content?.updatedAt, resolvedCandidate.updatedAt) || resolvedCandidate.updatedAt
		};
	}

	function applyMeasureContent(measure: Measure, contentIndex: Map<string, Awaited<ReturnType<typeof adminRepository.listContent>>["items"][number]>): Measure | null {
		const content = contentIndex.get(`measure:${measure.slug}`);

		if (content && !content.published)
			return null;

		const resolvedMeasure = resolveMeasure(measure);

		return {
			...resolvedMeasure,
			ballotSummary: content?.publicBallotSummary?.trim() || resolvedMeasure.ballotSummary,
			summary: content?.publicSummary?.trim() || resolvedMeasure.summary,
			updatedAt: maxUpdatedAt(content?.updatedAt, resolvedMeasure.updatedAt) || resolvedMeasure.updatedAt
		};
	}

	function applyContestContent(contest: Contest, contentIndex: Map<string, Awaited<ReturnType<typeof adminRepository.listContent>>["items"][number]>): Contest | null {
		if (contest.type === "candidate") {
			const candidates = (contest.candidates ?? [])
				.map(candidate => applyCandidateContent(candidate, contentIndex))
				.filter((candidate): candidate is Candidate => Boolean(candidate));

			if (!candidates.length)
				return null;

			return {
				...contest,
				candidates
			};
		}

		const measures = (contest.measures ?? [])
			.map(measure => applyMeasureContent(measure, contentIndex))
			.filter((measure): measure is Measure => Boolean(measure));

		if (!measures.length)
			return null;

		return {
			...contest,
			measures
		};
	}

	function applyElectionContent(election: Election, contentIndex: Map<string, Awaited<ReturnType<typeof adminRepository.listContent>>["items"][number]>): Election | null {
		const content = contentIndex.get(`election:${election.slug}`);

		if (content && !content.published)
			return null;

		const resolvedElection = resolveElection(election);
		const contests = resolvedElection.contests
			.map(contest => applyContestContent(contest, contentIndex))
			.filter((contest): contest is Contest => Boolean(contest));

		return {
			...resolvedElection,
			contests,
			description: content?.publicSummary?.trim() || resolvedElection.description,
			updatedAt: maxUpdatedAt(content?.updatedAt, resolvedElection.updatedAt) || resolvedElection.updatedAt
		};
	}

	function suppressUnverifiedContestContent(
		election: Election,
		publishedPackage: GuidePackageRecord | null,
	): Election {
		if (!publishedPackage?.contentStatus.publishedGuideShell || publishedPackage.contentStatus.verifiedContestPackage)
			return election;

		return {
			...election,
			contests: []
		};
	}

	async function listPublicCandidates() {
		const primaryElectionSlug = getPrimaryElectionSlug();

		if (!primaryElectionSlug)
			return [];

		const election = await getPublicElection(primaryElectionSlug);

		if (!election)
			return [];

		return election.contests.flatMap(contest => contest.candidates ?? []);
	}

	async function listPublicMeasures() {
		const primaryElectionSlug = getPrimaryElectionSlug();

		if (!primaryElectionSlug)
			return [];

		const election = await getPublicElection(primaryElectionSlug);

		if (!election)
			return [];

		return election.contests.flatMap(contest => contest.measures ?? []);
	}

	async function getPublicCandidate(slug: string) {
		return (await listPublicCandidates()).find(candidate => candidate.slug === slug) ?? null;
	}

	async function getPublicMeasure(slug: string) {
		return (await listPublicMeasures()).find(measure => measure.slug === slug) ?? null;
	}

	async function getPublicCandidatesBySlugs(slugs: string[]) {
		const requested = new Set(slugs);
		return (await listPublicCandidates()).filter(candidate => requested.has(candidate.slug));
	}

	async function getPublicElection(slug: string) {
		const publishedPackage = await getPublishedGuidePackageByElectionSlug(slug);

		if (!publishedPackage)
			return null;

		const election = coverageRepository.getElectionBySlug(slug);
		const contentIndex = await getContentIndex();
		const resolvedElection = election ? applyElectionContent(election, contentIndex) : null;

		return resolvedElection
			? suppressUnverifiedContestContent(resolvedElection, publishedPackage)
			: null;
	}

	async function getPublicElectionSummaries() {
		const publishedSummaries = await listPublishedElectionSummaries();
		const contentIndex = await getContentIndex();
		return publishedSummaries.filter((summary) => {
			const election = coverageRepository.getElectionBySlug(summary.slug);
			return Boolean(election && applyElectionContent(election, contentIndex));
		});
	}

	async function listPublicContests() {
		const primaryElectionSlug = getPrimaryElectionSlug();

		if (!primaryElectionSlug)
			return [];

		const election = await getPublicElection(primaryElectionSlug);
		return election?.contests ?? [];
	}

	function normalizeDirectoryAreaQuery(value: unknown) {
		const rawValue = Array.isArray(value) ? value[0] : value;

		if (typeof rawValue !== "string")
			return null;

		const normalized = toLookupSlug(rawValue);
		return normalized || null;
	}

	function directoryAreaMatchesLaunchTarget(areaSlug: string) {
		const launchTarget = coverageRepository.data.dataSources.launchTarget;
		const location = coverageRepository.data.location;
		const launchTargetValues = [
			launchTarget?.slug,
			launchTarget?.displayName,
			launchTarget?.name,
			location?.slug,
			location?.displayName,
		].map(value => value ? toLookupSlug(value) : "").filter(Boolean);

		return launchTargetValues.includes(areaSlug);
	}

	function supplementalOfficeholderMatchesDirectoryArea(record: SupplementalOfficeholderRecord, areaSlug: string | null) {
		if (!areaSlug)
			return false;

		const launchTarget = coverageRepository.data.dataSources.launchTarget;
		const normalizedLocation = toLookupSlug(record.location);
		const normalizedStateName = toLookupSlug(record.stateName);
		const normalizedStateCode = toLookupSlug(record.stateCode);

		if (directoryAreaMatchesLaunchTarget(areaSlug) && (!launchTarget?.state || toLookupSlug(launchTarget.state) === normalizedStateName))
			return true;

		if (normalizedLocation === areaSlug || normalizedLocation.includes(areaSlug) || areaSlug.includes(normalizedLocation))
			return true;

		return areaSlug === normalizedStateName
			|| areaSlug.endsWith(`-${normalizedStateName}`)
			|| areaSlug === normalizedStateCode
			|| areaSlug.endsWith(`-${normalizedStateCode}`);
	}

	function listSupplementalOfficeholdersForDirectory(areaSlug: string | null) {
		return listSupplementalOfficeholders()
			.filter(record => supplementalOfficeholderMatchesDirectoryArea(record, areaSlug));
	}

	function buildSupplementalDistrictSummariesForDirectory(areaSlug: string | null) {
		return listSupplementalOfficeholdersForDirectory(areaSlug)
			.map(record => buildPublicDistrictRecordFromSlug(record.districtSlug)?.district ?? null)
			.filter((district): district is DistrictRecordResponse["district"] => Boolean(district));
	}

	async function listPublicDistricts(areaSlug: string | null = null) {
		const primaryElectionSlug = getPrimaryElectionSlug();
		const supplementalDistricts = buildSupplementalDistrictSummariesForDirectory(areaSlug);

		if (!primaryElectionSlug)
			return uniqueBySlug(supplementalDistricts);

		const election = await getPublicElection(primaryElectionSlug);

		if (!election)
			return uniqueBySlug(supplementalDistricts);

		const guideDistricts = election.contests
			.filter(contest => contest.type === "candidate")
			.map(contest => buildDistrictSummary(contest, election));

		return uniqueBySlug([
			...guideDistricts,
			...supplementalDistricts,
		]);
	}

	async function getPublicDistrict(slug: string) {
		const primaryElectionSlug = getPrimaryElectionSlug();

		if (!primaryElectionSlug)
			return null;

		const election = await getPublicElection(primaryElectionSlug);

		if (!election)
			return null;

		const contest = election.contests.find(item => item.slug === slug && item.type === "candidate");

		if (!contest)
			return null;

		return {
			contest,
			election
		};
	}

	async function getPublicContest(slug: string) {
		const primaryElectionSlug = getPrimaryElectionSlug();

		if (!primaryElectionSlug)
			return null;

		const election = await getPublicElection(primaryElectionSlug);

		if (!election)
			return null;

		const contest = election.contests.find(item => item.slug === slug);

		if (!contest)
			return null;

		return {
			contest,
			election
		};
	}

	const publicFederalRepresentativeCache = createBoundedPromiseCache<string, PersonProfileResponse | null>({
		maxEntries: resolveBoundedCacheInteger(
			process.env.PUBLIC_REPRESENTATIVE_CACHE_MAX_ENTRIES,
			1_000,
		),
		ttlMs: resolveBoundedCacheInteger(
			process.env.PUBLIC_REPRESENTATIVE_CACHE_TTL_MS,
			15 * 60 * 1000,
		),
	});

	async function getPublicFederalRepresentative(slug: string) {
		const normalizedSlug = toLookupSlug(slug);

		if (!normalizedSlug || !congressClient)
			return null;

		return await publicFederalRepresentativeCache.getOrCreate(normalizedSlug, async () => {
			const searchName = buildSearchNameFromRepresentativeSlug(normalizedSlug);

			if (!searchName)
				return null;

			const members = await congressClient.listMembers();
			const rankedMembers = [...members]
				.map(item => ({
					item,
					score: rankDirectFederalMemberMatch(item, searchName),
				}))
				.filter(item => item.score >= 100)
				.sort((left, right) => right.score - left.score);
			const member = rankedMembers[0]?.item;

			if (!member)
				return null;

			const detail = await congressClient.getMember(member.bioguideId);

			if (!detail?.currentMember)
				return null;

			const baseProfile = buildRepresentativeProfileFromCongressMember(detail, normalizedSlug);
			const lookupContext = buildRepresentativeLookupContextFromCongressMember(detail, baseProfile.person.slug, baseProfile.updatedAt);
			return await representativeModuleResolver.enrichNationwidePersonProfile(lookupContext, baseProfile);
		});
	}

	async function listPublicRepresentatives(areaSlug: string | null = null) {
		const primaryElectionSlug = getPrimaryElectionSlug();
		const supplementalRepresentatives = listSupplementalOfficeholdersForDirectory(areaSlug)
			.map(buildSupplementalRepresentativeSummary);

		if (!primaryElectionSlug)
			return uniqueBySlug(supplementalRepresentatives);

		const election = await getPublicElection(primaryElectionSlug);

		if (!election)
			return uniqueBySlug(supplementalRepresentatives);

		const guideRepresentatives = election.contests
			.filter(contest => contest.type === "candidate")
			.flatMap(contest => (contest.candidates ?? [])
				.filter(candidate => candidate.incumbent)
				.map(candidate => ({
					...buildRepresentativeSummary(candidate),
					districtLabel: contest.office
				})));

		return uniqueBySlug([
			...guideRepresentatives,
			...supplementalRepresentatives,
		]);
	}

	async function getPublicRepresentative(slug: string) {
		const candidate = await getPublicCandidate(slug);

		if (candidate?.incumbent)
			return buildPersonProfileFromCandidate(candidate);

		const searchName = buildSearchNameFromRepresentativeSlug(slug);

		if (!searchName)
			return null;

		let representativeRecord = null;
		const supplementalOfficeholder = findSupplementalOfficeholderByRepresentativeSlug(slug);

		if (openStatesClient) {
			try {
				representativeRecord = (await openStatesClient.searchPeopleByName(searchName, {
					current: true,
					perPage: 10
				})).find(record => toLookupSlug(record.name) === toLookupSlug(slug)) ?? null;
			}
			catch (error) {
				logger.warn("provider.openstates.representative-route-lookup-failed", {
					message: error instanceof Error ? error.message : "Unknown provider error.",
					representativeSlug: slug,
					searchName,
				});
			}
		}

		if (representativeRecord) {
			const openStatesProfile = buildRepresentativeProfileFromOpenStates(representativeRecord);
			if (supplementalOfficeholder)
				return mergeRepresentativeProfileWithSupplementalOfficeholder(openStatesProfile, supplementalOfficeholder);

			const lookupContext = buildRepresentativeLookupContext(representativeRecord, openStatesProfile.person.slug, openStatesProfile.updatedAt);
			return await representativeModuleResolver.enrichNationwidePersonProfile(lookupContext, openStatesProfile);
		}

		if (supplementalOfficeholder) {
			return buildRepresentativeProfileFromSupplementalOfficeholder(supplementalOfficeholder);
		}

		try {
			const federalRepresentative = await getPublicFederalRepresentative(slug);

			if (federalRepresentative)
				return federalRepresentative;
		}
		catch (error) {
			logger.warn("provider.federal.representative-route-lookup-failed", {
				message: error instanceof Error ? error.message : "Unknown provider error.",
				representativeSlug: slug,
				searchName,
			});
		}

		return null;
	}

	function buildGuidePackageRecordResponsePayload(packageRecord: ReturnType<typeof buildGuidePackageRecord>): GuidePackageRecordResponse {
		return {
			package: resolveGuidePackageRecordAssets(packageRecord),
			updatedAt: packageRecord.workflow.updatedAt,
		};
	}

	function resolveGuidePackageRecordAssets(packageRecord: GuidePackageRecord): GuidePackageRecord {
		return {
			...packageRecord,
			attachedSources: resolveSources(packageRecord.attachedSources),
			electionRecord: packageRecord.electionRecord ? resolveElection(packageRecord.electionRecord) : null,
			jurisdictionRecord: packageRecord.jurisdictionRecord ? applyJurisdictionAssets(packageRecord.jurisdictionRecord) : null,
			officialResources: packageRecord.officialResources.map(resolveOfficialResource),
		};
	}

	function buildGuidePackageDiagnosticsPayload(packageRecord: ReturnType<typeof buildGuidePackageRecord>): GuidePackageDiagnosticsResponse {
		return {
			diagnostics: packageRecord.diagnostics,
			packageId: packageRecord.workflow.id,
			updatedAt: packageRecord.workflow.updatedAt,
		};
	}

	function parseStringArray(value: unknown, fieldLabel: string) {
		if (value === undefined)
			return undefined;

		if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== "string"))
			throw new Error(`${fieldLabel} must be an array of at most 50 text entries.`);

		const normalized = value.map(item => item.trim()).filter(Boolean);

		if (
			normalized.some(item => item.includes("\0") || item.length > 1_000)
			|| normalized.join("").length > 10_000
		) {
			throw new Error(`${fieldLabel} entries are too long.`);
		}

		return normalized;
	}

	function parseGuidePackageReviewRecommendation(value: unknown) {
		return parseOptionalEnum(
			value,
			guidePackageReviewRecommendations,
			"Guide package review recommendation"
		);
	}

	function isPublishReadyRecommendation(value: unknown) {
		return value === "publish" || value === "publish_with_warnings";
	}

	async function createGuidePackageDraft(electionSlug: string, jurisdictionSlug?: string | null) {
		const election = coverageRepository.getElectionBySlug(electionSlug);

		if (!election)
			throw new Error("Election snapshot not found for guide package generation.");

		const resolvedJurisdictionSlug = jurisdictionSlug?.trim() || election.jurisdictionSlug;
		const jurisdiction = coverageRepository.getJurisdictionBySlug(resolvedJurisdictionSlug);

		if (!jurisdiction)
			throw new Error("Jurisdiction snapshot not found for guide package generation.");

		const existingWorkflow = await adminRepository.getGuidePackage(buildGuidePackageId(election.slug));

		if (existingWorkflow)
			throw new Error("Guide package already exists for this election.");

		await adminRepository.createGuidePackage({
			coverageLimits: [
				"Final publish decision remains manual even when the package passes automated checks.",
				"Official election tools remain the authority for final ballot confirmation and polling logistics.",
			],
			coverageNotes: [
				"Draft package assembled from the current imported coverage snapshot.",
				"Contest, candidate, and measure records should still be reviewed before publish.",
			],
			electionSlug: election.slug,
			id: buildGuidePackageId(election.slug),
			jurisdictionSlug: jurisdiction.slug,
			status: "draft",
		});

		const guidePackage = await getGuidePackageRecord(buildGuidePackageId(election.slug));

		if (!guidePackage)
			throw new Error("Guide package draft could not be created.");

		return guidePackage;
	}

	function buildContestRecordResponse(contest: Contest, election: Election): ContestRecordResponse {
		const sources = collectContestSources(contest).map(resolveSource);
		const jurisdictionSummary = getJurisdictionSummary(election.jurisdictionSlug) ?? buildFallbackJurisdictionSummary(election);
		const relatedContests: ContestLinkSummary[] = election.contests
			.filter(item => item.slug !== contest.slug)
			.map(item => ({
				href: `/contest/${item.slug}`,
				jurisdiction: item.jurisdiction,
				office: item.office,
				slug: item.slug,
				title: item.title,
				type: item.type
			}));

		return {
			contest,
			election: {
				date: election.date,
				jurisdictionSlug: election.jurisdictionSlug,
				locationName: election.locationName,
				name: election.name,
				slug: election.slug,
				updatedAt: election.updatedAt
			},
			jurisdiction: jurisdictionSummary,
			note: "Contest pages are the canonical public reading surface for one office or ballot question. Use them for citations and source review, then return to the ballot guide for the full ballot context.",
			relatedContests,
			sourceCount: sources.length,
			sources,
			updatedAt: election.updatedAt
		};
	}

	function buildDistrictRecordResponse(contest: Contest, election: Election): DistrictRecordResponse {
		const sources = collectContestSources(contest).map(resolveSource);
		const representatives = (contest.candidates ?? [])
			.filter(candidate => candidate.incumbent)
			.map(candidate => ({
				...buildRepresentativeSummary(candidate),
				districtLabel: contest.office
			}));
		const relatedContests: ContestLinkSummary[] = election.contests
			.filter(item => item.slug !== contest.slug)
			.map(item => ({
				href: `/contest/${item.slug}`,
				jurisdiction: item.jurisdiction,
				office: item.office,
				slug: item.slug,
				title: item.title,
				type: item.type
			}));

		return {
			candidateAvailabilityNote: contest.candidates?.length
				? "Candidate records are attached to this district page, but some guide areas may still carry unverified contest material until local review is complete."
				: "No source-backed candidate field is attached to this district page yet.",
			candidates: contest.candidates ?? [],
			district: {
				...buildDistrictSummary(contest, election),
				description: contest.description,
				electionSlug: election.slug,
				roleGuide: contest.roleGuide
			},
			districtOriginLabel: "Published district page",
			districtOriginNote: "This district page comes from Ballot Clarity's local guide. Official election links may be current before every contest layer on the page is fully reviewed.",
			election: {
				date: election.date,
				jurisdictionSlug: election.jurisdictionSlug,
				locationName: election.locationName,
				name: election.name,
				slug: election.slug,
				updatedAt: election.updatedAt
			},
			mode: "guide",
			note: "District pages group the current representative, the upcoming contest, and the strongest available source links for one office area. Use them when you want district context without the full ballot stack.",
			officialResources: election.officialResources,
			relatedContests,
			representativeAvailabilityNote: representatives.length
				? `${representatives.length} current officeholder${representatives.length === 1 ? "" : "s"} ${representatives.length === 1 ? "is" : "are"} attached to this district page.`
				: "This published district page does not currently have an incumbent officeholder card attached.",
			representatives,
			sources,
			updatedAt: election.updatedAt
		};
	}

	function buildDistrictsResponse(districts: Awaited<ReturnType<typeof listPublicDistricts>>): DistrictsResponse {
		return {
			districts,
			mode: "guide",
			note: "District pages separate office-area context from the full ballot guide so voters can orient around one race at a time.",
			updatedAt: districts.map(district => district.updatedAt).sort((left, right) => right.localeCompare(left))[0] ?? coverageRepository.data.updatedAt
		};
	}

	function buildRepresentativesResponse(
		representatives: Awaited<ReturnType<typeof listPublicRepresentatives>>,
		districts: Awaited<ReturnType<typeof listPublicDistricts>>
	): RepresentativesResponse {
		return {
			districts,
			mode: "guide",
			note: "This directory highlights the current officials attached to this area and links to district, funding, and influence pages where those records exist.",
			representatives,
			updatedAt: representatives.map(item => item.updatedAt).sort((left, right) => right.localeCompare(left))[0] ?? coverageRepository.data.updatedAt
		};
	}

	const publishedRouteSourceDatasetCache: {
		promise: Promise<{
			citations: Map<string, SourceDirectoryItem["citedBy"]>;
			sources: Source[];
			updatedAt: string;
		}> | null;
	} = {
		promise: null,
	};

	function buildPageCitation(href: string, id: string, label: string): SourceDirectoryItem["citedBy"][number] {
		return {
			href,
			id,
			label,
			type: "page",
		};
	}

	function addPublishedRouteSources(
		sourceIndex: Map<string, Source>,
		citations: Map<string, SourceDirectoryItem["citedBy"]>,
		sources: Source[],
		citation: SourceDirectoryItem["citedBy"][number],
	) {
		for (const source of sources) {
			if (!isPublishedRouteSource(source) || !hasPublishedSourceUrl(source))
				continue;

			const existing = sourceIndex.get(source.id);

			if (!existing || existing.date.localeCompare(source.date) < 0)
				sourceIndex.set(source.id, source);

			addSourceCitation(citations, source.id, citation);
		}
	}

	async function getPublishedRouteSourceDataset() {
		if (publishedRouteSourceDatasetCache.promise)
			return await publishedRouteSourceDatasetCache.promise;

		const pending = (async () => {
			const sourceIndex = new Map<string, Source>();
			const citations = new Map<string, SourceDirectoryItem["citedBy"]>();
			const guideRepresentativeSlugs = new Set<string>();
			const supplementalDistrictSlugs = new Set<string>();
			const supplementalOfficeholders = listSupplementalOfficeholders();

			for (const representative of await listPublicRepresentatives())
				guideRepresentativeSlugs.add(representative.slug);

			for (const supplementalOfficeholder of supplementalOfficeholders)
				supplementalDistrictSlugs.add(supplementalOfficeholder.districtSlug);

			for (const districtSummary of await listPublicDistricts()) {
				const districtRecord = await getPublicDistrict(districtSummary.slug);

				if (!districtRecord)
					continue;

				const response = buildDistrictRecordResponse(districtRecord.contest, districtRecord.election);
				addPublishedRouteSources(
					sourceIndex,
					citations,
					response.sources,
					buildPageCitation(`/districts/${response.district.slug}`, response.district.slug, response.district.title),
				);
			}

			for (const districtSlug of supplementalDistrictSlugs) {
				const response = buildPublicDistrictRecordFromSlug(districtSlug);

				if (!response)
					continue;

				addPublishedRouteSources(
					sourceIndex,
					citations,
					response.sources,
					buildPageCitation(`/districts/${response.district.slug}`, response.district.slug, response.district.title),
				);
			}

			for (const supplementalOfficeholder of supplementalOfficeholders) {
				const response = buildRepresentativeProfileFromSupplementalOfficeholder(supplementalOfficeholder);
				addPublishedRouteSources(
					sourceIndex,
					citations,
					response.person.sources,
					buildPageCitation(`/representatives/${response.person.slug}`, response.person.slug, response.person.name),
				);
			}

			for (const representativeSlug of guideRepresentativeSlugs) {
				const response = await getPublicRepresentative(representativeSlug);

				if (!response)
					continue;

				addPublishedRouteSources(
					sourceIndex,
					citations,
					response.person.sources,
					buildPageCitation(`/representatives/${response.person.slug}`, response.person.slug, response.person.name),
				);

				if (response.person.funding?.sources?.length) {
					addPublishedRouteSources(
						sourceIndex,
						citations,
						response.person.funding.sources,
						buildPageCitation(
							`/representatives/${response.person.slug}/funding`,
							`${response.person.slug}:funding`,
							`${response.person.name} funding`,
						),
					);
				}

				const influenceSources = uniqueSources([
					...response.person.lobbyingContext.flatMap(block => block.sources),
					...response.person.publicStatements.flatMap(block => block.sources),
				]);

				if (influenceSources.length) {
					addPublishedRouteSources(
						sourceIndex,
						citations,
						influenceSources,
						buildPageCitation(
							`/representatives/${response.person.slug}/influence`,
							`${response.person.slug}:influence`,
							`${response.person.name} influence`,
						),
					);
				}
			}

			const sources = [...sourceIndex.values()].sort((left, right) => {
				return right.date.localeCompare(left.date) || left.title.localeCompare(right.title);
			});
			const updatedAt = sources[0]?.date || coverageRepository.data.updatedAt;

			return {
				citations,
				sources,
				updatedAt,
			};
		})().catch((error) => {
			publishedRouteSourceDatasetCache.promise = null;
			throw error;
		});

		publishedRouteSourceDatasetCache.promise = pending;
		return await pending;
	}

	function buildPublicCorrectionsResponse(corrections: Awaited<ReturnType<typeof adminRepository.listCorrections>>["corrections"]): PublicCorrectionsResponse {
		const publicCorrections = corrections.filter(item => item.status !== "new");
		const pageLookup = new Map<string, string>();

		for (const candidate of coverageRepository.data.candidates)
			pageLookup.set(`candidate:${candidate.name}`, `/candidate/${candidate.slug}`);

		for (const measure of coverageRepository.data.measures)
			pageLookup.set(`measure:${measure.title}`, `/measure/${measure.slug}`);

		pageLookup.set("policy:Privacy Policy", "/privacy");
		pageLookup.set("policy:Terms of Service", "/terms");
		pageLookup.set("policy:Methodology", "/methodology");
		pageLookup.set("policy:Neutrality policy", "/neutrality");

		return {
			corrections: publicCorrections.map(item => ({
				entityLabel: item.entityLabel,
				entityType: item.entityType,
				id: item.id,
				outcome: item.nextStep,
				pageLabel: item.entityLabel,
				pageUrl: item.pageUrl || pageLookup.get(`${item.entityType}:${item.entityLabel}`),
				priority: item.priority,
				status: item.status,
				subject: item.subject,
				submittedAt: item.submittedAt,
				summary: item.summary
			})),
			updatedAt: publicCorrections
				.map(item => item.submittedAt)
				.sort((left, right) => right.localeCompare(left))[0] ?? coverageRepository.data.updatedAt
		};
	}

	function buildCoverageSnapshotProvenance(coverageRepository: CoverageRepository): CoverageSnapshotProvenance {
		const snapshotMetadata = coverageRepository.snapshotMetadata;

		return {
			approvedAt: snapshotMetadata.approvedAt,
			configuredSnapshotMissing: coverageRepository.configuredSnapshotMissing,
			importedAt: snapshotMetadata.importedAt,
			loadedAt: coverageRepository.loadedAt,
			note: snapshotMetadata.note,
			reviewedAt: snapshotMetadata.reviewedAt,
			sourceLabel: snapshotMetadata.sourceLabel,
			sourceOrigin: snapshotMetadata.sourceOrigin,
			sourceType: snapshotMetadata.sourceType,
			status: snapshotMetadata.status
		};
	}

	function formatPublicCoveragePackageText(value: string | undefined) {
		return value
			?.replaceAll(/live coverage snapshot/gi, "live coverage package")
			.replaceAll(/local snapshot/gi, "local guide package")
			.replaceAll(/coverage snapshot/gi, "coverage package")
			.replaceAll(/\bsnapshot\b/gi, "package");
	}

	function buildSnapshotStatusNotes(
		snapshotProvenance: CoverageSnapshotProvenance,
		coverageMode: CoverageRepository["mode"]
	) {
		if (coverageMode === "empty") {
			return uniqueStrings([
				snapshotProvenance.configuredSnapshotMissing
					? "Configured live coverage package is missing, so Ballot Clarity is serving lookup results without a published local guide package."
					: "No published local guide package is active right now.",
				formatPublicCoveragePackageText(snapshotProvenance.note)
			]);
		}

		return uniqueStrings([
			`Active coverage package status: ${snapshotProvenance.status.replaceAll("_", " ")} (${formatPublicCoveragePackageText(snapshotProvenance.sourceLabel)}).`,
			formatPublicCoveragePackageText(snapshotProvenance.note)
		]);
	}

	function buildPublicStatusResponse(
		sources: Awaited<ReturnType<typeof adminRepository.listSourceMonitor>>["sources"],
		overview: Awaited<ReturnType<typeof adminRepository.getOverview>>
	): PublicStatusResponse {
		const snapshotProvenance = buildCoverageSnapshotProvenance(coverageRepository);

		if (coverageRepository.mode === "empty") {
			return {
				coverageMode: coverageRepository.mode,
				coverageUpdatedAt: coverageRepository.data.updatedAt,
				incidents: [],
				notes: uniqueStrings([
					...buildSnapshotStatusNotes(snapshotProvenance, coverageRepository.mode),
					"Lookup results are available across the public site.",
					"Local guide publication status remains generic until a verified local guide package is published."
				]),
				overallStatus: "reviewing",
				snapshotProvenance,
				sourceSummary: {
					"healthy": 0,
					"incident": 0,
					"review-soon": 0,
					"stale": 0
				},
				sources: [],
				updatedAt: new Date().toISOString()
			};
		}

		const sourceSummary = {
			"healthy": sources.filter(source => source.health === "healthy").length,
			"incident": sources.filter(source => source.health === "incident").length,
			"review-soon": sources.filter(source => source.health === "review-soon").length,
			"stale": sources.filter(source => source.health === "stale").length
		};
		let overallStatus: PublicStatusResponse["overallStatus"] = "healthy";

		if (sourceSummary.incident)
			overallStatus = "degraded";
		else if (sourceSummary["review-soon"] || sourceSummary.stale)
			overallStatus = "reviewing";

		const nextPublishWindow = overview.metrics.find(metric => metric.id === "next-publish")?.value;
		const snapshotSummaryNote = snapshotProvenance.status === "production_approved"
			? "Public pages are serving a production-approved coverage package."
			: snapshotProvenance.status === "reviewed"
				? "Public pages are serving a reviewed coverage package that is not yet marked production-approved."
				: snapshotProvenance.status === "seed"
					? "Public pages are serving a seed coverage package. Treat guide pages as staged until a reviewed local guide package replaces it."
					: "Public pages are serving an unclassified coverage package.";
		const notes = uniqueStrings([
			...buildSnapshotStatusNotes(snapshotProvenance, coverageRepository.mode),
			...overview.needsAttention,
			snapshotSummaryNote
		]);

		return {
			coverageMode: coverageRepository.mode,
			coverageUpdatedAt: coverageRepository.data.updatedAt,
			incidents: sources
				.filter(source => source.health !== "healthy")
				.map(source => ({
					id: source.id,
					summary: source.note,
					title: source.label
				})),
			nextPublishWindow,
			nextReviewAt: sources
				.map(source => source.nextCheckAt)
				.sort((left, right) => left.localeCompare(right))[0],
			notes,
			overallStatus,
			snapshotProvenance,
			sourceSummary,
			sources,
			updatedAt: new Date().toISOString()
		};
	}

	function applyJurisdictionAssets(jurisdiction: Jurisdiction): Jurisdiction {
		return {
			...jurisdiction,
			archivedGuides: jurisdiction.archivedGuides.map(guide => ({
				...guide,
				href: sourceAssetStore.resolve(guide.href)
			})),
			officialOffice: {
				...jurisdiction.officialOffice,
				website: sourceAssetStore.resolve(jurisdiction.officialOffice.website)
			},
			officialResources: jurisdiction.officialResources.map(resolveOfficialResource),
			votingMethods: jurisdiction.votingMethods.map(method => ({
				...method,
				officialResource: method.officialResource ? resolveOfficialResource(method.officialResource) : undefined
			}))
		};
	}

	async function resolveLocationLookup(raw: string, requestId?: string, selectionId?: string) {
		const publishedPrimaryPackage = coverageRepository.data.election
			? await getPublishedGuidePackageByElectionSlug(coverageRepository.data.election.slug)
			: null;
		const publishedJurisdictionSummaries = await listPublishedJurisdictionSummaries();
		const coverage = buildCoverageResponse(
			coverageRepository.mode,
			coverageRepository.data.updatedAt,
			locationGuessService.publicConfig,
			publishedPrimaryPackage ? coverageRepository.data.dataSources.launchTarget : undefined,
			publishedPrimaryPackage?.contentStatus ?? null,
			buildCoverageSnapshotProvenance(coverageRepository)
		);

		let officialLookup = null;
		let addressEnrichment = null;
		let geoContext = null;
		let selectionOptions: LocationLookupSelectionOption[] | undefined;

		if (classifyLookupInput(raw) === "address") {
			if (addressEnrichmentService) {
				try {
					addressEnrichment = await addressEnrichmentService.lookupAddress(raw);

					if (addressEnrichment) {
						addressEnrichment.representativeMatches = await augmentRepresentativeMatchesForLookup(
							congressClient,
							addressEnrichment.state || "",
							addressEnrichment.districtMatches,
							addressEnrichment.representativeMatches,
						);
						geoContext = {
							countyFips: addressEnrichment.countyFips,
							normalizedAddress: addressEnrichment.normalizedAddress,
							postalCode: addressEnrichment.zip5,
							sourceSystem: "U.S. Census Geocoder",
							stateAbbreviation: addressEnrichment.state
						};
					}
					else {
						geoContext = null;
					}
				}
				catch (error) {
					logger.warn("provider.census-openstates.lookup-failed", {
						message: error instanceof Error ? error.message : "Unknown provider error.",
						requestId
					});
				}
			}

			if (googleCivicClient) {
				try {
					officialLookup = await googleCivicClient.lookupVoterInfo(raw);
				}
				catch (error) {
					logger.warn("provider.google-civic.lookup-failed", {
						message: error instanceof Error ? error.message : "Unknown provider error.",
						requestId
					});
				}
			}
		}
		else if (zipLocationService) {
			try {
				const zipLookup = await zipLocationService.lookupZip(raw);

				if (zipLookup) {
					const resolvedZipMatches = await Promise.all(zipLookup.matches.map(async match => ({
						...match,
						representativeMatches: await augmentRepresentativeMatchesForLookup(
							congressClient,
							match.stateAbbreviation || "",
							match.districtMatches,
							match.representativeMatches,
						),
					})));
					const selectedZipMatch = selectionId
						? resolvedZipMatches.find(match => match.id === selectionId) ?? null
						: resolvedZipMatches.length === 1
							? resolvedZipMatches[0]
							: null;

					if (selectedZipMatch) {
						addressEnrichment = {
							benchmark: "ZIP_CENTROID",
							countyFips: selectedZipMatch.countyFips,
							districtMatches: selectedZipMatch.districtMatches,
							fromCache: false,
							latitude: selectedZipMatch.latitude,
							longitude: selectedZipMatch.longitude,
							normalizedAddress: selectedZipMatch.postalCode,
							representativeMatches: selectedZipMatch.representativeMatches,
							state: selectedZipMatch.stateAbbreviation,
							vintage: "ZIP_CENTROID",
							zip5: selectedZipMatch.postalCode
						};
						geoContext = {
							countyFips: selectedZipMatch.countyFips,
							countyName: selectedZipMatch.countyName,
							locality: selectedZipMatch.locality,
							postalCode: selectedZipMatch.postalCode,
							sourceSystem: selectedZipMatch.sourceSystem,
							stateAbbreviation: selectedZipMatch.stateAbbreviation,
							stateName: selectedZipMatch.stateName
						};
					}
					else if (resolvedZipMatches[0]) {
						const fallbackZipMatch = resolvedZipMatches[0];

						geoContext = {
							countyFips: fallbackZipMatch.countyFips,
							countyName: fallbackZipMatch.countyName,
							locality: fallbackZipMatch.locality,
							postalCode: fallbackZipMatch.postalCode,
							sourceSystem: fallbackZipMatch.sourceSystem,
							stateAbbreviation: fallbackZipMatch.stateAbbreviation,
							stateName: fallbackZipMatch.stateName
						};
						selectionOptions = resolvedZipMatches.map(match => buildZipSelectionOption(
							match,
							publishedJurisdictionSummaries
						));
					}
				}
				else {
					geoContext = null;
				}
			}
			catch (error) {
				logger.warn("provider.zip-lookup.lookup-failed", {
					message: error instanceof Error ? error.message : "Unknown provider error.",
					requestId
				});
			}
		}

		const lookupResponse = buildLocationLookupResponse(
			raw,
			publishedPrimaryPackage ? coverageRepository.data.jurisdiction : null,
			publishedJurisdictionSummaries,
			publishedPrimaryPackage ? coverageRepository.data.location : null,
			publishedPrimaryPackage?.workflow.electionSlug,
			coverageRepository.mode,
			coverage,
			geoContext,
			officialLookup,
			addressEnrichment,
			selectionOptions,
			selectionId,
			publishedPrimaryPackage?.contentStatus ?? null,
		);

		const activeLookupContext = buildActiveNationwideLookupContext(lookupResponse);

		if (lookupResponse.result === "resolved" && lookupResponse.availability && activeLookupContext) {
			const financeInfluenceAvailability = await representativeModuleResolver.enrichLocationFinanceInfluenceAvailability(
				activeLookupContext,
				lookupResponse.availability.financeInfluence.detail,
				lookupResponse.availability.financeInfluence.status
			);

			lookupResponse.availability.financeInfluence = {
				...lookupResponse.availability.financeInfluence,
				detail: financeInfluenceAvailability.detail,
				status: financeInfluenceAvailability.status,
			};
		}

		return lookupResponse;
	}

	async function resolveActiveNationwideLookup(request: express.Request, response: express.Response) {
		const routeLookup = typeof request.query.lookup === "string" ? request.query.lookup.trim() : "";
		const routeSelectionId = typeof request.query.selection === "string" ? request.query.selection.trim() : "";

		if (routeLookup) {
			if (!exactZipLookupPattern.test(routeLookup)) {
				response.status(400).json({
					message: "Only an exact 5-digit ZIP code may be included in a page URL. Submit street addresses through the lookup form."
				});
				return null;
			}

			if (routeSelectionId && !routeSelectionIdPattern.test(routeSelectionId)) {
				response.status(400).json({
					message: "The selected ZIP area identifier is invalid."
				});
				return null;
			}

			const throttleState = publicLookupThrottle.attempt(buildPublicThrottleKey(request));

			if (!throttleState.allowed) {
				logger.warn("location.route_lookup.throttled", {
					requestId: response.locals.requestId,
					retryAfterSeconds: throttleState.retryAfterSeconds
				});
				response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
				response.status(429).json({
					message: "Too many civic lookup requests from this connection. Try again later.",
					retryAfterSeconds: throttleState.retryAfterSeconds
				});
				return null;
			}

			const lookupResponse = await resolveLocationLookup(routeLookup, response.locals.requestId, routeSelectionId || undefined);
			const activeLookupContext = buildActiveNationwideLookupContext(lookupResponse);
			const activeLookupCookie = buildActiveNationwideLookupCookie(lookupResponse, activeLookupCookieSecret);

			if (activeLookupCookie)
				persistActiveNationwideLookupCookie(response, activeLookupCookie);

			return activeLookupContext;
		}

		const activeLookupContext = readActiveNationwideLookupContext(
			request.header("cookie"),
			activeLookupCookieSecret
		);

		if (!activeLookupContext)
			return null;

		const throttleState = publicLookupThrottle.attempt(buildPublicThrottleKey(request));

		if (!throttleState.allowed) {
			logger.warn("location.saved_lookup.throttled", {
				requestId: response.locals.requestId,
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
			response.status(429).json({
				message: "Too many civic lookup requests from this connection. Try again later.",
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			return null;
		}

		return activeLookupContext;
	}

	const trustProxy = parseTrustProxySetting(options.trustProxy ?? process.env.TRUST_PROXY);

	if (trustProxy)
		app.set("trust proxy", trustProxy);

	app.use((_request, response, next) => {
		for (const [header, value] of Object.entries(securityHeaders))
			response.setHeader(header, value);

		next();
	});

	app.use(cors({
		credentials: true,
		origin: createCorsOriginResolver()
	}));

	app.use(express.json({
		limit: "64kb",
		strict: true
	}));
	app.use(createRequestLoggingMiddleware(logger));
	const snapshotProvenance = buildCoverageSnapshotProvenance(coverageRepository);
	logger.info("coverage.loaded", {
		assetMode: sourceAssetStore.mode,
		coverageMode: coverageRepository.mode,
		coverageUpdatedAt: coverageRepository.data.updatedAt,
		configuredSnapshotMissing: coverageRepository.configuredSnapshotMissing,
		configuredSnapshotPath: coverageRepository.configuredSnapshotPath,
		loadedAt: coverageRepository.loadedAt,
		snapshotPath: coverageRepository.mode === "snapshot" ? coverageRepository.snapshotPath : undefined,
		snapshotSourceLabel: snapshotProvenance.sourceLabel,
		snapshotStatus: snapshotProvenance.status
	});

	if (coverageRepository.configuredSnapshotMissing) {
		logger.warn("coverage.snapshot_missing", {
			configuredSnapshotPath: coverageRepository.configuredSnapshotPath,
			loadedAt: coverageRepository.loadedAt
		});
	}
	else if (coverageRepository.mode === "snapshot" && snapshotProvenance.status !== "production_approved") {
		logger.warn("coverage.snapshot_not_production_approved", {
			snapshotPath: coverageRepository.snapshotPath,
			snapshotSourceLabel: snapshotProvenance.sourceLabel,
			snapshotStatus: snapshotProvenance.status
		});
	}

	app.use("/api/admin", (_request, response, next) => {
		response.setHeader("Cache-Control", "no-store, private");
		next();
	});

	app.get("/health", async (_request, response) => {
		try {
			await adminRepository.getHealth();
			const healthSnapshotProvenance = buildCoverageSnapshotProvenance(coverageRepository);
			const healthySnapshot = !coverageRepository.configuredSnapshotMissing;

			response.status(healthySnapshot ? 200 : 503).json({
				assetMode: sourceAssetStore.mode,
				coverageMode: coverageRepository.mode,
				coverageUpdatedAt: coverageRepository.data.updatedAt,
				driver: adminRepository.driver,
				message: healthySnapshot ? undefined : "Configured live coverage package is missing.",
				ok: healthySnapshot,
				ballotContentProviderSummary: buildBallotContentProviderSummary(),
				providerSummary: buildProviderSummary(),
				ready: healthySnapshot,
				snapshotProvenance: healthSnapshotProvenance,
				timestamp: new Date().toISOString()
			});
		}
		catch (error) {
			logger.error("health.dependency_failed", {
				error: error instanceof Error ? error.message : "Admin repository health check failed."
			});
			response.status(503).json({
				assetMode: sourceAssetStore.mode,
				coverageMode: coverageRepository.mode,
				coverageUpdatedAt: coverageRepository.data.updatedAt,
				driver: adminRepository.driver,
				message: "Dependency health check failed.",
				ok: false,
				ballotContentProviderSummary: buildBallotContentProviderSummary(),
				providerSummary: buildProviderSummary(),
				ready: false,
				snapshotProvenance: buildCoverageSnapshotProvenance(coverageRepository),
				timestamp: new Date().toISOString()
			});
		}
	});

	app.post("/api/admin/auth/login", async (request, response) => {
		if (!adminApiKey) {
			response.status(503).json({
				message: "Admin API is not configured on this server."
			});
			return;
		}

		if (!isAuthorizedAdminRequest(request.header("x-admin-api-key"), adminApiKey)) {
			response.status(401).json({
				message: "Unauthorized admin request."
			});
			return;
		}

		let username: string;
		let password: string;
		let mfaCode: string;

		try {
			username = parseAdminUsername(request.body?.username);
			password = parseAdminPassword(request.body?.password, "Admin password");
			mfaCode = parseAdminMfaCode(request.body?.mfaCode);
		}
		catch {
			response.status(400).json({
				message: "Invalid admin login request."
			});
			return;
		}

		const clientIp = buildPublicThrottleKey(request);
		const throttleState = adminLoginThrottle.check(username, clientIp);

		if (!await adminRepository.hasUsers()) {
			response.status(503).json({
				message: "No admin users are configured yet. Set bootstrap credentials or create the first admin account."
			});
			return;
		}

		if (!throttleState.allowed) {
			logger.warn("admin.login.throttled", {
				ip: clientIp,
				requestId: response.locals.requestId,
				retryAfterSeconds: throttleState.retryAfterSeconds,
				username
			});
			response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
			response.status(429).json({
				message: "Too many failed admin login attempts. Try again later.",
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			return;
		}

		const user = await adminRepository.authenticateUser(username, password);

		if (!user) {
			adminLoginThrottle.recordFailure(throttleState.keys);
			logger.warn("admin.login.failed", {
				ip: clientIp,
				requestId: response.locals.requestId,
				username
			});
			response.status(401).json({
				message: "Invalid admin credentials."
			});
			return;
		}

		if (user.mfaEnabledAt && !mfaCode) {
			response.json({
				authenticated: false,
				configured: true,
				displayName: null,
				mfaRequired: true,
				role: null,
				username: null
			});
			return;
		}

		if (user.mfaEnabledAt && !await adminRepository.verifyUserMfaCode(user.id, mfaCode)) {
			adminLoginThrottle.recordFailure(throttleState.keys);
			logger.warn("admin.login.mfa_failed", {
				requestId: response.locals.requestId,
				username: user.username
			});
			response.status(401).json({
				message: "Invalid admin verification code."
			});
			return;
		}

		adminLoginThrottle.clear(throttleState.accountKey);
		logger.info("admin.login.succeeded", {
			requestId: response.locals.requestId,
			role: user.role,
			username: user.username
		});

		response.json(buildAdminSessionResponse(user));
	});

	app.use("/api/admin", (request, response, next) => {
		if (!adminApiKey) {
			response.status(503).json({
				message: "Admin API is not configured on this server."
			});
			return;
		}

		const requestKey = request.header("x-admin-api-key");

		if (!isAuthorizedAdminRequest(requestKey, adminApiKey)) {
			response.status(401).json({
				message: "Unauthorized admin request."
			});
			return;
		}

		next();
	});

	app.get("/api/admin/auth/session/:username", async (request, response) => {
		let username: string;
		let credentialsUpdatedAt: string;

		try {
			username = parseAdminUsername(request.params.username);
			credentialsUpdatedAt = parseOptionalTimestamp(
				request.query.credentialsUpdatedAt,
				"Admin credential timestamp"
			) ?? "";

			if (!credentialsUpdatedAt)
				throw new Error("Admin credential timestamp is required.");
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Invalid admin session validation request."
			});
			return;
		}

		const users = await adminRepository.listUsers();
		const user = users.users.find(item => item.username === username);

		if (!user || user.disabledAt || !user.credentialsUpdatedAt || user.credentialsUpdatedAt !== credentialsUpdatedAt) {
			response.status(401).json({
				authenticated: false,
				configured: true,
				displayName: null,
				role: null,
				username: null
			});
			return;
		}

		response.json({
			authenticated: true,
			configured: true,
			credentialsUpdatedAt: user.credentialsUpdatedAt,
			displayName: user.displayName,
			mfaEnabledAt: user.mfaEnabledAt,
			passwordChangeRequiredAt: user.passwordChangeRequiredAt,
			role: user.role,
			username: user.username
		});
	});

	app.use("/api/admin", async (request, response, next) => {
		if (!adminSessionSecret) {
			if (!options.allowLegacyAdminActorHeadersForTesting) {
				response.status(503).json({
					message: "Admin session delegation is not configured on this server."
				});
				return;
			}

			response.locals.adminActor = buildLegacyAdminAuditActor(request) || {
				displayName: "Development API key",
				role: "admin",
				username: "development-api-key"
			} satisfies AdminAuditActor;
			response.locals.adminMfaVerified = true;
			next();
			return;
		}

		const token = parseAdminSessionToken(request.header("x-admin-session-token"), adminSessionSecret);

		if (!token) {
			response.status(401).json({
				message: "Active admin session delegation required."
			});
			return;
		}

		const users = await adminRepository.listUsers();
		const user = users.users.find(item => item.username === token.username);

		if (
			!user
			|| user.disabledAt
			|| user.credentialsUpdatedAt !== token.credentialsUpdatedAt
			|| user.displayName !== token.displayName
			|| user.mfaEnabledAt !== token.mfaEnabledAt
			|| user.passwordChangeRequiredAt !== token.passwordChangeRequiredAt
			|| user.role !== token.role
		) {
			response.status(401).json({
				message: "Admin session delegation is no longer valid."
			});
			return;
		}

		response.locals.adminActor = {
			displayName: user.displayName,
			role: user.role,
			username: user.username
		} satisfies AdminAuditActor;
		response.locals.adminMfaVerified = Boolean(user.mfaEnabledAt);

		if (
			user.passwordChangeRequiredAt
			&& request.method !== "GET"
			&& !(request.method === "POST" && request.path === "/auth/password")
		) {
			response.status(403).json({
				message: "Password change required before performing other admin actions."
			});
			return;
		}

		next();
	});

	app.post("/api/admin/auth/password", async (request, response) => {
		let username: string;
		let currentPassword: string;
		let newPassword: string;

		try {
			username = parseAdminUsername(request.body?.username);
			currentPassword = parseAdminPassword(request.body?.currentPassword, "Current password");
			newPassword = parseAdminPassword(request.body?.newPassword, "New password");
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Invalid admin password request."
			});
			return;
		}

		if (!requireSelfServiceActor(response, username))
			return;

		const throttleState = checkAdminVerificationAttempt(request, response, username, "password_change");

		if (!throttleState)
			return;

		const user = await adminRepository.authenticateUser(username, currentPassword);

		if (!user) {
			recordAdminVerificationFailure(request, response, username, "password_change", throttleState);
			response.status(401).json({
				message: "Current password was not accepted."
			});
			return;
		}

		try {
			const users = await adminRepository.updateUser(user.id, {
				auditActor: getAdminAuditActor(response) || {
					displayName: user.displayName,
					role: user.role,
					username: user.username
				},
				password: newPassword,
				passwordChangeMode: "self-service"
			});
			const updatedUser = users.users.find(item => item.id === user.id);

			if (!updatedUser?.credentialsUpdatedAt) {
				response.status(500).json({
					message: "Password changed, but the updated session metadata could not be loaded."
				});
				return;
			}

			adminLoginThrottle.clear(throttleState.accountKey);
			response.json(buildAdminSessionResponse(updatedUser));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to change admin password."
			});
		}
	});

	app.post("/api/admin/auth/mfa/setup", async (request, response) => {
		try {
			const username = parseAdminUsername(request.body?.username);

			if (!requireSelfServiceActor(response, username))
				return;

			response.json(await adminRepository.createMfaSetup(username));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to start admin MFA setup."
			});
		}
	});

	app.post("/api/admin/auth/mfa/enable", async (request, response) => {
		let username: string;
		let currentPassword: string;
		let secret: string;
		let mfaCode: string;

		try {
			username = parseAdminUsername(request.body?.username);
			currentPassword = parseAdminPassword(request.body?.currentPassword, "Current password");
			secret = parseAdminMfaSecret(request.body?.secret);
			mfaCode = parseAdminMfaCode(request.body?.mfaCode, { required: true });
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to enable admin MFA."
			});
			return;
		}

		if (!requireSelfServiceActor(response, username))
			return;

		const throttleState = checkAdminVerificationAttempt(request, response, username, "mfa_enable");

		if (!throttleState)
			return;

		try {
			const user = await adminRepository.enableMfa(username, currentPassword, secret, mfaCode, getAdminAuditActor(response));

			adminLoginThrottle.clear(throttleState.accountKey);
			response.json(buildAdminSessionResponse(user));
		}
		catch (error) {
			if (isAdminCredentialVerificationError(error))
				recordAdminVerificationFailure(request, response, username, "mfa_enable", throttleState);

			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to enable admin MFA."
			});
		}
	});

	app.post("/api/admin/auth/mfa/disable", async (request, response) => {
		let username: string;
		let currentPassword: string;
		let mfaCode: string;

		try {
			username = parseAdminUsername(request.body?.username);
			currentPassword = parseAdminPassword(request.body?.currentPassword, "Current password");
			mfaCode = parseAdminMfaCode(request.body?.mfaCode, { required: true });
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to disable admin MFA."
			});
			return;
		}

		if (!requireSelfServiceActor(response, username))
			return;

		const throttleState = checkAdminVerificationAttempt(request, response, username, "mfa_disable");

		if (!throttleState)
			return;

		try {
			const user = await adminRepository.disableMfa(username, currentPassword, mfaCode, getAdminAuditActor(response));

			adminLoginThrottle.clear(throttleState.accountKey);
			response.json(buildAdminSessionResponse(user));
		}
		catch (error) {
			if (isAdminCredentialVerificationError(error))
				recordAdminVerificationFailure(request, response, username, "mfa_disable", throttleState);

			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to disable admin MFA."
			});
		}
	});

	app.post("/api/location", async (request, response) => {
		const raw = typeof request.body?.q === "string" ? request.body.q.trim() : "";
		const selectionId = typeof request.body?.selectionId === "string" ? request.body.selectionId.trim() : "";

		response.set("Cache-Control", "no-store");

		const validationError = validateLookupInput(raw);

		if (validationError || (selectionId && !routeSelectionIdPattern.test(selectionId))) {
			response.status(400).json({
				message: validationError || "The selected ZIP area identifier is invalid."
			});
			return;
		}

		const throttleState = publicLookupThrottle.attempt(buildPublicThrottleKey(request));

		if (!throttleState.allowed) {
			logger.warn("location.lookup.throttled", {
				requestId: response.locals.requestId,
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
			response.status(429).json({
				message: "Too many civic lookup requests from this connection. Try again later.",
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			return;
		}

		const lookupResponse = await resolveLocationLookup(raw, response.locals.requestId, selectionId || undefined);

		await zipLookupLogger.record(raw, lookupResponse);

		const activeLookupCookie = buildActiveNationwideLookupCookie(lookupResponse, activeLookupCookieSecret);

		if (activeLookupCookie)
			persistActiveNationwideLookupCookie(response, activeLookupCookie);
		else
			clearActiveNationwideLookupCookie(response);

		response.json(lookupResponse);
	});

	app.get("/api/location/active", (request, response) => {
		response.set("Cache-Control", "no-store");
		const activeLookup = readActiveNationwideLookupContext(
			request.header("cookie"),
			activeLookupCookieSecret
		);

		response.json(activeLookup ? buildActiveNationwideLookupResponse(activeLookup) : null);
	});

	app.get("/api/location/guess", async (request, response) => {
		const guess = locationGuessService.buildGuess(request);

		response.set("Cache-Control", "no-store");
		if (locationGuessService.varyHeaders.length)
			response.set("Vary", locationGuessService.varyHeaders.join(", "));

		if (!guess) {
			response.status(404).json({
				message: locationGuessService.publicConfig.canGuessOnLoad
					? "Automatic location guessing is not available for this request."
					: "Automatic location guessing is not configured for this host."
			});
			return;
		}

		if (validateLookupInput(guess.rawQuery)) {
			response.status(404).json({
				message: "Automatic location guessing is not available for this request."
			});
			return;
		}

		const throttleState = publicLookupThrottle.attempt(buildPublicThrottleKey(request));

		if (!throttleState.allowed) {
			logger.warn("location.guess.throttled", {
				requestId: response.locals.requestId,
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
			response.status(429).json({
				message: "Too many civic lookup requests from this connection. Try again later.",
				retryAfterSeconds: throttleState.retryAfterSeconds
			});
			return;
		}

		const lookupResponse = await resolveLocationLookup(guess.rawQuery, response.locals.requestId);

		if (lookupResponse.result !== "resolved") {
			response.status(404).json({
				message: "IP-based location guess did not resolve to civic results for this request."
			});
			return;
		}

		const guessedLookupResponse = {
			...lookupResponse,
			detectedFromIp: true,
			note: `${buildLocationGuessNotePrefix(guess)} ${lookupResponse.note}`.trim()
		};
		const activeLookupCookie = buildActiveNationwideLookupCookie(guessedLookupResponse, activeLookupCookieSecret);

		if (activeLookupCookie)
			persistActiveNationwideLookupCookie(response, activeLookupCookie);
		else
			clearActiveNationwideLookupCookie(response);

		response.json(guessedLookupResponse);
	});

	app.post("/api/feedback", async (request, response) => {
		try {
			const throttleState = publicFeedbackThrottle.attempt(buildPublicThrottleKey(request));

			if (!throttleState.allowed) {
				logger.warn("feedback.submission.throttled", {
					requestId: response.locals.requestId,
					retryAfterSeconds: throttleState.retryAfterSeconds
				});
				response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
				response.status(429).json({
					message: "Too many public contact submissions from this connection. Try again later.",
					retryAfterSeconds: throttleState.retryAfterSeconds
				});
				return;
			}

			const result = await adminRepository.createCorrectionSubmission(
				normalizeCorrectionSubmission(request.body ?? {})
			);

			response.status(201).json(result);
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to submit feedback."
			});
		}
	});

	app.get("/api/elections", async (_request, response) => {
		response.json({
			elections: await getPublicElectionSummaries()
		});
	});

	app.get("/api/jurisdictions", async (_request, response) => {
		response.json({
			jurisdictions: await listPublishedJurisdictionSummaries()
		});
	});

	app.get("/api/data-sources", (_request, response) => {
		response.json({
			...coverageRepository.data.dataSources,
			assetMode: sourceAssetStore.mode,
			ballotContentProviders: getPublicBallotContentProviderOptions(),
			coverageMode: coverageRepository.mode,
			sourceAssetBaseUrl: sourceAssetStore.baseUrl
		});
	});

	app.get("/api/coverage", async (_request, response) => {
		const publishedPrimaryPackage = coverageRepository.data.election
			? await getPublishedGuidePackageByElectionSlug(coverageRepository.data.election.slug)
			: null;
		const payload: CoverageResponse = buildCoverageResponse(
			coverageRepository.mode,
			coverageRepository.data.updatedAt,
			locationGuessService.publicConfig,
			publishedPrimaryPackage ? coverageRepository.data.dataSources.launchTarget : undefined,
			publishedPrimaryPackage?.contentStatus ?? null,
			buildCoverageSnapshotProvenance(coverageRepository)
		);
		response.json(payload);
	});

	app.get("/api/status", async (_request, response) => {
		response.json(buildPublicStatusResponse(
			(await adminRepository.listSourceMonitor()).sources,
			await adminRepository.getOverview()
		));
	});

	app.get("/api/corrections", async (_request, response) => {
		response.json(buildPublicCorrectionsResponse((await adminRepository.listCorrections()).corrections));
	});

	app.get("/api/search", async (request, response) => {
		const query = typeof request.query.q === "string" ? request.query.q : "";

		if (query.length > 200 || containsControlCharacters(query)) {
			response.status(400).json({
				message: "Search query must be a single line with 200 characters or fewer."
			});
			return;
		}

		const primaryElectionSlug = getPrimaryElectionSlug();
		const election = primaryElectionSlug ? await getPublicElection(primaryElectionSlug) : null;
		const candidates = await listPublicCandidates();
		const measures = await listPublicMeasures();
		const contests = await listPublicContests();
		const sourceDirectory = buildSourceDirectory(
			candidates,
			measures,
			contests,
			resolvedSourceInventory,
			new Map<string, SourceDirectoryItem["citedBy"]>(),
			coverageRepository.data.location?.displayName ?? null,
			coverageRepository.data.updatedAt
		);
		const districts = await listPublicDistricts();

		response.json(buildSearchResponse(
			query,
			candidates,
			measures,
			contests,
			election,
			election ? coverageRepository.data.jurisdiction : null,
			sourceDirectory,
			districts
		));
	});

	app.get("/api/sources", async (_request, response) => {
		const candidates = await listPublicCandidates();
		const measures = await listPublicMeasures();
		const contests = await listPublicContests();
		const publishedRouteSourceDataset = await getPublishedRouteSourceDataset();
		const publishedSourceInventory = uniqueSources([
			...resolvedSourceInventory,
			...publishedRouteSourceDataset.sources,
		]);

		response.json({
			sources: buildSourceDirectory(
				candidates,
				measures,
				contests,
				publishedSourceInventory,
				publishedRouteSourceDataset.citations,
				coverageRepository.data.location?.displayName ?? null,
				maxUpdatedAt(coverageRepository.data.updatedAt, publishedRouteSourceDataset.updatedAt) || coverageRepository.data.updatedAt
			),
			updatedAt: maxUpdatedAt(coverageRepository.data.updatedAt, publishedRouteSourceDataset.updatedAt) || coverageRepository.data.updatedAt
		});
	});

	app.get("/api/sources/:id", async (request, response) => {
		const publishedRouteSourceDataset = await getPublishedRouteSourceDataset();
		const publishedSourceInventory = uniqueSources([
			...resolvedSourceInventory,
			...publishedRouteSourceDataset.sources,
		]);
		const record = buildSourceRecord(
			request.params.id,
			await listPublicCandidates(),
			await listPublicMeasures(),
			await listPublicContests(),
			publishedSourceInventory,
			publishedRouteSourceDataset.citations,
			coverageRepository.data.location?.displayName ?? null,
			maxUpdatedAt(coverageRepository.data.updatedAt, publishedRouteSourceDataset.updatedAt) || coverageRepository.data.updatedAt
		);

		if (!record) {
			response.status(404).json({
				message: "Source record not found."
			});
			return;
		}

		response.json(record);
	});

	app.get("/api/districts", async (request, response) => {
		const activeNationwideLookup = await resolveActiveNationwideLookup(request, response);

		if (response.headersSent)
			return;

		if (activeNationwideLookup) {
			response.json(buildNationwideDistrictsResponse(activeNationwideLookup));
			return;
		}

		response.json(buildDistrictsResponse(await listPublicDistricts(normalizeDirectoryAreaQuery(request.query.area))));
	});

	app.get("/api/districts/:slug", async (request, response) => {
		const activeNationwideLookup = await resolveActiveNationwideLookup(request, response);

		if (response.headersSent)
			return;

		if (activeNationwideLookup) {
			const nationwideDistrict = buildNationwideDistrictRecordResponse(activeNationwideLookup, request.params.slug);

			if (nationwideDistrict) {
				response.json({
					...nationwideDistrict,
					representatives: await representativeModuleResolver.enrichNationwideDistrictRepresentatives(
						activeNationwideLookup,
						nationwideDistrict.representatives
					),
				});
				return;
			}
		}

		const result = await getPublicDistrict(request.params.slug);

		if (!result) {
			response.json(buildPublicDistrictRecordFromSlug(request.params.slug) ?? buildRouteFallbackDistrictRecordResponse(request.params.slug));
			return;
		}

		response.json(buildDistrictRecordResponse(result.contest, result.election));
	});

	app.get("/api/representatives", async (request, response) => {
		const activeNationwideLookup = await resolveActiveNationwideLookup(request, response);

		if (response.headersSent)
			return;

		if (activeNationwideLookup) {
			const nationwideRepresentatives = buildNationwideRepresentativesResponse(activeNationwideLookup);
			response.json({
				...nationwideRepresentatives,
				representatives: await representativeModuleResolver.enrichNationwideRepresentativeDirectory(
					activeNationwideLookup,
					nationwideRepresentatives.representatives
				),
			});
			return;
		}

		const [districts, representatives] = await Promise.all([
			listPublicDistricts(normalizeDirectoryAreaQuery(request.query.area)),
			listPublicRepresentatives(normalizeDirectoryAreaQuery(request.query.area))
		]);

		response.json(buildRepresentativesResponse(representatives, districts));
	});

	app.get("/api/representatives/:slug", async (request, response) => {
		const activeNationwideLookup = await resolveActiveNationwideLookup(request, response);

		if (response.headersSent)
			return;

		if (activeNationwideLookup) {
			const representativeFromLookup = buildNationwidePersonProfileResponse(activeNationwideLookup, request.params.slug);

			if (representativeFromLookup) {
				response.json(await representativeModuleResolver.enrichNationwidePersonProfile(
					activeNationwideLookup,
					representativeFromLookup
				));
				return;
			}
		}

		if (!activeNationwideLookup) {
			const throttleState = publicLookupThrottle.attempt(buildPublicThrottleKey(request));

			if (!throttleState.allowed) {
				logger.warn("representative.direct_lookup.throttled", {
					requestId: response.locals.requestId,
					retryAfterSeconds: throttleState.retryAfterSeconds,
				});
				response.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
				response.status(429).json({
					message: "Too many representative lookup requests from this connection. Try again later.",
					retryAfterSeconds: throttleState.retryAfterSeconds,
				});
				return;
			}
		}

		const representative = await getPublicRepresentative(request.params.slug);

		if (!representative) {
			response.json(buildRouteFallbackPersonProfileResponse(request.params.slug));
			return;
		}

		response.json(representative);
	});

	app.get("/api/jurisdictions/:slug", async (request, response) => {
		const publishedPackage = await getPublishedGuidePackageByJurisdictionSlug(request.params.slug);

		if (!publishedPackage) {
			response.status(404).json({
				message: "Jurisdiction not found."
			});
			return;
		}

		const jurisdiction = coverageRepository.getJurisdictionBySlug(request.params.slug);

		if (!jurisdiction) {
			response.status(404).json({
				message: "Jurisdiction not found."
			});
			return;
		}

		response.json(applyJurisdictionAssets(jurisdiction));
	});

	app.get("/api/ballot", async (request, response) => {
		const electionSlug = typeof request.query.election === "string" ? request.query.election : "";
		const defaultLocation = coverageRepository.data.location;
		const requestedLocationSlug = typeof request.query.location === "string" ? request.query.location : "";

		if (!electionSlug) {
			response.status(400).json({
				message: "Election slug is required."
			});
			return;
		}

		const [election, guidePackage] = await Promise.all([
			getPublicElection(electionSlug),
			getPublishedGuidePackageByElectionSlug(electionSlug),
		]);

		if (!election) {
			response.status(404).json({
				message: "Ballot not found for the requested election."
			});
			return;
		}

		if (!defaultLocation) {
			response.status(404).json({
				message: "Ballot location context is not available for the requested election."
			});
			return;
		}

		response.json({
			guideContent: guidePackage?.contentStatus ?? null,
			election,
			location: {
				...defaultLocation,
				slug: requestedLocationSlug || defaultLocation.slug
			},
			note: guidePackage?.contentStatus
				? `${guidePackage.contentStatus.summary} Verify official election logistics with the linked election office.`
				: "Current public coverage is running from the latest imported civic-data package. Verify official election logistics with the linked election office.",
			updatedAt: election.updatedAt
		});
	});

	app.get("/api/contests/:slug", async (request, response) => {
		const result = await getPublicContest(request.params.slug);

		if (!result) {
			response.status(404).json({
				message: "Contest not found."
			});
			return;
		}

		response.json(buildContestRecordResponse(result.contest, result.election));
	});

	app.get("/api/candidates/:slug", async (request, response) => {
		const candidate = await getPublicCandidate(request.params.slug);

		if (!candidate) {
			response.status(404).json({
				message: "Candidate not found."
			});
			return;
		}

		response.json(candidate);
	});

	app.get("/api/measures/:slug", async (request, response) => {
		const measure = await getPublicMeasure(request.params.slug);

		if (!measure) {
			response.status(404).json({
				message: "Measure not found."
			});
			return;
		}

		response.json(measure);
	});

	app.get("/api/compare", async (request, response) => {
		const raw = typeof request.query.slugs === "string" ? request.query.slugs : "";
		const requestedSlugs = raw.split(",").map(item => item.trim()).filter(Boolean).slice(0, 3);
		const candidates = await getPublicCandidatesBySlugs(requestedSlugs);
		const offices = Array.from(new Set(candidates.map(candidate => candidate.officeSought)));
		const contests = Array.from(new Set(candidates.map(candidate => candidate.contestSlug)));
		const sameContest = contests.length === 1;

		response.json({
			candidates,
			contestSlug: sameContest ? contests[0] : null,
			note: "Compare pages are informational only. They do not rank candidates, show polls, or score fit.",
			office: offices.length === 1 ? offices[0] : null,
			sameContest,
			requestedSlugs
		});
	});

	app.get("/api/guide-packages/:id", async (request, response) => {
		const guidePackage = await getGuidePackageRecord(request.params.id);

		if (!guidePackage || guidePackage.workflow.status !== "published") {
			response.status(404).json({
				message: "Published guide package not found."
			});
			return;
		}

		response.json(buildGuidePackageRecordResponsePayload(guidePackage));
	});

	app.get("/api/admin/overview", async (_request, response) => {
		response.json(await adminRepository.getOverview());
	});

	app.get("/api/admin/audit", async (_request, response) => {
		if (!requireAdminRole(response))
			return;

		response.json(await adminRepository.listAuditEvents());
	});

	app.get("/api/admin/corrections", async (_request, response) => {
		response.json(await adminRepository.listCorrections());
	});

	app.patch("/api/admin/corrections/:id", async (request, response) => {
		try {
			const actor = getAdminAuditActor(response);
			const current = (await adminRepository.listCorrections()).corrections.find(item => item.id === request.params.id);
			const requestedStatus = parseOptionalEnum(request.body?.status, adminCorrectionStatuses, "Correction status");
			const publicCorrectionMutationRequested = Boolean(current && current.status !== "new")
				|| (requestedStatus !== undefined && requestedStatus !== "new");

			if (actor?.role !== "admin" && publicCorrectionMutationRequested) {
				response.status(403).json({
					message: "Admin role required to publish, update, or remove a public correction."
				});
				return;
			}

			if (actor?.role === "admin" && publicCorrectionMutationRequested && !requirePrivilegedAdminRole(response))
				return;

			response.json(await adminRepository.updateCorrection(request.params.id, {
				auditActor: actor,
				contentId: parseOptionalText(request.body?.contentId, "Linked content id", 256, { nullable: true }),
				nextStep: parseOptionalText(request.body?.nextStep, "Correction next step", 2_000),
				priority: parseOptionalEnum(request.body?.priority, adminPriorities, "Correction priority"),
				status: requestedStatus
			}));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to update correction."
			});
		}
	});

	app.get("/api/admin/review", async (_request, response) => {
		response.json(await adminRepository.listReview());
	});

	app.get("/api/admin/content", async (_request, response) => {
		response.json(await adminRepository.listContent());
	});

	app.get("/api/admin/content/:id/history", async (request, response) => {
		try {
			response.json(await adminRepository.getContentHistory(request.params.id));
		}
		catch (error) {
			response.status(404).json({
				message: error instanceof Error ? error.message : "Unable to load content history."
			});
		}
	});

	app.post("/api/admin/content/:id/rollback", async (request, response) => {
		if (!requirePrivilegedAdminRole(response))
			return;

		try {
			const historyId = parseOptionalText(request.body?.historyId, "Content history id", 256)?.trim() ?? "";

			if (!historyId) {
				response.status(400).json({
					message: "Content history id is required."
				});
				return;
			}

			response.json(await adminRepository.rollbackContent(request.params.id, historyId, getAdminAuditActor(response)));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to roll back content."
			});
		}
	});

	app.patch("/api/admin/content/:id", async (request, response) => {
		try {
			const actor = getAdminAuditActor(response);
			const current = (await adminRepository.listContent()).items.find(item => item.id === request.params.id);
			const publicationControlRequested = request.body?.published !== undefined
				|| request.body?.status === "published"
				|| request.body?.publishApprovedBy !== undefined
				|| request.body?.publishApprovalNote !== undefined;
			const liveContentMutationRequested = Boolean(current?.published)
				|| request.body?.published === true
				|| request.body?.status === "published";

			if (actor?.role !== "admin" && publicationControlRequested) {
				response.status(403).json({
					message: "Admin role required to publish, unpublish, or approve content."
				});
				return;
			}

			if (request.body?.publishApprovedBy !== undefined) {
				response.status(400).json({
					message: "Publish reviewer identity is recorded from the authenticated admin session."
				});
				return;
			}

			if (actor?.role === "admin" && liveContentMutationRequested && !requirePrivilegedAdminRole(response))
				return;

			if (actor?.role !== "admin") {
				if (current?.published) {
					response.status(403).json({
						message: "Admin role required to change live content. Unpublish it before editorial revision."
					});
					return;
				}
			}

			response.json(await adminRepository.updateContent(request.params.id, {
				auditActor: getAdminAuditActor(response),
				assignedTo: parseOptionalText(request.body?.assignedTo, "Content assignee", 200),
				blocker: parseOptionalText(request.body?.blocker, "Content blocker", 2_000, { nullable: true }),
				priority: parseOptionalEnum(request.body?.priority, adminPriorities, "Content priority"),
				publishApprovedBy: liveContentMutationRequested ? actor?.displayName : undefined,
				publishApprovalNote: parseOptionalText(request.body?.publishApprovalNote, "Publish approval note", 4_000, { nullable: true }),
				publicBallotSummary: parseOptionalText(request.body?.publicBallotSummary, "Public ballot summary", 10_000, { nullable: true }),
				publicSummary: parseOptionalText(request.body?.publicSummary, "Public summary", 20_000),
				published: parseOptionalBoolean(request.body?.published, "Published"),
				status: parseOptionalEnum(request.body?.status, adminReviewStatuses, "Content status")
			}));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to update content."
			});
		}
	});

	app.get("/api/admin/packages", async (_request, response) => {
		const [guidePackages, content] = await Promise.all([
			adminRepository.listGuidePackages(),
			adminRepository.listContent(),
		]);

		response.json(buildGuidePackageList(guidePackages.packages, coverageRepository, content.items));
	});

	app.post("/api/admin/packages", async (request, response) => {
		try {
			const electionSlug = parseOptionalText(request.body?.electionSlug, "Election slug", 200)?.trim() ?? "";
			const jurisdictionSlug = parseOptionalText(request.body?.jurisdictionSlug, "Jurisdiction slug", 200)?.trim();

			if (!electionSlug) {
				response.status(400).json({
					message: "Election slug is required."
				});
				return;
			}

			const guidePackage = await createGuidePackageDraft(electionSlug, jurisdictionSlug);
			response.status(201).json(buildGuidePackageRecordResponsePayload(guidePackage));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to generate guide package draft."
			});
		}
	});

	app.get("/api/admin/packages/:id", async (request, response) => {
		const guidePackage = await getGuidePackageRecord(request.params.id);

		if (!guidePackage) {
			response.status(404).json({
				message: "Guide package not found."
			});
			return;
		}

		response.json(buildGuidePackageRecordResponsePayload(guidePackage));
	});

	app.get("/api/admin/packages/:id/diagnostics", async (request, response) => {
		const guidePackage = await getGuidePackageRecord(request.params.id);

		if (!guidePackage) {
			response.status(404).json({
				message: "Guide package not found."
			});
			return;
		}

		response.json(buildGuidePackageDiagnosticsPayload(guidePackage));
	});

	app.patch("/api/admin/packages/:id", async (request, response) => {
		try {
			const currentPackage = await getGuidePackageRecord(request.params.id);
			const actor = getAdminAuditActor(response);

			if (!currentPackage) {
				response.status(404).json({
					message: "Guide package not found."
				});
				return;
			}

			if (currentPackage.workflow.status === "published") {
				response.status(400).json({
					message: "Unpublish the guide package before changing its review record."
				});
				return;
			}

			if (request.body?.reviewer !== undefined) {
				response.status(400).json({
					message: "Reviewer identity is recorded from the authenticated admin session."
				});
				return;
			}

			const requestedStatus = parseOptionalEnum(
				request.body?.status,
				guidePackageStatuses,
				"Guide package status"
			);

			if (requestedStatus === "published") {
				response.status(400).json({
					message: "Use the publish action to promote a guide package to published."
				});
				return;
			}

			if (requestedStatus === "ready_to_publish" && !currentPackage.diagnostics.readyToPublish) {
				response.status(400).json({
					diagnostics: currentPackage.diagnostics,
					message: currentPackage.diagnostics.blockingIssueCount
						? "Guide package still has blocking publish checks."
						: "Guide package still needs reviewer signoff or a publish recommendation."
				});
				return;
			}

			const reviewFieldsChanged = request.body?.reviewNotes !== undefined
				|| request.body?.reviewRecommendation !== undefined;
			const reviewCleared = request.body?.reviewRecommendation === null;
			const reviewedAt = reviewFieldsChanged
				? reviewCleared ? null : new Date().toISOString()
				: undefined;

			await adminRepository.updateGuidePackage(request.params.id, {
				auditActor: actor,
				coverageLimits: parseStringArray(request.body?.coverageLimits, "Coverage limits"),
				coverageNotes: parseStringArray(request.body?.coverageNotes, "Coverage notes"),
				reviewRecommendation: request.body?.reviewRecommendation === null
					? null
					: parseGuidePackageReviewRecommendation(request.body?.reviewRecommendation),
				reviewNotes: parseOptionalText(request.body?.reviewNotes, "Review notes", 10_000, { nullable: true }),
				reviewedAt,
				reviewer: reviewFieldsChanged
					? reviewCleared ? null : actor?.displayName || actor?.username
					: undefined,
				status: requestedStatus === "draft" || requestedStatus === "in_review" || requestedStatus === "ready_to_publish"
					? requestedStatus
					: undefined,
			});

			const updatedPackage = await getGuidePackageRecord(request.params.id);

			if (!updatedPackage)
				throw new Error("Guide package was updated but could not be reloaded.");

			response.json(buildGuidePackageRecordResponsePayload(updatedPackage));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to update guide package."
			});
		}
	});

	app.post("/api/admin/packages/:id/publish", async (request, response) => {
		if (!requirePrivilegedAdminRole(response))
			return;

		try {
			const currentPackage = await getGuidePackageRecord(request.params.id);

			if (!currentPackage) {
				response.status(404).json({
					message: "Guide package not found."
				});
				return;
			}

			if (currentPackage.workflow.status !== "ready_to_publish") {
				response.status(409).json({
					message: "Guide package must be in ready to publish status before promotion."
				});
				return;
			}

			if (!currentPackage.diagnostics.readyToPublish) {
				response.status(400).json({
					diagnostics: currentPackage.diagnostics,
					message: currentPackage.diagnostics.blockingIssueCount
						? "Guide package still has blocking publish checks."
						: "Guide package still needs reviewer signoff or a publish recommendation."
				});
				return;
			}

			if (
				request.body?.reviewer !== undefined
				|| request.body?.reviewRecommendation !== undefined
				|| request.body?.reviewNotes !== undefined
			) {
				response.status(400).json({
					message: "Save the authenticated reviewer signoff before publishing; publish requests cannot rewrite it."
				});
				return;
			}

			const reviewer = currentPackage.workflow.reviewer ?? "";
			const reviewRecommendation = currentPackage.workflow.reviewRecommendation;

			if (!reviewer) {
				response.status(400).json({
					message: "Reviewer name is required before publishing a guide package."
				});
				return;
			}

			if (!isPublishReadyRecommendation(reviewRecommendation)) {
				response.status(400).json({
					diagnostics: currentPackage.diagnostics,
					message: "Reviewer recommendation must be publish or publish with warnings before publication."
				});
				return;
			}

			const now = new Date().toISOString();

			await adminRepository.updateGuidePackage(request.params.id, {
				auditActor: getAdminAuditActor(response),
				publishedAt: now,
				status: "published",
			});

			const updatedPackage = await getGuidePackageRecord(request.params.id);

			if (!updatedPackage)
				throw new Error("Guide package was published but could not be reloaded.");

			response.json(buildGuidePackageRecordResponsePayload(updatedPackage));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to publish guide package."
			});
		}
	});

	app.post("/api/admin/packages/:id/unpublish", async (request, response) => {
		if (!requirePrivilegedAdminRole(response))
			return;

		try {
			const currentPackage = await getGuidePackageRecord(request.params.id);
			const actor = getAdminAuditActor(response);

			if (!currentPackage) {
				response.status(404).json({
					message: "Guide package not found."
				});
				return;
			}

			if (currentPackage.workflow.status !== "published") {
				response.status(409).json({
					message: "Only a published guide package can be unpublished."
				});
				return;
			}

			const reason = parseOptionalText(request.body?.reason, "Unpublish reason", 2_000)?.trim() ?? "";

			if (!reason) {
				response.status(400).json({
					message: "Unpublish reason is required."
				});
				return;
			}

			await adminRepository.updateGuidePackage(request.params.id, {
				auditActor: actor,
				publishedAt: null,
				reviewRecommendation: "needs_revision",
				reviewNotes: reason,
				reviewedAt: new Date().toISOString(),
				reviewer: actor?.displayName || actor?.username,
				status: "in_review",
			});

			const updatedPackage = await getGuidePackageRecord(request.params.id);

			if (!updatedPackage)
				throw new Error("Guide package was unpublished but could not be reloaded.");

			response.json(buildGuidePackageRecordResponsePayload(updatedPackage));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to unpublish guide package."
			});
		}
	});

	app.get("/api/admin/sources", async (_request, response) => {
		response.json(await adminRepository.listSourceMonitor());
	});

	app.patch("/api/admin/sources/:id", async (request, response) => {
		if (!requirePrivilegedAdminRole(response))
			return;

		try {
			response.json(await adminRepository.updateSource(request.params.id, {
				auditActor: getAdminAuditActor(response),
				health: parseOptionalEnum(request.body?.health, adminSourceHealthValues, "Source health"),
				nextCheckAt: parseOptionalTimestamp(request.body?.nextCheckAt, "Next source check"),
				note: parseOptionalText(request.body?.note, "Source note", 2_000),
				owner: parseOptionalText(request.body?.owner, "Source owner", 200)
			}));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to update source monitor."
			});
		}
	});

	app.get("/api/admin/users", async (_request, response) => {
		if (!requireAdminRole(response))
			return;

		response.json(await adminRepository.listUsers());
	});

	app.post("/api/admin/users", async (request, response) => {
		if (!requirePrivilegedAdminRole(response))
			return;

		try {
			const role = request.body?.role;

			if (role !== "admin" && role !== "editor") {
				response.status(400).json({
					message: "Role must be either admin or editor."
				});
				return;
			}

			await adminRepository.createUser({
				auditActor: getAdminAuditActor(response),
				displayName: parseOptionalText(request.body?.displayName, "Display name", 200) ?? "",
				password: parseOptionalText(request.body?.password, "Password", 256) ?? "",
				role,
				username: parseOptionalText(request.body?.username, "Username", 64) ?? ""
			});

			response.status(201).json(await adminRepository.listUsers());
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to create admin user."
			});
		}
	});

	app.patch("/api/admin/users/:id", async (request, response) => {
		if (!requirePrivilegedAdminRole(response))
			return;

		try {
			if (request.body?.role !== undefined) {
				response.status(400).json({
					message: "Admin and editor roles are immutable. Create a replacement account when a different role is required."
				});
				return;
			}

			const disabled = parseOptionalBoolean(request.body?.disabled, "Disabled");
			const mfaReset = parseOptionalBoolean(request.body?.mfaReset, "MFA reset");
			const password = parseOptionalText(request.body?.password, "Password", 256);

			if (disabled === undefined && mfaReset !== true && password === undefined)
				throw new Error("At least one account change is required.");

			response.json(await adminRepository.updateUser(request.params.id, {
				auditActor: getAdminAuditActor(response),
				disabled,
				mfaReset: mfaReset === true ? true : undefined,
				password,
				passwordChangeMode: password !== undefined ? "admin-reset" : undefined
			}));
		}
		catch (error) {
			response.status(400).json({
				message: error instanceof Error ? error.message : "Unable to update admin user."
			});
		}
	});

	const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
		logger.error("request.failed", {
			error: error instanceof Error ? error.message : "Unhandled request error.",
			method: request.method,
			path: request.path,
			requestId: response.locals.requestId,
			stack: error instanceof Error ? error.stack : undefined
		});

		if (response.headersSent)
			return;

		response.status(500).json({
			message: "Internal server error.",
			requestId: response.locals.requestId
		});
	};

	app.use(errorHandler);

	return app;
}

export async function startServer(
	port = Number(process.env.PORT || 3001),
	host = process.env.HOST?.trim() || "127.0.0.1"
) {
	const app = await createApp();
	const server = app.listen(port, host, () => {
		console.log(`Ballot Clarity API listening on http://${host}:${port}`);
	});

	return { app, host, port, server };
}

function isDirectExecution(metaUrl: string) {
	return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === metaUrl;
}

if (isDirectExecution(import.meta.url))
	void startServer();
