import type { CorrectionSubmissionInput } from "./feedback-submission.js";
import type {
	AdminActivityItem,
	AdminAuditEvent,
	AdminAuditEventType,
	AdminAuditResponse,
	AdminContentHistoryItem,
	AdminContentHistoryResponse,
	AdminContentItem,
	AdminContentResponse,
	AdminContentSnapshot,
	AdminCorrectionRequest,
	AdminCorrectionsResponse,
	AdminCorrectionStatus,
	AdminEntityType,
	AdminMfaSetupResponse,
	AdminOverviewResponse,
	AdminPriority,
	AdminReviewResponse,
	AdminReviewStatus,
	AdminSourceHealth,
	AdminSourceMonitorItem,
	AdminSourceMonitorResponse,
	AdminSubmissionType,
	AdminUser,
	AdminUserRole,
	AdminUsersResponse,
	GuidePackageReviewRecommendation,
	GuidePackageStatus,
	GuidePackageWorkflow,
} from "./types/civic.js";
import { Buffer } from "node:buffer";
import { createHash, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
	decryptAdminMfaSecret,
	encryptAdminMfaSecret,
	migrateAdminMfaSecret,
} from "./admin-mfa-secret.js";
import {
	buildAdminMfaOtpAuthUrl,
	createAdminMfaSecret,
	verifyAdminMfaCode
} from "./admin-mfa.js";
import { buildAdminSecurityStatus } from "./admin-security.js";
import {
	demoAdminCorrections,
	demoAdminOverview,
	demoAdminSourceMonitor,
	demoCandidates,
	demoElection,
	demoMeasures
} from "./coverage-data.js";
import { normalizeCorrectionSubmission } from "./feedback-submission.js";

export interface AdminRepositoryOptions {
	dbPath?: string | null;
	databaseUrl?: string | null;
	bootstrapDisplayName?: string | null;
	bootstrapPassword?: string | null;
	bootstrapRole?: AdminUserRole | null;
	bootstrapUsername?: string | null;
	contentSeed?: AdminContentItem[];
	correctionSeed?: AdminCorrectionRequest[];
	activitySeed?: AdminActivityItem[];
	sourceMonitorSeed?: AdminSourceMonitorItem[];
	guidePackageSeed?: GuidePackageWorkflow[];
	mfaEncryptionKey?: string | null;
}

export interface AdminAuditActor {
	displayName?: string | null;
	role?: AdminUserRole | null;
	username?: string | null;
}

export interface LegacyDemoAdminIds {
	activityIds: string[];
	contentIds: string[];
	correctionIds: string[];
	sourceMonitorIds: string[];
}

export interface GuidePackageWorkflowListResponse {
	packages: GuidePackageWorkflow[];
	updatedAt: string;
}

export interface ContentPatch {
	auditActor?: AdminAuditActor;
	assignedTo?: string;
	blocker?: string | null;
	priority?: AdminPriority;
	publishApprovedBy?: string | null;
	publishApprovalNote?: string | null;
	publicBallotSummary?: string | null;
	publicSummary?: string;
	published?: boolean;
	status?: AdminReviewStatus;
}

export interface CorrectionPatch {
	auditActor?: AdminAuditActor;
	contentId?: string | null;
	nextStep?: string;
	priority?: AdminPriority;
	status?: AdminCorrectionStatus;
}

export interface SourcePatch {
	auditActor?: AdminAuditActor;
	health?: AdminSourceHealth;
	nextCheckAt?: string;
	note?: string;
	owner?: string;
}

export interface CreateGuidePackageInput {
	auditActor?: AdminAuditActor;
	coverageLimits?: string[];
	coverageNotes?: string[];
	createdAt?: string;
	draftedAt?: string;
	electionSlug: string;
	id: string;
	jurisdictionSlug: string;
	publishedAt?: string | null;
	reviewRecommendation?: GuidePackageReviewRecommendation | null;
	reviewNotes?: string | null;
	reviewedAt?: string | null;
	reviewer?: string | null;
	status?: GuidePackageStatus;
	updatedAt?: string;
}

export interface GuidePackagePatch {
	auditActor?: AdminAuditActor;
	coverageLimits?: string[] | null;
	coverageNotes?: string[] | null;
	draftedAt?: string;
	publishedAt?: string | null;
	reviewRecommendation?: GuidePackageReviewRecommendation | null;
	reviewNotes?: string | null;
	reviewedAt?: string | null;
	reviewer?: string | null;
	status?: GuidePackageStatus;
}

export interface CreateUserInput {
	auditActor?: AdminAuditActor;
	displayName: string;
	password: string;
	role: AdminUserRole;
	username: string;
}

export interface UserPatch {
	auditActor?: AdminAuditActor;
	disabled?: boolean;
	mfaReset?: boolean;
	password?: string;
	passwordChangeMode?: "admin-reset" | "self-service";
}

export interface AdminRepository {
	driver: "postgres" | "sqlite";
	authenticateUser: (username: string, password: string) => AdminUser | null | Promise<AdminUser | null>;
	createCorrectionSubmission: (input: CorrectionSubmissionInput) => { ok: true; submittedAt: string } | Promise<{ ok: true; submittedAt: string }>;
	createMfaSetup: (username: string) => AdminMfaSetupResponse | Promise<AdminMfaSetupResponse>;
	createUser: (input: CreateUserInput) => AdminUser | Promise<AdminUser>;
	disableMfa: (username: string, currentPassword: string, mfaCode: string, auditActor?: AdminAuditActor) => AdminUser | Promise<AdminUser>;
	enableMfa: (username: string, currentPassword: string, secret: string, mfaCode: string, auditActor?: AdminAuditActor) => AdminUser | Promise<AdminUser>;
	getContentRecord: (entityType: AdminEntityType, entitySlug: string) => AdminContentItem | null | Promise<AdminContentItem | null>;
	getContentHistory: (id: string) => AdminContentHistoryResponse | Promise<AdminContentHistoryResponse>;
	getOverview: () => AdminOverviewResponse | Promise<AdminOverviewResponse>;
	getHealth: () => { ok: true } | Promise<{ ok: true }>;
	hasUsers: () => boolean | Promise<boolean>;
	listContent: () => AdminContentResponse | Promise<AdminContentResponse>;
	listCorrections: () => AdminCorrectionsResponse | Promise<AdminCorrectionsResponse>;
	listGuidePackages: () => GuidePackageWorkflowListResponse | Promise<GuidePackageWorkflowListResponse>;
	listReview: () => AdminReviewResponse | Promise<AdminReviewResponse>;
	listSourceMonitor: () => AdminSourceMonitorResponse | Promise<AdminSourceMonitorResponse>;
	listUsers: () => AdminUsersResponse | Promise<AdminUsersResponse>;
	createGuidePackage: (input: CreateGuidePackageInput) => GuidePackageWorkflowListResponse | Promise<GuidePackageWorkflowListResponse>;
	getGuidePackage: (id: string) => GuidePackageWorkflow | null | Promise<GuidePackageWorkflow | null>;
	listAuditEvents: () => AdminAuditResponse | Promise<AdminAuditResponse>;
	rollbackContent: (id: string, historyId: string, auditActor?: AdminAuditActor) => AdminContentResponse | Promise<AdminContentResponse>;
	updateContent: (id: string, patch: ContentPatch) => AdminContentResponse | Promise<AdminContentResponse>;
	updateCorrection: (id: string, patch: CorrectionPatch) => AdminCorrectionsResponse | Promise<AdminCorrectionsResponse>;
	updateGuidePackage: (id: string, patch: GuidePackagePatch) => GuidePackageWorkflowListResponse | Promise<GuidePackageWorkflowListResponse>;
	updateSource: (id: string, patch: SourcePatch) => AdminSourceMonitorResponse | Promise<AdminSourceMonitorResponse>;
	updateUser: (id: string, patch: UserPatch) => AdminUsersResponse | Promise<AdminUsersResponse>;
	verifyUserMfaCode: (userId: string, mfaCode: string) => boolean | Promise<boolean>;
}

interface DatabaseCountRow {
	count: number;
}

interface UserRow {
	id: string;
	username: string;
	display_name: string;
	role: AdminUserRole;
	created_at: string;
	credentials_updated_at: string | null;
	disabled_at: string | null;
	last_login_at: string | null;
	mfa_enabled_at: string | null;
	mfa_secret: string | null;
	password_change_required_at: string | null;
	password_hash: string;
	updated_at: string;
}

const adminUserSelectColumns = "id, username, display_name, role, created_at, credentials_updated_at, disabled_at, last_login_at, mfa_secret, mfa_enabled_at, password_change_required_at, password_hash, updated_at";

interface ContentRow {
	id: string;
	title: string;
	entity_type: AdminEntityType;
	entity_slug: string;
	status: AdminReviewStatus;
	priority: AdminPriority;
	updated_at: string;
	assigned_to: string;
	blocker: string | null;
	summary: string;
	public_summary: string | null;
	ballot_summary: string | null;
	source_coverage: string;
	published: number;
	published_at: string | null;
	publish_approved_at: string | null;
	publish_approved_by: string | null;
	publish_approval_note: string | null;
}

export interface ContentHistoryRow {
	id: string;
	content_id: string;
	changed_at: string;
	changed_fields: string;
	previous_snapshot: string;
	next_snapshot: string;
	summary: string;
}

interface ContentSnapshotSource {
	assigned_to: string;
	blocker: string | null;
	priority: AdminPriority;
	public_summary: string | null;
	ballot_summary: string | null;
	published: boolean | number;
	published_at: string | null;
	publish_approved_at: string | null;
	publish_approved_by: string | null;
	publish_approval_note: string | null;
	status: AdminReviewStatus;
	updated_at: string;
}

interface CorrectionRow {
	content_id: string | null;
	content_title: string | null;
	id: string;
	submission_type: AdminSubmissionType;
	subject: string;
	entity_type: AdminEntityType;
	entity_label: string;
	status: AdminCorrectionStatus;
	priority: AdminPriority;
	submitted_at: string;
	reported_by: string;
	summary: string;
	next_step: string;
	source_count: number;
	page_url: string | null;
}

interface SourceRow {
	id: string;
	label: string;
	authority: AdminSourceMonitorItem["authority"];
	health: AdminSourceHealth;
	last_checked_at: string;
	next_check_at: string;
	owner: string;
	note: string;
}

interface ActivityRow {
	id: string;
	label: string;
	type: AdminActivityItem["type"];
	timestamp: string;
	summary: string;
}

interface AuditRow {
	actor_display_name: string;
	actor_role: AdminUserRole | null;
	actor_username: string | null;
	event_hash: string;
	event_type: AdminAuditEventType;
	id: string;
	metadata: string;
	previous_hash: string | null;
	sequence: number;
	summary: string;
	target_id: string;
	target_label: string;
	target_type: string;
	timestamp: string;
}

interface AuditEventInput {
	actor?: AdminAuditActor;
	eventType: AdminAuditEventType;
	metadata?: Record<string, unknown>;
	summary: string;
	targetId: string;
	targetLabel: string;
	targetType: string;
	timestamp?: string;
}

interface GuidePackageRow {
	id: string;
	election_slug: string;
	jurisdiction_slug: string;
	status: GuidePackageStatus;
	reviewer: string | null;
	review_notes: string | null;
	review_recommendation: GuidePackageReviewRecommendation | null;
	coverage_notes: string;
	coverage_limits: string;
	created_at: string;
	drafted_at: string;
	reviewed_at: string | null;
	published_at: string | null;
	updated_at: string;
}

export const defaultDbPath = fileURLToPath(new URL("../data/ballot-clarity.sqlite", import.meta.url));
const packagedSchemaPath = new URL("./admin-schema.sql", import.meta.url);
const sourceSchemaPath = new URL("../admin-schema.sql", import.meta.url);

export function resolveSqliteSchemaPath() {
	const packagedPathname = fileURLToPath(packagedSchemaPath);

	if (existsSync(packagedPathname))
		return packagedPathname;

	return fileURLToPath(sourceSchemaPath);
}

export function hashPassword(password: string) {
	const salt = randomUUID().replaceAll("-", "");
	const derived = scryptSync(password, salt, 64).toString("hex");

	return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
	const [algorithm, salt, digest] = storedHash.split(":");

	if (algorithm !== "scrypt" || !salt || !digest)
		return false;

	const computed = scryptSync(password, salt, 64);
	const stored = Buffer.from(digest, "hex");

	if (computed.length !== stored.length)
		return false;

	return timingSafeEqual(computed, stored);
}

export function normalizeAdminPassword(password: string) {
	const normalized = password.trim();

	if (normalized.length < 12)
		throw new Error("Admin passwords must be at least 12 characters.");

	if (normalized.length > 256)
		throw new Error("Admin passwords must be 256 characters or fewer.");

	if (normalized.includes("\0"))
		throw new Error("Admin password contains an invalid control character.");

	return normalized;
}

export function normalizeAdminUsername(username: string) {
	const normalized = username.trim().toLowerCase();

	if (!/^[a-z\d](?:[a-z\d._-]{0,62}[a-z\d])?$/u.test(normalized))
		throw new Error("Admin usernames must be 1 to 64 characters and use only letters, numbers, periods, underscores, or hyphens.");

	return normalized;
}

export function normalizeAdminDisplayName(displayName: string) {
	const normalized = displayName.trim();

	if (!normalized || normalized.length > 200)
		throw new Error("Admin display names must be 1 to 200 characters.");

	if (Array.from(normalized).some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127;
	})) {
		throw new Error("Admin display name contains an invalid control character.");
	}

	return normalized;
}

export function validateAdminUserRole(role: unknown): asserts role is AdminUserRole {
	if (role !== "admin" && role !== "editor")
		throw new Error("Role must be either admin or editor.");
}

const validAdminPriorities = new Set<AdminPriority>(["high", "medium", "low"]);
const validAdminCorrectionStatuses = new Set<AdminCorrectionStatus>([
	"new",
	"triaged",
	"researching",
	"resolved"
]);
const validAdminReviewStatuses = new Set<AdminReviewStatus>([
	"draft",
	"in-review",
	"needs-sources",
	"ready-to-publish",
	"published"
]);
const validAdminSourceHealthValues = new Set<AdminSourceHealth>([
	"healthy",
	"incident",
	"review-soon",
	"stale"
]);

function assertBoundedAdminText(label: string, value: string | null | undefined, maximumLength: number) {
	if (value === undefined || value === null)
		return;

	if (value.includes("\0"))
		throw new Error(`${label} contains an invalid control character.`);

	if (value.length > maximumLength)
		throw new Error(`${label} must be ${maximumLength.toLocaleString("en-US")} characters or fewer.`);
}

export function validateContentPatch(patch: ContentPatch) {
	if (patch.priority !== undefined && !validAdminPriorities.has(patch.priority))
		throw new Error("Content priority is invalid.");

	if (patch.status !== undefined && !validAdminReviewStatuses.has(patch.status))
		throw new Error("Content status is invalid.");

	assertBoundedAdminText("Content assignee", patch.assignedTo, 200);
	assertBoundedAdminText("Content blocker", patch.blocker, 2_000);
	assertBoundedAdminText("Publish approval reviewer", patch.publishApprovedBy, 200);
	assertBoundedAdminText("Publish approval note", patch.publishApprovalNote, 5_000);
	assertBoundedAdminText("Public ballot summary", patch.publicBallotSummary, 3_000);
	assertBoundedAdminText("Public page summary", patch.publicSummary, 10_000);
}

export function validateCorrectionPatch(patch: CorrectionPatch) {
	if (patch.priority !== undefined && !validAdminPriorities.has(patch.priority))
		throw new Error("Correction priority is invalid.");

	if (patch.status !== undefined && !validAdminCorrectionStatuses.has(patch.status))
		throw new Error("Correction status is invalid.");

	assertBoundedAdminText("Linked content id", patch.contentId, 256);
	assertBoundedAdminText("Correction next step", patch.nextStep, 2_000);
}

export function validateSourcePatch(patch: SourcePatch) {
	if (patch.health !== undefined && !validAdminSourceHealthValues.has(patch.health))
		throw new Error("Source health is invalid.");

	assertBoundedAdminText("Next source check", patch.nextCheckAt, 64);
	assertBoundedAdminText("Source note", patch.note, 2_000);
	assertBoundedAdminText("Source owner", patch.owner, 200);

	if (patch.nextCheckAt !== undefined && !Number.isFinite(Date.parse(patch.nextCheckAt)))
		throw new Error("Next source check must be a valid timestamp.");
}

export function validateContentSnapshotForPersistence(snapshot: AdminContentSnapshot) {
	if (!validAdminPriorities.has(snapshot.priority))
		throw new Error("Content priority is invalid.");

	if (!validAdminReviewStatuses.has(snapshot.status))
		throw new Error("Content status is invalid.");

	assertBoundedAdminText("Content assignee", snapshot.assignedTo, 200);
	assertBoundedAdminText("Content blocker", snapshot.blocker, 2_000);
	assertBoundedAdminText("Publish approval reviewer", snapshot.publishApprovedBy, 200);
	assertBoundedAdminText("Publish approval note", snapshot.publishApprovalNote, 5_000);
	assertBoundedAdminText("Public ballot summary", snapshot.publicBallotSummary, 3_000);
	assertBoundedAdminText("Public page summary", snapshot.publicSummary, 10_000);

	if (snapshot.published && snapshot.status !== "published")
		throw new Error("Published content must use the published status.");

	if (!snapshot.published && snapshot.status === "published")
		throw new Error("Unpublished content cannot use the published status.");

	if (snapshot.published && snapshot.blocker)
		throw new Error("Content blockers must be resolved before publication.");

	if (snapshot.published && !snapshot.publishApprovedBy?.trim())
		throw new Error("Publish approval reviewer is required before content can be published.");

	if (snapshot.published && !snapshot.publishApprovalNote?.trim())
		throw new Error("Publish approval note is required before content can be published.");
}

const validGuidePackageStatuses = new Set<GuidePackageStatus>([
	"draft",
	"in_review",
	"ready_to_publish",
	"published"
]);
const validGuidePackageReviewRecommendations = new Set<GuidePackageReviewRecommendation>([
	"publish",
	"publish_with_warnings",
	"needs_revision",
	"do_not_publish"
]);

export interface GuidePackagePersistenceState {
	coverageLimits: string[];
	coverageNotes: string[];
	draftedAt: string;
	publishedAt: string | null;
	reviewRecommendation: GuidePackageReviewRecommendation | null;
	reviewNotes: string | null;
	reviewedAt: string | null;
	reviewer: string | null;
	status: GuidePackageStatus;
}

function assertValidIsoTimestamp(label: string, value: string | null) {
	if (value !== null && !Number.isFinite(Date.parse(value)))
		throw new Error(`${label} must be a valid timestamp.`);
}

export function validateGuidePackagePersistenceState(state: GuidePackagePersistenceState) {
	if (!validGuidePackageStatuses.has(state.status))
		throw new Error("Guide package status is invalid.");

	if (
		state.reviewRecommendation !== null
		&& !validGuidePackageReviewRecommendations.has(state.reviewRecommendation)
	) {
		throw new Error("Guide package review recommendation is invalid.");
	}

	assertBoundedAdminText("Guide package reviewer", state.reviewer, 200);
	assertBoundedAdminText("Guide package review notes", state.reviewNotes, 5_000);
	assertValidIsoTimestamp("Guide package drafted time", state.draftedAt);
	assertValidIsoTimestamp("Guide package reviewed time", state.reviewedAt);
	assertValidIsoTimestamp("Guide package published time", state.publishedAt);

	for (const [label, entries] of [
		["Coverage limits", state.coverageLimits],
		["Coverage notes", state.coverageNotes]
	] as const) {
		if (entries.length > 50 || entries.some(entry => typeof entry !== "string" || entry.length > 1_000 || entry.includes("\0")))
			throw new Error(`${label} must contain at most 50 bounded text entries.`);

		if (entries.join("").length > 10_000)
			throw new Error(`${label} entries are too long.`);
	}

	const isReadyOrPublished = state.status === "ready_to_publish" || state.status === "published";
	const recommendationIsPublishReady = state.reviewRecommendation === "publish"
		|| state.reviewRecommendation === "publish_with_warnings";

	if (isReadyOrPublished && !state.reviewer?.trim())
		throw new Error("Guide package reviewer is required before promotion.");

	if (isReadyOrPublished && !state.reviewNotes?.trim())
		throw new Error("Guide package review notes are required before promotion.");

	if (isReadyOrPublished && !state.reviewedAt)
		throw new Error("Guide package review time is required before promotion.");

	if (isReadyOrPublished && !recommendationIsPublishReady)
		throw new Error("Guide package review recommendation must approve publication before promotion.");

	if (state.status === "published" && !state.publishedAt)
		throw new Error("Guide package publication time is required for published packages.");

	if (state.status !== "published" && state.publishedAt)
		throw new Error("Only published guide packages may retain a publication time.");
}

export function nextAdminCredentialTimestamp(previous?: string | null) {
	const now = new Date().toISOString();

	if (!previous)
		return now;

	const previousMs = Date.parse(previous);
	const nowMs = Date.parse(now);

	if (Number.isFinite(previousMs) && Number.isFinite(nowMs) && nowMs <= previousMs)
		return new Date(previousMs + 1).toISOString();

	return now;
}

function rowToUser(row: UserRow): AdminUser {
	return {
		createdAt: row.created_at,
		credentialsUpdatedAt: row.credentials_updated_at || row.created_at,
		disabledAt: row.disabled_at || undefined,
		displayName: row.display_name,
		id: row.id,
		lastLoginAt: row.last_login_at || undefined,
		mfaEnabledAt: row.mfa_enabled_at || undefined,
		passwordChangeRequiredAt: row.password_change_required_at || undefined,
		role: row.role,
		username: row.username
	};
}

function verifyAdminMfaCodeSafely(secret: string, code: string) {
	try {
		return verifyAdminMfaCode({ code, secret });
	}
	catch {
		return false;
	}
}

function rowToContent(row: ContentRow): AdminContentItem {
	return {
		assignedTo: row.assigned_to,
		blocker: row.blocker || undefined,
		entitySlug: row.entity_slug,
		entityType: row.entity_type,
		id: row.id,
		priority: row.priority,
		publicBallotSummary: row.ballot_summary || undefined,
		publicSummary: row.public_summary || "",
		published: Boolean(row.published),
		publishedAt: row.published_at || undefined,
		publishApprovedAt: row.publish_approved_at || undefined,
		publishApprovedBy: row.publish_approved_by || undefined,
		publishApprovalNote: row.publish_approval_note || undefined,
		sourceCoverage: row.source_coverage,
		status: row.status,
		summary: row.summary,
		title: row.title,
		updatedAt: row.updated_at
	};
}

export function buildContentSnapshot(row: ContentSnapshotSource, updatedAt = row.updated_at): AdminContentSnapshot {
	return {
		assignedTo: row.assigned_to,
		blocker: row.blocker || undefined,
		priority: row.priority,
		publicBallotSummary: row.ballot_summary || undefined,
		publicSummary: row.public_summary || "",
		published: Boolean(row.published),
		publishedAt: row.published_at || undefined,
		publishApprovedAt: row.publish_approved_at || undefined,
		publishApprovedBy: row.publish_approved_by || undefined,
		publishApprovalNote: row.publish_approval_note || undefined,
		status: row.status,
		updatedAt
	};
}

export function parseContentSnapshot(raw: string): AdminContentSnapshot {
	const parsed = JSON.parse(raw) as Partial<AdminContentSnapshot>;

	if (
		typeof parsed.assignedTo !== "string"
		|| (parsed.blocker !== undefined && typeof parsed.blocker !== "string")
		|| (parsed.priority !== "high" && parsed.priority !== "medium" && parsed.priority !== "low")
		|| (parsed.publicBallotSummary !== undefined && typeof parsed.publicBallotSummary !== "string")
		|| typeof parsed.publicSummary !== "string"
		|| typeof parsed.published !== "boolean"
		|| (parsed.publishedAt !== undefined && typeof parsed.publishedAt !== "string")
		|| (parsed.publishApprovedAt !== undefined && typeof parsed.publishApprovedAt !== "string")
		|| (parsed.publishApprovedBy !== undefined && typeof parsed.publishApprovedBy !== "string")
		|| (parsed.publishApprovalNote !== undefined && typeof parsed.publishApprovalNote !== "string")
		|| typeof parsed.status !== "string"
		|| typeof parsed.updatedAt !== "string"
	) {
		throw new Error("Stored content history snapshot is invalid.");
	}

	return parsed as AdminContentSnapshot;
}

export function parseContentHistoryRow(row: ContentHistoryRow): AdminContentHistoryItem {
	const changedFields = JSON.parse(row.changed_fields) as unknown;

	return {
		changedAt: row.changed_at,
		changedFields: Array.isArray(changedFields) ? changedFields.map(String) : [],
		contentId: row.content_id,
		id: row.id,
		next: parseContentSnapshot(row.next_snapshot),
		previous: parseContentSnapshot(row.previous_snapshot),
		summary: row.summary
	};
}

export function changedContentFields(previous: AdminContentSnapshot, next: AdminContentSnapshot) {
	const fields: Array<keyof AdminContentSnapshot> = [
		"assignedTo",
		"blocker",
		"priority",
		"publicBallotSummary",
		"publicSummary",
		"published",
		"publishedAt",
		"publishApprovedAt",
		"publishApprovedBy",
		"publishApprovalNote",
		"status"
	];

	return fields.filter(field => (previous[field] ?? null) !== (next[field] ?? null));
}

export function describeContentHistoryChange(title: string, changedFields: string[]) {
	return `${title} changed: ${changedFields.join(", ")}.`;
}

export function snapshotToContentUpdateValues(snapshot: AdminContentSnapshot) {
	return {
		assignedTo: snapshot.assignedTo.trim(),
		blocker: snapshot.blocker?.trim() || null,
		priority: snapshot.priority,
		publicBallotSummary: snapshot.publicBallotSummary?.trim() || null,
		publicSummary: snapshot.publicSummary.trim(),
		published: snapshot.published,
		publishedAt: snapshot.published ? snapshot.publishedAt || null : null,
		publishApprovedAt: snapshot.published ? snapshot.publishApprovedAt || null : null,
		publishApprovedBy: snapshot.published ? snapshot.publishApprovedBy?.trim() || null : null,
		publishApprovalNote: snapshot.published ? snapshot.publishApprovalNote?.trim() || null : null,
		status: snapshot.status
	};
}

export function resolveContentLookupFromPageUrl(pageUrl: string | null | undefined) {
	const raw = pageUrl?.trim();

	if (!raw)
		return null;

	let pathname: string;

	try {
		pathname = new URL(raw, "https://ballotclarity.org").pathname;
	}
	catch {
		return null;
	}

	const segments = pathname.replace(/^\/+|\/+$/gu, "").split("/").filter(Boolean);
	const [section, slug, extra] = segments;

	if (!section || !slug || extra)
		return null;

	if (section === "candidate" || section === "candidates")
		return { entitySlug: slug, entityType: "candidate" as const };

	if (section === "measure" || section === "measures")
		return { entitySlug: slug, entityType: "measure" as const };

	if (section === "ballot" || section === "election" || section === "elections")
		return { entitySlug: slug, entityType: "election" as const };

	return null;
}

function rowToCorrection(row: CorrectionRow): AdminCorrectionRequest {
	return {
		contentId: row.content_id || undefined,
		contentTitle: row.content_title || undefined,
		entityLabel: row.entity_label,
		entityType: row.entity_type,
		id: row.id,
		nextStep: row.next_step,
		pageUrl: row.page_url || undefined,
		priority: row.priority,
		reportedBy: row.reported_by,
		sourceCount: row.source_count,
		status: row.status,
		subject: row.subject,
		submissionType: row.submission_type,
		submittedAt: row.submitted_at,
		summary: row.summary
	};
}

function rowToSource(row: SourceRow): AdminSourceMonitorItem {
	return {
		authority: row.authority,
		health: row.health,
		id: row.id,
		label: row.label,
		lastCheckedAt: row.last_checked_at,
		nextCheckAt: row.next_check_at,
		note: row.note,
		owner: row.owner
	};
}

function rowToActivity(row: ActivityRow): AdminActivityItem {
	return {
		id: row.id,
		label: row.label,
		summary: row.summary,
		timestamp: row.timestamp,
		type: row.type
	};
}

function parseAuditMetadata(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw) as unknown;

		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {};
	}
	catch {
		return {};
	}
}

function rowToAuditEvent(row: AuditRow): AdminAuditEvent {
	return {
		actorDisplayName: row.actor_display_name,
		actorRole: row.actor_role || undefined,
		actorUsername: row.actor_username || undefined,
		eventHash: row.event_hash,
		eventType: row.event_type,
		id: row.id,
		metadata: parseAuditMetadata(row.metadata),
		previousHash: row.previous_hash || undefined,
		sequence: row.sequence,
		summary: row.summary,
		targetId: row.target_id,
		targetLabel: row.target_label,
		targetType: row.target_type,
		timestamp: row.timestamp
	};
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value))
		return `[${value.map(item => stableStringify(item)).join(",")}]`;

	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
			.join(",")}}`;
	}

	return JSON.stringify(value);
}

function hashAuditEvent(input: Omit<AuditRow, "event_hash">) {
	return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function auditRowWithoutHash(row: AuditRow): Omit<AuditRow, "event_hash"> {
	return {
		actor_display_name: row.actor_display_name,
		actor_role: row.actor_role,
		actor_username: row.actor_username,
		event_type: row.event_type,
		id: row.id,
		metadata: row.metadata,
		previous_hash: row.previous_hash || null,
		sequence: row.sequence,
		summary: row.summary,
		target_id: row.target_id,
		target_label: row.target_label,
		target_type: row.target_type,
		timestamp: row.timestamp
	};
}

function normalizeAuditActor(actor: AdminAuditActor | undefined) {
	const username = actor?.username?.trim().toLowerCase() || null;
	const displayName = actor?.displayName?.trim() || username || "Admin API";
	const role = actor?.role === "admin" || actor?.role === "editor" ? actor.role : null;

	return {
		displayName,
		role,
		username
	};
}

function verifyAuditChain(rows: AuditRow[]) {
	let previousHash: string | null = null;
	let previousSequence = 0;

	for (const row of rows) {
		if (row.sequence !== previousSequence + 1)
			return false;

		if ((row.previous_hash || null) !== previousHash)
			return false;

		if (hashAuditEvent(auditRowWithoutHash(row)) !== row.event_hash)
			return false;

		previousHash = row.event_hash;
		previousSequence = row.sequence;
	}

	return true;
}

function parseStoredStringArray(raw: string | null | undefined) {
	if (!raw)
		return [];

	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed.map(item => String(item ?? "").trim()).filter(Boolean)
			: [];
	}
	catch {
		return [];
	}
}

function rowToGuidePackage(row: GuidePackageRow): GuidePackageWorkflow {
	return {
		coverageLimits: parseStoredStringArray(row.coverage_limits),
		coverageNotes: parseStoredStringArray(row.coverage_notes),
		createdAt: row.created_at,
		draftedAt: row.drafted_at,
		electionSlug: row.election_slug,
		id: row.id,
		jurisdictionSlug: row.jurisdiction_slug,
		publishedAt: row.published_at || undefined,
		reviewRecommendation: row.review_recommendation || undefined,
		reviewNotes: row.review_notes || undefined,
		reviewedAt: row.reviewed_at || undefined,
		reviewer: row.reviewer || undefined,
		status: row.status,
		updatedAt: row.updated_at,
	};
}

export function defaultContentSeed(): AdminContentItem[] {
	const candidateItems = demoCandidates.map((candidate) => {
		const sourceCoverage = `${candidate.sources.length} attached staged source${candidate.sources.length === 1 ? "" : "s"} with ${candidate.whatWeKnow.length} documented knowledge checks; not approved for public candidate publication.`;
		const priority: AdminPriority = candidate.slug === "sandra-patel" ? "medium" : "low";
		const status: AdminReviewStatus = candidate.slug === "sandra-patel" ? "needs-sources" : "in-review";

		return {
			assignedTo: candidate.slug === "sandra-patel" ? "Research queue" : "Editorial review",
			blocker: candidate.slug === "sandra-patel"
				? "Waiting on a source-backed Georgia legislative district crosswalk note."
				: undefined,
			entitySlug: candidate.slug,
			entityType: "candidate" as const,
			id: `content-${candidate.slug}`,
			priority,
			publicBallotSummary: candidate.ballotSummary,
			publicSummary: candidate.summary,
			published: false,
			sourceCoverage,
			status,
			summary: candidate.summary,
			title: `${candidate.name} profile`,
			updatedAt: candidate.updatedAt
		};
	});

	const measureItems = demoMeasures.map((measure, index) => ({
		assignedTo: index === 0 ? "Managing editor" : "Editorial review",
		blocker: undefined,
		entitySlug: measure.slug,
		entityType: "measure" as const,
		id: `content-${measure.slug}`,
		priority: index === 0 ? "medium" as const : "low" as const,
		publicBallotSummary: measure.ballotSummary,
		publicSummary: measure.summary,
		published: false,
		sourceCoverage: `${measure.sources.length} attached staged source${measure.sources.length === 1 ? "" : "s"} with yes/no impact sections and fiscal notes; not approved for public measure publication.`,
		status: "in-review" as const,
		summary: measure.summary,
		title: measure.title,
		updatedAt: measure.updatedAt
	}));

	return [
		{
			assignedTo: "Editorial review",
			blocker: undefined,
			entitySlug: demoElection.slug,
			entityType: "election",
			id: `content-${demoElection.slug}`,
			priority: "high",
			publicSummary: demoElection.description,
			published: true,
			publishedAt: demoElection.updatedAt,
			publishApprovedAt: demoElection.updatedAt,
			publishApprovedBy: "Editorial review",
			publishApprovalNote: "Approved only for the official-logistics guide shell; contest, candidate, and measure content remains unpublished until locally verified.",
			sourceCoverage: `${demoElection.contests.length} contest sections with official notices and guide freshness metadata attached.`,
			status: "published",
			summary: "Cross-checking the Fulton County launch profile, official office links, and public-status language before the next public refresh.",
			title: "Fulton County launch coverage profile",
			updatedAt: demoElection.updatedAt
		},
		...candidateItems,
		...measureItems
	];
}

export function getLegacyDemoAdminIds(): LegacyDemoAdminIds {
	return {
		activityIds: demoAdminOverview.recentActivity.map(item => item.id),
		contentIds: defaultContentSeed().map(item => item.id),
		correctionIds: demoAdminCorrections.corrections.map(item => item.id),
		sourceMonitorIds: demoAdminSourceMonitor.sources.map(item => item.id)
	};
}

export function shouldPurgeLegacyDemoAdminData(options: AdminRepositoryOptions) {
	return options.contentSeed === undefined
		&& options.correctionSeed === undefined
		&& options.sourceMonitorSeed === undefined
		&& options.activitySeed === undefined;
}

function deleteRowsByIds(database: DatabaseSync, table: string, ids: string[]) {
	if (!ids.length)
		return;

	const placeholders = ids.map(() => "?").join(", ");
	database.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids);
}

function ensureDatabasePath(pathname: string) {
	if (pathname === ":memory:")
		return pathname;

	mkdirSync(dirname(pathname), { recursive: true });
	return pathname;
}

function hasColumn(database: DatabaseSync, table: string, column: string) {
	const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
	return rows.some(row => row.name === column);
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string) {
	if (hasColumn(database, table, column))
		return;

	database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function createSqliteAdminRepository(options: AdminRepositoryOptions = {}): AdminRepository {
	const resolvedPath = ensureDatabasePath(options.dbPath || process.env.ADMIN_DB_PATH || defaultDbPath);
	const database = new DatabaseSync(resolvedPath);
	const dummyPasswordHash = hashPassword(randomUUID());
	const mfaEncryptionKey = options.mfaEncryptionKey ?? process.env.ADMIN_MFA_ENCRYPTION_KEY ?? "";
	const schema = readFileSync(resolveSqliteSchemaPath(), "utf8");
	const contentSeed = options.contentSeed ?? [];
	const correctionSeed = options.correctionSeed ?? [];
	const sourceMonitorSeed = options.sourceMonitorSeed ?? [];
	const activitySeed = options.activitySeed ?? [];
	const guidePackageSeed = options.guidePackageSeed ?? [];

	database.exec(schema);
	ensureColumn(database, "admin_users", "credentials_updated_at", "TEXT");
	ensureColumn(database, "admin_users", "disabled_at", "TEXT");
	ensureColumn(database, "admin_users", "mfa_secret", "TEXT");
	ensureColumn(database, "admin_users", "mfa_enabled_at", "TEXT");
	ensureColumn(database, "admin_users", "password_change_required_at", "TEXT");
	ensureColumn(database, "admin_content", "public_summary", "TEXT");
	ensureColumn(database, "admin_content", "ballot_summary", "TEXT");
	ensureColumn(database, "admin_content", "publish_approved_by", "TEXT");
	ensureColumn(database, "admin_content", "publish_approved_at", "TEXT");
	ensureColumn(database, "admin_content", "publish_approval_note", "TEXT");
	ensureColumn(database, "admin_corrections", "content_id", "TEXT");
	ensureColumn(database, "admin_guide_packages", "review_recommendation", "TEXT");
	database.exec("CREATE INDEX IF NOT EXISTS idx_admin_corrections_content ON admin_corrections (content_id)");
	database.prepare(`
		UPDATE admin_users
		SET credentials_updated_at = COALESCE(credentials_updated_at, created_at, updated_at)
		WHERE credentials_updated_at IS NULL
	`).run();
	const storedMfaSecrets = database.prepare(`
		SELECT id, mfa_secret
		FROM admin_users
		WHERE mfa_secret IS NOT NULL
	`).all() as Array<{ id: string; mfa_secret: string }>;

	if (storedMfaSecrets.length) {
		database.exec("BEGIN IMMEDIATE");

		try {
			const updateMfaSecret = database.prepare(`
				UPDATE admin_users
				SET mfa_secret = ?
				WHERE id = ?
			`);

			for (const row of storedMfaSecrets) {
				const migratedSecret = migrateAdminMfaSecret(
					row.id,
					row.mfa_secret,
					mfaEncryptionKey
				);

				if (migratedSecret !== row.mfa_secret)
					updateMfaSecret.run(migratedSecret, row.id);
			}

			database.exec("COMMIT");
		}
		catch (error) {
			database.exec("ROLLBACK");
			throw error;
		}
	}
	database.prepare(`
		UPDATE admin_content
		SET publish_approved_by = COALESCE(publish_approved_by, 'Legacy publish state'),
			publish_approved_at = COALESCE(publish_approved_at, published_at, updated_at),
			publish_approval_note = COALESCE(publish_approval_note, 'Published before approval metadata was added; retained as a legacy approved record.')
		WHERE published = 1 AND publish_approved_by IS NULL
	`).run();

	if (shouldPurgeLegacyDemoAdminData(options)) {
		const legacyIds = getLegacyDemoAdminIds();

		deleteRowsByIds(database, "admin_content", legacyIds.contentIds);
		deleteRowsByIds(database, "admin_corrections", legacyIds.correctionIds);
		deleteRowsByIds(database, "admin_source_monitors", legacyIds.sourceMonitorIds);
		deleteRowsByIds(database, "admin_activity", legacyIds.activityIds);
	}

	const countStatement = (table: string) => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`);

	const usersCount = Number((countStatement("admin_users").get() as unknown as DatabaseCountRow).count);
	const contentCount = Number((countStatement("admin_content").get() as unknown as DatabaseCountRow).count);
	const correctionsCount = Number((countStatement("admin_corrections").get() as unknown as DatabaseCountRow).count);
	const sourcesCount = Number((countStatement("admin_source_monitors").get() as unknown as DatabaseCountRow).count);
	const activityCount = Number((countStatement("admin_activity").get() as unknown as DatabaseCountRow).count);
	const guidePackagesCount = Number((countStatement("admin_guide_packages").get() as unknown as DatabaseCountRow).count);

	if (!contentCount) {
		const insertContent = database.prepare(`
			INSERT INTO admin_content (
				id,
				entity_type,
				entity_slug,
				title,
				status,
				priority,
				assigned_to,
				blocker,
				summary,
				public_summary,
				ballot_summary,
				source_coverage,
				published,
				published_at,
				publish_approved_by,
				publish_approved_at,
				publish_approval_note,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const item of contentSeed) {
			insertContent.run(
				item.id,
				item.entityType,
				item.entitySlug,
				item.title,
				item.status,
				item.priority,
				item.assignedTo,
				item.blocker || null,
				item.summary,
				item.publicSummary,
				item.publicBallotSummary || null,
				item.sourceCoverage,
				item.published ? 1 : 0,
				item.publishedAt || null,
				item.publishApprovedBy || null,
				item.publishApprovedAt || null,
				item.publishApprovalNote || null,
				item.updatedAt
			);
		}
	}

	const backfillContentFields = database.prepare(`
		UPDATE admin_content
		SET public_summary = CASE
				WHEN public_summary IS NULL OR trim(public_summary) = '' THEN ?
				ELSE public_summary
			END,
			ballot_summary = CASE
				WHEN ballot_summary IS NULL OR trim(ballot_summary) = '' THEN ?
				ELSE ballot_summary
			END,
			published = CASE
				WHEN public_summary IS NULL OR trim(public_summary) = '' THEN ?
				ELSE published
			END,
			published_at = CASE
				WHEN public_summary IS NULL OR trim(public_summary) = '' THEN COALESCE(published_at, ?)
				ELSE published_at
			END,
			publish_approved_by = CASE
				WHEN public_summary IS NULL OR trim(public_summary) = '' THEN COALESCE(publish_approved_by, ?)
				ELSE publish_approved_by
			END,
			publish_approved_at = CASE
				WHEN public_summary IS NULL OR trim(public_summary) = '' THEN COALESCE(publish_approved_at, ?)
				ELSE publish_approved_at
			END,
			publish_approval_note = CASE
				WHEN public_summary IS NULL OR trim(public_summary) = '' THEN COALESCE(publish_approval_note, ?)
				ELSE publish_approval_note
			END
		WHERE entity_type = ? AND entity_slug = ?
	`);

	for (const item of contentSeed) {
		backfillContentFields.run(
			item.publicSummary,
			item.publicBallotSummary || null,
			item.published ? 1 : 0,
			item.publishedAt || null,
			item.publishApprovedBy || null,
			item.publishApprovedAt || null,
			item.publishApprovalNote || null,
			item.entityType,
			item.entitySlug
		);
	}

	if (!correctionsCount) {
		const insertCorrection = database.prepare(`
			INSERT INTO admin_corrections (
				id,
				submission_type,
				subject,
				entity_type,
				entity_label,
				status,
				priority,
				submitted_at,
				reported_by,
				summary,
				next_step,
				source_count,
				page_url,
				content_id
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const item of correctionSeed) {
			insertCorrection.run(
				item.id,
				item.submissionType ?? "correction",
				item.subject,
				item.entityType,
				item.entityLabel,
				item.status,
				item.priority,
				item.submittedAt,
				item.reportedBy,
				item.summary,
				item.nextStep,
				item.sourceCount,
				item.pageUrl || null,
				item.contentId || null
			);
		}
	}

	if (!sourcesCount) {
		const insertSource = database.prepare(`
			INSERT INTO admin_source_monitors (
				id,
				label,
				authority,
				health,
				last_checked_at,
				next_check_at,
				owner,
				note
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const item of sourceMonitorSeed) {
			insertSource.run(
				item.id,
				item.label,
				item.authority,
				item.health,
				item.lastCheckedAt,
				item.nextCheckAt,
				item.owner,
				item.note
			);
		}
	}

	if (!activityCount) {
		const insertActivity = database.prepare(`
			INSERT INTO admin_activity (
				id,
				label,
				type,
				timestamp,
				summary
			) VALUES (?, ?, ?, ?, ?)
		`);

		for (const item of activitySeed) {
			insertActivity.run(item.id, item.label, item.type, item.timestamp, item.summary);
		}
	}

	if (!guidePackagesCount) {
		const insertGuidePackage = database.prepare(`
			INSERT INTO admin_guide_packages (
				id,
				election_slug,
				jurisdiction_slug,
				status,
				reviewer,
				review_notes,
				review_recommendation,
				coverage_notes,
				coverage_limits,
				created_at,
				drafted_at,
				reviewed_at,
				published_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const item of guidePackageSeed) {
			insertGuidePackage.run(
				item.id,
				item.electionSlug,
				item.jurisdictionSlug,
				item.status,
				item.reviewer || null,
				item.reviewNotes || null,
				item.reviewRecommendation || null,
				JSON.stringify(item.coverageNotes ?? []),
				JSON.stringify(item.coverageLimits ?? []),
				item.createdAt,
				item.draftedAt,
				item.reviewedAt || null,
				item.publishedAt || null,
				item.updatedAt
			);
		}
	}

	const bootstrapUsername = options.bootstrapUsername || process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_USERNAME || null;
	const bootstrapPassword = options.bootstrapPassword || process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || null;
	const bootstrapDisplayName = options.bootstrapDisplayName || process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME || "Ballot Clarity Admin";
	const bootstrapRole = options.bootstrapRole || (process.env.ADMIN_BOOTSTRAP_ROLE as AdminUserRole | undefined) || "admin";

	if (!usersCount && bootstrapUsername && bootstrapPassword) {
		const now = new Date().toISOString();
		const normalizedBootstrapUsername = normalizeAdminUsername(bootstrapUsername);
		const normalizedBootstrapDisplayName = normalizeAdminDisplayName(bootstrapDisplayName);
		const normalizedBootstrapPassword = normalizeAdminPassword(bootstrapPassword);

		validateAdminUserRole(bootstrapRole);

		database.prepare(`
			INSERT INTO admin_users (
				id,
				username,
				display_name,
				role,
				password_hash,
				created_at,
				credentials_updated_at,
				mfa_secret,
				mfa_enabled_at,
				password_change_required_at,
				updated_at,
				disabled_at,
				last_login_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			`user-${normalizedBootstrapUsername}`,
			normalizedBootstrapUsername,
			normalizedBootstrapDisplayName,
			bootstrapRole,
			hashPassword(normalizedBootstrapPassword),
			now,
			now,
			null,
			null,
			null,
			now,
			null,
			null
		);
	}

	function listUsers(): AdminUsersResponse {
		const rows = database.prepare(`
			SELECT ${adminUserSelectColumns}
			FROM admin_users
			ORDER BY CASE WHEN disabled_at IS NULL THEN 0 ELSE 1 END, CASE role WHEN 'admin' THEN 0 ELSE 1 END, username
		`).all() as unknown as UserRow[];

		return {
			users: rows.map(rowToUser)
		};
	}

	function createUser(input: CreateUserInput): AdminUser {
		const username = normalizeAdminUsername(input.username);
		const displayName = normalizeAdminDisplayName(input.displayName);
		const password = normalizeAdminPassword(input.password);

		validateAdminUserRole(input.role);

		return runImmediateTransaction(() => {
			const existing = database.prepare(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE username = ?
			`).get(username) as UserRow | undefined;

			if (existing)
				throw new Error("An admin user with that username already exists.");

			const now = new Date().toISOString();
			const id = `user-${randomUUID()}`;

			database.prepare(`
				INSERT INTO admin_users (
					id,
					username,
					display_name,
					role,
					password_hash,
					created_at,
					credentials_updated_at,
					mfa_secret,
					mfa_enabled_at,
					password_change_required_at,
					updated_at,
					disabled_at,
					last_login_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				id,
				username,
				displayName,
				input.role,
				hashPassword(password),
				now,
				now,
				null,
				null,
				now,
				now,
				null,
				null
			);

			logActivity("review", `Created ${input.role} user`, `${displayName} can now access the internal editorial workspace.`);
			appendAuditEvent({
				actor: input.auditActor,
				eventType: "admin_user_create",
				metadata: {
					passwordChangeRequiredAt: now,
					role: input.role,
					username
				},
				summary: `${displayName} was created as an ${input.role} account.`,
				targetId: id,
				targetLabel: displayName,
				targetType: "admin_user",
				timestamp: now
			});

			return {
				createdAt: now,
				credentialsUpdatedAt: now,
				displayName,
				id,
				passwordChangeRequiredAt: now,
				role: input.role,
				username
			};
		});
	}

	function createMfaSetup(username: string): AdminMfaSetupResponse {
		const normalized = username.trim().toLowerCase();
		const row = database.prepare(`
			SELECT ${adminUserSelectColumns}
			FROM admin_users
			WHERE username = ?
		`).get(normalized) as UserRow | undefined;

		if (!row || row.disabled_at)
			throw new Error("Admin user not found.");

		if (row.mfa_enabled_at)
			throw new Error("Multi-factor authentication is already enabled for this account.");

		const issuer = "Ballot Clarity";
		const secret = createAdminMfaSecret();

		return {
			issuer,
			otpauthUrl: buildAdminMfaOtpAuthUrl({
				issuer,
				secret,
				username: row.username
			}),
			secret,
			username: row.username
		};
	}

	function verifyUserMfaCode(userId: string, mfaCode: string) {
		const row = database.prepare(`
			SELECT ${adminUserSelectColumns}
			FROM admin_users
			WHERE id = ?
		`).get(userId) as UserRow | undefined;

		if (!row?.mfa_secret || !row.mfa_enabled_at)
			return false;

		try {
			return verifyAdminMfaCodeSafely(
				decryptAdminMfaSecret(row.id, row.mfa_secret, mfaEncryptionKey),
				mfaCode
			);
		}
		catch {
			return false;
		}
	}

	function enableMfa(username: string, currentPassword: string, secret: string, mfaCode: string, auditActor?: AdminAuditActor): AdminUser {
		const normalized = username.trim().toLowerCase();
		return runImmediateTransaction(() => {
			const row = database.prepare(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE username = ?
			`).get(normalized) as UserRow | undefined;

			if (!row || row.disabled_at)
				throw new Error("Admin user not found.");

			if (row.mfa_enabled_at)
				throw new Error("Multi-factor authentication is already enabled for this account.");

			if (!verifyPassword(currentPassword, row.password_hash))
				throw new Error("Current password was not accepted.");

			if (!verifyAdminMfaCodeSafely(secret, mfaCode))
				throw new Error("The verification code was not accepted.");

			const nextCredentialsUpdatedAt = nextAdminCredentialTimestamp(row.credentials_updated_at || row.created_at);
			const encryptedMfaSecret = encryptAdminMfaSecret(row.id, secret, mfaEncryptionKey);

			database.prepare(`
				UPDATE admin_users
				SET mfa_secret = ?, mfa_enabled_at = ?, credentials_updated_at = ?, updated_at = ?
				WHERE id = ?
			`).run(encryptedMfaSecret, nextCredentialsUpdatedAt, nextCredentialsUpdatedAt, nextCredentialsUpdatedAt, row.id);

			logActivity("review", "Enabled admin MFA", `${row.display_name} enabled multi-factor authentication.`);
			appendAuditEvent({
				actor: auditActor,
				eventType: "admin_user_mfa_enable",
				metadata: {
					credentialsUpdatedAt: nextCredentialsUpdatedAt,
					mfaEnabledAt: nextCredentialsUpdatedAt,
					username: row.username
				},
				summary: `${row.display_name} enabled multi-factor authentication.`,
				targetId: row.id,
				targetLabel: row.display_name,
				targetType: "admin_user",
				timestamp: nextCredentialsUpdatedAt
			});

			return rowToUser({
				...row,
				credentials_updated_at: nextCredentialsUpdatedAt,
				mfa_enabled_at: nextCredentialsUpdatedAt,
				mfa_secret: encryptedMfaSecret,
				updated_at: nextCredentialsUpdatedAt
			});
		});
	}

	function disableMfa(username: string, currentPassword: string, mfaCode: string, auditActor?: AdminAuditActor): AdminUser {
		const normalized = username.trim().toLowerCase();
		return runImmediateTransaction(() => {
			const row = database.prepare(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE username = ?
			`).get(normalized) as UserRow | undefined;

			if (!row || row.disabled_at || !verifyPassword(currentPassword, row.password_hash))
				throw new Error("Current password was not accepted.");

			if (!row.mfa_secret || !row.mfa_enabled_at)
				throw new Error("Multi-factor authentication is not enabled for this account.");

			if (!verifyAdminMfaCodeSafely(
				decryptAdminMfaSecret(row.id, row.mfa_secret, mfaEncryptionKey),
				mfaCode
			)) {
				throw new Error("The verification code was not accepted.");
			}

			const nextCredentialsUpdatedAt = nextAdminCredentialTimestamp(row.credentials_updated_at || row.created_at);

			database.prepare(`
				UPDATE admin_users
				SET mfa_secret = NULL, mfa_enabled_at = NULL, credentials_updated_at = ?, updated_at = ?
				WHERE id = ?
			`).run(nextCredentialsUpdatedAt, nextCredentialsUpdatedAt, row.id);

			logActivity("review", "Disabled admin MFA", `${row.display_name} disabled multi-factor authentication.`);
			appendAuditEvent({
				actor: auditActor,
				eventType: "admin_user_mfa_disable",
				metadata: {
					credentialsUpdatedAt: nextCredentialsUpdatedAt,
					username: row.username
				},
				summary: `${row.display_name} disabled multi-factor authentication.`,
				targetId: row.id,
				targetLabel: row.display_name,
				targetType: "admin_user",
				timestamp: nextCredentialsUpdatedAt
			});

			return rowToUser({
				...row,
				credentials_updated_at: nextCredentialsUpdatedAt,
				mfa_enabled_at: null,
				mfa_secret: null,
				updated_at: nextCredentialsUpdatedAt
			});
		});
	}

	function authenticateUser(username: string, password: string) {
		const normalized = username.trim().toLowerCase();
		const row = database.prepare(`
			SELECT ${adminUserSelectColumns}
			FROM admin_users
			WHERE username = ?
		`).get(normalized) as UserRow | undefined;

		const passwordAccepted = verifyPassword(password, row?.password_hash ?? dummyPasswordHash);

		if (!row || row.disabled_at || !passwordAccepted)
			return null;

		const now = new Date().toISOString();
		database.prepare("UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, row.id);

		return {
			...rowToUser({ ...row, last_login_at: now }),
			lastLoginAt: now
		};
	}

	function updateUser(id: string, patch: UserPatch): AdminUsersResponse {
		return runImmediateTransaction(() => {
			const current = database.prepare(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE id = ?
			`).get(id) as UserRow | undefined;

			if (!current)
				throw new Error("Admin user not found.");

			const actorUsername = patch.auditActor?.username?.trim().toLowerCase();
			const administrativeSelfMutation = patch.passwordChangeMode !== "self-service"
				&& actorUsername === current.username
				&& (patch.disabled !== undefined || patch.mfaReset === true || patch.password !== undefined);

			if (administrativeSelfMutation) {
				throw new Error(
					"Use the self-service password or MFA workflow for the authenticated account. Administrative account recovery must target a different user."
				);
			}

			const now = new Date().toISOString();
			const nextDisabledAt = patch.disabled === undefined
				? current.disabled_at
				: patch.disabled
					? current.disabled_at || now
					: null;
			const nextPasswordHash = patch.password === undefined
				? current.password_hash
				: hashPassword(normalizeAdminPassword(patch.password));
			const shouldResetMfa = patch.mfaReset === true && Boolean(current.mfa_secret || current.mfa_enabled_at);
			const disabledStateChanged = nextDisabledAt !== current.disabled_at;
			const shouldRotateCredentials = patch.password !== undefined || shouldResetMfa || disabledStateChanged;
			const nextCredentialsUpdatedAt = shouldRotateCredentials
				? nextAdminCredentialTimestamp(current.credentials_updated_at || current.created_at)
				: current.credentials_updated_at || current.created_at;
			const nextUpdatedAt = shouldRotateCredentials ? nextCredentialsUpdatedAt : now;
			const nextMfaSecret = patch.mfaReset === true ? null : current.mfa_secret;
			const nextMfaEnabledAt = patch.mfaReset === true ? null : current.mfa_enabled_at;
			const nextPasswordChangeRequiredAt = patch.password === undefined
				? current.password_change_required_at
				: patch.passwordChangeMode === "self-service"
					? null
					: nextCredentialsUpdatedAt;

			if (patch.disabled && !current.disabled_at && current.role === "admin") {
				const remainingAdmins = database.prepare(`
				SELECT COUNT(*) AS count
				FROM admin_users
				WHERE role = 'admin' AND disabled_at IS NULL AND id <> ?
			`).get(id) as unknown as DatabaseCountRow;

				if (Number(remainingAdmins.count) < 1)
					throw new Error("Cannot disable the last active admin user.");
			}

			database.prepare(`
			UPDATE admin_users
			SET disabled_at = ?, password_hash = ?, mfa_secret = ?, mfa_enabled_at = ?, password_change_required_at = ?, credentials_updated_at = ?, updated_at = ?
			WHERE id = ?
		`).run(
				nextDisabledAt,
				nextPasswordHash,
				nextMfaSecret,
				nextMfaEnabledAt,
				nextPasswordChangeRequiredAt,
				nextCredentialsUpdatedAt,
				nextUpdatedAt,
				id
			);

			if (disabledStateChanged) {
				logActivity(
					"review",
					patch.disabled ? "Disabled admin user" : "Restored admin user",
					`${current.display_name} ${patch.disabled ? "can no longer sign in" : "can sign in again"}. Existing sessions for this account are no longer valid.`
				);
				appendAuditEvent({
					actor: patch.auditActor,
					eventType: patch.disabled ? "admin_user_disable" : "admin_user_restore",
					metadata: {
						credentialsUpdatedAt: nextCredentialsUpdatedAt,
						disabledAt: nextDisabledAt,
						username: current.username
					},
					summary: `${current.display_name} ${patch.disabled ? "was disabled" : "was restored"}.`,
					targetId: current.id,
					targetLabel: current.display_name,
					targetType: "admin_user",
					timestamp: nextCredentialsUpdatedAt
				});
			}

			if (patch.password !== undefined) {
				const isSelfService = patch.passwordChangeMode === "self-service";

				logActivity(
					"review",
					isSelfService ? "Changed admin password" : "Reset admin password",
					isSelfService
						? `${current.display_name} changed their own password. Existing sessions for this account are no longer valid.`
						: `${current.display_name} received a new temporary password. Existing sessions for this account are no longer valid.`
				);
				appendAuditEvent({
					actor: patch.auditActor,
					eventType: isSelfService ? "admin_user_password_change" : "admin_user_password_reset",
					metadata: {
						credentialsUpdatedAt: nextCredentialsUpdatedAt,
						passwordChangeRequiredAt: nextPasswordChangeRequiredAt,
						selfService: isSelfService,
						username: current.username
					},
					summary: isSelfService
						? `${current.display_name} changed their own password.`
						: `${current.display_name} received an admin password reset.`,
					targetId: current.id,
					targetLabel: current.display_name,
					targetType: "admin_user",
					timestamp: nextCredentialsUpdatedAt
				});
			}

			if (shouldResetMfa) {
				logActivity(
					"review",
					"Reset admin MFA",
					`${current.display_name} must enroll multi-factor authentication again before MFA is required. Existing sessions for this account are no longer valid.`
				);
				appendAuditEvent({
					actor: patch.auditActor,
					eventType: "admin_user_mfa_reset",
					metadata: {
						credentialsUpdatedAt: nextCredentialsUpdatedAt,
						username: current.username
					},
					summary: `${current.display_name} had multi-factor authentication reset by an administrator.`,
					targetId: current.id,
					targetLabel: current.display_name,
					targetType: "admin_user",
					timestamp: nextCredentialsUpdatedAt
				});
			}

			return listUsers();
		});
	}

	function logActivity(type: AdminActivityItem["type"], label: string, summary: string) {
		const timestamp = new Date().toISOString();

		database.prepare(`
			INSERT INTO admin_activity (id, label, type, timestamp, summary)
			VALUES (?, ?, ?, ?, ?)
		`).run(`activity-${randomUUID()}`, label, type, timestamp, summary);
	}

	function runImmediateTransaction<T>(work: () => T) {
		database.exec("BEGIN IMMEDIATE");

		try {
			const result = work();
			database.exec("COMMIT");
			return result;
		}
		catch (error) {
			database.exec("ROLLBACK");
			throw error;
		}
	}

	function appendAuditEvent(input: AuditEventInput) {
		const actor = normalizeAuditActor(input.actor);
		const metadata = stableStringify(input.metadata ?? {});
		const timestamp = input.timestamp || new Date().toISOString();
		const last = database.prepare(`
			SELECT sequence, event_hash
			FROM admin_audit_events
			ORDER BY sequence DESC
			LIMIT 1
		`).get() as Pick<AuditRow, "event_hash" | "sequence"> | undefined;
		const previousHash = last?.event_hash || null;
		const sequence = Number(last?.sequence ?? 0) + 1;
		const eventWithoutHash: Omit<AuditRow, "event_hash"> = {
			actor_display_name: actor.displayName,
			actor_role: actor.role,
			actor_username: actor.username,
			event_type: input.eventType,
			id: `audit-${randomUUID()}`,
			metadata,
			previous_hash: previousHash,
			sequence,
			summary: input.summary,
			target_id: input.targetId,
			target_label: input.targetLabel,
			target_type: input.targetType,
			timestamp
		};
		const eventHash = hashAuditEvent(eventWithoutHash);

		database.prepare(`
			INSERT INTO admin_audit_events (
				id,
				sequence,
				timestamp,
				event_type,
				actor_username,
				actor_display_name,
				actor_role,
				target_type,
				target_id,
				target_label,
				summary,
				metadata,
				previous_hash,
				event_hash
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			eventWithoutHash.id,
			eventWithoutHash.sequence,
			eventWithoutHash.timestamp,
			eventWithoutHash.event_type,
			eventWithoutHash.actor_username,
			eventWithoutHash.actor_display_name,
			eventWithoutHash.actor_role,
			eventWithoutHash.target_type,
			eventWithoutHash.target_id,
			eventWithoutHash.target_label,
			eventWithoutHash.summary,
			eventWithoutHash.metadata,
			eventWithoutHash.previous_hash,
			eventHash
		);
	}

	function listActivity(limit = 8) {
		const rows = database.prepare(`
			SELECT id, label, type, timestamp, summary
			FROM admin_activity
			ORDER BY timestamp DESC
			LIMIT ?
		`).all(limit) as unknown as ActivityRow[];

		return rows.map(rowToActivity);
	}

	function listAuditEvents(): AdminAuditResponse {
		const allRows = database.prepare(`
			SELECT id, sequence, timestamp, event_type, actor_username, actor_display_name, actor_role, target_type, target_id, target_label, summary, metadata, previous_hash, event_hash
			FROM admin_audit_events
			ORDER BY sequence ASC
		`).all() as unknown as AuditRow[];
		const latestHash = allRows.at(-1)?.event_hash;
		const rows = allRows.slice(-100).reverse();

		return {
			events: rows.map(rowToAuditEvent),
			integrityVerified: verifyAuditChain(allRows),
			latestHash,
			updatedAt: allRows.at(-1)?.timestamp ?? new Date().toISOString()
		};
	}

	function listContent(): AdminContentResponse {
		const rows = database.prepare(`
			SELECT id, title, entity_type, entity_slug, status, priority, updated_at, assigned_to, blocker, summary, public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by, publish_approved_at, publish_approval_note
			FROM admin_content
			ORDER BY published ASC, priority DESC, updated_at DESC
		`).all() as unknown as ContentRow[];

		return {
			items: rows.map(rowToContent)
		};
	}

	function listGuidePackages(): GuidePackageWorkflowListResponse {
		const rows = database.prepare(`
			SELECT id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits, created_at, drafted_at, reviewed_at, published_at, updated_at
			FROM admin_guide_packages
			ORDER BY CASE status
				WHEN 'published' THEN 0
				WHEN 'ready_to_publish' THEN 1
				WHEN 'in_review' THEN 2
				ELSE 3
			END, updated_at DESC
		`).all() as unknown as GuidePackageRow[];

		return {
			packages: rows.map(rowToGuidePackage),
			updatedAt: rows.map(row => row.updated_at).sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString(),
		};
	}

	function getGuidePackage(id: string) {
		const row = database.prepare(`
			SELECT id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits, created_at, drafted_at, reviewed_at, published_at, updated_at
			FROM admin_guide_packages
			WHERE id = ?
		`).get(id) as GuidePackageRow | undefined;

		return row ? rowToGuidePackage(row) : null;
	}

	function createGuidePackage(input: CreateGuidePackageInput) {
		return runImmediateTransaction(() => {
			const now = new Date().toISOString();
			const status = input.status ?? "draft";
			const createdAt = input.createdAt || now;
			const draftedAt = input.draftedAt || now;
			const updatedAt = input.updatedAt || now;
			const reviewNotes = input.reviewNotes?.trim() || null;
			const reviewRecommendation = input.reviewRecommendation || null;
			const reviewer = input.reviewer?.trim() || null;
			const existing = getGuidePackage(input.id);

			if (existing)
				throw new Error("Guide package already exists.");

			validateGuidePackagePersistenceState({
				coverageLimits: input.coverageLimits ?? [],
				coverageNotes: input.coverageNotes ?? [],
				draftedAt,
				publishedAt: input.publishedAt || null,
				reviewRecommendation,
				reviewNotes,
				reviewedAt: input.reviewedAt || null,
				reviewer,
				status
			});

			database.prepare(`
				INSERT INTO admin_guide_packages (
					id,
					election_slug,
					jurisdiction_slug,
					status,
					reviewer,
					review_notes,
					review_recommendation,
					coverage_notes,
					coverage_limits,
					created_at,
					drafted_at,
					reviewed_at,
					published_at,
					updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				input.id,
				input.electionSlug,
				input.jurisdictionSlug,
				status,
				reviewer,
				reviewNotes,
				reviewRecommendation,
				JSON.stringify(input.coverageNotes ?? []),
				JSON.stringify(input.coverageLimits ?? []),
				createdAt,
				draftedAt,
				input.reviewedAt || null,
				input.publishedAt || null,
				updatedAt
			);

			logActivity("review", "Guide package drafted", `${input.electionSlug} guide package entered the ${status.replaceAll("_", " ")} state.`);
			return listGuidePackages();
		});
	}

	function getContentRecord(entityType: AdminEntityType, entitySlug: string) {
		const row = database.prepare(`
			SELECT id, title, entity_type, entity_slug, status, priority, updated_at, assigned_to, blocker, summary, public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by, publish_approved_at, publish_approval_note
			FROM admin_content
			WHERE entity_type = ? AND entity_slug = ?
		`).get(entityType, entitySlug) as ContentRow | undefined;

		return row ? rowToContent(row) : null;
	}

	function getContentRow(id: string) {
		return database.prepare(`
			SELECT id, title, entity_type, entity_slug, status, priority, updated_at, assigned_to, blocker, summary, public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by, publish_approved_at, publish_approval_note
			FROM admin_content
			WHERE id = ?
		`).get(id) as ContentRow | undefined;
	}

	function getContentHistory(id: string): AdminContentHistoryResponse {
		if (!getContentRow(id))
			throw new Error("Content record not found.");

		const rows = database.prepare(`
			SELECT id, content_id, changed_at, changed_fields, previous_snapshot, next_snapshot, summary
			FROM admin_content_history
			WHERE content_id = ?
			ORDER BY changed_at DESC
		`).all(id) as unknown as ContentHistoryRow[];

		return {
			contentId: id,
			history: rows.map(parseContentHistoryRow),
			updatedAt: rows[0]?.changed_at || new Date().toISOString()
		};
	}

	function writeContentHistory(
		contentId: string,
		changedAt: string,
		changedFields: string[],
		previous: AdminContentSnapshot,
		next: AdminContentSnapshot,
		summary: string
	) {
		database.prepare(`
			INSERT INTO admin_content_history (
				id,
				content_id,
				changed_at,
				changed_fields,
				previous_snapshot,
				next_snapshot,
				summary
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			`content-history-${randomUUID()}`,
			contentId,
			changedAt,
			JSON.stringify(changedFields),
			JSON.stringify(previous),
			JSON.stringify(next),
			summary
		);
	}

	function resolvePublishApproval(current: ContentRow, patch: ContentPatch, nextPublished: boolean, now: string) {
		if (!nextPublished) {
			return {
				publishApprovedAt: null,
				publishApprovedBy: null,
				publishApprovalNote: null
			};
		}

		const nextPublishApprovedBy = patch.publishApprovedBy === undefined
			? current.publish_approved_by
			: patch.publishApprovedBy?.trim() || null;
		const nextPublishApprovalNote = patch.publishApprovalNote === undefined
			? current.publish_approval_note
			: patch.publishApprovalNote?.trim() || null;
		const approvalChanged = patch.publishApprovedBy !== undefined || patch.publishApprovalNote !== undefined;
		const nextPublishApprovedAt = nextPublishApprovedBy
			? approvalChanged ? now : current.publish_approved_at || now
			: null;

		if (!nextPublishApprovedBy)
			throw new Error("Publish approval reviewer is required before content can be published.");

		return {
			publishApprovedAt: nextPublishApprovedAt,
			publishApprovedBy: nextPublishApprovedBy,
			publishApprovalNote: nextPublishApprovalNote
		};
	}

	function updateContent(id: string, patch: ContentPatch) {
		validateContentPatch(patch);
		return runImmediateTransaction(() => {
			const current = getContentRow(id);

			if (!current)
				throw new Error("Content record not found.");

			const now = new Date().toISOString();
			const nextPublished = patch.published ?? Boolean(current.published);
			const nextStatus = patch.status
				|| (nextPublished ? "published" : current.status === "published" ? "in-review" : current.status);
			const nextPublishedAt = nextPublished ? current.published_at || now : null;
			const publishApproval = resolvePublishApproval(current, patch, nextPublished, now);
			const nextPublicSummary = patch.publicSummary === undefined
				? current.public_summary || ""
				: patch.publicSummary.trim();

			if (!nextPublicSummary)
				throw new Error("Public page summary is required.");

			const nextBallotSummary = patch.publicBallotSummary === undefined
				? current.ballot_summary
				: patch.publicBallotSummary?.trim() || null;
			const nextSnapshot: AdminContentSnapshot = {
				assignedTo: patch.assignedTo?.trim() || current.assigned_to,
				blocker: patch.blocker === undefined ? current.blocker || undefined : patch.blocker?.trim() || undefined,
				priority: patch.priority ?? current.priority,
				publicBallotSummary: nextBallotSummary || undefined,
				publicSummary: nextPublicSummary,
				published: nextPublished,
				publishedAt: nextPublishedAt || undefined,
				publishApprovedAt: publishApproval.publishApprovedAt || undefined,
				publishApprovedBy: publishApproval.publishApprovedBy || undefined,
				publishApprovalNote: publishApproval.publishApprovalNote || undefined,
				status: nextStatus,
				updatedAt: now
			};

			validateContentSnapshotForPersistence(nextSnapshot);
			const previousSnapshot = buildContentSnapshot(current);
			const changedFields = changedContentFields(previousSnapshot, nextSnapshot);

			if (!changedFields.length)
				return listContent();

			database.prepare(`
				UPDATE admin_content
				SET status = ?,
					priority = ?,
					assigned_to = ?,
					blocker = ?,
					public_summary = ?,
					ballot_summary = ?,
					published = ?,
					published_at = ?,
					publish_approved_by = ?,
					publish_approved_at = ?,
					publish_approval_note = ?,
					updated_at = ?
				WHERE id = ?
			`).run(
				nextSnapshot.status,
				nextSnapshot.priority,
				nextSnapshot.assignedTo,
				nextSnapshot.blocker || null,
				nextSnapshot.publicSummary,
				nextSnapshot.publicBallotSummary || null,
				nextSnapshot.published ? 1 : 0,
				nextSnapshot.publishedAt || null,
				nextSnapshot.publishApprovedBy || null,
				nextSnapshot.publishApprovedAt || null,
				nextSnapshot.publishApprovalNote || null,
				now,
				id
			);

			writeContentHistory(
				id,
				now,
				changedFields,
				previousSnapshot,
				nextSnapshot,
				describeContentHistoryChange(current.title, changedFields)
			);

			logActivity(
				nextPublished ? "publish" : "review",
				`${current.title} updated`,
				nextPublished
					? `${current.title} is marked published and approved by ${nextSnapshot.publishApprovedBy}.`
					: `${current.title} moved to ${nextStatus}.`
			);

			if (
				changedFields.includes("published")
				|| changedFields.includes("publishApprovedAt")
				|| changedFields.includes("publishApprovedBy")
				|| changedFields.includes("publishApprovalNote")
			) {
				appendAuditEvent({
					actor: patch.auditActor,
					eventType: nextPublished ? "content_publish" : "content_unpublish",
					metadata: {
						changedFields,
						entitySlug: current.entity_slug,
						entityType: current.entity_type,
						publishApprovedAt: nextSnapshot.publishApprovedAt ?? null,
						publishApprovedBy: nextSnapshot.publishApprovedBy ?? null
					},
					summary: nextPublished
						? `${current.title} was published with reviewer approval.`
						: `${current.title} was unpublished and approval metadata was cleared.`,
					targetId: current.id,
					targetLabel: current.title,
					targetType: "admin_content",
					timestamp: now
				});
			}

			return listContent();
		});
	}

	function rollbackContent(id: string, historyId: string, auditActor?: AdminAuditActor) {
		return runImmediateTransaction(() => {
			const current = getContentRow(id);

			if (!current)
				throw new Error("Content record not found.");

			const historyRow = database.prepare(`
				SELECT id, content_id, changed_at, changed_fields, previous_snapshot, next_snapshot, summary
				FROM admin_content_history
				WHERE id = ? AND content_id = ?
			`).get(historyId, id) as ContentHistoryRow | undefined;

			if (!historyRow)
				throw new Error("Content history record not found.");

			const now = new Date().toISOString();
			const previousSnapshot = buildContentSnapshot(current);
			const rollbackValues = snapshotToContentUpdateValues(parseContentSnapshot(historyRow.previous_snapshot));

			if (!rollbackValues.publicSummary)
				throw new Error("Rollback target has no public page summary.");

			const nextSnapshot: AdminContentSnapshot = {
				assignedTo: rollbackValues.assignedTo,
				blocker: rollbackValues.blocker || undefined,
				priority: rollbackValues.priority,
				publicBallotSummary: rollbackValues.publicBallotSummary || undefined,
				publicSummary: rollbackValues.publicSummary,
				published: rollbackValues.published,
				publishedAt: rollbackValues.publishedAt || undefined,
				publishApprovedAt: rollbackValues.publishApprovedAt || undefined,
				publishApprovedBy: rollbackValues.publishApprovedBy || undefined,
				publishApprovalNote: rollbackValues.publishApprovalNote || undefined,
				status: rollbackValues.status,
				updatedAt: now
			};

			validateContentSnapshotForPersistence(nextSnapshot);
			const changedFields = changedContentFields(previousSnapshot, nextSnapshot);

			if (!changedFields.length)
				return listContent();

			database.prepare(`
				UPDATE admin_content
				SET status = ?,
					priority = ?,
					assigned_to = ?,
					blocker = ?,
					public_summary = ?,
					ballot_summary = ?,
					published = ?,
					published_at = ?,
					publish_approved_by = ?,
					publish_approved_at = ?,
					publish_approval_note = ?,
					updated_at = ?
				WHERE id = ?
			`).run(
				nextSnapshot.status,
				nextSnapshot.priority,
				nextSnapshot.assignedTo,
				nextSnapshot.blocker || null,
				nextSnapshot.publicSummary,
				nextSnapshot.publicBallotSummary || null,
				nextSnapshot.published ? 1 : 0,
				nextSnapshot.publishedAt || null,
				nextSnapshot.publishApprovedBy || null,
				nextSnapshot.publishApprovedAt || null,
				nextSnapshot.publishApprovalNote || null,
				now,
				id
			);

			writeContentHistory(
				id,
				now,
				changedFields,
				previousSnapshot,
				nextSnapshot,
				`Rolled back ${current.title} to the version from ${historyRow.changed_at}.`
			);
			logActivity("review", `${current.title} rolled back`, `Restored public content fields from the ${historyRow.changed_at} revision.`);
			appendAuditEvent({
				actor: auditActor,
				eventType: "content_rollback",
				metadata: {
					changedFields,
					restoredFromHistoryId: historyRow.id,
					restoredFromTimestamp: historyRow.changed_at
				},
				summary: `${current.title} was rolled back to the ${historyRow.changed_at} revision.`,
				targetId: current.id,
				targetLabel: current.title,
				targetType: "admin_content",
				timestamp: now
			});

			return listContent();
		});
	}

	function updateGuidePackage(id: string, patch: GuidePackagePatch) {
		return runImmediateTransaction(() => {
			const current = database.prepare(`
				SELECT id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits, created_at, drafted_at, reviewed_at, published_at, updated_at
				FROM admin_guide_packages
				WHERE id = ?
			`).get(id) as GuidePackageRow | undefined;

			if (!current)
				throw new Error("Guide package not found.");

			const now = new Date().toISOString();
			const nextStatus = patch.status ?? current.status;
			const nextReviewer = patch.reviewer === undefined
				? current.reviewer
				: patch.reviewer?.trim() || null;
			const nextReviewRecommendation = patch.reviewRecommendation === undefined
				? current.review_recommendation
				: patch.reviewRecommendation || null;
			const nextReviewNotes = patch.reviewNotes === undefined
				? current.review_notes
				: patch.reviewNotes?.trim() || null;
			const nextCoverageNotes = patch.coverageNotes === undefined
				? parseStoredStringArray(current.coverage_notes)
				: patch.coverageNotes ?? [];
			const nextCoverageLimits = patch.coverageLimits === undefined
				? parseStoredStringArray(current.coverage_limits)
				: patch.coverageLimits ?? [];
			const nextDraftedAt = patch.draftedAt || current.drafted_at;
			const nextReviewedAt = patch.reviewedAt === undefined
				? current.reviewed_at
				: patch.reviewedAt;
			const nextPublishedAt = patch.publishedAt === undefined
				? current.published_at
				: patch.publishedAt;

			validateGuidePackagePersistenceState({
				coverageLimits: nextCoverageLimits,
				coverageNotes: nextCoverageNotes,
				draftedAt: nextDraftedAt,
				publishedAt: nextPublishedAt,
				reviewRecommendation: nextReviewRecommendation,
				reviewNotes: nextReviewNotes,
				reviewedAt: nextReviewedAt,
				reviewer: nextReviewer,
				status: nextStatus
			});

			database.prepare(`
				UPDATE admin_guide_packages
				SET status = ?,
					reviewer = ?,
					review_notes = ?,
					review_recommendation = ?,
					coverage_notes = ?,
					coverage_limits = ?,
					drafted_at = ?,
					reviewed_at = ?,
					published_at = ?,
					updated_at = ?
				WHERE id = ?
			`).run(
				nextStatus,
				nextReviewer,
				nextReviewNotes,
				nextReviewRecommendation,
				JSON.stringify(nextCoverageNotes),
				JSON.stringify(nextCoverageLimits),
				nextDraftedAt,
				nextReviewedAt || null,
				nextPublishedAt || null,
				now,
				id
			);

			logActivity(
				nextStatus === "published" ? "publish" : "review",
				`Guide package ${current.election_slug} updated`,
				`Guide package moved to ${nextStatus.replaceAll("_", " ")}.`
			);

			if (current.status !== "published" && nextStatus === "published") {
				appendAuditEvent({
					actor: patch.auditActor,
					eventType: "guide_package_publish",
					metadata: {
						electionSlug: current.election_slug,
						jurisdictionSlug: current.jurisdiction_slug,
						publishedAt: nextPublishedAt,
						reviewRecommendation: nextReviewRecommendation,
						reviewer: nextReviewer
					},
					summary: `${current.election_slug} guide package was published.`,
					targetId: current.id,
					targetLabel: current.election_slug,
					targetType: "guide_package",
					timestamp: now
				});
			}
			else if (current.status === "published" && nextStatus !== "published") {
				appendAuditEvent({
					actor: patch.auditActor,
					eventType: "guide_package_unpublish",
					metadata: {
						electionSlug: current.election_slug,
						jurisdictionSlug: current.jurisdiction_slug,
						nextStatus,
						reviewRecommendation: nextReviewRecommendation,
						reviewer: nextReviewer
					},
					summary: `${current.election_slug} guide package was unpublished.`,
					targetId: current.id,
					targetLabel: current.election_slug,
					targetType: "guide_package",
					timestamp: now
				});
			}

			return listGuidePackages();
		});
	}

	function listReview(): AdminReviewResponse {
		return {
			items: listContent().items.map(item => ({
				assignedTo: item.assignedTo,
				blocker: item.blocker,
				entityType: item.entityType,
				id: item.id,
				priority: item.priority,
				sourceCoverage: item.sourceCoverage,
				status: item.status,
				summary: item.summary,
				title: item.title,
				updatedAt: item.updatedAt
			}))
		};
	}

	function listCorrections(): AdminCorrectionsResponse {
		const rows = database.prepare(`
			SELECT
				c.id,
				c.submission_type,
				c.subject,
				c.entity_type,
				c.entity_label,
				c.status,
				c.priority,
				c.submitted_at,
				c.reported_by,
				c.summary,
				c.next_step,
				c.source_count,
				c.page_url,
				c.content_id,
				content.title AS content_title
			FROM admin_corrections c
			LEFT JOIN admin_content content ON content.id = c.content_id
			ORDER BY CASE c.status WHEN 'new' THEN 0 WHEN 'triaged' THEN 1 WHEN 'researching' THEN 2 ELSE 3 END, c.submitted_at DESC
		`).all() as unknown as CorrectionRow[];

		return {
			corrections: rows.map(rowToCorrection)
		};
	}

	function resolveContentIdForPageUrl(pageUrl: string | undefined) {
		const lookup = resolveContentLookupFromPageUrl(pageUrl);

		if (!lookup)
			return null;

		const row = database.prepare(`
			SELECT id
			FROM admin_content
			WHERE entity_type = ? AND entity_slug = ?
		`).get(lookup.entityType, lookup.entitySlug) as { id: string } | undefined;

		return row?.id ?? null;
	}

	function resolvePatchContentId(contentId: string | null | undefined) {
		if (contentId === null)
			return null;

		const normalized = contentId?.trim();

		if (!normalized)
			return null;

		const row = database.prepare(`
			SELECT id
			FROM admin_content
			WHERE id = ?
		`).get(normalized) as { id: string } | undefined;

		if (!row)
			throw new Error("Linked content record not found.");

		return row.id;
	}

	function createCorrectionSubmission(input: CorrectionSubmissionInput) {
		const submission = normalizeCorrectionSubmission(input);
		return runImmediateTransaction(() => {
			const { email, message, subject } = submission;
			const now = new Date().toISOString();
			const id = `correction-${randomUUID()}`;
			const reportedBy = submission.name ? `${submission.name} <${email}>` : email;
			const summary = submission.sourceLinks
				? `${message}\n\nSupporting links:\n${submission.sourceLinks}`
				: message;
			const contentId = resolveContentIdForPageUrl(submission.pageUrl);

			database.prepare(`
				INSERT INTO admin_corrections (
					id,
					submission_type,
					subject,
					entity_type,
					entity_label,
					status,
					priority,
					submitted_at,
					reported_by,
					summary,
					next_step,
					source_count,
					page_url,
					content_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				id,
				submission.submissionType,
				subject,
				"policy",
				submission.pageUrl || "General site feedback",
				"new",
				submission.submissionType === "correction" ? "high" : "medium",
				now,
				reportedBy,
				summary,
				submission.submissionType === "correction"
					? "Verify the cited claim, source trail, and page framing."
					: "Triage the feedback and determine whether it belongs in product, content, or operations review.",
				submission.sourceLinks?.split("\n").length ?? 0,
				submission.pageUrl || null,
				contentId
			);

			logActivity(
				"correction",
				submission.submissionType === "correction" ? "Received correction submission" : "Received public feedback",
				`${subject} was submitted through the public contact form.`
			);

			return {
				ok: true,
				submittedAt: now
			} as const;
		});
	}

	function updateCorrection(id: string, patch: CorrectionPatch) {
		validateCorrectionPatch(patch);
		return runImmediateTransaction(() => {
			const current = database.prepare(`
			SELECT
				c.id,
				c.submission_type,
				c.subject,
				c.entity_type,
				c.entity_label,
				c.status,
				c.priority,
				c.submitted_at,
				c.reported_by,
				c.summary,
				c.next_step,
				c.source_count,
				c.page_url,
				c.content_id,
				content.title AS content_title
			FROM admin_corrections c
			LEFT JOIN admin_content content ON content.id = c.content_id
			WHERE c.id = ?
		`).get(id) as CorrectionRow | undefined;

			if (!current)
				throw new Error("Correction record not found.");

			const contentId = patch.contentId === undefined
				? current.content_id
				: resolvePatchContentId(patch.contentId);
			const nextStatus = patch.status ?? current.status;
			const nextPriority = patch.priority ?? current.priority;
			const nextStep = patch.nextStep?.trim() || current.next_step;
			const now = new Date().toISOString();

			database.prepare(`
			UPDATE admin_corrections
			SET status = ?, priority = ?, next_step = ?, content_id = ?
			WHERE id = ?
			`).run(
				nextStatus,
				nextPriority,
				nextStep,
				contentId,
				id
			);

			const linkageSummary = contentId === current.content_id
				? ""
				: contentId
					? " Linked to a content record."
					: " Removed linked content record.";
			logActivity(
				"correction",
				`${current.subject} updated`,
				`Correction item moved to ${nextStatus}.${linkageSummary}`
			);

			if (current.status !== "new" || nextStatus !== "new") {
				const eventType = current.status === "new" && nextStatus !== "new"
					? "correction_publish"
					: current.status !== "new" && nextStatus === "new"
						? "correction_unpublish"
						: "correction_public_update";

				appendAuditEvent({
					actor: patch.auditActor,
					eventType,
					metadata: {
						contentId,
						nextPriority,
						nextStatus,
						previousContentId: current.content_id,
						previousPriority: current.priority,
						previousStatus: current.status
					},
					summary: eventType === "correction_publish"
						? `${current.subject} was promoted from private intake to the public corrections log.`
						: eventType === "correction_unpublish"
							? `${current.subject} was removed from the public corrections log and returned to private intake.`
							: `${current.subject} public correction record was updated.`,
					targetId: current.id,
					targetLabel: current.subject,
					targetType: "correction",
					timestamp: now
				});
			}

			return listCorrections();
		});
	}

	function listSourceMonitor(): AdminSourceMonitorResponse {
		const rows = database.prepare(`
			SELECT id, label, authority, health, last_checked_at, next_check_at, owner, note
			FROM admin_source_monitors
			ORDER BY CASE health WHEN 'incident' THEN 0 WHEN 'stale' THEN 1 WHEN 'review-soon' THEN 2 ELSE 3 END, next_check_at ASC
		`).all() as unknown as SourceRow[];

		return {
			sources: rows.map(rowToSource)
		};
	}

	function updateSource(id: string, patch: SourcePatch) {
		validateSourcePatch(patch);
		return runImmediateTransaction(() => {
			const current = database.prepare(`
			SELECT id, label, authority, health, last_checked_at, next_check_at, owner, note
			FROM admin_source_monitors
			WHERE id = ?
		`).get(id) as SourceRow | undefined;

			if (!current)
				throw new Error("Source monitor record not found.");

			const now = new Date().toISOString();
			const nextHealth = patch.health ?? current.health;
			const nextCheckAt = patch.nextCheckAt?.trim() || current.next_check_at;
			const nextOwner = patch.owner?.trim() || current.owner;
			const nextNote = patch.note?.trim() || current.note;

			database.prepare(`
			UPDATE admin_source_monitors
			SET health = ?, last_checked_at = ?, next_check_at = ?, owner = ?, note = ?
			WHERE id = ?
			`).run(
				nextHealth,
				now,
				nextCheckAt,
				nextOwner,
				nextNote,
				id
			);

			logActivity("source-check", `${current.label} updated`, `Source monitor status is now ${nextHealth}.`);
			appendAuditEvent({
				actor: patch.auditActor,
				eventType: "source_monitor_update",
				metadata: {
					health: nextHealth,
					nextCheckAt,
					owner: nextOwner,
					previousHealth: current.health,
					previousNextCheckAt: current.next_check_at,
					previousOwner: current.owner
				},
				summary: `${current.label} source monitor was checked and updated.`,
				targetId: current.id,
				targetLabel: current.label,
				targetType: "source_monitor",
				timestamp: now
			});

			return listSourceMonitor();
		});
	}

	function getOverview(): AdminOverviewResponse {
		const content = listContent().items;
		const corrections = listCorrections().corrections;
		const guidePackages = listGuidePackages().packages;
		const sources = listSourceMonitor().sources;
		const security = buildAdminSecurityStatus(listUsers().users);

		const healthySourceCount = sources.filter(item => item.health === "healthy").length;
		const openCorrections = corrections.filter(item => item.status !== "resolved");
		const reviewQueue = content.filter(item => item.status !== "published" || !item.published);
		const packageQueue = guidePackages.filter(item => item.status !== "published");
		const dueChecks = sources.filter(item => new Date(item.nextCheckAt).getTime() <= Date.now());
		const needsAttention = [
			...(security.status === "needs_attention"
				? [security.summary]
				: []),
			...openCorrections
				.filter(item => item.priority === "high")
				.slice(0, 2)
				.map(item => `${item.subject}: ${item.nextStep}`),
			...packageQueue
				.slice(0, 2)
				.map(item => `${item.electionSlug}: package is ${item.status.replaceAll("_", " ")}.`),
			...content
				.filter(item => item.status === "needs-sources")
				.slice(0, 2)
				.map(item => `${item.title}: ${item.blocker || "Waiting on source coverage."}`),
			...sources
				.filter(item => item.health === "incident" || item.health === "stale")
				.slice(0, 2)
				.map(item => `${item.label}: ${item.note}`)
		].slice(0, 6);

		return {
			metrics: [
				{
					helpText: "Reader reports and internal issues that still need a documented resolution.",
					id: "open-corrections",
					label: "Open corrections",
					tone: openCorrections.length ? "attention" : "healthy",
					value: String(openCorrections.length)
				},
				{
					helpText: "Candidate, measure, election, and guide-package records not yet marked published.",
					id: "review-queue",
					label: "Awaiting publish",
					tone: (reviewQueue.length || packageQueue.length) ? "review" : "healthy",
					value: String(reviewQueue.length + packageQueue.length)
				},
				{
					helpText: "Tracked source systems passing the latest check cycle.",
					id: "healthy-sources",
					label: "Healthy sources",
					tone: healthySourceCount === sources.length ? "healthy" : "review",
					value: `${healthySourceCount}/${sources.length}`
				},
				{
					helpText: "Source monitors due now or already past their next scheduled check.",
					id: "due-checks",
					label: "Checks due",
					tone: dueChecks.length ? "attention" : "healthy",
					value: String(dueChecks.length)
				}
			],
			needsAttention: needsAttention.length ? needsAttention : ["No urgent blockers are currently open."],
			recentActivity: listActivity(),
			security
		};
	}

	function hasUsers() {
		const count = database.prepare("SELECT COUNT(*) AS count FROM admin_users").get() as unknown as DatabaseCountRow;
		return Number(count.count) > 0;
	}

	return {
		driver: "sqlite",
		authenticateUser,
		createCorrectionSubmission,
		createGuidePackage,
		createMfaSetup,
		createUser,
		disableMfa,
		enableMfa,
		getContentHistory,
		getContentRecord,
		getGuidePackage,
		getHealth: () => ({ ok: true }),
		getOverview,
		hasUsers,
		listContent,
		listAuditEvents,
		listCorrections,
		listGuidePackages,
		listReview,
		listSourceMonitor,
		listUsers,
		rollbackContent,
		updateContent,
		updateCorrection,
		updateGuidePackage,
		updateSource,
		updateUser,
		verifyUserMfaCode
	};
}
