import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	buildSeedCoverageSnapshot,
	buildSeedCoverageSnapshotMetadata,
	readCoverageSnapshotMetadata,
	writeCoverageSnapshot,
	writeCoverageSnapshotMetadata,
} from "../src/coverage-repository.js";
import {
	buildFultonOfficialLogisticsOnlySnapshot,
	buildFultonReviewedCoverageSnapshotMetadata,
} from "../src/fulton-reviewed-coverage.js";
import {
	backupSnapshot,
	listBackups,
	promoteSnapshot,
	rollbackSnapshot,
	runManageCoverageCommand,
} from "../src/manage-live-coverage.js";

function createWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-live-coverage-ops-"));

	return {
		dispose() {
			rmSync(root, { force: true, recursive: true });
		},
		root,
	};
}

test("coverage snapshot metadata sidecars round-trip with reviewed and seed provenance", () => {
	const workspace = createWorkspace();

	try {
		const snapshotPath = join(workspace.root, "reviewed-fulton.json");
		const metadata = {
			approvedAt: undefined,
			importedAt: "2026-04-20T12:00:00.000Z",
			note: "Reviewed Fulton snapshot ready for staging promotion.",
			reviewedAt: "2026-04-21T12:00:00.000Z",
			sourceLabel: "Reviewed Fulton coverage snapshot",
			sourceOrigin: "manual import",
			sourceType: "imported" as const,
			status: "reviewed" as const
		};

		writeCoverageSnapshot(buildSeedCoverageSnapshot(), snapshotPath);
		writeCoverageSnapshotMetadata(metadata, snapshotPath);

		assert.deepEqual(readCoverageSnapshotMetadata(snapshotPath), metadata);

		const seedSnapshotPath = join(workspace.root, "seed-fulton.json");
		writeCoverageSnapshot(buildSeedCoverageSnapshot(), seedSnapshotPath);
		writeCoverageSnapshotMetadata(buildSeedCoverageSnapshotMetadata("2026-04-19T10:00:00.000Z"), seedSnapshotPath);

		assert.equal(readCoverageSnapshotMetadata(seedSnapshotPath).status, "seed");
		assert.equal(readCoverageSnapshotMetadata(seedSnapshotPath).sourceType, "seed");
	}
	finally {
		workspace.dispose();
	}
});

test("promote and rollback preserve backup snapshots and sidecar metadata", () => {
	const workspace = createWorkspace();

	try {
		const activeSnapshotPath = join(workspace.root, "active.json");
		const reviewedCandidatePath = join(workspace.root, "reviewed.json");
		const approvedCandidatePath = join(workspace.root, "approved.json");

		writeCoverageSnapshot(buildSeedCoverageSnapshot(), activeSnapshotPath);
		writeCoverageSnapshotMetadata({
			importedAt: "2026-04-19T12:00:00.000Z",
			note: "Existing seed snapshot.",
			sourceLabel: "Seed active snapshot",
			sourceType: "seed",
			status: "seed"
		}, activeSnapshotPath);

		writeCoverageSnapshot(buildFultonOfficialLogisticsOnlySnapshot(), reviewedCandidatePath);
		writeCoverageSnapshotMetadata(buildFultonReviewedCoverageSnapshotMetadata({
			importedAt: "2026-04-20T12:00:00.000Z",
			note: "Reviewed candidate snapshot.",
			reviewedAt: "2026-04-21T12:00:00.000Z",
			sourceLabel: "Reviewed Fulton snapshot",
			status: "reviewed"
		}), reviewedCandidatePath);

		writeCoverageSnapshot(buildFultonOfficialLogisticsOnlySnapshot(), approvedCandidatePath);
		writeCoverageSnapshotMetadata(buildFultonReviewedCoverageSnapshotMetadata({
			approvedAt: "2026-04-22T12:00:00.000Z",
			importedAt: "2026-04-22T10:00:00.000Z",
			note: "Production-approved candidate snapshot.",
			reviewedAt: "2026-04-22T11:00:00.000Z",
			sourceLabel: "Approved Fulton snapshot",
			status: "production_approved"
		}), approvedCandidatePath);

		const firstBackup = backupSnapshot(activeSnapshotPath);
		assert.ok(firstBackup);
		assert.equal(existsSync(firstBackup!.snapshotPath), true);
		promoteSnapshot(reviewedCandidatePath, activeSnapshotPath);
		assert.equal(readCoverageSnapshotMetadata(activeSnapshotPath).status, "reviewed");

		const listedBackups = listBackups(activeSnapshotPath);
		assert.equal(listedBackups.includes(firstBackup!.snapshotPath), true);

		const secondBackup = backupSnapshot(activeSnapshotPath);
		assert.ok(secondBackup);
		promoteSnapshot(approvedCandidatePath, activeSnapshotPath);
		assert.equal(readCoverageSnapshotMetadata(activeSnapshotPath).status, "production_approved");

		rollbackSnapshot(activeSnapshotPath, secondBackup!.snapshotPath);
		assert.equal(readCoverageSnapshotMetadata(activeSnapshotPath).status, "reviewed");
	}
	finally {
		workspace.dispose();
	}
});

test("runManageCoverageCommand reads flag values from the provided argv", () => {
	const workspace = createWorkspace();

	try {
		const activeSnapshotPath = join(workspace.root, "active.json");
		const candidatePath = join(workspace.root, "candidate.json");

		writeCoverageSnapshot(buildFultonOfficialLogisticsOnlySnapshot(), candidatePath);
		writeCoverageSnapshotMetadata(buildFultonReviewedCoverageSnapshotMetadata({
			importedAt: "2026-04-20T12:00:00.000Z",
			note: "Reviewed candidate snapshot.",
			reviewedAt: "2026-04-21T12:00:00.000Z",
			sourceLabel: "Reviewed Fulton snapshot",
			status: "reviewed"
		}), candidatePath);

		runManageCoverageCommand(["promote", "--from", candidatePath, "--target", activeSnapshotPath]);

		assert.equal(readCoverageSnapshotMetadata(activeSnapshotPath).status, "reviewed");
	}
	finally {
		workspace.dispose();
	}
});

test("promotion rejects staged content carrying reviewed metadata without changing the active pair", () => {
	const workspace = createWorkspace();

	try {
		const activeSnapshotPath = join(workspace.root, "active.json");
		const invalidCandidatePath = join(workspace.root, "invalid-reviewed.json");

		writeCoverageSnapshot(buildFultonOfficialLogisticsOnlySnapshot(), activeSnapshotPath);
		writeCoverageSnapshotMetadata(buildFultonReviewedCoverageSnapshotMetadata({
			importedAt: "2026-04-20T12:00:00.000Z",
			reviewedAt: "2026-04-20T12:00:00.000Z",
			status: "reviewed"
		}), activeSnapshotPath);
		writeCoverageSnapshot(buildSeedCoverageSnapshot(), invalidCandidatePath);
		writeCoverageSnapshotMetadata(buildFultonReviewedCoverageSnapshotMetadata({
			importedAt: "2026-04-21T12:00:00.000Z",
			reviewedAt: "2026-04-21T12:00:00.000Z",
			status: "reviewed"
		}), invalidCandidatePath);

		assert.throws(
			() => promoteSnapshot(invalidCandidatePath, activeSnapshotPath),
			/publication validation/i
		);
		assert.equal(readCoverageSnapshotMetadata(activeSnapshotPath).importedAt, "2026-04-20T12:00:00.000Z");
	}
	finally {
		workspace.dispose();
	}
});
