import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { defaultContentSeed } from "../src/admin-store.js";
import { demoAdminCorrections, demoAdminSourceMonitor } from "../src/coverage-data.js";
import { createPostgresAdminRepository } from "../src/postgres-admin-store.js";

const testDatabaseUrl = process.env.TEST_ADMIN_DATABASE_URL;

test("Postgres preserves workflow invariants and rolls back unaudited mutations", {
	skip: !testDatabaseUrl,
}, async () => {
	if (!testDatabaseUrl)
		return;

	const schema = `ballot_clarity_${randomUUID().replaceAll("-", "")}`;
	const adminPool = new Pool({ connectionString: testDatabaseUrl });
	const scopedUrl = new URL(testDatabaseUrl);

	await adminPool.query(`CREATE SCHEMA ${schema}`);
	scopedUrl.searchParams.set("options", `-c search_path=${schema}`);

	const inspector = new Pool({ connectionString: scopedUrl.toString() });

	try {
		const repository = await createPostgresAdminRepository({
			bootstrapDisplayName: "Primary Admin",
			bootstrapPassword: "primary-admin-password",
			bootstrapUsername: "primary-admin",
			contentSeed: defaultContentSeed(),
			correctionSeed: demoAdminCorrections.corrections,
			databaseUrl: scopedUrl.toString(),
			mfaEncryptionKey: "test-admin-mfa-encryption-key-that-is-long-enough",
			sourceMonitorSeed: demoAdminSourceMonitor.sources,
		});
		const secondary = await repository.createUser({
			displayName: "Secondary Admin",
			password: "secondary-admin-password",
			role: "admin",
			username: "secondary-admin",
		});
		assert.ok(secondary.passwordChangeRequiredAt);
		const secondaryAfterPasswordChange = (await repository.updateUser(secondary.id, {
			auditActor: {
				displayName: secondary.displayName,
				role: secondary.role,
				username: secondary.username,
			},
			password: "secondary-selected-password",
			passwordChangeMode: "self-service",
		})).users.find(user => user.id === secondary.id);

		assert.equal(secondaryAfterPasswordChange?.passwordChangeRequiredAt, undefined);
		const primary = (await repository.listUsers()).users.find(user => user.username === "primary-admin");

		assert.ok(primary);

		const actor = {
			displayName: "Security Operator",
			role: "admin" as const,
			username: "security-operator",
		};
		const outcomes = await Promise.allSettled([
			repository.updateUser(primary.id, { auditActor: actor, disabled: true }),
			repository.updateUser(secondary.id, { auditActor: actor, disabled: true }),
		]);
		const fulfilled = outcomes.filter(outcome => outcome.status === "fulfilled");
		const rejected = outcomes.filter(outcome => outcome.status === "rejected");

		assert.equal(fulfilled.length, 1);
		assert.equal(rejected.length, 1);
		assert.match(String((rejected[0] as PromiseRejectedResult).reason), /last active admin/u);

		const users = (await repository.listUsers()).users;
		const activeAdmins = users.filter(user => user.role === "admin" && !user.disabledAt);
		const disabledAdmin = users.find(user => user.role === "admin" && user.disabledAt);
		const disabledAdminBeforeMutation = [primary, secondary].find(user => user.id === disabledAdmin?.id);

		assert.equal(activeAdmins.length, 1);
		assert.ok(disabledAdmin);
		assert.ok(disabledAdminBeforeMutation);
		assert.notEqual(disabledAdmin.credentialsUpdatedAt, disabledAdminBeforeMutation.credentialsUpdatedAt);
		assert.equal((await repository.listAuditEvents()).integrityVerified, true);

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

		assert.ok(publishedContent);

		const baselineContent = (await inspector.query<{
			published: boolean;
			status: string;
			updated_at: string;
		}>(
			"SELECT published, status, updated_at FROM admin_content WHERE id = $1",
			[publishedContent.id]
		)).rows[0];
		const baselineGuidePackage = (await inspector.query<{
			status: string;
			updated_at: string;
		}>(
			"SELECT status, updated_at FROM admin_guide_packages WHERE id = $1",
			[guidePackageId]
		)).rows[0];
		const baselineHistoryCount = Number(
			(await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_content_history")).rows[0]?.count
		);
		const baselineActivityCount = Number(
			(await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_activity")).rows[0]?.count
		);
		const baselineAuditCount = Number(
			(await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_audit_events")).rows[0]?.count
		);

		await inspector.query(`
			CREATE FUNCTION reject_admin_audit_event()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				RAISE EXCEPTION 'forced audit failure';
			END;
			$$
		`);
		await inspector.query(`
			CREATE TRIGGER reject_admin_audit_event
			BEFORE INSERT ON admin_audit_events
			FOR EACH ROW
			EXECUTE FUNCTION reject_admin_audit_event()
		`);

		await assert.rejects(
			async () => await repository.updateUser(disabledAdmin.id, {
				auditActor: actor,
				disabled: false,
			}),
			/forced audit failure/u
		);

		const storedDisabledAdmin = await inspector.query<{
			credentials_updated_at: string;
			disabled_at: string | null;
		}>(
			"SELECT credentials_updated_at, disabled_at FROM admin_users WHERE id = $1",
			[disabledAdmin.id]
		);

		assert.notEqual(storedDisabledAdmin.rows[0]?.disabled_at, null);
		assert.equal(
			new Date(storedDisabledAdmin.rows[0]?.credentials_updated_at ?? "").toISOString(),
			disabledAdmin.credentialsUpdatedAt
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_activity")).rows[0]?.count),
			baselineActivityCount
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_audit_events")).rows[0]?.count),
			baselineAuditCount
		);

		await assert.rejects(
			async () => await repository.updateContent(publishedContent.id, {
				auditActor: actor,
				published: false,
			}),
			/forced audit failure/u
		);
		assert.deepEqual(
			(await inspector.query(
				"SELECT published, status, updated_at FROM admin_content WHERE id = $1",
				[publishedContent.id]
			)).rows[0],
			baselineContent
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_content_history")).rows[0]?.count),
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
			(await inspector.query(
				"SELECT status, updated_at FROM admin_guide_packages WHERE id = $1",
				[guidePackageId]
			)).rows[0],
			baselineGuidePackage
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_activity")).rows[0]?.count),
			baselineActivityCount
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_audit_events")).rows[0]?.count),
			baselineAuditCount
		);

		const correction = (await repository.listCorrections()).corrections[0];
		const source = (await repository.listSourceMonitor()).sources[0];

		assert.ok(correction);
		assert.ok(source);

		const baselineCorrectionCount = Number(
			(await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_corrections")).rows[0]?.count
		);
		const baselineCorrection = (await inspector.query(
			"SELECT status, priority, next_step, content_id FROM admin_corrections WHERE id = $1",
			[correction.id]
		)).rows[0];
		const baselineSource = (await inspector.query(
			"SELECT health, last_checked_at, next_check_at, owner, note FROM admin_source_monitors WHERE id = $1",
			[source.id]
		)).rows[0];

		await assert.rejects(
			async () => await repository.updateCorrection(correction.id, {
				auditActor: actor,
				nextStep: "A public update that must be audited.",
			}),
			/forced audit failure/u
		);
		assert.deepEqual(
			(await inspector.query(
				"SELECT status, priority, next_step, content_id FROM admin_corrections WHERE id = $1",
				[correction.id]
			)).rows[0],
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
			(await inspector.query(
				"SELECT health, last_checked_at, next_check_at, owner, note FROM admin_source_monitors WHERE id = $1",
				[source.id]
			)).rows[0],
			baselineSource
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_activity")).rows[0]?.count),
			baselineActivityCount
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_audit_events")).rows[0]?.count),
			baselineAuditCount
		);

		await inspector.query(`
				CREATE FUNCTION reject_admin_activity()
				RETURNS trigger
				LANGUAGE plpgsql
				AS $$
				BEGIN
					RAISE EXCEPTION 'forced activity failure';
				END;
				$$
			`);
		await inspector.query(`
				CREATE TRIGGER reject_admin_activity
				BEFORE INSERT ON admin_activity
				FOR EACH ROW
				EXECUTE FUNCTION reject_admin_activity()
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
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_corrections")).rows[0]?.count),
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
			(await inspector.query(
				"SELECT status, priority, next_step, content_id FROM admin_corrections WHERE id = $1",
				[correction.id]
			)).rows[0],
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
			(await inspector.query(
				"SELECT health, last_checked_at, next_check_at, owner, note FROM admin_source_monitors WHERE id = $1",
				[source.id]
			)).rows[0],
			baselineSource
		);

		await assert.rejects(
			async () => await repository.createGuidePackage({
				electionSlug: "second-transaction-test-election",
				id: "second-guide-package-transaction-test",
				jurisdictionSlug: "transaction-test-jurisdiction",
				status: "draft",
			}),
			/forced activity failure/u
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>(
				"SELECT COUNT(*)::text AS count FROM admin_guide_packages WHERE id = $1",
				["second-guide-package-transaction-test"]
			)).rows[0]?.count),
			0
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_activity")).rows[0]?.count),
			baselineActivityCount
		);
	}
	finally {
		await inspector.end();
		await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await adminPool.end();
	}
});
