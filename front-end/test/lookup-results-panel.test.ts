import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lookupResultsPanel = readFileSync(new URL("../src/components/LookupResultsPanel.vue", import.meta.url), "utf8");

test("lookup availability cards render in a balanced desktop grid", () => {
	assert.match(lookupResultsPanel, /xl:grid-cols-3/);
	assert.match(lookupResultsPanel, /auto-rows-fr/);
	assert.doesNotMatch(lookupResultsPanel, /xl:grid-cols-5/);
});

test("lookup availability cards hide low-value limited cards", () => {
	assert.match(lookupResultsPanel, /const primaryAvailabilityIds = new Set\(\["official-logistics", "representatives", "local-guide"\]\)/);
	assert.match(
		lookupResultsPanel,
		/const visibleAvailabilityItems = computed\(\(\) =>\s*availabilityItems\.value\.filter/
	);
	assert.match(lookupResultsPanel, /if \(!card\.href \|\| card\.item\.status === "unavailable"\)/);
	assert.match(lookupResultsPanel, /primaryAvailabilityIds\.has\(card\.id\)/);
	assert.match(lookupResultsPanel, /return card\.item\.status === "available"/);
	assert.match(lookupResultsPanel, /v-for="card in visibleAvailabilityItems"/);
});

test("lookup availability cards expose page links for actionable categories", () => {
	assert.match(lookupResultsPanel, /href: buildLookupAwareTarget\("\/results"\)[\s\S]+?id: "civic-results"/);
	assert.match(lookupResultsPanel, /href: props\.lookup\.representativeMatches\.length \? buildLookupAwareTarget\("\/representatives"\) : undefined[\s\S]+?id: "representatives"/);
	assert.match(lookupResultsPanel, /href: buildOfficialLogisticsHref\(\)[\s\S]+?id: "official-logistics"/);
	assert.match(lookupResultsPanel, /href: buildCandidateDataHref\(\)[\s\S]+?id: "ballot-candidates"/);
	assert.match(lookupResultsPanel, /href: props\.lookup\.representativeMatches\.length \? buildLookupAwareTarget\("\/representatives"\) : undefined[\s\S]+?id: "finance-influence"/);
	assert.match(lookupResultsPanel, /href: buildLocalGuideHref\(\)[\s\S]+?id: "local-guide"/);
	assert.match(lookupResultsPanel, /const NuxtLinkComponent = resolveComponent\("NuxtLink"\)/);
	assert.match(lookupResultsPanel, /:is="card\.href \? NuxtLinkComponent : 'article'"/);
	assert.doesNotMatch(lookupResultsPanel, /:is="card\.href \? 'NuxtLink' : 'article'"/);
});

test("lookup results show provider ballot previews with official verification copy", () => {
	assert.match(lookupResultsPanel, /Provider ballot preview/);
	assert.match(lookupResultsPanel, /Needs official verification/);
	assert.match(lookupResultsPanel, /preview\.disclaimer/);
	assert.match(lookupResultsPanel, /preview\.verificationResource\.url/);
	assert.match(lookupResultsPanel, /Verify with/);
});
