import assert from "node:assert/strict";
import test from "node:test";
import {
	createAddressCacheRepository,
	hashAddressCacheInput,
	normalizeAddressCacheInput,
} from "../src/address-cache-repository.js";

const encryptionKey = "test-address-cache-encryption-key-that-is-long-enough";

test("address cache input normalization ignores whitespace and casing differences", () => {
	assert.equal(
		normalizeAddressCacheInput("  55   Trinity Ave SW,\nAtlanta, GA 30303  "),
		"55 trinity ave sw, atlanta, ga 30303",
	);
	assert.equal(
		hashAddressCacheInput("55 Trinity Ave SW, Atlanta, GA 30303", encryptionKey),
		hashAddressCacheInput("  55   TRINITY ave sw,\nAtlanta, ga 30303  ", encryptionKey),
	);
});

test("address cache input hashing is keyed and keeps distinct lookup inputs distinct", () => {
	assert.notEqual(
		hashAddressCacheInput("55 Trinity Ave SW, Atlanta, GA 30303", encryptionKey),
		hashAddressCacheInput("5600 Campbellton Fairburn Rd, Fairburn, GA 30213", encryptionKey),
	);
	assert.notEqual(
		hashAddressCacheInput("55 Trinity Ave SW, Atlanta, GA 30303", encryptionKey),
		hashAddressCacheInput("55 Trinity Ave SW, Atlanta, GA 30303", "another-address-cache-secret"),
	);
	assert.match(hashAddressCacheInput("55 Trinity Ave SW, Atlanta, GA 30303", encryptionKey), /^[a-f0-9]{64}$/u);
	assert.throws(() => hashAddressCacheInput("55 Trinity Ave SW, Atlanta, GA 30303", ""));
});

test("address cache repository safely disables persistence without both database and encryption configuration", async () => {
	const noDatabaseRepository = await createAddressCacheRepository("", encryptionKey);
	const noEncryptionRepository = await createAddressCacheRepository("postgres://unused", "");

	assert.equal(noDatabaseRepository.driver, "none");
	assert.equal(noEncryptionRepository.driver, "none");
	assert.equal(await noDatabaseRepository.getByInput("55 Trinity Ave SW, Atlanta, GA 30303"), null);

	await assert.doesNotReject(noDatabaseRepository.save("55 Trinity Ave SW, Atlanta, GA 30303", {
		benchmark: "Public_AR_Current",
		districtMatches: [],
		normalizedAddress: "55 TRINITY AVE SW, ATLANTA, GA, 30303",
		vintage: "Current_Current",
		zip5: "30303",
	}));
});
