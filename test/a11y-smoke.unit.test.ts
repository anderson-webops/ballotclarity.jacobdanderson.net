import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readText(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

test("accessibility smoke covers primary dynamic public guide routes", () => {
	const smokeScript = readText("scripts/a11y-smoke.mjs");
	const requiredRoutes = [
		"/ballot/2026-fulton-county-general",
		"/elections/2026-fulton-county-general",
		"/locations/fulton-county-georgia",
		"/plan",
		"/compare",
	];

	assert.match(smokeScript, /buildFultonOfficialLogisticsOnlySnapshot/);

	for (const route of requiredRoutes) {
		assert.match(smokeScript, new RegExp(`"${route}"`));
	}
});

test("accessibility smoke serves reviewed route fixture data for dynamic pages", () => {
	const smokeScript = readText("scripts/a11y-smoke.mjs");

	assert.match(smokeScript, /apiPathname === "\/ballot"/);
	assert.match(smokeScript, /apiPathname === "\/elections"/);
	assert.match(smokeScript, /apiPathname === "\/jurisdictions"/);
	assert.match(smokeScript, /apiPathname === `\/jurisdictions\/\$\{reviewedJurisdiction\.slug\}`/);
	assert.match(smokeScript, /apiPathname === "\/districts"/);
	assert.match(smokeScript, /apiPathname === "\/representatives"/);
	assert.match(smokeScript, /districts: \[mockDistrictSummary\]/);
	assert.match(smokeScript, /representatives: \[mockRepresentativeSummary\]/);
});

test("accessibility smoke shuts down Nuxt deterministically in CI", () => {
	const smokeScript = readText("scripts/a11y-smoke.mjs");
	const workflow = readText(".github/workflows/ci.yml");

	assert.match(smokeScript, /detached: process\.platform !== "win32"/);
	assert.match(smokeScript, /async function stopFrontend/);
	assert.match(smokeScript, /process\.kill\(-child\.pid, signal\)/);
	assert.match(smokeScript, /await stopFrontend\(frontendProcess\)/);
	assert.match(workflow, /^\s{2}accessibility:\n\s{4}runs-on: ubuntu-latest\n\s{4}timeout-minutes: 10/m);
});

test("accessibility smoke evaluates axe through browser automation without an inline script tag", () => {
	const smokeScript = readText("scripts/a11y-smoke.mjs");

	assert.match(smokeScript, /const axeSource = readFileSync\(axeSourcePath, "utf8"\)/);
	assert.match(smokeScript, /await page\.evaluate\(axeSource\)/);
	assert.doesNotMatch(smokeScript, /page\.addScriptTag/);
});

test("location key-date notes remain definition-list descriptions", () => {
	const locationPage = readText("front-end/src/pages/locations/[slug].vue");
	const keyDatesSection = locationPage.slice(
		locationPage.indexOf("<p class=\"text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark\">"),
		locationPage.indexOf("<section class=\"gap-6 grid xl:grid-cols")
	);

	assert.match(keyDatesSection, /<dd class="text-sm text-app-muted mt-3 dark:text-app-muted-dark">\s*\{\{ registrationDeadline\?\.note/);
	assert.match(keyDatesSection, /<dd class="text-sm text-app-muted mt-3 dark:text-app-muted-dark">\s*\{\{ earlyVotingDate\?\.note/);
	assert.doesNotMatch(keyDatesSection, /<p class="text-sm text-app-muted mt-3 dark:text-app-muted-dark">/);
});
