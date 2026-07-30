import assert from "node:assert/strict";
import test from "node:test";
import {
	isSecretEnvelope,
	openSecretJson,
	openSecretValue,
	sealSecretJson,
	sealSecretValue,
} from "../src/secret-envelope.js";

const secret = "test-secret-envelope-key-that-is-long-enough";

test("secret envelopes round-trip without exposing plaintext", () => {
	const envelope = sealSecretValue("55 Trinity Ave SW", secret, "address-cache");

	assert.equal(isSecretEnvelope(envelope), true);
	assert.doesNotMatch(envelope, /Trinity/u);
	assert.equal(openSecretValue(envelope, secret, "address-cache"), "55 Trinity Ave SW");
});

test("secret envelopes bind ciphertext to its key and purpose", () => {
	const envelope = sealSecretJson({ district: "GA-05", zip5: "30303" }, secret, "address-cache");

	assert.deepEqual(
		openSecretJson(envelope, secret, "address-cache"),
		{ district: "GA-05", zip5: "30303" }
	);
	assert.throws(() => openSecretJson(envelope, "wrong-secret", "address-cache"));
	assert.throws(() => openSecretJson(envelope, secret, "admin-mfa"));
});

test("secret envelopes reject tampering and extra segments", () => {
	const envelope = sealSecretValue("sensitive", secret, "active-lookup-cookie");
	const parts = envelope.split(".");
	const tamperedCiphertext = `${parts[2]?.slice(0, -1)}${parts[2]?.endsWith("A") ? "B" : "A"}`;

	assert.throws(() => openSecretValue(
		[parts[0], parts[1], tamperedCiphertext, parts[3]].join("."),
		secret,
		"active-lookup-cookie"
	));
	assert.throws(() => openSecretValue(`${envelope}.extra`, secret, "active-lookup-cookie"));
});
