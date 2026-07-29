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
	assertWorkflowCancelsStaleRuns(".github/workflows/qodana_code_quality.yml");
});

test("GitHub workflows use Node 24-compatible action majors", () => {
	const workflows = [
		readText(".github/workflows/ci.yml"),
		readText(".github/workflows/qodana_code_quality.yml"),
	].join("\n");

	assert.doesNotMatch(workflows, /actions\/checkout@v4/);
	assert.doesNotMatch(workflows, /actions\/setup-node@v4/);
	assert.match(workflows, /actions\/checkout@v7/);
	assert.match(workflows, /actions\/setup-node@v7/);
});

test("CI runs the repository security audit policy", () => {
	const workflow = readText(".github/workflows/ci.yml");

	assert.match(workflow, /^\s{2}security-audit:/m);
	assert.match(workflow, /run: npm ci/);
	assert.match(workflow, /name: Security audit policy\s+run: npm run audit/);
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
