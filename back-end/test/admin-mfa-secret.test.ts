import assert from "node:assert/strict";
import test from "node:test";
import {
	decryptAdminMfaSecret,
	encryptAdminMfaSecret,
	migrateAdminMfaSecret,
} from "../src/admin-mfa-secret.js";

const encryptionKey = "test-admin-mfa-encryption-key-that-is-long-enough";
const secret = "JBSWY3DPEHPK3PXP";

test("admin MFA secrets are encrypted and bound to the account", () => {
	const encrypted = encryptAdminMfaSecret("user-one", secret, encryptionKey);

	assert.match(encrypted, /^v1\./u);
	assert.doesNotMatch(encrypted, new RegExp(secret, "u"));
	assert.equal(decryptAdminMfaSecret("user-one", encrypted, encryptionKey), secret);
	assert.throws(() => decryptAdminMfaSecret("user-two", encrypted, encryptionKey));
	assert.throws(() => decryptAdminMfaSecret("user-one", encrypted, "wrong-key"));
});

test("legacy plaintext MFA secrets migrate once and encrypted values are validated", () => {
	const migrated = migrateAdminMfaSecret("legacy-user", secret, encryptionKey);

	assert.match(migrated, /^v1\./u);
	assert.equal(decryptAdminMfaSecret("legacy-user", migrated, encryptionKey), secret);
	assert.equal(migrateAdminMfaSecret("legacy-user", migrated, encryptionKey), migrated);
	assert.throws(() => migrateAdminMfaSecret("legacy-user", migrated, "wrong-key"));
});

test("admin MFA encryption fails closed without a dedicated key", () => {
	assert.throws(
		() => encryptAdminMfaSecret("user-one", secret, ""),
		/ADMIN_MFA_ENCRYPTION_KEY/u
	);
});
