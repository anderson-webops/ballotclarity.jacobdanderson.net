import assert from "node:assert/strict";
import test from "node:test";
import { buildLocationLookupSlug } from "../src/location-lookup.js";

test("location lookup slugs are normalized in a single bounded pass", () => {
	assert.equal(buildLocationLookupSlug("Alpharetta, Georgia"), "alpharetta-georgia");
	assert.equal(buildLocationLookupSlug("  Fulton___County  "), "fulton-county");
	assert.equal(buildLocationLookupSlug("Québec / 123"), "qu-bec-123");
	assert.equal(buildLocationLookupSlug("---"), "");
	assert.equal(
		buildLocationLookupSlug(`${"A".repeat(300)}${"!".repeat(300)}B`),
		`${"a".repeat(300)}-b`,
	);
});
