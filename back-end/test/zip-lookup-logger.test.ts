import type { LocationLookupResponse } from "../src/types/civic.js";
import type { ZipLookupLogEvent } from "../src/zip-lookup-logger.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	createZipLookupLogger,
	defaultZipLookupLogMaxBytes,
	defaultZipLookupLogPath,
	isZipLookupLoggingEnabled,
	normalizeZipLookupLogInput,
	resolveZipLookupLogMaxBytes,
} from "../src/zip-lookup-logger.js";

const resolvedResponse: LocationLookupResponse = {
	guideAvailability: "published",
	inputKind: "zip",
	note: "Resolved.",
	result: "resolved"
};

function readLogEvents(logPath: string) {
	if (!existsSync(logPath))
		return [];

	return readFileSync(logPath, "utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map(line => JSON.parse(line) as Record<string, unknown>);
}

test("ZIP lookup logging truthy parser accepts explicit enabled values only", () => {
	assert.equal(isZipLookupLoggingEnabled("1"), true);
	assert.equal(isZipLookupLoggingEnabled("true"), true);
	assert.equal(isZipLookupLoggingEnabled("yes"), true);
	assert.equal(isZipLookupLoggingEnabled("on"), true);
	assert.equal(isZipLookupLoggingEnabled("false"), false);
	assert.equal(isZipLookupLoggingEnabled(""), false);
});

test("ZIP lookup logger defaults to the production JSONL path", () => {
	const logger = createZipLookupLogger({ enabled: false });

	assert.equal(logger.logPath, defaultZipLookupLogPath);
	assert.equal(logger.maxBytes, defaultZipLookupLogMaxBytes);
});

test("ZIP lookup log size resolver accepts only positive safe integers", () => {
	assert.equal(resolveZipLookupLogMaxBytes("1024"), 1024);
	assert.equal(resolveZipLookupLogMaxBytes(256.9), 256);
	assert.equal(resolveZipLookupLogMaxBytes("0"), defaultZipLookupLogMaxBytes);
	assert.equal(resolveZipLookupLogMaxBytes("unbounded"), defaultZipLookupLogMaxBytes);
	assert.equal(resolveZipLookupLogMaxBytes(Number.MAX_SAFE_INTEGER + 1), defaultZipLookupLogMaxBytes);
});

test("ZIP lookup logger writes exact normalized 5-digit ZIP lookups", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({
			enabled: true,
			logPath,
			now: () => new Date("2026-04-26T21:00:00.000Z")
		});

		await logger.record("30022", resolvedResponse);
		const events = readLogEvents(logPath);

		assert.equal(events.length, 1);
		assert.deepEqual(Object.keys(events[0] ?? {}).sort(), [
			"guideAvailability",
			"result",
			"selectionRequired",
			"timestamp",
			"zip5"
		]);
		assert.deepEqual(events[0], {
			guideAvailability: "published",
			result: "resolved",
			selectionRequired: false,
			timestamp: "2026-04-26T21:00:00.000Z",
			zip5: "30022"
		});
		assert.equal(Object.hasOwn(events[0] ?? {}, "rawInput"), false);
		assert.equal(Object.hasOwn(events[0] ?? {}, "rawLookupText"), false);
		assert.equal(Object.hasOwn(events[0] ?? {}, "userAgent"), false);
		assert.equal(Object.hasOwn(events[0] ?? {}, "ip"), false);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("ZIP lookup logger rotates one bounded backup and restricts filesystem permissions", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "private", "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({
			enabled: true,
			logPath,
			maxBytes: 200,
			now: () => new Date("2026-04-26T21:00:00.000Z"),
		});

		await logger.record("30022", resolvedResponse);
		await logger.record("30303", resolvedResponse);

		assert.equal(readLogEvents(`${logPath}.1`).length, 1);
		assert.equal(readLogEvents(`${logPath}.1`)[0]?.zip5, "30022");
		assert.equal(readLogEvents(logPath).length, 1);
		assert.equal(readLogEvents(logPath)[0]?.zip5, "30303");
		assert.equal(statSync(logPath).mode & 0o777, 0o600);
		assert.equal(statSync(`${logPath}.1`).mode & 0o777, 0o600);
		assert.equal(statSync(dirname(logPath)).mode & 0o777, 0o700);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("ZIP lookup logger serializes concurrent writes", async () => {
	let activeWrites = 0;
	let maximumActiveWrites = 0;
	const writtenZipCodes: string[] = [];
	const logger = createZipLookupLogger({
		appendLine: async (_path, line) => {
			activeWrites += 1;
			maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
			await new Promise(resolve => setTimeout(resolve, 5));
			writtenZipCodes.push((JSON.parse(line) as ZipLookupLogEvent).zip5);
			activeWrites -= 1;
		},
		enabled: true,
	});

	await Promise.all([
		logger.record("30022", resolvedResponse),
		logger.record("30303", resolvedResponse),
		logger.record("30213", resolvedResponse),
	]);

	assert.equal(maximumActiveWrites, 1);
	assert.deepEqual(writtenZipCodes, ["30022", "30303", "30213"]);
});

test("ZIP lookup logger stays silent for full addresses containing a ZIP", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({
			enabled: true,
			logPath,
			now: () => new Date("2026-04-26T21:30:00.000Z")
		});

		await logger.record("55 Trinity Ave SW, Atlanta, GA 30303", {
			...resolvedResponse,
			inputKind: "address"
		});

		assert.deepEqual(readLogEvents(logPath), []);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("ZIP lookup logger stays silent for provider-normalized address ZIPs", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({ enabled: true, logPath });

		await logger.record("55 Trinity Ave SW, Atlanta, GA", {
			...resolvedResponse,
			inputKind: "address",
			normalizedAddress: "55 TRINITY AVE SW, ATLANTA, GA, 30303"
		});

		assert.deepEqual(readLogEvents(logPath), []);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("ZIP lookup logger stays silent for full addresses without a ZIP", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({ enabled: true, logPath });

		await logger.record("12345 Main St, Atlanta, GA", {
			...resolvedResponse,
			inputKind: "address"
		});

		assert.deepEqual(readLogEvents(logPath), []);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("ZIP lookup logger stays silent for ZIP+4 input", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({ enabled: true, logPath });

		await logger.record("30022-1234", resolvedResponse);

		assert.deepEqual(readLogEvents(logPath), []);
		assert.equal(normalizeZipLookupLogInput("30022-1234"), null);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("ZIP lookup logger stays silent for city names and mixed location strings", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({ enabled: true, logPath });

		await logger.record("Atlanta", resolvedResponse);
		await logger.record("Atlanta GA 30303", resolvedResponse);
		await logger.record("30303 Atlanta", resolvedResponse);

		assert.deepEqual(readLogEvents(logPath), []);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("disabled ZIP lookup logger writes nothing", async () => {
	const tempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-zip-log-"));
	const logPath = join(tempDir, "zip-events.jsonl");

	try {
		const logger = createZipLookupLogger({ enabled: false, logPath });

		await logger.record("30022", resolvedResponse);

		assert.deepEqual(readLogEvents(logPath), []);
	}
	finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});
