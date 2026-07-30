import type { PoolClient } from "pg";
import type {
	AdminAuditActor,
	AdminRepository,
	AdminRepositoryOptions,
	ContentHistoryRow,
	CreateGuidePackageInput,
	GuidePackagePatch,
	GuidePackageWorkflowListResponse,
} from "./admin-store.js";
import type {
	AdminActivityItem,
	AdminAuditEvent,
	AdminAuditEventType,
	AdminAuditResponse,
	AdminContentHistoryResponse,
	AdminContentItem,
	AdminContentSnapshot,
	AdminCorrectionRequest,
	AdminEntityType,
	AdminMfaSetupResponse,
	AdminSourceMonitorItem,
	AdminUser,
	AdminUserRole,
	GuidePackageReviewRecommendation,
	GuidePackageStatus,
	GuidePackageWorkflow,
} from "./types/civic.js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
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
	buildContentSnapshot,
	changedContentFields,
	describeContentHistoryChange,
	getLegacyDemoAdminIds,
	hashPassword,
	nextAdminCredentialTimestamp,
	normalizeAdminPassword,
	parseContentHistoryRow,
	parseContentSnapshot,
	resolveContentLookupFromPageUrl,
	shouldPurgeLegacyDemoAdminData,
	snapshotToContentUpdateValues,
	verifyPassword
} from "./admin-store.js";
import { normalizeCorrectionSubmission } from "./feedback-submission.js";

interface CountRow {
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
	password_hash: string;
	updated_at: string;
}

const adminUserSelectColumns = "id, username, display_name, role, created_at, credentials_updated_at, disabled_at, last_login_at, mfa_secret, mfa_enabled_at, password_hash, updated_at";

interface ContentRow {
	id: string;
	title: string;
	entity_type: AdminEntityType;
	entity_slug: string;
	status: AdminContentItem["status"];
	priority: AdminContentItem["priority"];
	updated_at: string;
	assigned_to: string;
	blocker: string | null;
	summary: string;
	public_summary: string | null;
	ballot_summary: string | null;
	source_coverage: string;
	published: boolean;
	published_at: string | null;
	publish_approved_at: string | null;
	publish_approved_by: string | null;
	publish_approval_note: string | null;
}

interface CorrectionRow {
	content_id: string | null;
	content_title: string | null;
	id: string;
	submission_type: AdminCorrectionRequest["submissionType"];
	subject: string;
	entity_type: AdminCorrectionRequest["entityType"];
	entity_label: string;
	status: AdminCorrectionRequest["status"];
	priority: AdminCorrectionRequest["priority"];
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
	health: AdminSourceMonitorItem["health"];
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

const packagedSchemaPath = new URL("./admin-schema.postgres.sql", import.meta.url);
const sourceSchemaPath = new URL("../admin-schema.postgres.sql", import.meta.url);

function resolvePostgresSchemaPath() {
	const packagedPathname = fileURLToPath(packagedSchemaPath);

	if (existsSync(packagedPathname))
		return packagedPathname;

	return fileURLToPath(sourceSchemaPath);
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
		published: row.published,
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

async function seedPostgresDatabase(pool: Pool, options: AdminRepositoryOptions) {
	const mfaEncryptionKey = options.mfaEncryptionKey ?? process.env.ADMIN_MFA_ENCRYPTION_KEY ?? "";
	const schema = readFileSync(resolvePostgresSchemaPath(), "utf8");
	const contentSeed = options.contentSeed ?? [];
	const correctionSeed = options.correctionSeed ?? [];
	const sourceMonitorSeed = options.sourceMonitorSeed ?? [];
	const activitySeed = options.activitySeed ?? [];
	const guidePackageSeed = options.guidePackageSeed ?? [];
	await pool.query(schema);
	await pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS credentials_updated_at TEXT");
	await pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS disabled_at TEXT");
	await pool.query("ALTER TABLE admin_content ADD COLUMN IF NOT EXISTS public_summary TEXT");
	await pool.query("ALTER TABLE admin_content ADD COLUMN IF NOT EXISTS ballot_summary TEXT");
	await pool.query("ALTER TABLE admin_content ADD COLUMN IF NOT EXISTS publish_approved_by TEXT");
	await pool.query("ALTER TABLE admin_content ADD COLUMN IF NOT EXISTS publish_approved_at TEXT");
	await pool.query("ALTER TABLE admin_content ADD COLUMN IF NOT EXISTS publish_approval_note TEXT");
	await pool.query("ALTER TABLE admin_corrections ADD COLUMN IF NOT EXISTS content_id TEXT");
	await pool.query("ALTER TABLE admin_guide_packages ADD COLUMN IF NOT EXISTS review_recommendation TEXT");
	await pool.query("CREATE INDEX IF NOT EXISTS idx_admin_corrections_content ON admin_corrections (content_id)");
	await pool.query(`
		UPDATE admin_users
		SET credentials_updated_at = COALESCE(credentials_updated_at, created_at, updated_at)
		WHERE credentials_updated_at IS NULL
	`);
	const storedMfaSecrets = await pool.query<Pick<UserRow, "id" | "mfa_secret">>(`
		SELECT id, mfa_secret
		FROM admin_users
		WHERE mfa_secret IS NOT NULL
	`);

	if (storedMfaSecrets.rows.length) {
		const client = await pool.connect();

		try {
			await client.query("BEGIN");

			for (const row of storedMfaSecrets.rows) {
				if (!row.mfa_secret)
					continue;

				const migratedSecret = migrateAdminMfaSecret(
					row.id,
					row.mfa_secret,
					mfaEncryptionKey
				);

				if (migratedSecret !== row.mfa_secret) {
					await client.query(
						"UPDATE admin_users SET mfa_secret = $1 WHERE id = $2",
						[migratedSecret, row.id]
					);
				}
			}

			await client.query("COMMIT");
		}
		catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
		finally {
			client.release();
		}
	}
	await pool.query(`
		UPDATE admin_content
		SET publish_approved_by = COALESCE(publish_approved_by, 'Legacy publish state'),
			publish_approved_at = COALESCE(publish_approved_at, published_at, updated_at),
			publish_approval_note = COALESCE(publish_approval_note, 'Published before approval metadata was added; retained as a legacy approved record.')
		WHERE published = TRUE AND publish_approved_by IS NULL
	`);

	if (shouldPurgeLegacyDemoAdminData(options)) {
		const legacyIds = getLegacyDemoAdminIds();

		if (legacyIds.contentIds.length)
			await pool.query("DELETE FROM admin_content WHERE id = ANY($1::text[])", [legacyIds.contentIds]);

		if (legacyIds.correctionIds.length)
			await pool.query("DELETE FROM admin_corrections WHERE id = ANY($1::text[])", [legacyIds.correctionIds]);

		if (legacyIds.sourceMonitorIds.length)
			await pool.query("DELETE FROM admin_source_monitors WHERE id = ANY($1::text[])", [legacyIds.sourceMonitorIds]);

		if (legacyIds.activityIds.length)
			await pool.query("DELETE FROM admin_activity WHERE id = ANY($1::text[])", [legacyIds.activityIds]);
	}

	const usersCount = Number((await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_users")).rows[0]?.count ?? 0);
	const contentCount = Number((await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_content")).rows[0]?.count ?? 0);
	const correctionsCount = Number((await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_corrections")).rows[0]?.count ?? 0);
	const sourcesCount = Number((await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_source_monitors")).rows[0]?.count ?? 0);
	const activityCount = Number((await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_activity")).rows[0]?.count ?? 0);
	const guidePackagesCount = Number((await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_guide_packages")).rows[0]?.count ?? 0);

	if (!contentCount) {
		for (const item of contentSeed) {
			await pool.query(`
				INSERT INTO admin_content (
					id, entity_type, entity_slug, title, status, priority, assigned_to, blocker, summary,
					public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by,
					publish_approved_at, publish_approval_note, updated_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
			`, [
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
				item.published,
				item.publishedAt || null,
				item.publishApprovedBy || null,
				item.publishApprovedAt || null,
				item.publishApprovalNote || null,
				item.updatedAt
			]);
		}
	}

	for (const item of contentSeed) {
		await pool.query(`
			UPDATE admin_content
			SET public_summary = CASE
					WHEN public_summary IS NULL OR btrim(public_summary) = '' THEN $1
					ELSE public_summary
				END,
				ballot_summary = CASE
					WHEN ballot_summary IS NULL OR btrim(ballot_summary) = '' THEN $2
					ELSE ballot_summary
				END,
				published = CASE
					WHEN public_summary IS NULL OR btrim(public_summary) = '' THEN $3
					ELSE published
				END,
				published_at = CASE
					WHEN public_summary IS NULL OR btrim(public_summary) = '' THEN COALESCE(published_at, $4)
					ELSE published_at
				END,
				publish_approved_by = CASE
					WHEN public_summary IS NULL OR btrim(public_summary) = '' THEN COALESCE(publish_approved_by, $5)
					ELSE publish_approved_by
				END,
				publish_approved_at = CASE
					WHEN public_summary IS NULL OR btrim(public_summary) = '' THEN COALESCE(publish_approved_at, $6)
					ELSE publish_approved_at
				END,
				publish_approval_note = CASE
					WHEN public_summary IS NULL OR btrim(public_summary) = '' THEN COALESCE(publish_approval_note, $7)
					ELSE publish_approval_note
				END
			WHERE entity_type = $8 AND entity_slug = $9
		`, [
			item.publicSummary,
			item.publicBallotSummary || null,
			item.published,
			item.publishedAt || null,
			item.publishApprovedBy || null,
			item.publishApprovedAt || null,
			item.publishApprovalNote || null,
			item.entityType,
			item.entitySlug
		]);
	}

	if (!correctionsCount) {
		for (const item of correctionSeed) {
			await pool.query(`
					INSERT INTO admin_corrections (
						id, submission_type, subject, entity_type, entity_label, status, priority, submitted_at,
						reported_by, summary, next_step, source_count, page_url, content_id
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
				`, [
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
			]);
		}
	}

	if (!sourcesCount) {
		for (const item of sourceMonitorSeed) {
			await pool.query(`
				INSERT INTO admin_source_monitors (
					id, label, authority, health, last_checked_at, next_check_at, owner, note
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			`, [
				item.id,
				item.label,
				item.authority,
				item.health,
				item.lastCheckedAt,
				item.nextCheckAt,
				item.owner,
				item.note
			]);
		}
	}

	if (!activityCount) {
		for (const item of activitySeed) {
			await pool.query(`
				INSERT INTO admin_activity (id, label, type, timestamp, summary)
				VALUES ($1, $2, $3, $4, $5)
			`, [item.id, item.label, item.type, item.timestamp, item.summary]);
		}
	}

	if (!guidePackagesCount) {
		for (const item of guidePackageSeed) {
			await pool.query(`
				INSERT INTO admin_guide_packages (
					id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits,
					created_at, drafted_at, reviewed_at, published_at, updated_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
			`, [
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
			]);
		}
	}

	const bootstrapUsername = options.bootstrapUsername || process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_USERNAME || null;
	const bootstrapPassword = options.bootstrapPassword || process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || null;
	const bootstrapDisplayName = options.bootstrapDisplayName || process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME || "Ballot Clarity Admin";
	const bootstrapRole = options.bootstrapRole || (process.env.ADMIN_BOOTSTRAP_ROLE as AdminUserRole | undefined) || "admin";

	if (!usersCount && bootstrapUsername && bootstrapPassword) {
		const now = new Date().toISOString();

		await pool.query(`
			INSERT INTO admin_users (
				id, username, display_name, role, password_hash, created_at, credentials_updated_at, mfa_secret, mfa_enabled_at, updated_at, disabled_at, last_login_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		`, [
			`user-${bootstrapUsername}`,
			bootstrapUsername.trim(),
			bootstrapDisplayName,
			bootstrapRole,
			hashPassword(bootstrapPassword),
			now,
			now,
			null,
			null,
			now,
			null,
			null
		]);
	}
}

export async function createPostgresAdminRepository(options: AdminRepositoryOptions = {}): Promise<AdminRepository> {
	const connectionString = options.databaseUrl || process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
	const dummyPasswordHash = hashPassword(randomUUID());
	const mfaEncryptionKey = options.mfaEncryptionKey ?? process.env.ADMIN_MFA_ENCRYPTION_KEY ?? "";

	if (!connectionString)
		throw new Error("Postgres admin store requires ADMIN_DATABASE_URL or DATABASE_URL.");

	const pool = new Pool({
		allowExitOnIdle: true,
		connectionString
	});

	await seedPostgresDatabase(pool, options);

	async function runTransaction<T>(work: (client: PoolClient) => Promise<T>) {
		const client = await pool.connect();

		try {
			await client.query("BEGIN");
			const result = await work(client);
			await client.query("COMMIT");
			return result;
		}
		catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
		finally {
			client.release();
		}
	}

	async function logActivity(
		type: AdminActivityItem["type"],
		label: string,
		summary: string,
		executor: Pool | PoolClient = pool
	) {
		const timestamp = new Date().toISOString();
		await executor.query(`
			INSERT INTO admin_activity (id, label, type, timestamp, summary)
			VALUES ($1, $2, $3, $4, $5)
		`, [`activity-${randomUUID()}`, label, type, timestamp, summary]);
	}

	async function listActivity(limit = 8) {
		const result = await pool.query<ActivityRow>(`
			SELECT id, label, type, timestamp, summary
			FROM admin_activity
			ORDER BY timestamp DESC
			LIMIT $1
		`, [limit]);

		return result.rows.map(rowToActivity);
	}

	async function appendAuditEvent(client: PoolClient, input: AuditEventInput) {
		const actor = normalizeAuditActor(input.actor);
		const metadata = stableStringify(input.metadata ?? {});
		const timestamp = input.timestamp || new Date().toISOString();

		await client.query("LOCK TABLE admin_audit_events IN EXCLUSIVE MODE");
		const lastResult = await client.query<Pick<AuditRow, "event_hash" | "sequence">>(`
			SELECT sequence, event_hash
			FROM admin_audit_events
			ORDER BY sequence DESC
			LIMIT 1
		`);
		const last = lastResult.rows[0];
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

		await client.query(`
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
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		`, [
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
		]);
	}

	async function recordAuditEvent(input: AuditEventInput) {
		await runTransaction(async (client) => {
			await appendAuditEvent(client, input);
		});
	}

	async function buildAuditEventResponse(): Promise<AdminAuditResponse> {
		const result = await pool.query<AuditRow>(`
			SELECT id, sequence, timestamp, event_type, actor_username, actor_display_name, actor_role, target_type, target_id, target_label, summary, metadata, previous_hash, event_hash
			FROM admin_audit_events
			ORDER BY sequence ASC
		`);
		const latestHash = result.rows.at(-1)?.event_hash;
		const rows = result.rows.slice(-100).reverse();

		return {
			events: rows.map(rowToAuditEvent),
			integrityVerified: verifyAuditChain(result.rows),
			latestHash,
			updatedAt: result.rows.at(-1)?.timestamp ?? new Date().toISOString()
		};
	}

	async function getContentRow(id: string) {
		const result = await pool.query<ContentRow>(`
				SELECT id, title, entity_type, entity_slug, status, priority, updated_at, assigned_to, blocker, summary, public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by, publish_approved_at, publish_approval_note
				FROM admin_content
				WHERE id = $1
		`, [id]);

		return result.rows[0];
	}

	async function resolveContentIdForPageUrl(pageUrl: string | undefined) {
		const lookup = resolveContentLookupFromPageUrl(pageUrl);

		if (!lookup)
			return null;

		const result = await pool.query<{ id: string }>(`
				SELECT id
				FROM admin_content
				WHERE entity_type = $1 AND entity_slug = $2
			`, [lookup.entityType, lookup.entitySlug]);

		return result.rows[0]?.id ?? null;
	}

	async function resolvePatchContentId(contentId: string | null | undefined) {
		if (contentId === null)
			return null;

		const normalized = contentId?.trim();

		if (!normalized)
			return null;

		const result = await pool.query<{ id: string }>(`
				SELECT id
				FROM admin_content
				WHERE id = $1
			`, [normalized]);

		const row = result.rows[0];

		if (!row)
			throw new Error("Linked content record not found.");

		return row.id;
	}

	async function writeContentHistory(
		contentId: string,
		changedAt: string,
		changedFields: string[],
		previous: AdminContentSnapshot,
		next: AdminContentSnapshot,
		summary: string
	) {
		await pool.query(`
			INSERT INTO admin_content_history (
				id,
				content_id,
				changed_at,
				changed_fields,
				previous_snapshot,
				next_snapshot,
				summary
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, [
			`content-history-${randomUUID()}`,
			contentId,
			changedAt,
			JSON.stringify(changedFields),
			JSON.stringify(previous),
			JSON.stringify(next),
			summary
		]);
	}

	const repository: AdminRepository = {
		driver: "postgres",
		async authenticateUser(username, password) {
			const normalized = username.trim().toLowerCase();
			const result = await pool.query<UserRow>(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE username = $1
			`, [normalized]);
			const row = result.rows[0];
			const passwordAccepted = verifyPassword(password, row?.password_hash ?? dummyPasswordHash);

			if (!row || row.disabled_at || !passwordAccepted)
				return null;

			const now = new Date().toISOString();
			await pool.query("UPDATE admin_users SET last_login_at = $1, updated_at = $1 WHERE id = $2", [now, row.id]);

			return {
				...rowToUser({ ...row, last_login_at: now }),
				lastLoginAt: now
			};
		},
		async createCorrectionSubmission(input) {
			const submission = normalizeCorrectionSubmission(input);
			const { email, message, subject } = submission;

			const now = new Date().toISOString();
			const id = `correction-${randomUUID()}`;
			const reportedBy = submission.name ? `${submission.name} <${email}>` : email;
			const summary = submission.sourceLinks
				? `${message}\n\nSupporting links:\n${submission.sourceLinks}`
				: message;
			const contentId = await resolveContentIdForPageUrl(submission.pageUrl);

			await pool.query(`
					INSERT INTO admin_corrections (
						id, submission_type, subject, entity_type, entity_label, status, priority, submitted_at,
						reported_by, summary, next_step, source_count, page_url, content_id
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
				`, [
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
			]);

			await logActivity(
				"correction",
				submission.submissionType === "correction" ? "Received correction submission" : "Received public feedback",
				`${subject} was submitted through the public contact form.`
			);

			return { ok: true, submittedAt: now };
		},
		async createUser(input) {
			const username = input.username.trim().toLowerCase();
			const displayName = input.displayName.trim();
			const password = normalizeAdminPassword(input.password);

			if (!username || !displayName)
				throw new Error("Display name, username, role, and password are required.");

			const now = new Date().toISOString();
			const id = `user-${randomUUID()}`;

			await runTransaction(async (client) => {
				const existing = await client.query<UserRow>(`
					SELECT ${adminUserSelectColumns}
					FROM admin_users
					WHERE username = $1
					FOR UPDATE
				`, [username]);

				if (existing.rows[0])
					throw new Error("An admin user with that username already exists.");

				await client.query(`
					INSERT INTO admin_users (
						id, username, display_name, role, password_hash, created_at, credentials_updated_at, mfa_secret, mfa_enabled_at, updated_at, disabled_at, last_login_at
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
				`, [
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
					null,
					null
				]);

				await logActivity(
					"review",
					`Created ${input.role} user`,
					`${displayName} can now access the internal editorial workspace.`,
					client
				);
				await appendAuditEvent(client, {
					actor: input.auditActor,
					eventType: "admin_user_create",
					metadata: {
						role: input.role,
						username
					},
					summary: `${displayName} was created as an ${input.role} account.`,
					targetId: id,
					targetLabel: displayName,
					targetType: "admin_user",
					timestamp: now
				});
			});

			return {
				createdAt: now,
				credentialsUpdatedAt: now,
				displayName,
				id,
				role: input.role,
				username
			};
		},
		async createMfaSetup(username): Promise<AdminMfaSetupResponse> {
			const normalized = username.trim().toLowerCase();
			const result = await pool.query<UserRow>(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE username = $1
			`, [normalized]);
			const row = result.rows[0];

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
		},
		async verifyUserMfaCode(userId, mfaCode) {
			const result = await pool.query<UserRow>(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				WHERE id = $1
			`, [userId]);
			const row = result.rows[0];

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
		},
		async enableMfa(username, currentPassword, secret, mfaCode, auditActor): Promise<AdminUser> {
			const normalized = username.trim().toLowerCase();
			return await runTransaction(async (client) => {
				const result = await client.query<UserRow>(`
					SELECT ${adminUserSelectColumns}
					FROM admin_users
					WHERE username = $1
					FOR UPDATE
				`, [normalized]);
				const row = result.rows[0];

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

				await client.query(`
					UPDATE admin_users
					SET mfa_secret = $1, mfa_enabled_at = $2, credentials_updated_at = $3, updated_at = $4
					WHERE id = $5
				`, [encryptedMfaSecret, nextCredentialsUpdatedAt, nextCredentialsUpdatedAt, nextCredentialsUpdatedAt, row.id]);

				await logActivity(
					"review",
					"Enabled admin MFA",
					`${row.display_name} enabled multi-factor authentication.`,
					client
				);
				await appendAuditEvent(client, {
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
		},
		async disableMfa(username, currentPassword, mfaCode, auditActor): Promise<AdminUser> {
			const normalized = username.trim().toLowerCase();
			return await runTransaction(async (client) => {
				const result = await client.query<UserRow>(`
					SELECT ${adminUserSelectColumns}
					FROM admin_users
					WHERE username = $1
					FOR UPDATE
				`, [normalized]);
				const row = result.rows[0];

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

				await client.query(`
					UPDATE admin_users
					SET mfa_secret = NULL, mfa_enabled_at = NULL, credentials_updated_at = $1, updated_at = $2
					WHERE id = $3
				`, [nextCredentialsUpdatedAt, nextCredentialsUpdatedAt, row.id]);

				await logActivity(
					"review",
					"Disabled admin MFA",
					`${row.display_name} disabled multi-factor authentication.`,
					client
				);
				await appendAuditEvent(client, {
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
		},
		async getContentRecord(entityType, entitySlug) {
			const result = await pool.query<ContentRow>(`
				SELECT id, title, entity_type, entity_slug, status, priority, updated_at, assigned_to, blocker, summary, public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by, publish_approved_at, publish_approval_note
				FROM admin_content
				WHERE entity_type = $1 AND entity_slug = $2
			`, [entityType, entitySlug]);

			return result.rows[0] ? rowToContent(result.rows[0]) : null;
		},
		async getContentHistory(id): Promise<AdminContentHistoryResponse> {
			if (!await getContentRow(id))
				throw new Error("Content record not found.");

			const result = await pool.query<ContentHistoryRow>(`
				SELECT id, content_id, changed_at, changed_fields, previous_snapshot, next_snapshot, summary
				FROM admin_content_history
				WHERE content_id = $1
				ORDER BY changed_at DESC
			`, [id]);

			return {
				contentId: id,
				history: result.rows.map(parseContentHistoryRow),
				updatedAt: result.rows[0]?.changed_at || new Date().toISOString()
			};
		},
		async getGuidePackage(id) {
			const result = await pool.query<GuidePackageRow>(`
				SELECT id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits, created_at, drafted_at, reviewed_at, published_at, updated_at
				FROM admin_guide_packages
				WHERE id = $1
			`, [id]);

			return result.rows[0] ? rowToGuidePackage(result.rows[0]) : null;
		},
		async getHealth() {
			await pool.query("SELECT 1");
			return { ok: true };
		},
		async getOverview() {
			const content = (await repository.listContent()).items;
			const corrections = (await repository.listCorrections()).corrections;
			const guidePackages = (await repository.listGuidePackages()).packages;
			const sources = (await repository.listSourceMonitor()).sources;
			const security = buildAdminSecurityStatus((await repository.listUsers()).users);
			const healthySourceCount = sources.filter(item => item.health === "healthy").length;
			const openCorrections = corrections.filter(item => item.status !== "resolved");
			const reviewQueue = content.filter(item => item.status !== "published" || !item.published);
			const packageQueue = guidePackages.filter(item => item.status !== "published");
			const dueChecks = sources.filter(item => new Date(item.nextCheckAt).getTime() <= Date.now());
			const needsAttention = [
				...(security.status === "needs_attention" ? [security.summary] : []),
				...openCorrections.filter(item => item.priority === "high").slice(0, 2).map(item => `${item.subject}: ${item.nextStep}`),
				...packageQueue.slice(0, 2).map(item => `${item.electionSlug}: package is ${item.status.replaceAll("_", " ")}.`),
				...content.filter(item => item.status === "needs-sources").slice(0, 2).map(item => `${item.title}: ${item.blocker || "Waiting on source coverage."}`),
				...sources.filter(item => item.health === "incident" || item.health === "stale").slice(0, 2).map(item => `${item.label}: ${item.note}`)
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
				recentActivity: await listActivity(),
				security
			};
		},
		async hasUsers() {
			const result = await pool.query<CountRow>("SELECT COUNT(*)::int AS count FROM admin_users");
			return Number(result.rows[0]?.count ?? 0) > 0;
		},
		async listContent() {
			const result = await pool.query<ContentRow>(`
				SELECT id, title, entity_type, entity_slug, status, priority, updated_at, assigned_to, blocker, summary, public_summary, ballot_summary, source_coverage, published, published_at, publish_approved_by, publish_approved_at, publish_approval_note
				FROM admin_content
				ORDER BY published ASC, priority DESC, updated_at DESC
			`);

			return { items: result.rows.map(rowToContent) };
		},
		async listAuditEvents() {
			return await buildAuditEventResponse();
		},
		async listCorrections() {
			const result = await pool.query<CorrectionRow>(`
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
				`);

			return { corrections: result.rows.map(rowToCorrection) };
		},
		async listGuidePackages() {
			const result = await pool.query<GuidePackageRow>(`
				SELECT id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits, created_at, drafted_at, reviewed_at, published_at, updated_at
				FROM admin_guide_packages
				ORDER BY CASE status
					WHEN 'published' THEN 0
					WHEN 'ready_to_publish' THEN 1
					WHEN 'in_review' THEN 2
					ELSE 3
				END, updated_at DESC
			`);

			return {
				packages: result.rows.map(rowToGuidePackage),
				updatedAt: result.rows.map(row => row.updated_at).sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString(),
			} satisfies GuidePackageWorkflowListResponse;
		},
		async listReview() {
			return {
				items: (await repository.listContent()).items.map(item => ({
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
		},
		async createGuidePackage(input: CreateGuidePackageInput) {
			const existing = await repository.getGuidePackage(input.id);

			if (existing)
				throw new Error("Guide package already exists.");

			const now = new Date().toISOString();

			await pool.query(`
				INSERT INTO admin_guide_packages (
					id, election_slug, jurisdiction_slug, status, reviewer, review_notes, review_recommendation, coverage_notes, coverage_limits,
					created_at, drafted_at, reviewed_at, published_at, updated_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
			`, [
				input.id,
				input.electionSlug,
				input.jurisdictionSlug,
				input.status ?? "draft",
				input.reviewer?.trim() || null,
				input.reviewNotes?.trim() || null,
				input.reviewRecommendation || null,
				JSON.stringify(input.coverageNotes ?? []),
				JSON.stringify(input.coverageLimits ?? []),
				input.createdAt || now,
				input.draftedAt || now,
				input.reviewedAt || null,
				input.publishedAt || null,
				input.updatedAt || now
			]);

			await logActivity("review", "Guide package drafted", `${input.electionSlug} guide package entered the ${(input.status ?? "draft").replaceAll("_", " ")} state.`);
			return await repository.listGuidePackages();
		},
		async listSourceMonitor() {
			const result = await pool.query<SourceRow>(`
				SELECT id, label, authority, health, last_checked_at, next_check_at, owner, note
				FROM admin_source_monitors
				ORDER BY CASE health WHEN 'incident' THEN 0 WHEN 'stale' THEN 1 WHEN 'review-soon' THEN 2 ELSE 3 END, next_check_at ASC
			`);

			return { sources: result.rows.map(rowToSource) };
		},
		async listUsers() {
			const result = await pool.query<UserRow>(`
				SELECT ${adminUserSelectColumns}
				FROM admin_users
				ORDER BY CASE WHEN disabled_at IS NULL THEN 0 ELSE 1 END, CASE role WHEN 'admin' THEN 0 ELSE 1 END, username
			`);

			return { users: result.rows.map(rowToUser) };
		},
		async updateUser(id, patch) {
			await runTransaction(async (client) => {
				await client.query("LOCK TABLE admin_users IN SHARE ROW EXCLUSIVE MODE");
				const currentResult = await client.query<UserRow>(`
					SELECT ${adminUserSelectColumns}
					FROM admin_users
					WHERE id = $1
					FOR UPDATE
				`, [id]);
				const current = currentResult.rows[0];

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
				const shouldRotateCredentials = patch.password !== undefined || shouldResetMfa;
				const nextCredentialsUpdatedAt = shouldRotateCredentials
					? nextAdminCredentialTimestamp(current.credentials_updated_at || current.created_at)
					: current.credentials_updated_at || current.created_at;
				const nextUpdatedAt = shouldRotateCredentials ? nextCredentialsUpdatedAt : now;
				const nextMfaSecret = patch.mfaReset === true ? null : current.mfa_secret;
				const nextMfaEnabledAt = patch.mfaReset === true ? null : current.mfa_enabled_at;

				if (patch.disabled && !current.disabled_at && current.role === "admin") {
					const remainingAdmins = await client.query<CountRow>(`
						SELECT COUNT(*)::int AS count
						FROM admin_users
						WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1
					`, [id]);

					if (Number(remainingAdmins.rows[0]?.count ?? 0) < 1)
						throw new Error("Cannot disable the last active admin user.");
				}

				await client.query(`
					UPDATE admin_users
					SET disabled_at = $1, password_hash = $2, mfa_secret = $3, mfa_enabled_at = $4, credentials_updated_at = $5, updated_at = $6
					WHERE id = $7
				`, [nextDisabledAt, nextPasswordHash, nextMfaSecret, nextMfaEnabledAt, nextCredentialsUpdatedAt, nextUpdatedAt, id]);

				if (patch.disabled !== undefined && nextDisabledAt !== current.disabled_at) {
					await logActivity(
						"review",
						patch.disabled ? "Disabled admin user" : "Restored admin user",
						`${current.display_name} ${patch.disabled ? "can no longer sign in" : "can sign in again"}.`,
						client
					);
					await appendAuditEvent(client, {
						actor: patch.auditActor,
						eventType: patch.disabled ? "admin_user_disable" : "admin_user_restore",
						metadata: {
							disabledAt: nextDisabledAt,
							username: current.username
						},
						summary: `${current.display_name} ${patch.disabled ? "was disabled" : "was restored"}.`,
						targetId: current.id,
						targetLabel: current.display_name,
						targetType: "admin_user",
						timestamp: now
					});
				}

				if (patch.password !== undefined) {
					const isSelfService = patch.passwordChangeMode === "self-service";

					await logActivity(
						"review",
						isSelfService ? "Changed admin password" : "Reset admin password",
						isSelfService
							? `${current.display_name} changed their own password. Existing sessions for this account are no longer valid.`
							: `${current.display_name} received a new temporary password. Existing sessions for this account are no longer valid.`,
						client
					);
					await appendAuditEvent(client, {
						actor: patch.auditActor,
						eventType: isSelfService ? "admin_user_password_change" : "admin_user_password_reset",
						metadata: {
							credentialsUpdatedAt: nextCredentialsUpdatedAt,
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
					await logActivity(
						"review",
						"Reset admin MFA",
						`${current.display_name} must enroll multi-factor authentication again before MFA is required. Existing sessions for this account are no longer valid.`,
						client
					);
					await appendAuditEvent(client, {
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
			});

			return await repository.listUsers();
		},
		async updateContent(id, patch) {
			const current = await getContentRow(id);

			if (!current)
				throw new Error("Content record not found.");

			const now = new Date().toISOString();
			const nextPublished = patch.published ?? current.published;
			const nextStatus = patch.status || (nextPublished ? "published" : current.status === "published" ? "in-review" : current.status);
			const nextPublishedAt = nextPublished ? current.published_at || now : null;
			const nextPublishApprovedBy = nextPublished
				? patch.publishApprovedBy === undefined ? current.publish_approved_by : patch.publishApprovedBy?.trim() || null
				: null;
			const nextPublishApprovalNote = nextPublished
				? patch.publishApprovalNote === undefined ? current.publish_approval_note : patch.publishApprovalNote?.trim() || null
				: null;
			const approvalChanged = patch.publishApprovedBy !== undefined || patch.publishApprovalNote !== undefined;
			const nextPublishApprovedAt = nextPublishApprovedBy
				? approvalChanged ? now : current.publish_approved_at || now
				: null;
			const nextPublicSummary = patch.publicSummary === undefined ? current.public_summary || "" : patch.publicSummary.trim();

			if (!nextPublicSummary)
				throw new Error("Public page summary is required.");

			if (nextPublished && !nextPublishApprovedBy)
				throw new Error("Publish approval reviewer is required before content can be published.");

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
				publishApprovedAt: nextPublishApprovedAt || undefined,
				publishApprovedBy: nextPublishApprovedBy || undefined,
				publishApprovalNote: nextPublishApprovalNote || undefined,
				status: nextStatus,
				updatedAt: now
			};
			const previousSnapshot = buildContentSnapshot(current);
			const changedFields = changedContentFields(previousSnapshot, nextSnapshot);

			if (!changedFields.length)
				return await repository.listContent();

			await pool.query(`
				UPDATE admin_content
				SET status = $1,
					priority = $2,
					assigned_to = $3,
					blocker = $4,
					public_summary = $5,
					ballot_summary = $6,
					published = $7,
					published_at = $8,
					publish_approved_by = $9,
					publish_approved_at = $10,
					publish_approval_note = $11,
					updated_at = $12
				WHERE id = $13
			`, [
				nextSnapshot.status,
				nextSnapshot.priority,
				nextSnapshot.assignedTo,
				nextSnapshot.blocker || null,
				nextSnapshot.publicSummary,
				nextSnapshot.publicBallotSummary || null,
				nextSnapshot.published,
				nextSnapshot.publishedAt || null,
				nextSnapshot.publishApprovedBy || null,
				nextSnapshot.publishApprovedAt || null,
				nextSnapshot.publishApprovalNote || null,
				now,
				id
			]);

			await writeContentHistory(
				id,
				now,
				changedFields,
				previousSnapshot,
				nextSnapshot,
				describeContentHistoryChange(current.title, changedFields)
			);

			await logActivity(
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
				await recordAuditEvent({
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

			return await repository.listContent();
		},
		async rollbackContent(id, historyId, auditActor) {
			const current = await getContentRow(id);

			if (!current)
				throw new Error("Content record not found.");

			const historyResult = await pool.query<ContentHistoryRow>(`
				SELECT id, content_id, changed_at, changed_fields, previous_snapshot, next_snapshot, summary
				FROM admin_content_history
				WHERE id = $1 AND content_id = $2
			`, [historyId, id]);
			const historyRow = historyResult.rows[0];

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
			const changedFields = changedContentFields(previousSnapshot, nextSnapshot);

			if (!changedFields.length)
				return await repository.listContent();

			await pool.query(`
				UPDATE admin_content
				SET status = $1,
					priority = $2,
					assigned_to = $3,
					blocker = $4,
					public_summary = $5,
					ballot_summary = $6,
					published = $7,
					published_at = $8,
					publish_approved_by = $9,
					publish_approved_at = $10,
					publish_approval_note = $11,
					updated_at = $12
				WHERE id = $13
			`, [
				nextSnapshot.status,
				nextSnapshot.priority,
				nextSnapshot.assignedTo,
				nextSnapshot.blocker || null,
				nextSnapshot.publicSummary,
				nextSnapshot.publicBallotSummary || null,
				nextSnapshot.published,
				nextSnapshot.publishedAt || null,
				nextSnapshot.publishApprovedBy || null,
				nextSnapshot.publishApprovedAt || null,
				nextSnapshot.publishApprovalNote || null,
				now,
				id
			]);

			await writeContentHistory(
				id,
				now,
				changedFields,
				previousSnapshot,
				nextSnapshot,
				`Rolled back ${current.title} to the version from ${historyRow.changed_at}.`
			);
			await logActivity("review", `${current.title} rolled back`, `Restored public content fields from the ${historyRow.changed_at} revision.`);
			await recordAuditEvent({
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

			return await repository.listContent();
		},
		async updateGuidePackage(id, patch: GuidePackagePatch) {
			const current = await repository.getGuidePackage(id);

			if (!current)
				throw new Error("Guide package not found.");

			const now = new Date().toISOString();
			const nextStatus = patch.status ?? current.status;
			const nextReviewer = patch.reviewer === undefined ? current.reviewer ?? null : patch.reviewer?.trim() || null;
			const nextReviewRecommendation = patch.reviewRecommendation === undefined
				? current.reviewRecommendation ?? null
				: patch.reviewRecommendation || null;
			const nextReviewNotes = patch.reviewNotes === undefined ? current.reviewNotes ?? null : patch.reviewNotes?.trim() || null;
			const nextCoverageNotes = patch.coverageNotes === undefined ? current.coverageNotes : patch.coverageNotes ?? [];
			const nextCoverageLimits = patch.coverageLimits === undefined ? current.coverageLimits : patch.coverageLimits ?? [];
			const nextDraftedAt = patch.draftedAt || current.draftedAt;
			const nextReviewedAt = patch.reviewedAt === undefined ? current.reviewedAt ?? null : patch.reviewedAt;
			const nextPublishedAt = patch.publishedAt === undefined ? current.publishedAt ?? null : patch.publishedAt;

			await pool.query(`
				UPDATE admin_guide_packages
				SET status = $1,
					reviewer = $2,
					review_notes = $3,
					review_recommendation = $4,
					coverage_notes = $5,
					coverage_limits = $6,
					drafted_at = $7,
					reviewed_at = $8,
					published_at = $9,
					updated_at = $10
				WHERE id = $11
			`, [
				nextStatus,
				nextReviewer,
				nextReviewNotes,
				nextReviewRecommendation,
				JSON.stringify(nextCoverageNotes),
				JSON.stringify(nextCoverageLimits),
				nextDraftedAt,
				nextReviewedAt,
				nextPublishedAt,
				now,
				id
			]);

			await logActivity(
				nextStatus === "published" ? "publish" : "review",
				`Guide package ${current.electionSlug} updated`,
				`Guide package moved to ${nextStatus.replaceAll("_", " ")}.`
			);

			if (current.status !== "published" && nextStatus === "published") {
				await recordAuditEvent({
					actor: patch.auditActor,
					eventType: "guide_package_publish",
					metadata: {
						electionSlug: current.electionSlug,
						jurisdictionSlug: current.jurisdictionSlug,
						publishedAt: nextPublishedAt,
						reviewRecommendation: nextReviewRecommendation,
						reviewer: nextReviewer
					},
					summary: `${current.electionSlug} guide package was published.`,
					targetId: current.id,
					targetLabel: current.electionSlug,
					targetType: "guide_package",
					timestamp: now
				});
			}
			else if (current.status === "published" && nextStatus !== "published") {
				await recordAuditEvent({
					actor: patch.auditActor,
					eventType: "guide_package_unpublish",
					metadata: {
						electionSlug: current.electionSlug,
						jurisdictionSlug: current.jurisdictionSlug,
						nextStatus,
						reviewRecommendation: nextReviewRecommendation,
						reviewer: nextReviewer
					},
					summary: `${current.electionSlug} guide package was unpublished.`,
					targetId: current.id,
					targetLabel: current.electionSlug,
					targetType: "guide_package",
					timestamp: now
				});
			}

			return await repository.listGuidePackages();
		},
		async updateCorrection(id, patch) {
			const currentResult = await pool.query<CorrectionRow>(`
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
					WHERE c.id = $1
				`, [id]);
			const current = currentResult.rows[0];

			if (!current)
				throw new Error("Correction record not found.");

			const contentId = patch.contentId === undefined
				? current.content_id
				: await resolvePatchContentId(patch.contentId);

			await pool.query(`
					UPDATE admin_corrections
					SET status = $1, priority = $2, next_step = $3, content_id = $4
					WHERE id = $5
				`, [
				patch.status ?? current.status,
				patch.priority ?? current.priority,
				patch.nextStep?.trim() || current.next_step,
				contentId,
				id
			]);

			const linkageSummary = contentId === current.content_id
				? ""
				: contentId
					? " Linked to a content record."
					: " Removed linked content record.";
			await logActivity(
				"correction",
				`${current.subject} updated`,
				`Correction item moved to ${patch.status ?? current.status}.${linkageSummary}`
			);

			return await repository.listCorrections();
		},
		async updateSource(id, patch) {
			const currentResult = await pool.query<SourceRow>(`
				SELECT id, label, authority, health, last_checked_at, next_check_at, owner, note
				FROM admin_source_monitors
				WHERE id = $1
			`, [id]);
			const current = currentResult.rows[0];

			if (!current)
				throw new Error("Source monitor record not found.");

			const now = new Date().toISOString();

			await pool.query(`
				UPDATE admin_source_monitors
				SET health = $1, last_checked_at = $2, next_check_at = $3, owner = $4, note = $5
				WHERE id = $6
			`, [
				patch.health ?? current.health,
				now,
				patch.nextCheckAt?.trim() || current.next_check_at,
				patch.owner?.trim() || current.owner,
				patch.note?.trim() || current.note,
				id
			]);

			await logActivity("source-check", `${current.label} updated`, `Source monitor status is now ${patch.health ?? current.health}.`);

			return await repository.listSourceMonitor();
		}
	};

	return repository;
}
