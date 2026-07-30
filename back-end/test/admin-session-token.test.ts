import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import test from "node:test";
import { parseAdminSessionToken } from "../src/admin-session-token.js";

const sessionSecret = "test-admin-session-secret-that-is-long-enough";

function createToken(payload: Record<string, unknown>) {
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = createHmac("sha256", sessionSecret).update(encodedPayload).digest("hex");
	return `${encodedPayload}.${signature}`;
}

function validPayload() {
	return {
		credentialsUpdatedAt: new Date().toISOString(),
		displayName: "Operations Admin",
		expiresAt: Date.now() + 60_000,
		role: "admin",
		username: "ops-admin",
	};
}

test("admin session delegation accepts a valid bounded token", () => {
	const payload = validPayload();

	assert.deepEqual(parseAdminSessionToken(createToken(payload), sessionSecret), payload);
});

test("admin session delegation preserves a valid password-change requirement", () => {
	const payload = {
		...validPayload(),
		passwordChangeRequiredAt: new Date().toISOString(),
	};

	assert.deepEqual(parseAdminSessionToken(createToken(payload), sessionSecret), payload);
});

test("admin session delegation rejects malformed, expired, and invalid-role tokens", () => {
	const validToken = createToken(validPayload());

	assert.equal(parseAdminSessionToken(`${validToken}.extra`, sessionSecret), null);
	assert.equal(parseAdminSessionToken(`${validToken}0`, sessionSecret), null);
	assert.equal(parseAdminSessionToken(createToken({
		...validPayload(),
		expiresAt: Date.now() - 1,
	}), sessionSecret), null);
	assert.equal(parseAdminSessionToken(createToken({
		...validPayload(),
		role: "owner",
	}), sessionSecret), null);
	assert.equal(parseAdminSessionToken(createToken({
		...validPayload(),
		credentialsUpdatedAt: "not-a-timestamp",
	}), sessionSecret), null);
	assert.equal(parseAdminSessionToken(createToken({
		...validPayload(),
		username: "Invalid Username",
	}), sessionSecret), null);
	assert.equal(parseAdminSessionToken(createToken({
		...validPayload(),
		displayName: "x".repeat(201),
	}), sessionSecret), null);
	assert.equal(parseAdminSessionToken(createToken({
		...validPayload(),
		passwordChangeRequiredAt: "not-a-timestamp",
	}), sessionSecret), null);
	assert.equal(parseAdminSessionToken("a".repeat(4097), sessionSecret), null);
});
