import type { CoverageSnapshotMetadata } from "./coverage-repository.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	parseCoverageSnapshot,
	writeCoverageSnapshot,
	writeCoverageSnapshotMetadata,
} from "./coverage-repository.js";
import { fetchRemoteJsonText } from "./remote-json-source.js";

function readFlag(flag: string, argv = process.argv) {
	const index = argv.indexOf(flag);

	if (index === -1)
		return undefined;

	return argv[index + 1];
}

export async function readSourcePayload(argv = process.argv) {
	const filePath = readFlag("--from-file", argv) || process.env.LIVE_COVERAGE_SOURCE_FILE;
	const sourceUrl = readFlag("--from-url", argv) || process.env.LIVE_COVERAGE_SOURCE_URL;

	if (filePath)
		return readFileSync(filePath, "utf8");

	if (sourceUrl) {
		return await fetchRemoteJsonText(sourceUrl, {
			maxBytes: Number(process.env.LIVE_COVERAGE_FETCH_MAX_BYTES || 5 * 1024 * 1024),
			timeoutMs: Number(process.env.LIVE_COVERAGE_FETCH_TIMEOUT_MS || 15_000),
		});
	}

	throw new Error("Specify --from-file <path> or --from-url <url> when importing live coverage.");
}

function buildMetadata(argv = process.argv): CoverageSnapshotMetadata {
	const status = readFlag("--status", argv) || process.env.LIVE_COVERAGE_STATUS || "reviewed";
	const sourceLabel = readFlag("--source-label", argv) || process.env.LIVE_COVERAGE_SOURCE_LABEL || "Imported live coverage snapshot";
	const sourceOrigin = readFlag("--source-origin", argv) || process.env.LIVE_COVERAGE_SOURCE_ORIGIN;
	const note = readFlag("--note", argv) || process.env.LIVE_COVERAGE_NOTE;
	const now = new Date().toISOString();

	if (status !== "production_approved" && status !== "reviewed" && status !== "seed" && status !== "unknown")
		throw new Error("Coverage snapshot status must be one of: production_approved, reviewed, seed, unknown.");

	return {
		approvedAt: status === "production_approved" ? now : undefined,
		importedAt: now,
		note,
		reviewedAt: status === "reviewed" || status === "production_approved" ? now : undefined,
		sourceLabel,
		sourceOrigin,
		sourceType: "imported",
		status
	};
}

export async function runImportLiveCoverage(argv = process.argv) {
	try {
		const snapshot = parseCoverageSnapshot(JSON.parse(await readSourcePayload(argv)));
		const outputPath = writeCoverageSnapshot(
			snapshot,
			readFlag("--output", argv) || process.env.LIVE_COVERAGE_FILE || undefined
		);
		const metadataPath = writeCoverageSnapshotMetadata(buildMetadata(argv), outputPath);

		console.log(`Imported live coverage snapshot to ${outputPath}.`);
		console.log(`Wrote coverage snapshot metadata to ${metadataPath}.`);
	}
	catch (error) {
		console.error(error instanceof Error ? error.message : "Unable to import live coverage snapshot.");
		process.exit(1);
	}
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun)
	void runImportLiveCoverage();
