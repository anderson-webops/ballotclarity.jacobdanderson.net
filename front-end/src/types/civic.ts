export type SourceType
	= | "campaign filing"
		| "ethics filing"
		| "hearing transcript"
		| "official record"
		| "policy memo"
		| "questionnaire"
		| "research brief"
		| "voter guide";

export type SourceAuthority
	= | "ballot-clarity-archive"
		| "ballot-clarity-source-record"
		| "candidate-campaign"
		| "commercial-provider"
		| "nonprofit-provider"
		| "official-government"
		| "open-data";

export type SourcePublisherType
	= | "ballot-clarity source record"
		| "campaign"
		| "nonprofit"
		| "official"
		| "public-interest"
		| "third-party civic infrastructure";

export type SourcePublicationKind = "curated-global" | "published-provenance";

export interface Source {
	id: string;
	title: string;
	publisher: string;
	type: SourceType;
	authority: SourceAuthority;
	sourceSystem: string;
	date: string;
	url: string;
	note?: string;
}

export interface SourceCitationTarget {
	id: string;
	label: string;
	href: string;
	type: "candidate" | "contest" | "election" | "jurisdiction" | "measure" | "page";
}

export interface SourceDirectoryItem extends Source {
	citationCount: number;
	citedBy: SourceCitationTarget[];
	geographicScope: string;
	limitations: string[];
	primarySourceLabel?: string;
	publicationKind: SourcePublicationKind;
	publisherType: SourcePublisherType;
	reviewNote: string;
	routeFamilies: string[];
	summary: string;
	usedFor: string;
}

export interface SourcesDirectoryResponse {
	sources: SourceDirectoryItem[];
	updatedAt: string;
}

export interface SourceRecordResponse {
	source: SourceDirectoryItem;
	updatedAt: string;
}

export interface OfficialResource {
	label: string;
	url: string;
	sourceLabel: string;
	authority: SourceAuthority;
	sourceSystem: string;
	note?: string;
}

export interface ExternalLink {
	label: string;
	url: string;
	note?: string;
}

export interface ElectionKeyDate {
	label: string;
	date: string;
	note?: string;
}

export interface ChangeLogEntry {
	id: string;
	date: string;
	summary: string;
}

export interface ElectionOffice {
	name: string;
	address: string;
	phone: string;
	email: string;
	website: string;
	hours: string;
}

export interface VotingMethod {
	slug: string;
	title: string;
	summary: string;
	details: string[];
	officialResource?: OfficialResource;
}

export interface ArchivedGuide {
	id: string;
	title: string;
	date: string;
	href: string;
}

export interface IssueTag {
	slug: string;
	label: string;
}

export interface FundingLineItem {
	name: string;
	amount: number;
	category: string;
}

export interface FundingSummary {
	totalRaised: number;
	cashOnHand: number;
	smallDonorShare: number;
	summary: string;
	topFunders: FundingLineItem[];
	sources: Source[];
}

export interface ElectionLogisticsSite {
	id: string;
	name: string;
	address: string;
	note?: string;
}

export interface ElectionLogisticsCandidate {
	candidateUrl?: string;
	email?: string;
	id: string;
	name: string;
	office?: string;
	party?: string;
	phone?: string;
	profileImages?: ProfileImage[];
}

export type BallotContentPreviewStatus = "official_source_unverified" | "provider_unverified";

export interface BallotContentPreviewCandidate {
	candidateUrl?: string;
	email?: string;
	id: string;
	name: string;
	orderOnBallot?: number;
	party?: string;
	phone?: string;
	profileImages?: ProfileImage[];
}

export interface BallotContentPreviewReferendum {
	brief?: string;
	effectOfAbstain?: string;
	passageThreshold?: string;
	responses: string[];
	subtitle?: string;
	text?: string;
	title?: string;
	url?: string;
}

export interface BallotContentPreviewContest {
	ballotTitle?: string;
	candidates: BallotContentPreviewCandidate[];
	districtName?: string;
	id: string;
	office?: string;
	referendum?: BallotContentPreviewReferendum;
	sourceLabels: string[];
	title: string;
	type?: string;
}

export interface BallotContentPreview {
	candidateCount: number;
	contestCount: number;
	disclaimer: string;
	generatedAt: string;
	id: string;
	measureCount: number;
	officialOnly: boolean;
	providerId: string;
	providerLabel: string;
	sourceAuthority: SourceAuthority;
	status: BallotContentPreviewStatus;
	verificationResource?: OfficialResource;
	verificationResourceLabel?: string;
	contests: BallotContentPreviewContest[];
}

export interface ElectionLogistics {
	additionalElectionNames: string[];
	candidatePreviews?: ElectionLogisticsCandidate[];
	dropOffLocations: ElectionLogisticsSite[];
	earlyVoteSites: ElectionLogisticsSite[];
	electionDay?: string;
	electionName?: string;
	mailOnly: boolean;
	normalizedAddress?: string;
	officialSourceNote: string;
	pollingLocations: ElectionLogisticsSite[];
}

export interface VoteRecordSummary {
	id: string;
	title: string;
	date: string;
	summary: string;
	significance: string;
	sources: Source[];
}

export interface EvidenceBlock {
	id: string;
	title: string;
	summary: string;
	sources: Source[];
}

export interface MeasureChangeItem {
	id: string;
	text: string;
	sources: Source[];
}

export interface MeasureTimelineItem {
	id: string;
	label: string;
	timing: string;
	summary: string;
	sources: Source[];
}

export interface MeasureFiscalItem {
	id: string;
	label: string;
	value: string;
	scope: string;
	horizon: string;
	note: string;
	sources: Source[];
}

export interface MeasureArgument {
	id: string;
	title: string;
	summary: string;
	attribution: string;
	sources: Source[];
}

export interface AlignmentModule {
	status: "not-live";
	summary: string;
	considerations: string[];
}

export type FreshnessStatus = "incomplete" | "out-of-date" | "up-to-date" | "updating";

export interface FreshnessMeta {
	contentLastVerifiedAt: string;
	dataLastUpdatedAt?: string;
	nextReviewAt: string;
	status: FreshnessStatus;
	statusLabel: string;
	statusNote: string;
}

export interface TrustBullet {
	id: string;
	text: string;
	note?: string;
	sources: Source[];
}

export type ComparisonProvenanceStatus
	= | "candidate-quoted"
		| "candidate-submitted"
		| "unclear"
		| "verified-official";

export interface ComparisonProvenance {
	status: ComparisonProvenanceStatus;
	label: string;
	detail: string;
	capturedAt?: string;
}

export interface CandidateLink {
	label: string;
	url: string;
	note?: string;
}

export type ProfileImageSourceKind = "archive" | "campaign" | "official" | "provider";

export interface ProfileImage {
	alt: string;
	attribution?: string;
	capturedAt?: string;
	priority: number;
	sourceKind: ProfileImageSourceKind;
	sourceLabel: string;
	sourceSystem: string;
	sourceUrl?: string;
	url: string;
}

export interface ComparableStatement {
	id: string;
	text: string | null;
	provenance: ComparisonProvenance;
	sources: Source[];
}

export interface CandidateBallotStatus {
	status: "on-ballot-verified" | "unknown";
	asOf: string;
	label: string;
	provenance: ComparisonProvenance;
	sources: Source[];
}

export interface QuestionnaireResponse {
	questionId: string;
	category: string;
	questionPrompt: string;
	answerType: "short-text" | "yes-no-explanation";
	answerText: string | null;
	responseStatus: "answered" | "no-response" | "unclear";
	answerReceivedAt?: string;
	provenance: ComparisonProvenance;
	sources: Source[];
}

export interface CandidateComparisonProfile {
	ballotName: string;
	displayName: string;
	ballotOrder: number;
	partyOnBallot: string;
	campaignWebsiteUrl: string;
	contactChannels: CandidateLink[];
	ballotStatus: CandidateBallotStatus;
	whyRunning: ComparableStatement;
	topPriorities: ComparableStatement[];
	questionnaireResponses: QuestionnaireResponse[];
}

export interface Candidate {
	slug: string;
	name: string;
	officeSought: string;
	contestSlug: string;
	party: string;
	incumbent: boolean;
	location: string;
	summary: string;
	ballotSummary: string;
	topIssues: IssueTag[];
	biography: EvidenceBlock[];
	keyActions: VoteRecordSummary[];
	funding: FundingSummary;
	lobbyingContext: EvidenceBlock[];
	publicStatements: EvidenceBlock[];
	alignmentModule: AlignmentModule;
	freshness: FreshnessMeta;
	whatWeKnow: TrustBullet[];
	whatWeDoNotKnow: TrustBullet[];
	methodologyNotes: string[];
	comparison: CandidateComparisonProfile;
	sources: Source[];
	updatedAt: string;
	profileImages?: ProfileImage[];
}

export interface Measure {
	slug: string;
	title: string;
	contestSlug: string;
	location: string;
	summary: string;
	ballotSummary: string;
	plainLanguageExplanation: string;
	currentLawOverview: string;
	currentPractice: MeasureChangeItem[];
	proposedChanges: MeasureChangeItem[];
	yesMeaning: string;
	noMeaning: string;
	yesHighlights: string[];
	noHighlights: string[];
	fiscalContextNote: string;
	implementationOverview: string;
	implementationTimeline: MeasureTimelineItem[];
	fiscalSummary: MeasureFiscalItem[];
	potentialImpacts: EvidenceBlock[];
	supportArguments: MeasureArgument[];
	opposeArguments: MeasureArgument[];
	argumentsDisclaimer: string;
	argumentsAndConsiderations: EvidenceBlock[];
	freshness: FreshnessMeta;
	whatWeKnow: TrustBullet[];
	whatWeDoNotKnow: TrustBullet[];
	sources: Source[];
	updatedAt: string;
}

export interface ContestRoleGuide {
	summary: string;
	whyItMatters: string;
	decisionAreas: string[];
}

export interface Contest {
	slug: string;
	title: string;
	office: string;
	jurisdiction: "Federal" | "State" | "Local" | "Ballot measure";
	type: "candidate" | "measure";
	description: string;
	roleGuide: ContestRoleGuide;
	candidates?: Candidate[];
	measures?: Measure[];
}

export interface ElectionSummary {
	slug: string;
	name: string;
	date: string;
	jurisdictionSlug: string;
	locationName: string;
	updatedAt: string;
}

export interface Election extends ElectionSummary {
	description: string;
	contests: Contest[];
	freshness: FreshnessMeta;
	keyDates: ElectionKeyDate[];
	officialResources: OfficialResource[];
	changeLog: ChangeLogEntry[];
}

export interface LocationSelection {
	slug: string;
	displayName: string;
	state: string;
	coverageLabel: string;
	lookupMode?: "address-submitted" | "address-verified" | "coverage-selection" | "zip-preview";
	requiresOfficialConfirmation?: boolean;
	lookupInput?: string;
}

export interface LocationDistrictMatch {
	id: string;
	label: string;
	districtType: string;
	districtCode: string;
	sourceSystem: string;
}

export type RepresentativeGovernmentLevel = "federal" | "state" | "county" | "city";

export type RepresentativeOfficeType
	= | "county_commission"
		| "county_official"
		| "city_official"
		| "mayor"
		| "other"
		| "state_house"
		| "state_senate"
		| "us_house"
		| "us_senate";

export interface LocationRepresentativeMatch {
	id: string;
	name: string;
	party?: string;
	officeTitle: string;
	districtLabel: string;
	governmentLevel: RepresentativeGovernmentLevel | null;
	officeDisplayLabel: string;
	officeType: RepresentativeOfficeType | null;
	sourceSystem: string;
	openstatesUrl?: string;
	profileImages?: ProfileImage[];
}

export type LocationLookupActionKind = "ballot-guide" | "official-verification";
export type LocationLookupInputKind = "address" | "zip";
export type LocationLookupResult = "resolved" | "unsupported";
export type LocationGuideAvailability = "published" | "not-published";
export type GuideContentStatus = "verified_local" | "official_logistics_only" | "staged_reference" | "seeded_demo";
export type LocationDataAvailabilityStatus = "available" | "limited" | "unavailable";

export interface GuideContentLayerStatus {
	count: number;
	detail: string;
	hasContent: boolean;
	label: string;
	status: GuideContentStatus;
}

export interface GuideContentSummary {
	candidates: GuideContentLayerStatus;
	contests: GuideContentLayerStatus;
	guideShell: GuideContentLayerStatus;
	mixedContent: boolean;
	measures: GuideContentLayerStatus;
	officialLogistics: GuideContentLayerStatus;
	publishedGuideShell: boolean;
	summary: string;
	verifiedContestPackage: boolean;
}

export interface LocationDataAvailabilityItem {
	label: string;
	status: LocationDataAvailabilityStatus;
	detail: string;
}

export interface LocationDataAvailabilitySummary {
	nationwideCivicResults: LocationDataAvailabilityItem;
	representatives: LocationDataAvailabilityItem;
	officialLogistics: LocationDataAvailabilityItem;
	ballotCandidates: LocationDataAvailabilityItem;
	financeInfluence: LocationDataAvailabilityItem;
	guideShell: LocationDataAvailabilityItem;
	verifiedContestPackage: LocationDataAvailabilityItem;
	fullLocalGuide: LocationDataAvailabilityItem;
}

export interface LocationLookupAction {
	id: string;
	kind: LocationLookupActionKind;
	title: string;
	description: string;
	badge?: string;
	electionSlug?: string;
	location?: LocationSelection;
	url?: string;
}

export interface LocationLookupSelectionOption {
	id: string;
	label: string;
	description: string;
	guideAvailability: LocationGuideAvailability;
	districtMatches?: LocationDistrictMatch[];
	representativeMatches?: LocationRepresentativeMatch[];
}

export interface LocationLookupResponse {
	result: LocationLookupResult;
	inputKind: LocationLookupInputKind;
	note: string;
	ballotContentPreviews?: BallotContentPreview[];
	lookupQuery?: string;
	selectionId?: string;
	detectedFromIp?: boolean;
	guideAvailability?: LocationGuideAvailability;
	guideContent?: GuideContentSummary | null;
	availability?: LocationDataAvailabilitySummary;
	location?: LocationSelection;
	electionSlug?: string;
	actions?: LocationLookupAction[];
	selectionOptions?: LocationLookupSelectionOption[];
	normalizedAddress?: string;
	electionLogistics?: ElectionLogistics | null;
	districtMatches?: LocationDistrictMatch[];
	representativeMatches?: LocationRepresentativeMatch[];
	fromCache?: boolean;
}

export interface NationwideLookupResultContext {
	result: LocationLookupResult;
	inputKind: LocationLookupInputKind;
	note: string;
	ballotContentPreviews?: BallotContentPreview[];
	resolvedAt?: string;
	lookupQuery?: string;
	selectionId?: string;
	detectedFromIp?: boolean;
	guideAvailability?: LocationGuideAvailability;
	guideContent?: GuideContentSummary | null;
	availability: LocationDataAvailabilitySummary | null;
	location: LocationSelection | null;
	election: ElectionSummary | null;
	electionSlug?: string;
	actions: LocationLookupAction[];
	selectionOptions: LocationLookupSelectionOption[];
	normalizedAddress: string;
	electionLogistics: ElectionLogistics | null;
	districtMatches: LocationDistrictMatch[];
	representativeMatches: LocationRepresentativeMatch[];
	fromCache: boolean;
}

export interface ElectionsResponse {
	elections: ElectionSummary[];
}

export interface JurisdictionSummary {
	slug: string;
	name: string;
	displayName: string;
	state: string;
	jurisdictionType: string;
	description: string;
	nextElectionName: string;
	nextElectionSlug: string;
	updatedAt: string;
}

export interface Jurisdiction extends JurisdictionSummary {
	officialOffice: ElectionOffice;
	officialResources: OfficialResource[];
	votingMethods: VotingMethod[];
	upcomingElections: ElectionSummary[];
	archivedGuides: ArchivedGuide[];
	coverageNotes: string[];
}

export interface JurisdictionsResponse {
	jurisdictions: JurisdictionSummary[];
}

export type DataSourceOptionStatus = "planned-live" | "reference-pattern" | "research-layer";

export interface DataSourceOption {
	id: string;
	name: string;
	authority: SourceAuthority;
	status: DataSourceOptionStatus;
	accessMethod: string;
	coverage: string;
	updatePattern: string;
	summary: string;
	bestUse: string;
	notes: string[];
	links?: ExternalLink[];
}

export interface DataSourceCategory {
	slug: string;
	title: string;
	summary: string;
	authoritativeRule: string;
	liveApproach: string;
	options: DataSourceOption[];
}

export interface DataArchitectureStage {
	id: string;
	title: string;
	summary: string;
	details: string[];
}

export interface DataMigrationWatchItem {
	id: string;
	title: string;
	summary: string;
	implication: string;
}

export interface DataRoadmapMilestone {
	id: string;
	title: string;
	summary: string;
}

export interface DataSourcesResponse {
	updatedAt: string;
	principles: string[];
	ballotContentProviders?: BallotContentProviderOption[];
	categories: DataSourceCategory[];
	architectureStages: DataArchitectureStage[];
	migrationWatch: DataMigrationWatchItem[];
	roadmap: DataRoadmapMilestone[];
	launchTarget?: LaunchTargetProfile;
}

export type BallotContentProviderConnectionStatus = "active" | "needs_key" | "needs_partner_access" | "needs_endpoint";

export interface BallotContentProviderOption {
	id: string;
	label: string;
	authority: SourceAuthority;
	connectionStatus: BallotContentProviderConnectionStatus;
	configured: boolean;
	setupUrl: string;
	docsUrl?: string;
	capabilities: string[];
	bestUse: string;
	limitations: string[];
}

export type LaunchTargetPhase = "launching" | "planning" | "public-archive";

export interface LaunchTargetProfile {
	slug: string;
	name: string;
	displayName: string;
	state: string;
	phase: LaunchTargetPhase;
	phaseLabel: string;
	summary: string;
	currentElectionName: string;
	currentElectionDate: string;
	nextElectionName?: string;
	nextElectionDate?: string;
	officialResources: OfficialResource[];
	referenceLinks: ExternalLink[];
}

export type CoverageCapabilityStatus = "in-build" | "live-now" | "planned";

export interface CoverageCapability {
	id: string;
	label: string;
	status: CoverageCapabilityStatus;
	summary: string;
}

export interface CoverageCollection {
	id: string;
	label: string;
	status: "canonical" | "reference";
	summary: string;
	href: string;
}

export type CoverageRouteFamilyStatus = "guide-dependent" | "limited" | "live-now";

export interface CoverageRouteFamily {
	id: string;
	label: string;
	status: CoverageRouteFamilyStatus;
	summary: string;
	routes: string[];
	activeSources: string[];
	note?: string;
}

export interface CoverageLimitation {
	id: string;
	title: string;
	summary: string;
}

export type LocationGuessMode = "browser_geolocation" | "disabled" | "geoip_provider" | "proxy_headers";

export interface LocationGuessCapability {
	mode: LocationGuessMode;
	canGuessOnLoad: boolean;
}

export type CoverageSnapshotStatus = "production_approved" | "reviewed" | "seed" | "unknown";
export type CoverageSnapshotSourceType = "imported" | "seed" | "unknown";

export interface CoverageSnapshotProvenance {
	status: CoverageSnapshotStatus;
	configuredSnapshotMissing: boolean;
	sourceLabel: string;
	sourceType: CoverageSnapshotSourceType;
	sourceOrigin?: string;
	loadedAt: string;
	importedAt?: string;
	reviewedAt?: string;
	approvedAt?: string;
	note?: string;
}

export interface CoverageResponse {
	updatedAt: string;
	coverageMode: "empty" | "snapshot";
	coverageUpdatedAt: string;
	snapshotProvenance?: CoverageSnapshotProvenance;
	locationGuess: LocationGuessCapability;
	launchTarget?: LaunchTargetProfile;
	guideContent?: GuideContentSummary | null;
	scopeNote: string;
	currentState: string;
	supportedContentTypes: CoverageCapability[];
	routeFamilies: CoverageRouteFamily[];
	limitations: CoverageLimitation[];
	nextSteps: string[];
	collections: CoverageCollection[];
}

export type PublicOperationalStatus = "degraded" | "healthy" | "reviewing";

export interface PublicStatusSourceItem {
	id: string;
	label: string;
	authority: SourceAuthority;
	health: AdminSourceHealth;
	lastCheckedAt: string;
	nextCheckAt: string;
	note: string;
}

export interface PublicStatusNotice {
	id: string;
	title: string;
	summary: string;
}

export interface PublicStatusResponse {
	updatedAt: string;
	overallStatus: PublicOperationalStatus;
	coverageMode: "empty" | "snapshot";
	coverageUpdatedAt: string;
	snapshotProvenance?: CoverageSnapshotProvenance;
	sourceSummary: Record<AdminSourceHealth, number>;
	nextReviewAt?: string;
	nextPublishWindow?: string;
	notes: string[];
	incidents: PublicStatusNotice[];
	sources: PublicStatusSourceItem[];
}

export interface PublicCorrectionItem {
	id: string;
	subject: string;
	entityType: AdminEntityType;
	entityLabel: string;
	status: AdminCorrectionStatus;
	priority: AdminPriority;
	submittedAt: string;
	pageUrl?: string;
	pageLabel?: string;
	summary: string;
	outcome: string;
}

export interface PublicCorrectionsResponse {
	updatedAt: string;
	corrections: PublicCorrectionItem[];
}

export interface ContestLinkSummary {
	slug: string;
	title: string;
	office: string;
	jurisdiction: Contest["jurisdiction"];
	type: Contest["type"];
	href: string;
}

export interface ContestRecordResponse {
	contest: Contest;
	election: ElectionSummary;
	jurisdiction: JurisdictionSummary;
	updatedAt: string;
	note: string;
	sourceCount: number;
	sources: Source[];
	relatedContests: ContestLinkSummary[];
}

export interface DistrictSummary {
	slug: string;
	title: string;
	office: string;
	jurisdiction: Contest["jurisdiction"];
	summary: string;
	representativeCount: number;
	candidateCount: number;
	href: string;
	updatedAt: string;
}

export interface RepresentativeSummary {
	slug: string;
	name: string;
	location: string;
	governmentLevel: RepresentativeGovernmentLevel | null;
	party: string;
	officeholderLabel: string;
	officeDisplayLabel: string;
	officeType: RepresentativeOfficeType | null;
	officeSought: string;
	districtSlug: string;
	districtLabel: string;
	onCurrentBallot: boolean;
	ballotStatusLabel: string;
	provenance: {
		label: string;
		status: "direct" | "crosswalked" | "inferred";
		note: string;
	} | null;
	href: string;
	openstatesUrl?: string;
	profileImages?: ProfileImage[];
	incumbent: boolean;
	summary: string;
	fundingAvailable: boolean;
	fundingSummary: string;
	influenceAvailable: boolean;
	influenceSummary: string;
	updatedAt: string;
	sourceCount: number;
	sources: Source[];
}

export interface PersonProfileFunding extends FundingSummary {
	committeeName?: string;
	coverageLabel?: string;
	receiptBreakdown?: FundingLineItem[];
	provenanceLabel?: string;
	totalSpent?: number;
}

export interface InfluenceRegistrantSummary {
	name: string;
	amount: number;
}

export interface PersonProfileInfluence {
	contributionCount: number;
	coverageLabel?: string;
	filingYear?: number;
	matchMode?: "committee" | "honoree";
	reportCount: number;
	topRegistrants: InfluenceRegistrantSummary[];
	totalMatched: number;
}

export interface PersonProfileOfficeContext {
	chamberLabel?: string;
	committeeMemberships?: string[];
	currentTermEndLabel?: string;
	currentTermLabel?: string;
	currentTermStartLabel?: string;
	districtLabel?: string;
	jurisdictionLabel?: string;
	officialOfficeAddress?: string;
	officialPhone?: string;
	referenceLinks?: ExternalLink[];
	serviceStartLabel?: string;
}

export interface PersonProfileEnrichmentStatusItem {
	status: "available" | "unavailable";
	reasonCode:
		| "attached"
		| "federal_only_provider"
		| "identity_only_provider"
		| "no_local_disclosure_source"
		| "no_local_finance_source"
		| "no_local_legislative_source"
		| "no_committee_record"
		| "no_provider_match"
		| "no_reliable_crosswalk"
		| "no_state_disclosure_source"
		| "no_state_finance_source"
		| "no_state_legislative_source"
		| "provider_error"
		| "provider_returned_no_records"
		| "provider_unconfigured"
		| "requires_funding_match";
	sourceSystem?: string;
	summary: string;
}

export interface PersonProfileEnrichmentStatus {
	funding: PersonProfileEnrichmentStatusItem;
	influence: PersonProfileEnrichmentStatusItem;
	legislativeContext: PersonProfileEnrichmentStatusItem;
	officeContext: PersonProfileEnrichmentStatusItem;
}

export interface PersonProfile {
	slug: string;
	name: string;
	location: string;
	governmentLevel: RepresentativeGovernmentLevel | null;
	officeDisplayLabel: string;
	officeType: RepresentativeOfficeType | null;
	officeSought: string;
	contestSlug: string;
	party: string;
	incumbent: boolean;
	districtLabel: string;
	districtSlug: string;
	summary: string;
	sourceCount: number;
	sources: Source[];
	updatedAt: string;
	freshness: FreshnessMeta;
	funding: PersonProfileFunding | null;
	influence?: PersonProfileInfluence | null;
	lobbyingContext: EvidenceBlock[];
	publicStatements: EvidenceBlock[];
	biography: EvidenceBlock[];
	topIssues: IssueTag[];
	keyActions: VoteRecordSummary[];
	whatWeKnow: TrustBullet[];
	whatWeDoNotKnow: TrustBullet[];
	methodologyNotes: string[];
	comparison: CandidateComparisonProfile | null;
	onCurrentBallot: boolean;
	ballotStatusLabel: string;
	officeholderLabel: string;
	officeContext?: PersonProfileOfficeContext;
	enrichmentStatus?: PersonProfileEnrichmentStatus;
	officialWebsiteUrl?: string;
	profileImages?: ProfileImage[];
	provenance: {
		source: "guide" | "nationwide" | "lookup";
		label: string;
		status: "direct" | "crosswalked" | "inferred";
		note: string;
		asOf: string;
	};
	openstatesUrl?: string;
}

export interface PersonProfileResponse {
	person: PersonProfile;
	updatedAt: string;
	note: string;
}

export interface DistrictRecordResponse {
	mode: "guide" | "nationwide";
	districtOriginLabel: string;
	districtOriginNote: string;
	candidateAvailabilityNote: string;
	representativeAvailabilityNote: string;
	district: DistrictSummary & {
		description: string;
		roleGuide: ContestRoleGuide;
		electionSlug: string;
	};
	election: ElectionSummary;
	updatedAt: string;
	note: string;
	candidates: Candidate[];
	representatives: RepresentativeSummary[];
	officialResources: OfficialResource[];
	sources: Source[];
	relatedContests: ContestLinkSummary[];
}

export interface DistrictsResponse {
	mode: "guide" | "nationwide";
	updatedAt: string;
	note: string;
	districts: DistrictSummary[];
}

export interface RepresentativesResponse {
	mode: "guide" | "nationwide";
	updatedAt: string;
	note: string;
	representatives: RepresentativeSummary[];
	districts: DistrictSummary[];
}

export interface BallotResponse {
	guideContent: GuideContentSummary | null;
	location: LocationSelection;
	election: Election;
	updatedAt: string;
	note: string;
}

export type GuidePackageStatus = "draft" | "in_review" | "ready_to_publish" | "published";

export type GuidePipelineClass = "fully_automatable" | "automatable_with_review" | "review_first_manual";

export type GuidePackageIssueSeverity = "info" | "warning" | "error";

export type GuidePackageChecklistItemStatus = "pass" | "warning" | "fail" | "not_applicable";

export type GuidePackageChecklistCategory
	= | "election_identity_scope"
		| "contest_completeness"
		| "candidate_completeness"
		| "measure_completeness"
		| "official_resources"
		| "source_coverage"
		| "content_quality_neutrality"
		| "freshness_timing"
		| "known_limitations";

export type GuidePackageChecklistEvaluationMode = "auto" | "reviewer_confirmed" | "hybrid";

export type GuidePackageReviewRecommendation = "publish" | "publish_with_warnings" | "needs_revision" | "do_not_publish";

export type GuidePackageIssueKind
	= | "ambiguous_match"
		| "coverage_limit"
		| "missing_field"
		| "normalization_issue"
		| "publish_gate"
		| "source_gap";

export interface GuidePackageCoverageScope {
	label: string;
	electionSlug: string;
	jurisdictionSlug: string;
	locationSlug?: string;
	districtSlugs: string[];
	routeFamilies: string[];
}

export interface GuidePackageCounts {
	contests: number;
	candidates: number;
	measures: number;
	officialResources: number;
	attachedSources: number;
}

export interface GuidePackageIssue {
	id: string;
	severity: GuidePackageIssueSeverity;
	kind: GuidePackageIssueKind;
	title: string;
	summary: string;
	blocking: boolean;
	pipelineClass: GuidePipelineClass;
	entityType?: "candidate" | "contest" | "election" | "jurisdiction" | "measure";
	entitySlug?: string;
}

export interface GuidePackageChecklistItem {
	id: string;
	category: GuidePackageChecklistCategory;
	label: string;
	detail: string;
	status: GuidePackageChecklistItemStatus;
	blocking: boolean;
	pipelineClass: GuidePipelineClass;
	evaluationMode: GuidePackageChecklistEvaluationMode;
	whatToCheck: string;
	whyItMatters: string;
	passStandard: string;
	warningStandard: string;
	failStandard: string;
	autoSignal?: string;
	reviewerSignal?: string;
	issueKind: GuidePackageIssueKind;
}

export interface GuidePackageChecklistCategoryGroup {
	id: GuidePackageChecklistCategory;
	label: string;
	description: string;
	items: GuidePackageChecklistItem[];
	blockingIssueCount: number;
	warningCount: number;
	failCount: number;
}

export interface GuidePackageRecommendationSummary {
	system: GuidePackageReviewRecommendation;
	reviewer?: GuidePackageReviewRecommendation;
	final: GuidePackageReviewRecommendation;
	reason: string;
}

export interface GuidePackageDiagnostics {
	readyToPublish: boolean;
	completenessScore: number;
	blockingIssueCount: number;
	warningCount: number;
	issues: GuidePackageIssue[];
	blockers: GuidePackageIssue[];
	warnings: GuidePackageIssue[];
	checklist: GuidePackageChecklistItem[];
	checklistCategories: GuidePackageChecklistCategoryGroup[];
	recommendation: GuidePackageRecommendationSummary;
	rubricVersion: string;
}

export interface GuidePackageWorkflow {
	id: string;
	electionSlug: string;
	jurisdictionSlug: string;
	status: GuidePackageStatus;
	reviewer?: string;
	reviewNotes?: string;
	reviewRecommendation?: GuidePackageReviewRecommendation;
	coverageNotes: string[];
	coverageLimits: string[];
	createdAt: string;
	draftedAt: string;
	reviewedAt?: string;
	publishedAt?: string;
	updatedAt: string;
}

export interface GuidePackageContestSummary {
	slug: string;
	title: string;
	office: string;
	type: Contest["type"];
	href: string;
	candidateCount: number;
	measureCount: number;
	sourceCount: number;
}

export interface GuidePackageCandidateSummary {
	slug: string;
	name: string;
	contestSlug: string;
	officeSought: string;
	party: string;
	href: string;
	sourceCount: number;
	summary: string;
}

export interface GuidePackageMeasureSummary {
	slug: string;
	title: string;
	contestSlug: string;
	href: string;
	sourceCount: number;
	summary: string;
}

export interface GuidePackageSummary {
	workflow: GuidePackageWorkflow;
	contentStatus: GuideContentSummary;
	election: ElectionSummary | null;
	jurisdiction: JurisdictionSummary | null;
	coverageScope: GuidePackageCoverageScope;
	counts: GuidePackageCounts;
	diagnostics: Pick<GuidePackageDiagnostics, "blockingIssueCount" | "completenessScore" | "readyToPublish" | "recommendation" | "warningCount">;
}

export interface GuidePackageRecord extends GuidePackageSummary {
	electionRecord: Election | null;
	jurisdictionRecord: Jurisdiction | null;
	contests: GuidePackageContestSummary[];
	candidates: GuidePackageCandidateSummary[];
	measures: GuidePackageMeasureSummary[];
	officialResources: OfficialResource[];
	attachedSources: Source[];
	diagnostics: GuidePackageDiagnostics;
}

export interface GuidePackageListResponse {
	packages: GuidePackageRecord[];
	updatedAt: string;
}

export interface GuidePackageRecordResponse {
	package: GuidePackageRecord;
	updatedAt: string;
}

export interface GuidePackageDiagnosticsResponse {
	packageId: string;
	diagnostics: GuidePackageDiagnostics;
	updatedAt: string;
}

export interface CompareResponse {
	requestedSlugs: string[];
	contestSlug: string | null;
	office: string | null;
	sameContest: boolean;
	candidates: Candidate[];
	note: string;
}

export type SearchResultType = "candidate" | "contest" | "district" | "election" | "jurisdiction" | "measure" | "source";

export interface SearchResultItem {
	id: string;
	type: SearchResultType;
	title: string;
	summary: string;
	href: string;
	meta: string;
	updatedAt?: string;
	sourceCount?: number;
	authority?: SourceAuthority;
}

export interface SearchResultGroup {
	label: string;
	type: SearchResultType;
	items: SearchResultItem[];
}

export interface SearchResponse {
	query: string;
	total: number;
	groups: SearchResultGroup[];
	suggestions: string[];
}

export type AdminPriority = "high" | "medium" | "low";

export type AdminUserRole = "admin" | "editor";

export type AdminSignalTone = "attention" | "healthy" | "review";

export type AdminReviewStatus
	= | "draft"
		| "in-review"
		| "needs-sources"
		| "ready-to-publish"
		| "published";

export type AdminCorrectionStatus = "new" | "researching" | "resolved" | "triaged";

export type AdminSourceHealth = "healthy" | "incident" | "review-soon" | "stale";

export type AdminEntityType = "candidate" | "election" | "measure" | "policy";

export type AdminActivityType = "correction" | "publish" | "review" | "source-check";

export type AdminAuditEventType
	= | "admin_user_create"
		| "admin_user_disable"
		| "admin_user_mfa_disable"
		| "admin_user_mfa_enable"
		| "admin_user_mfa_reset"
		| "admin_user_password_change"
		| "admin_user_password_reset"
		| "admin_user_restore"
		| "correction_public_update"
		| "correction_publish"
		| "correction_unpublish"
		| "content_publish"
		| "content_rollback"
		| "content_unpublish"
		| "guide_package_publish"
		| "guide_package_unpublish"
		| "source_monitor_update";

export type AdminSubmissionType = "correction" | "feedback";

export interface AdminDashboardMetric {
	id: string;
	label: string;
	value: string;
	helpText: string;
	tone: AdminSignalTone;
}

export interface AdminCorrectionRequest {
	contentId?: string;
	contentTitle?: string;
	id: string;
	submissionType: AdminSubmissionType;
	subject: string;
	entityType: AdminEntityType;
	entityLabel: string;
	status: AdminCorrectionStatus;
	priority: AdminPriority;
	submittedAt: string;
	reportedBy: string;
	summary: string;
	nextStep: string;
	sourceCount: number;
	pageUrl?: string;
}

export interface AdminReviewItem {
	id: string;
	title: string;
	entityType: AdminEntityType;
	status: AdminReviewStatus;
	priority: AdminPriority;
	updatedAt: string;
	assignedTo: string;
	blocker?: string;
	summary: string;
	sourceCoverage: string;
}

export interface AdminContentItem {
	id: string;
	title: string;
	entityType: AdminEntityType;
	entitySlug: string;
	status: AdminReviewStatus;
	priority: AdminPriority;
	updatedAt: string;
	assignedTo: string;
	blocker?: string;
	summary: string;
	publicSummary: string;
	publicBallotSummary?: string;
	sourceCoverage: string;
	published: boolean;
	publishedAt?: string;
	publishApprovedAt?: string;
	publishApprovedBy?: string;
	publishApprovalNote?: string;
}

export interface AdminContentSnapshot {
	assignedTo: string;
	blocker?: string;
	priority: AdminPriority;
	publicBallotSummary?: string;
	publicSummary: string;
	published: boolean;
	publishedAt?: string;
	publishApprovedAt?: string;
	publishApprovedBy?: string;
	publishApprovalNote?: string;
	status: AdminReviewStatus;
	updatedAt: string;
}

export interface AdminContentHistoryItem {
	id: string;
	contentId: string;
	changedAt: string;
	changedFields: string[];
	previous: AdminContentSnapshot;
	next: AdminContentSnapshot;
	summary: string;
}

export interface AdminSourceMonitorItem {
	id: string;
	label: string;
	authority: SourceAuthority;
	health: AdminSourceHealth;
	lastCheckedAt: string;
	nextCheckAt: string;
	owner: string;
	note: string;
}

export interface AdminActivityItem {
	id: string;
	label: string;
	type: AdminActivityType;
	timestamp: string;
	summary: string;
}

export interface AdminAuditEvent {
	actorDisplayName: string;
	actorRole?: AdminUserRole;
	actorUsername?: string;
	eventHash: string;
	eventType: AdminAuditEventType;
	id: string;
	metadata: Record<string, unknown>;
	previousHash?: string;
	sequence: number;
	summary: string;
	targetId: string;
	targetLabel: string;
	targetType: string;
	timestamp: string;
}

export interface AdminUser {
	id: string;
	username: string;
	displayName: string;
	role: AdminUserRole;
	createdAt: string;
	credentialsUpdatedAt?: string;
	disabledAt?: string;
	lastLoginAt?: string;
	mfaEnabledAt?: string;
	passwordChangeRequiredAt?: string;
}

export interface AdminSecurityUser {
	id: string;
	username: string;
	displayName: string;
	role: AdminUserRole;
}

export interface AdminSecurityStatus {
	activeAdminCount: number;
	activeUserCount: number;
	mfaEnabledUserCount: number;
	passwordChangeRequiredUserCount: number;
	status: "healthy" | "needs_attention";
	summary: string;
	usersWithoutMfa: AdminSecurityUser[];
	usersRequiringPasswordChange: AdminSecurityUser[];
}

export interface AdminOverviewResponse {
	metrics: AdminDashboardMetric[];
	needsAttention: string[];
	recentActivity: AdminActivityItem[];
	security: AdminSecurityStatus;
}

export interface AdminAuditResponse {
	events: AdminAuditEvent[];
	integrityVerified: boolean;
	latestHash?: string;
	updatedAt: string;
}

export interface AdminCorrectionsResponse {
	corrections: AdminCorrectionRequest[];
}

export interface AdminReviewResponse {
	items: AdminReviewItem[];
}

export interface AdminContentResponse {
	items: AdminContentItem[];
}

export interface AdminContentHistoryResponse {
	contentId: string;
	history: AdminContentHistoryItem[];
	updatedAt: string;
}

export interface AdminSourceMonitorResponse {
	sources: AdminSourceMonitorItem[];
}

export interface AdminUsersResponse {
	users: AdminUser[];
}

export interface AdminMfaSetupResponse {
	issuer: string;
	otpauthUrl: string;
	secret: string;
	username: string;
}

export interface AdminSessionResponse {
	authenticated: boolean;
	configured: boolean;
	credentialsUpdatedAt?: string;
	displayName: string | null;
	mfaEnabledAt?: string;
	mfaRequired?: boolean;
	passwordChangeRequiredAt?: string;
	role: AdminUserRole | null;
	username: string | null;
}

export type BallotViewMode = "deep" | "quick";

export interface PlannedCandidateChoice {
	type: "candidate";
	contestSlug: string;
	candidateSlug: string;
	savedAt: string;
}

export type PlannedMeasureDecision = "no" | "review" | "yes";

export interface PlannedMeasureChoice {
	type: "measure";
	contestSlug: string;
	measureSlug: string;
	decision: PlannedMeasureDecision;
	savedAt: string;
}

export type BallotPlanSelection = PlannedCandidateChoice | PlannedMeasureChoice;
