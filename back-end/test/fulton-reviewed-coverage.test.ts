import type { CoverageSnapshotMetadata } from "../src/coverage-repository.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildSeedCoverageSnapshot, readCoverageSnapshot, readCoverageSnapshotMetadata } from "../src/coverage-repository.js";
import {
	referenceArchiveCandidateNames,
	validateCoverageSnapshotForPublication,
} from "../src/coverage-snapshot-validation.js";
import { runExportFultonReviewedCoverageCommand } from "../src/export-fulton-reviewed-coverage.js";
import {
	buildFultonOfficialLogisticsOnlySnapshot,
	buildFultonReviewedCoverageSnapshotMetadata,
	fultonOfficialLogisticsSnapshotDefaultTimestamp,
} from "../src/fulton-reviewed-coverage.js";

function createWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-fulton-reviewed-"));

	return {
		dispose() {
			rmSync(root, { force: true, recursive: true });
		},
		root,
	};
}

function approvedMetadata(overrides: Partial<CoverageSnapshotMetadata> = {}): CoverageSnapshotMetadata {
	return {
		approvedAt: "2026-04-24T13:00:00.000Z",
		importedAt: "2026-04-24T12:00:00.000Z",
		reviewedAt: "2026-04-24T12:30:00.000Z",
		sourceLabel: "Approved Fulton snapshot",
		sourceOrigin: "test",
		sourceType: "imported",
		status: "production_approved",
		...overrides,
	};
}

test("reviewed Fulton official-logistics snapshot excludes staged reference candidates, contests, and measures", () => {
	const snapshot = buildFultonOfficialLogisticsOnlySnapshot();
	const metadata = buildFultonReviewedCoverageSnapshotMetadata({
		importedAt: fultonOfficialLogisticsSnapshotDefaultTimestamp,
		reviewedAt: fultonOfficialLogisticsSnapshotDefaultTimestamp,
		status: "reviewed",
	});
	const validation = validateCoverageSnapshotForPublication(snapshot, metadata);
	const serialized = JSON.stringify(snapshot);

	assert.equal(validation.ok, true);
	assert.equal(validation.referenceArchiveMatches.length, 0);
	assert.equal(snapshot.candidates.length, 0);
	assert.equal(snapshot.measures.length, 0);
	assert.equal(snapshot.election?.contests.length, 0);
	for (const name of referenceArchiveCandidateNames)
		assert.equal(serialized.includes(name), false);
});

test("reviewed Fulton export command writes snapshot, sidecar metadata, and clean validation output", () => {
	const workspace = createWorkspace();
	const logged: string[] = [];
	const originalLog = console.log;

	try {
		console.log = (...args: unknown[]) => {
			logged.push(args.map(String).join(" "));
		};
		const outputPath = join(workspace.root, "fulton-reviewed.json");
		const result = runExportFultonReviewedCoverageCommand([
			"--output",
			outputPath,
			"--status",
			"reviewed",
			"--timestamp",
			"2026-04-24T12:00:00.000Z",
			"--source-label",
			"Reviewed Fulton County official-logistics-only coverage snapshot",
			"--source-origin",
			"Ballot Clarity source/data pipeline test",
		]);
		const snapshot = readCoverageSnapshot(result.snapshotPath);
		const metadata = readCoverageSnapshotMetadata(result.snapshotPath);

		assert.equal(result.snapshotPath, outputPath);
		assert.equal(result.metadataPath, `${outputPath}.meta.json`);
		assert.equal(metadata.status, "reviewed");
		assert.equal(metadata.sourceType, "imported");
		assert.equal(metadata.reviewedAt, "2026-04-24T12:00:00.000Z");
		assert.equal(snapshot.election?.contests.length, 0);
		assert.equal(snapshot.candidates.length, 0);
		assert.equal(snapshot.measures.length, 0);
		assert.equal(logged.some(line => /Validation: pass/.test(line)), true);
		assert.equal(logged.some(line => /Reference archive matches: 0/.test(line)), true);
		assert.equal(readFileSync(result.metadataPath, "utf8").includes("production_approved"), false);
	}
	finally {
		console.log = originalLog;
		workspace.dispose();
	}
});

test("production-approved validation rejects snapshots containing reference archive candidate names", () => {
	const validation = validateCoverageSnapshotForPublication(
		buildSeedCoverageSnapshot(),
		approvedMetadata(),
	);

	assert.equal(validation.ok, false);
	assert.ok(validation.referenceArchiveMatches.some(match => match.name === "Elena Torres"));
	assert.ok(validation.errors.some(error => /staged\/reference candidate names/i.test(error)));
});

test("production-approved validation rejects placeholder and internal public URLs", () => {
	const snapshot = buildFultonOfficialLogisticsOnlySnapshot();
	assert.ok(snapshot.jurisdiction);
	assert.ok(snapshot.jurisdiction.officialResources[0]);
	snapshot.jurisdiction.officialResources[0].url = "https://torresfordistrict7.example";

	const validation = validateCoverageSnapshotForPublication(snapshot, approvedMetadata());

	assert.equal(validation.ok, false);
	assert.equal(validation.placeholderUrlMatches.length, 1);
	assert.equal(validation.placeholderUrlMatches[0]?.hostname, "torresfordistrict7.example");
	assert.ok(validation.errors.some(error => /placeholder or internal public URLs/i.test(error)));
});

test("coverage publication rejects executable or otherwise unsafe public URL fields", () => {
	const snapshot = buildFultonOfficialLogisticsOnlySnapshot();
	assert.ok(snapshot.jurisdiction);
	assert.ok(snapshot.jurisdiction.officialResources[0]);
	snapshot.jurisdiction.officialResources[0].url = "javascript:alert(1)";

	const validation = validateCoverageSnapshotForPublication(snapshot, approvedMetadata());

	assert.equal(validation.ok, false);
	assert.equal(validation.unsafePublicHrefMatches.length, 1);
	assert.equal(validation.unsafePublicHrefMatches[0]?.path, "$.jurisdiction.officialResources[0].url");
	assert.ok(validation.errors.some(error => /unsafe public URL values/i.test(error)));
});

test("production-approved validation rejects mixed or staged guide content", () => {
	const validation = validateCoverageSnapshotForPublication(
		buildSeedCoverageSnapshot(),
		approvedMetadata(),
		{
			allowStagedReferenceContent: true,
		},
	);

	assert.equal(validation.ok, false);
	assert.ok(validation.guideContent.some(content => content.mixedContent));
	assert.ok(validation.errors.some(error => /mixedContent=true/i.test(error)));
	assert.ok(validation.errors.some(error => /staged_reference guide layers/i.test(error)));
});

test("reviewed validation rejects reference archive names even when staged content is allowed for diagnostics", () => {
	const validation = validateCoverageSnapshotForPublication(
		buildSeedCoverageSnapshot(),
		approvedMetadata({
			approvedAt: undefined,
			status: "reviewed",
		}),
		{
			allowStagedReferenceContent: true,
		},
	);

	assert.equal(validation.ok, false);
	assert.ok(validation.referenceArchiveMatches.some(match => match.name === "Elena Torres"));
	assert.ok(validation.errors.some(error => /staged\/reference candidate names/i.test(error)));
	assert.equal(validation.warnings.some(warning => /staged\/reference candidate names/i.test(warning)), false);
});

test("reviewed validation rejects mixed or staged guide content", () => {
	const validation = validateCoverageSnapshotForPublication(
		buildSeedCoverageSnapshot(),
		approvedMetadata({
			approvedAt: undefined,
			status: "reviewed",
		}),
	);

	assert.equal(validation.ok, false);
	assert.ok(validation.guideContent.some(content => content.mixedContent));
	assert.ok(validation.errors.some(error => /mixedContent=true/i.test(error)));
	assert.ok(validation.errors.some(error => /seeded_demo or staged_reference guide layers/i.test(error)));
});

test("production-approved validation permits an approved official-logistics-only package with no staged content", () => {
	const snapshot = buildFultonOfficialLogisticsOnlySnapshot();
	const validation = validateCoverageSnapshotForPublication(snapshot, approvedMetadata());

	assert.equal(validation.ok, true);
	assert.equal(validation.guideContent[0]?.guideShell.status, "official_logistics_only");
	assert.equal(validation.guideContent[0]?.contests.status, "official_logistics_only");
	assert.equal(validation.guideContent[0]?.mixedContent, false);
	assert.equal(validation.guideContent[0]?.verifiedContestPackage, false);
});
