import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	coverageSnapshotMetadataPath,
	readCoverageSnapshot,
	readCoverageSnapshotMetadata,
} from "./coverage-repository.js";
import {
	summarizeCoverageSnapshotValidation,
	validateCoverageSnapshotForPublication,
} from "./coverage-snapshot-validation.js";

function readFlag(flag: string, argv = process.argv.slice(2)) {
	const index = argv.indexOf(flag);

	if (index === -1)
		return undefined;

	return argv[index + 1];
}

function requireFlag(flag: string, argv = process.argv.slice(2)) {
	const value = readFlag(flag, argv);

	if (!value)
		throw new Error(`${flag} is required.`);

	return value;
}

export function defaultTargetPath() {
	return process.env.LIVE_COVERAGE_FILE || resolve(process.cwd(), "back-end", "data", "live-coverage.local.json");
}

export function backupDirectoryFor(snapshotPath: string) {
	return join(dirname(snapshotPath), "backups");
}

function timestamp() {
	return new Date().toISOString().replaceAll(":", "").replaceAll(".", "").replace("T", "-");
}

export function backupSnapshot(snapshotPath: string) {
	if (!existsSync(snapshotPath))
		return null;

	const backupDir = backupDirectoryFor(snapshotPath);
	mkdirSync(backupDir, { recursive: true });
	const stamp = timestamp();
	const backupSnapshotPath = join(backupDir, `${basename(snapshotPath)}.${stamp}`);
	const backupMetadataPath = coverageSnapshotMetadataPath(backupSnapshotPath);

	copyFileSync(snapshotPath, backupSnapshotPath);

	if (existsSync(coverageSnapshotMetadataPath(snapshotPath)))
		copyFileSync(coverageSnapshotMetadataPath(snapshotPath), backupMetadataPath);

	return {
		metadataPath: existsSync(backupMetadataPath) ? backupMetadataPath : null,
		snapshotPath: backupSnapshotPath,
		stamp
	};
}

function assertPromotableSnapshot(snapshotPath: string) {
	const metadataPath = coverageSnapshotMetadataPath(snapshotPath);

	if (!existsSync(snapshotPath))
		throw new Error(`Coverage snapshot not found at ${snapshotPath}.`);

	if (!existsSync(metadataPath))
		throw new Error(`Coverage snapshot metadata not found at ${metadataPath}.`);

	const snapshot = readCoverageSnapshot(snapshotPath);
	const metadata = readCoverageSnapshotMetadata(snapshotPath);

	if (metadata.status !== "reviewed" && metadata.status !== "production_approved") {
		throw new Error(
			`Coverage snapshot status must be reviewed or production_approved before activation; received ${metadata.status}.`
		);
	}

	const validation = validateCoverageSnapshotForPublication(snapshot, metadata);

	if (!validation.ok) {
		throw new Error([
			"Coverage snapshot failed publication validation.",
			...summarizeCoverageSnapshotValidation(validation),
		].join("\n"));
	}
}

function temporarySiblingPath(targetPath: string, purpose: string) {
	return join(
		dirname(targetPath),
		`.${basename(targetPath)}.${purpose}.${process.pid}.${randomUUID()}.tmp`
	);
}

function replaceSnapshotPair(sourcePath: string, targetPath: string) {
	const sourceMetadataPath = coverageSnapshotMetadataPath(sourcePath);
	const targetMetadataPath = coverageSnapshotMetadataPath(targetPath);
	const stagedSnapshotPath = temporarySiblingPath(targetPath, "staged");
	const stagedMetadataPath = temporarySiblingPath(targetMetadataPath, "staged");
	const previousSnapshotPath = existsSync(targetPath)
		? temporarySiblingPath(targetPath, "previous")
		: null;
	const previousMetadataPath = existsSync(targetMetadataPath)
		? temporarySiblingPath(targetMetadataPath, "previous")
		: null;
	let snapshotReplaced = false;
	let metadataReplaced = false;

	mkdirSync(dirname(targetPath), { recursive: true });

	try {
		copyFileSync(sourcePath, stagedSnapshotPath);
		copyFileSync(sourceMetadataPath, stagedMetadataPath);

		if (previousSnapshotPath)
			copyFileSync(targetPath, previousSnapshotPath);

		if (previousMetadataPath)
			copyFileSync(targetMetadataPath, previousMetadataPath);

		// Replace data before its approval sidecar. An interrupted process therefore
		// cannot apply newer approval metadata to older snapshot content.
		renameSync(stagedSnapshotPath, targetPath);
		snapshotReplaced = true;
		renameSync(stagedMetadataPath, targetMetadataPath);
		metadataReplaced = true;
	}
	catch (error) {
		if (snapshotReplaced) {
			if (previousSnapshotPath && existsSync(previousSnapshotPath))
				renameSync(previousSnapshotPath, targetPath);
			else
				rmSync(targetPath, { force: true });
		}

		if (metadataReplaced) {
			if (previousMetadataPath && existsSync(previousMetadataPath))
				renameSync(previousMetadataPath, targetMetadataPath);
			else
				rmSync(targetMetadataPath, { force: true });
		}

		throw error;
	}
	finally {
		for (const path of [
			stagedSnapshotPath,
			stagedMetadataPath,
			previousSnapshotPath,
			previousMetadataPath,
		]) {
			if (path)
				rmSync(path, { force: true });
		}
	}
}

export function promoteSnapshot(candidatePath: string, targetPath: string) {
	assertPromotableSnapshot(candidatePath);
	replaceSnapshotPair(candidatePath, targetPath);
}

export function rollbackSnapshot(targetPath: string, backupPath: string) {
	assertPromotableSnapshot(backupPath);
	replaceSnapshotPair(backupPath, targetPath);
}

export function listBackups(targetPath: string) {
	const backupDir = backupDirectoryFor(targetPath);

	if (!existsSync(backupDir))
		return [];

	return readdirSync(backupDir)
		.filter(entry => entry.startsWith(`${basename(targetPath)}.`))
		.filter(entry => !entry.endsWith(".meta.json"))
		.sort()
		.reverse()
		.map(entry => join(backupDir, entry));
}

export function runManageCoverageCommand(argv = process.argv.slice(2)) {
	const [command] = argv;
	const targetPath = readFlag("--target", argv) || defaultTargetPath();

	if (!command || command === "help" || command === "--help") {
		console.log("Usage:");
		console.log("  tsx src/manage-live-coverage.ts promote --from <candidate-snapshot> [--target <active-snapshot>]");
		console.log("  tsx src/manage-live-coverage.ts rollback --from <backup-snapshot> [--target <active-snapshot>]");
		console.log("  tsx src/manage-live-coverage.ts list-backups [--target <active-snapshot>]");
		return;
	}

	if (command === "promote") {
		const candidatePath = requireFlag("--from", argv);
		const backup = backupSnapshot(targetPath);
		promoteSnapshot(candidatePath, targetPath);
		console.log(`Promoted coverage snapshot from ${candidatePath} to ${targetPath}.`);

		if (backup)
			console.log(`Backed up previous active snapshot to ${backup.snapshotPath}.`);

		return;
	}

	if (command === "rollback") {
		const backupPath = requireFlag("--from", argv);
		const backup = backupSnapshot(targetPath);
		rollbackSnapshot(targetPath, backupPath);
		console.log(`Rolled back active coverage snapshot from ${backupPath} to ${targetPath}.`);

		if (backup)
			console.log(`Backed up pre-rollback snapshot to ${backup.snapshotPath}.`);

		return;
	}

	if (command === "list-backups") {
		for (const entry of listBackups(targetPath))
			console.log(entry);
		return;
	}

	throw new Error(`Unknown command: ${command}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	try {
		runManageCoverageCommand();
	}
	catch (error) {
		console.error(error instanceof Error ? error.message : "Unable to manage live coverage snapshot.");
		process.exit(1);
	}
}
