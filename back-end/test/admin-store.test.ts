import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createAdminMfaCode } from "../src/admin-mfa.js";
import { createSqliteAdminRepository, defaultContentSeed } from "../src/admin-store.js";

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
