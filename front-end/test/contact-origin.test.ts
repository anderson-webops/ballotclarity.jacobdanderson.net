import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedContactAddressOrigin } from "../server/utils/contact-origin.ts";

const expectedOrigin = "https://ballotclarity.org";

test("contact origin checks accept same-origin browser provenance", () => {
	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin,
		fetchSite: "same-origin",
		production: true,
	}), true);
	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin,
		origin: expectedOrigin,
		production: true,
	}), true);
	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin,
		production: true,
		referrer: `${expectedOrigin}/contact`,
	}), true);
});

test("contact origin checks reject cross-origin and malformed provenance", () => {
	for (const fetchSite of ["cross-origin", "same-site"]) {
		assert.equal(isAllowedContactAddressOrigin({
			expectedOrigin,
			fetchSite,
			production: true,
		}), false);
	}

	for (const origin of ["https://attacker.example", "null", "not a URL"]) {
		assert.equal(isAllowedContactAddressOrigin({
			expectedOrigin,
			origin,
			production: true,
		}), false);
	}

	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin,
		origin: expectedOrigin,
		production: true,
		referrer: "https://attacker.example/path",
	}), false);
});

test("contact origin checks fail closed without production provenance", () => {
	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin,
		production: true,
	}), false);
	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin,
		production: false,
	}), true);
	assert.equal(isAllowedContactAddressOrigin({
		expectedOrigin: "not a URL",
		fetchSite: "same-origin",
		production: true,
	}), false);
});
