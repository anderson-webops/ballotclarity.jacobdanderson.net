import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createAdminMfaCode } from "../src/admin-mfa.js";
import { createSqliteAdminRepository, defaultContentSeed } from "../src/admin-store.js";
import { demoAdminCorrections, demoAdminSourceMonitor } from "../src/coverage-data.js";

test("default content seed keeps staged candidate and measure records unpublished", () => {
	const contentSeed = defaultContentSeed();
	const stagedRecords = contentSeed.filter(item => item.entityType === "candidate" || item.entityType === "measure");

	assert.ok(stagedRecords.length > 0);

	for (const item of stagedRecords) {
		assert.equal(item.published, false);
		assert.equal(item.publishedAt, undefined);
		assert.equal(item.publishApprovedAt, undefined);
		assert.equal(item.publishApprovedBy, undefined);
		assert.equal(item.publishApprovalNote, undefined);
		assert.notEqual(item.status, "published");
		assert.match(item.sourceCoverage, /not approved for public/i);
	}
});

test("default content seed scopes the published election shell approval to official logistics", () => {
	const electionRecord = defaultContentSeed().find(item => item.entityType === "election");

	assert.ok(electionRecord);
	assert.equal(electionRecord.published, true);
	assert.equal(electionRecord.publishApprovedBy, "Editorial review");
	assert.match(electionRecord.publishApprovalNote ?? "", /official-logistics guide shell/i);
	assert.match(electionRecord.publishApprovalNote ?? "", /contest, candidate, and measure content remains unpublished/i);
});

test("SQLite admin storage persists MFA seeds only as account-bound ciphertext", async () => {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-admin-mfa-"));
	const dbPath = join(root, "admin.sqlite");
	const encryptionKey = "test-admin-mfa-encryption-key-that-is-long-enough";
	const password = "correct-horse-battery-staple";

	try {
		const repository = createSqliteAdminRepository({
			bootstrapDisplayName: "Operations Admin",
			bootstrapPassword: password,
			bootstrapUsername: "ops-admin",
			dbPath,
			mfaEncryptionKey: encryptionKey,
		});
		const setup = await repository.createMfaSetup("ops-admin");
		const enabledUser = await repository.enableMfa(
			"ops-admin",
			password,
			setup.secret,
			createAdminMfaCode(setup.secret)
		);
		const inspector = new DatabaseSync(dbPath, { readOnly: true });
		const stored = inspector.prepare(
			"SELECT mfa_secret FROM admin_users WHERE id = ?"
		).get(enabledUser.id) as { mfa_secret: string };

		inspector.close();
		assert.match(stored.mfa_secret, /^v1\./u);
		assert.notEqual(stored.mfa_secret, setup.secret);
		assert.equal(
			await repository.verifyUserMfaCode(
				enabledUser.id,
				createAdminMfaCode(setup.secret)
			),
			true
		);
		assert.throws(() => createSqliteAdminRepository({
			dbPath,
			mfaEncryptionKey: "wrong-admin-mfa-encryption-key",
		}));
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("SQLite admin users must replace administrator-issued temporary passwords", async () => {
	const repository = createSqliteAdminRepository({
		bootstrapDisplayName: "Operations Admin",
		bootstrapPassword: "correct-horse-battery-staple",
		bootstrapUsername: "ops-admin",
		dbPath: ":memory:",
	});
	const editor = await repository.createUser({
		auditActor: {
			displayName: "Operations Admin",
			role: "admin",
			username: "ops-admin",
		},
		displayName: "Editorial Reviewer",
		password: "editorial-review-password",
		role: "editor",
		username: "reviewer",
	});

	assert.ok(editor.passwordChangeRequiredAt);
	assert.equal(
		(await repository.authenticateUser("reviewer", "editorial-review-password"))?.passwordChangeRequiredAt,
		editor.passwordChangeRequiredAt
	);

	const administrativelyReset = (await repository.updateUser(editor.id, {
		auditActor: {
			displayName: "Operations Admin",
			role: "admin",
			username: "ops-admin",
		},
		password: "second-temporary-password",
	})).users.find(user => user.id === editor.id);

	assert.ok(administrativelyReset?.passwordChangeRequiredAt);
	assert.notEqual(administrativelyReset.passwordChangeRequiredAt, editor.passwordChangeRequiredAt);

	const selfChanged = (await repository.updateUser(editor.id, {
		auditActor: {
			displayName: editor.displayName,
			role: editor.role,
			username: editor.username,
		},
		password: "reviewer-selected-password",
		passwordChangeMode: "self-service",
	})).users.find(user => user.id === editor.id);

	assert.equal(selfChanged?.passwordChangeRequiredAt, undefined);
	assert.equal(
		(await repository.authenticateUser("reviewer", "reviewer-selected-password"))?.passwordChangeRequiredAt,
		undefined
	);
});

test("SQLite account mutations roll back when their audit event cannot be recorded", async () => {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-admin-transaction-"));
	const dbPath = join(root, "admin.sqlite");
	const encryptionKey = "test-admin-mfa-encryption-key-that-is-long-enough";
	const password = "correct-horse-battery-staple";

	try {
		const repository = createSqliteAdminRepository({
			bootstrapDisplayName: "Operations Admin",
			bootstrapPassword: password,
			bootstrapUsername: "ops-admin",
			dbPath,
			mfaEncryptionKey: encryptionKey,
		});
		const editor = await repository.createUser({
			displayName: "Editorial Reviewer",
			password: "editorial-review-password",
			role: "editor",
			username: "reviewer",
		});
		const inspector = new DatabaseSync(dbPath);
		const baselineActivityCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_activity").get() as { count: number }).count
		);
		const baselineAuditCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_audit_events").get() as { count: number }).count
		);

		inspector.exec(`
			CREATE TRIGGER reject_admin_audit_event
			BEFORE INSERT ON admin_audit_events
			BEGIN
				SELECT RAISE(ABORT, 'forced audit failure');
			END
		`);

		await assert.rejects(
			async () => await repository.updateUser(editor.id, {
				auditActor: {
					displayName: "Operations Admin",
					role: "admin",
					username: "ops-admin",
				},
				disabled: true,
			}),
			/forced audit failure/u
		);
		const storedEditor = inspector.prepare(
			"SELECT credentials_updated_at, disabled_at FROM admin_users WHERE id = ?"
		).get(editor.id) as { credentials_updated_at: string; disabled_at: string | null };

		assert.equal(storedEditor.disabled_at, null);
		assert.equal(storedEditor.credentials_updated_at, editor.credentialsUpdatedAt);

		await assert.rejects(
			async () => await repository.createUser({
				displayName: "Second Reviewer",
				password: "second-reviewer-password",
				role: "editor",
				username: "second-reviewer",
			}),
			/forced audit failure/u
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE username = ?").get("second-reviewer") as { count: number }).count),
			0
		);

		const setup = await repository.createMfaSetup("ops-admin");

		await assert.rejects(
			async () => await repository.enableMfa(
				"ops-admin",
				password,
				setup.secret,
				createAdminMfaCode(setup.secret)
			),
			/forced audit failure/u
		);
		const storedMfa = inspector.prepare(
			"SELECT mfa_secret, mfa_enabled_at FROM admin_users WHERE username = ?"
		).get("ops-admin") as { mfa_enabled_at: string | null; mfa_secret: string | null };

		assert.equal(storedMfa.mfa_secret, null);
		assert.equal(storedMfa.mfa_enabled_at, null);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_activity").get() as { count: number }).count),
			baselineActivityCount
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_audit_events").get() as { count: number }).count),
			baselineAuditCount
		);

		inspector.close();
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("SQLite publication mutations roll back when their audit event cannot be recorded", async () => {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-publication-transaction-"));
	const dbPath = join(root, "admin.sqlite");

	try {
		const repository = createSqliteAdminRepository({
			contentSeed: defaultContentSeed(),
			correctionSeed: demoAdminCorrections.corrections,
			dbPath,
			sourceMonitorSeed: demoAdminSourceMonitor.sources,
		});
		const now = new Date().toISOString();
		const guidePackageId = "guide-package-transaction-test";

		await repository.createGuidePackage({
			draftedAt: now,
			electionSlug: "transaction-test-election",
			id: guidePackageId,
			jurisdictionSlug: "transaction-test-jurisdiction",
			status: "draft",
		});

		const publishedContent = (await repository.listContent()).items.find(item => item.published);
		const correction = (await repository.listCorrections()).corrections.find(item => item.status !== "new");
		const source = (await repository.listSourceMonitor()).sources[0];

		assert.ok(publishedContent);
		assert.ok(correction);
		assert.ok(source);

		const inspector = new DatabaseSync(dbPath);
		const baselineContent = inspector.prepare(`
			SELECT published, status, updated_at
			FROM admin_content
			WHERE id = ?
		`).get(publishedContent.id) as { published: number; status: string; updated_at: string };
		const baselineGuidePackage = inspector.prepare(`
			SELECT status, updated_at
			FROM admin_guide_packages
			WHERE id = ?
		`).get(guidePackageId) as { status: string; updated_at: string };
		const baselineCorrection = inspector.prepare(`
			SELECT status, priority, next_step, content_id
			FROM admin_corrections
			WHERE id = ?
		`).get(correction.id);
		const baselineSource = inspector.prepare(`
			SELECT health, last_checked_at, next_check_at, owner, note
			FROM admin_source_monitors
			WHERE id = ?
		`).get(source.id);
		const baselineHistoryCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_content_history").get() as { count: number }).count
		);
		const baselineActivityCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_activity").get() as { count: number }).count
		);
		const baselineAuditCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_audit_events").get() as { count: number }).count
		);
		const actor = {
			displayName: "Security Operator",
			role: "admin" as const,
			username: "security-operator",
		};

		inspector.exec(`
			CREATE TRIGGER reject_admin_audit_event
			BEFORE INSERT ON admin_audit_events
			BEGIN
				SELECT RAISE(ABORT, 'forced audit failure');
			END
		`);

		await assert.rejects(
			async () => await repository.updateContent(publishedContent.id, {
				auditActor: actor,
				published: false,
			}),
			/forced audit failure/u
		);
		assert.deepEqual(
			inspector.prepare(`
				SELECT published, status, updated_at
				FROM admin_content
				WHERE id = ?
			`).get(publishedContent.id),
			baselineContent
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_content_history").get() as { count: number }).count),
			baselineHistoryCount
		);

		await assert.rejects(
			async () => await repository.updateGuidePackage(guidePackageId, {
				auditActor: actor,
				publishedAt: now,
				reviewedAt: now,
				reviewer: "Security Operator",
				reviewNotes: "The package passed the publication checklist.",
				reviewRecommendation: "publish",
				status: "published",
			}),
			/forced audit failure/u
		);
		assert.deepEqual(
			inspector.prepare(`
				SELECT status, updated_at
				FROM admin_guide_packages
				WHERE id = ?
			`).get(guidePackageId),
			baselineGuidePackage
		);

		await assert.rejects(
			async () => await repository.updateCorrection(correction.id, {
				auditActor: actor,
				nextStep: "A public update that must be audited.",
			}),
			/forced audit failure/u
		);
		assert.deepEqual(
			inspector.prepare(`
				SELECT status, priority, next_step, content_id
				FROM admin_corrections
				WHERE id = ?
			`).get(correction.id),
			baselineCorrection
		);

		await assert.rejects(
			async () => await repository.updateSource(source.id, {
				auditActor: actor,
				health: "incident",
				note: "A source update that must be audited.",
			}),
			/forced audit failure/u
		);
		assert.deepEqual(
			inspector.prepare(`
				SELECT health, last_checked_at, next_check_at, owner, note
				FROM admin_source_monitors
				WHERE id = ?
			`).get(source.id),
			baselineSource
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_activity").get() as { count: number }).count),
			baselineActivityCount
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_audit_events").get() as { count: number }).count),
			baselineAuditCount
		);

		inspector.close();
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("SQLite editorial workflow mutations roll back when activity recording fails", async () => {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-workflow-transaction-"));
	const dbPath = join(root, "admin.sqlite");

	try {
		const repository = createSqliteAdminRepository({
			contentSeed: defaultContentSeed(),
			correctionSeed: demoAdminCorrections.corrections,
			dbPath,
			sourceMonitorSeed: demoAdminSourceMonitor.sources,
		});
		const correction = (await repository.listCorrections()).corrections[0];
		const source = (await repository.listSourceMonitor()).sources[0];

		assert.ok(correction);
		assert.ok(source);

		const inspector = new DatabaseSync(dbPath);
		const baselineCorrectionCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_corrections").get() as { count: number }).count
		);
		const baselineCorrection = inspector.prepare(`
			SELECT status, priority, next_step, content_id
			FROM admin_corrections
			WHERE id = ?
		`).get(correction.id);
		const baselineSource = inspector.prepare(`
			SELECT health, last_checked_at, next_check_at, owner, note
			FROM admin_source_monitors
			WHERE id = ?
		`).get(source.id);
		const baselineActivityCount = Number(
			(inspector.prepare("SELECT COUNT(*) AS count FROM admin_activity").get() as { count: number }).count
		);

		inspector.exec(`
			CREATE TRIGGER reject_admin_activity
			BEFORE INSERT ON admin_activity
			BEGIN
				SELECT RAISE(ABORT, 'forced activity failure');
			END
		`);

		await assert.rejects(
			async () => await repository.createCorrectionSubmission({
				email: "reader@example.org",
				message: "Please review the sourcing on this page.",
				subject: "Source review",
				submissionType: "correction",
			}),
			/forced activity failure/u
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_corrections").get() as { count: number }).count),
			baselineCorrectionCount
		);

		await assert.rejects(
			async () => await repository.updateCorrection(correction.id, {
				nextStep: "A different next step.",
				status: "researching",
			}),
			/forced activity failure/u
		);
		assert.deepEqual(
			inspector.prepare(`
				SELECT status, priority, next_step, content_id
				FROM admin_corrections
				WHERE id = ?
			`).get(correction.id),
			baselineCorrection
		);

		await assert.rejects(
			async () => await repository.updateSource(source.id, {
				health: "incident",
				note: "A different source note.",
			}),
			/forced activity failure/u
		);
		assert.deepEqual(
			inspector.prepare(`
				SELECT health, last_checked_at, next_check_at, owner, note
				FROM admin_source_monitors
				WHERE id = ?
			`).get(source.id),
			baselineSource
		);

		await assert.rejects(
			async () => await repository.createGuidePackage({
				electionSlug: "transaction-test-election",
				id: "guide-package-transaction-test",
				jurisdictionSlug: "transaction-test-jurisdiction",
				status: "draft",
			}),
			/forced activity failure/u
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_guide_packages").get() as { count: number }).count),
			0
		);
		assert.equal(
			Number((inspector.prepare("SELECT COUNT(*) AS count FROM admin_activity").get() as { count: number }).count),
			baselineActivityCount
		);

		inspector.close();
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});
