import type {
	LocationGuideAvailability,
	LocationLookupResponse,
	LocationLookupResult,
} from "./types/civic.js";
import { Buffer } from "node:buffer";
import { appendFile, chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

export const defaultZipLookupLogPath = "/var/lib/ballotclarity/zip-lookup-events.jsonl";
export const defaultZipLookupLogMaxBytes = 10 * 1024 * 1024;

const truthyEnvPattern = /^(?:1|true|yes|on)$/i;
const exactZip5Pattern = /^\d{5}$/;

export interface ZipLookupLogEvent {
	timestamp: string;
	zip5: string;
	result: LocationLookupResult;
	guideAvailability: LocationGuideAvailability | null;
	selectionRequired: boolean;
}

export interface ZipLookupLogger {
	readonly enabled: boolean;
	readonly logPath: string;
	readonly maxBytes?: number;
	record: (rawInput: string, lookupResponse: LocationLookupResponse) => Promise<void>;
}

export interface ZipLookupLoggerOptions {
	appendLine?: (logPath: string, line: string) => Promise<void>;
	enabled?: boolean;
	logPath?: string;
	maxBytes?: number;
	now?: () => Date;
	onError?: (error: unknown) => void;
}

export function isZipLookupLoggingEnabled(value = process.env.BALLOTCLARITY_ZIP_LOOKUP_LOG_ENABLED) {
	return truthyEnvPattern.test(value?.trim() ?? "");
}

export function normalizeZipLookupLogInput(rawInput: string) {
	const normalized = rawInput.trim();
	return exactZip5Pattern.test(normalized) ? normalized : null;
}

function resolveZip5ForLookupLog(rawInput: string, lookupResponse: LocationLookupResponse) {
	if (lookupResponse.inputKind !== "zip")
		return null;

	return normalizeZipLookupLogInput(rawInput);
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function currentFileSize(path: string) {
	try {
		return (await stat(path)).size;
	}
	catch (error) {
		if (isNotFoundError(error))
			return 0;

		throw error;
	}
}

async function appendJsonLine(logPath: string, line: string, maxBytes: number) {
	const logDirectory = dirname(logPath);
	const backupPath = `${logPath}.1`;
	const entry = `${line}\n`;
	const entryBytes = Buffer.byteLength(entry, "utf8");

	if (entryBytes > maxBytes)
		throw new Error(`ZIP lookup log entry exceeds the ${maxBytes}-byte file limit.`);

	await mkdir(logDirectory, { mode: 0o700, recursive: true });
	await chmod(logDirectory, 0o700);

	const existingBytes = await currentFileSize(logPath);

	if (existingBytes > 0 && existingBytes + entryBytes > maxBytes) {
		await rm(backupPath, { force: true });
		await rename(logPath, backupPath);
		await chmod(backupPath, 0o600);
	}

	await appendFile(logPath, entry, {
		encoding: "utf8",
		flag: "a",
		mode: 0o600,
	});
	await chmod(logPath, 0o600);
}

function resolveLogPath(logPath?: string) {
	return logPath?.trim()
		|| process.env.BALLOTCLARITY_ZIP_LOOKUP_LOG_PATH?.trim()
		|| defaultZipLookupLogPath;
}

export function resolveZipLookupLogMaxBytes(
	value: number | string | null | undefined = process.env.BALLOTCLARITY_ZIP_LOOKUP_LOG_MAX_BYTES,
	fallback = defaultZipLookupLogMaxBytes,
) {
	const parsed = typeof value === "number" ? value : Number(value);
	const normalized = Math.floor(parsed);

	return Number.isSafeInteger(normalized) && normalized > 0
		? normalized
		: fallback;
}

export function createZipLookupLogger(options: ZipLookupLoggerOptions = {}): ZipLookupLogger {
	const enabled = options.enabled ?? isZipLookupLoggingEnabled();
	const logPath = resolveLogPath(options.logPath);
	const maxBytes = resolveZipLookupLogMaxBytes(options.maxBytes);
	const appendLine = options.appendLine ?? ((path, line) => appendJsonLine(path, line, maxBytes));
	const now = options.now ?? (() => new Date());
	let writeQueue = Promise.resolve();

	return {
		enabled,
		logPath,
		maxBytes,
		async record(rawInput, lookupResponse) {
			if (!enabled)
				return;

			const zip5 = resolveZip5ForLookupLog(rawInput, lookupResponse);

			if (!zip5)
				return;

			const event: ZipLookupLogEvent = {
				guideAvailability: lookupResponse.guideAvailability ?? null,
				result: lookupResponse.result,
				selectionRequired: Boolean(lookupResponse.selectionOptions?.length),
				timestamp: now().toISOString(),
				zip5
			};

			try {
				const write = writeQueue.then(() => appendLine(logPath, JSON.stringify(event)));
				writeQueue = write.catch(() => {});
				await write;
			}
			catch (error) {
				options.onError?.(error);
			}
		}
	};
}
