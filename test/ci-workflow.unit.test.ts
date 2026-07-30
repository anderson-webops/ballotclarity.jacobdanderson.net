import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readText(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

function assertWorkflowCancelsStaleRuns(path: string) {
	const workflow = readText(path);

	assert.match(workflow, /^concurrency:\n\s{2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n\s{2}cancel-in-progress: true/m);
}

test("GitHub workflows cancel stale runs for the same branch or pull request", () => {
	assertWorkflowCancelsStaleRuns(".github/workflows/ci.yml");
	assertWorkflowCancelsStaleRuns(".github/workflows/codeql.yml");
	assertWorkflowCancelsStaleRuns(".github/workflows/qodana_code_quality.yml");
});

test("GitHub workflows pin every third-party action to a commit", () => {
	const workflows = [
		readText(".github/workflows/ci.yml"),
		readText(".github/workflows/codeql.yml"),
		readText(".github/workflows/qodana_code_quality.yml"),
	].join("\n");
	const actionReferences = [...workflows.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s#]+)/gmu)];

	assert.ok(actionReferences.length > 0);
	for (const [, action, reference] of actionReferences)
		assert.match(reference, /^[a-f\d]{40}$/u, `${action} must use a full commit SHA`);
	assert.equal(
		workflows.match(/persist-credentials: false/gu)?.length,
		workflows.match(/uses:\s+actions\/checkout@/gu)?.length,
	);

	assert.match(workflows, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
	assert.match(workflows, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
	assert.match(workflows, /github\/codeql-action\/analyze@e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81/);
	assert.match(workflows, /JetBrains\/qodana-action@b588768b6e7e6da579e518bc584f79de0d243692/);
});

test("CI runs the repository security audit policy", () => {
	const workflow = readText(".github/workflows/ci.yml");

	assert.match(workflow, /^\s{2}security-audit:/m);
	assert.match(workflow, /run: npm ci --include=optional/);
	assert.match(workflow, /name: Verify standalone backend lockfile\s+run: npm run verify:backend-lockfile/);
	assert.match(workflow, /name: Security audit policy\s+run: npm run audit/);
	assert.match(workflow, /name: Production dependency audit\s+run: npm run audit:production/);
	assert.match(workflow, /name: Verify registry signatures\s+run: npm run audit:signatures/);
});

test("CI verifies the deploy host's ARM64 native dependency path", () => {
	const workflow = readText(".github/workflows/ci.yml");

	assert.match(workflow, /^\s{2}native-arm64:/m);
	assert.match(workflow, /runs-on: ubuntu-24\.04-arm/);
	assert.match(workflow, /run: npm run verify:native-bindings/);
	assert.match(workflow, /run: npm run build/);
});

test("CodeQL uses the extended JavaScript security suite with least-privilege permissions", () => {
	const workflow = readText(".github/workflows/codeql.yml");

	assert.match(workflow, /^permissions:\n\s{2}contents: read\n\s{2}security-events: write/m);
	assert.match(workflow, /languages: javascript-typescript/);
	assert.match(workflow, /queries: security-extended/);
	assert.match(workflow, /run: npm ci --include=optional/);
});

test("CI runs the production configuration policy", () => {
	const workflow = readText(".github/workflows/ci.yml");

	assert.match(workflow, /^\s{2}production-config:/m);
	assert.match(workflow, /name: Production configuration policy\s+run: npm run verify:production:fixture/);
});

test("CI verifies production analytics after the Nuxt build", () => {
	const workflow = readText(".github/workflows/ci.yml");
	const buildJob = workflow.slice(workflow.indexOf("  build:"));

	assert.match(buildJob, /name: Build\s+run: npm run build/);
	assert.match(buildJob, /name: Analytics bundle verification\s+run: npm run verify:analytics/);
	assert.ok(
		buildJob.indexOf("run: npm run build") < buildJob.indexOf("run: npm run verify:analytics"),
		"analytics verification must run after the build output exists",
	);
});
