import {
	isSecretEnvelope,
	openSecretValue,
	sealSecretValue,
} from "./secret-envelope.js";

const adminMfaPurposePrefix = "ballot-clarity:admin-mfa:v1";

function buildAdminMfaPurpose(userId: string) {
	const normalizedUserId = userId.trim();

	if (!normalizedUserId)
		throw new Error("An admin user ID is required to protect an MFA secret.");

	return `${adminMfaPurposePrefix}:${normalizedUserId}`;
}

function requireAdminMfaEncryptionKey(encryptionKey: string) {
	const normalizedKey = encryptionKey.trim();

	if (!normalizedKey) {
		throw new Error(
			"ADMIN_MFA_ENCRYPTION_KEY is required before admin MFA can be enabled or read."
		);
	}

	return normalizedKey;
}

export function encryptAdminMfaSecret(
	userId: string,
	secret: string,
	encryptionKey: string
) {
	return sealSecretValue(
		secret,
		requireAdminMfaEncryptionKey(encryptionKey),
		buildAdminMfaPurpose(userId)
	);
}

export function decryptAdminMfaSecret(
	userId: string,
	storedSecret: string,
	encryptionKey: string
) {
	if (!isSecretEnvelope(storedSecret))
		throw new Error("Admin MFA secret is not encrypted.");

	return openSecretValue(
		storedSecret,
		requireAdminMfaEncryptionKey(encryptionKey),
		buildAdminMfaPurpose(userId)
	);
}

export function migrateAdminMfaSecret(
	userId: string,
	storedSecret: string,
	encryptionKey: string
) {
	if (isSecretEnvelope(storedSecret)) {
		decryptAdminMfaSecret(userId, storedSecret, encryptionKey);
		return storedSecret;
	}

	return encryptAdminMfaSecret(userId, storedSecret, encryptionKey);
}
