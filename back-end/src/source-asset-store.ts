import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hasUnsafeHrefCharacters, normalizePublicHref } from "./public-href.js";

export type SourceAssetMode = "external-base" | "public-mirror";

export interface SourceAssetStoreOptions {
	publicSourceFileDirectory?: string | null;
}

function parseSourceAssetBaseUrl(value: string) {
	if (!value)
		return null;

	if (hasUnsafeHrefCharacters(value))
		throw new Error("SOURCE_ASSET_BASE_URL must not contain control characters or backslashes.");

	let parsed: URL;

	try {
		parsed = new URL(value);
	}
	catch {
		throw new Error("SOURCE_ASSET_BASE_URL must be a valid HTTP or HTTPS URL.");
	}

	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:")
		|| parsed.username
		|| parsed.password
		|| parsed.search
		|| parsed.hash
	) {
		throw new Error("SOURCE_ASSET_BASE_URL must be an HTTP or HTTPS URL without credentials, a query, or a fragment.");
	}

	parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
	return parsed.href.replace(/\/$/u, "");
}

function normalizeSourceAssetPath(url: string) {
	const parsed = new URL(url, "https://ballotclarity.invalid");
	return parsed.pathname.slice("/source-files/".length);
}

function isPublicSourceFileUrl(url: string) {
	return url.startsWith("/source-files/");
}

function isSafeSourceAssetPath(assetPath: string) {
	try {
		const decoded = decodeURIComponent(assetPath);
		return Boolean(decoded)
			&& !hasUnsafeHrefCharacters(decoded)
			&& !decoded.split(/[\\/]/u).includes("..");
	}
	catch {
		return false;
	}
}

function defaultPublicSourceFileDirectory() {
	const configuredDirectory = (process.env.SOURCE_ASSET_PUBLIC_DIR || "").trim();

	if (configuredDirectory)
		return configuredDirectory;

	const moduleDirectory = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		resolvePath(process.cwd(), "front-end", "public", "source-files"),
		resolvePath(process.cwd(), "..", "front-end", "public", "source-files"),
		resolvePath(moduleDirectory, "..", "..", "front-end", "public", "source-files"),
		resolvePath(moduleDirectory, "..", "..", "front-end", ".output", "public", "source-files"),
	];

	return candidates.find(candidate => existsSync(candidate)) ?? null;
}

export function createSourceAssetStore(options: SourceAssetStoreOptions = {}) {
	const configuredBaseUrl = (process.env.SOURCE_ASSET_BASE_URL || "").trim();
	const mode: SourceAssetMode = configuredBaseUrl ? "external-base" : "public-mirror";
	const baseUrl = configuredBaseUrl ? parseSourceAssetBaseUrl(configuredBaseUrl) : null;
	const publicSourceFileDirectory = options.publicSourceFileDirectory === undefined
		? defaultPublicSourceFileDirectory()
		: options.publicSourceFileDirectory;

	return {
		baseUrl,
		mode,
		publicSourceFileDirectory,
		resolve(url: string) {
			const safeUrl = normalizePublicHref(url);

			if (!safeUrl)
				return "";

			if (!isPublicSourceFileUrl(safeUrl))
				return safeUrl;

			const normalizedAssetPath = normalizeSourceAssetPath(safeUrl);

			if (!isSafeSourceAssetPath(normalizedAssetPath))
				return "";

			if (mode === "external-base" && baseUrl) {
				const parsed = new URL(safeUrl, "https://ballotclarity.invalid");
				const assetUrl = new URL(normalizedAssetPath, `${baseUrl}/`);
				assetUrl.search = parsed.search;
				assetUrl.hash = parsed.hash;
				return assetUrl.href;
			}

			if (publicSourceFileDirectory) {
				const assetPath = resolvePath(publicSourceFileDirectory, decodeURIComponent(normalizedAssetPath));

				if (!existsSync(assetPath))
					return "";
			}

			return safeUrl;
		}
	};
}
