import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresAdminRepository } from "../src/postgres-admin-store.js";

const testDatabaseUrl = process.env.TEST_ADMIN_DATABASE_URL;

test("Postgres preserves one active admin and rolls back unaudited account mutations", {
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
			databaseUrl: scopedUrl.toString(),
			mfaEncryptionKey: "test-admin-mfa-encryption-key-that-is-long-enough",
		});
		const secondary = await repository.createUser({
			displayName: "Secondary Admin",
			password: "secondary-admin-password",
			role: "admin",
			username: "secondary-admin",
		});
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

		assert.equal(activeAdmins.length, 1);
		assert.ok(disabledAdmin);
		assert.equal((await repository.listAuditEvents()).integrityVerified, true);

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

		const storedDisabledAdmin = await inspector.query<{ disabled_at: string | null }>(
			"SELECT disabled_at FROM admin_users WHERE id = $1",
			[disabledAdmin.id]
		);

		assert.notEqual(storedDisabledAdmin.rows[0]?.disabled_at, null);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_activity")).rows[0]?.count),
			baselineActivityCount
		);
		assert.equal(
			Number((await inspector.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_audit_events")).rows[0]?.count),
			baselineAuditCount
		);
	}
	finally {
		await inspector.end();
		await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await adminPool.end();
	}
});
