import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const envelopeVersion = "v1";
const initializationVectorBytes = 12;

function deriveEncryptionKey(secret: string, purpose: string) {
	if (!secret.trim())
		throw new Error(`A secret is required for ${purpose}.`);

	return createHash("sha256")
		.update(`${purpose}\0`, "utf8")
		.update(secret, "utf8")
		.digest();
}

export function sealSecretValue(value: string, secret: string, purpose: string) {
	const initializationVector = randomBytes(initializationVectorBytes);
	const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(secret, purpose), initializationVector);
	const additionalData = Buffer.from(purpose, "utf8");

	cipher.setAAD(additionalData);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const authenticationTag = cipher.getAuthTag();

	return [
		envelopeVersion,
		initializationVector.toString("base64url"),
		encrypted.toString("base64url"),
		authenticationTag.toString("base64url"),
	].join(".");
}

export function openSecretValue(envelope: string, secret: string, purpose: string) {
	const [version, encodedInitializationVector, encodedCiphertext, encodedAuthenticationTag, ...extraParts] = envelope.split(".");

	if (
		version !== envelopeVersion
		|| !encodedInitializationVector
		|| !encodedCiphertext
		|| !encodedAuthenticationTag
		|| extraParts.length
	) {
		throw new Error("Encrypted value has an unsupported format.");
	}

	const initializationVector = Buffer.from(encodedInitializationVector, "base64url");
	const ciphertext = Buffer.from(encodedCiphertext, "base64url");
	const authenticationTag = Buffer.from(encodedAuthenticationTag, "base64url");

	if (initializationVector.length !== initializationVectorBytes || authenticationTag.length !== 16)
		throw new Error("Encrypted value has invalid parameters.");

	const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(secret, purpose), initializationVector);
	decipher.setAAD(Buffer.from(purpose, "utf8"));
	decipher.setAuthTag(authenticationTag);

	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

export function sealSecretJson(value: unknown, secret: string, purpose: string) {
	return sealSecretValue(JSON.stringify(value), secret, purpose);
}

export function openSecretJson<T>(envelope: string, secret: string, purpose: string) {
	return JSON.parse(openSecretValue(envelope, secret, purpose)) as T;
}

export function isSecretEnvelope(value: string) {
	return value.startsWith(`${envelopeVersion}.`);
}
