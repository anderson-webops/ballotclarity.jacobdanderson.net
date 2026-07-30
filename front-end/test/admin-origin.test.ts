import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedAdminMutationOrigin } from "../server/utils/admin-origin.ts";

const expectedOrigin = "https://ballotclarity.org";

test("admin mutation origin checks accept same-origin browser requests", () => {
	assert.equal(isAllowedAdminMutationOrigin({
		expectedOrigin,
		fetchSite: "same-origin",
		origin: expectedOrigin,
		production: true,
	}), true);
	assert.equal(isAllowedAdminMutationOrigin({
		expectedOrigin,
		fetchSite: "same-origin",
		production: true,
	}), true);
});

test("admin mutation origin checks reject cross-origin and same-site sibling requests", () => {
	for (const fetchSite of ["cross-origin", "same-site"]) {
		assert.equal(isAllowedAdminMutationOrigin({
			expectedOrigin,
			fetchSite,
			origin: "https://attacker.ballotclarity.org",
			production: true,
		}), false);
	}

	assert.equal(isAllowedAdminMutationOrigin({
		expectedOrigin,
		fetchSite: "same-origin",
		origin: "https://attacker.example",
		production: true,
	}), false);
});

test("admin mutation origin checks fail closed when production provenance is absent", () => {
	assert.equal(isAllowedAdminMutationOrigin({
		expectedOrigin,
		production: true,
	}), false);
	assert.equal(isAllowedAdminMutationOrigin({
		expectedOrigin,
		production: false,
	}), true);
});
