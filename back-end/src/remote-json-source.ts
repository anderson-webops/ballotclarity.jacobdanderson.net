import type { LookupAddress } from "node:dns";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Buffer } from "node:buffer";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

interface RemoteJsonResponse {
	body: AsyncIterable<Uint8Array | string> & {
		destroy?: (error?: Error) => void;
	};
	headers: IncomingHttpHeaders;
	statusCode: number;
}

interface RemoteJsonTransportInput {
	address: string;
	timeoutMs: number;
	url: URL;
}

interface FetchRemoteJsonOptions {
	maxBytes?: number;
	maxRedirects?: number;
	resolveAddresses?: (hostname: string) => Promise<LookupAddress[]>;
	timeoutMs?: number;
	transport?: (input: RemoteJsonTransportInput) => Promise<RemoteJsonResponse>;
}

const blockedAddresses = new BlockList();
const blockedHostnameSuffixes = [
	".internal",
	".invalid",
	".local",
	".localhost",
	".test",
];
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

for (const [network, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const) {
	blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
	["::", 128],
	["::1", 128],
	["100::", 64],
	["2001:db8::", 32],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
] as const) {
	blockedAddresses.addSubnet(network, prefix, "ipv6");
}

function normalizeHostname(hostname: string) {
	return hostname.replace(/^\[|\]$/gu, "").toLowerCase();
}

export function isPublicRemoteAddress(address: string) {
	const normalized = normalizeHostname(address);
	const family = isIP(normalized);

	if (!family)
		return false;

	if (family === 6 && normalized.startsWith("::ffff:"))
		return false;

	return !blockedAddresses.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

export function parseRemoteJsonUrl(value: string | URL) {
	let url: URL;

	try {
		url = value instanceof URL ? new URL(value) : new URL(value);
	}
	catch {
		throw new Error("Remote coverage source must be a valid absolute HTTPS URL.");
	}

	const hostname = normalizeHostname(url.hostname);

	if (url.protocol !== "https:")
		throw new Error("Remote coverage source must use HTTPS.");

	if (url.username || url.password)
		throw new Error("Remote coverage source URL must not contain embedded credentials.");

	if (
		hostname === "localhost"
		|| blockedHostnameSuffixes.some(suffix => hostname.endsWith(suffix))
	) {
		throw new Error("Remote coverage source hostname is not allowed.");
	}

	url.hash = "";
	return url;
}

async function resolvePublicAddresses(
	url: URL,
	resolveAddresses: NonNullable<FetchRemoteJsonOptions["resolveAddresses"]>
) {
	const hostname = normalizeHostname(url.hostname);
	const directFamily = isIP(hostname);
	const addresses = directFamily
		? [{ address: hostname, family: directFamily }]
		: await resolveAddresses(hostname);

	if (!addresses.length)
		throw new Error(`Remote coverage source hostname did not resolve: ${hostname}.`);

	if (addresses.some(record => !isPublicRemoteAddress(record.address))) {
		throw new Error(
			`Remote coverage source resolved to a private, local, reserved, or documentation address: ${hostname}.`
		);
	}

	return addresses;
}

function requestPinnedRemoteJson({
	address,
	timeoutMs,
	url,
}: RemoteJsonTransportInput): Promise<RemoteJsonResponse> {
	return new Promise((resolve, reject) => {
		const request = httpsRequest({
			headers: {
				"Accept": "application/json, application/*+json",
				"Host": url.host,
				"User-Agent": "Ballot-Clarity-Coverage-Importer/1.0",
			},
			hostname: address,
			method: "GET",
			path: `${url.pathname}${url.search}`,
			port: url.port || 443,
			rejectUnauthorized: true,
			servername: isIP(normalizeHostname(url.hostname))
				? undefined
				: normalizeHostname(url.hostname),
		}, (response: IncomingMessage) => {
			resolve({
				body: response,
				headers: response.headers,
				statusCode: response.statusCode ?? 0,
			});
		});

		request.setTimeout(timeoutMs, () => {
			request.destroy(new Error(`Remote coverage source timed out after ${timeoutMs}ms.`));
		});
		request.once("error", reject);
		request.end();
	});
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
	let timeout: NodeJS.Timeout | undefined;

	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					reject(new Error(`Remote coverage source timed out after ${timeoutMs}ms.`));
				}, timeoutMs);
				timeout.unref();
			}),
		]);
	}
	finally {
		if (timeout)
			clearTimeout(timeout);
	}
}

function isJsonContentType(value: string | string[] | undefined) {
	const normalized = Array.isArray(value) ? value[0] : value;
	const mediaType = normalized?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
	return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function readBoundedJsonBody(
	response: RemoteJsonResponse,
	maxBytes: number,
	timeoutMs: number
) {
	const contentLength = Number(response.headers["content-length"]);

	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		response.body.destroy?.();
		throw new Error(`Remote coverage source exceeds the ${maxBytes}-byte limit.`);
	}

	const contentEncoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();

	if (contentEncoding !== "identity") {
		response.body.destroy?.();
		throw new Error("Remote coverage source must not use compressed content encoding.");
	}

	if (!isJsonContentType(response.headers["content-type"])) {
		response.body.destroy?.();
		throw new Error("Remote coverage source must return an application/json content type.");
	}

	return await withTimeout((async () => {
		const chunks: Buffer[] = [];
		let totalBytes = 0;

		for await (const rawChunk of response.body) {
			const chunk = Buffer.isBuffer(rawChunk)
				? rawChunk
				: Buffer.from(rawChunk);
			totalBytes += chunk.length;

			if (totalBytes > maxBytes) {
				response.body.destroy?.();
				throw new Error(`Remote coverage source exceeds the ${maxBytes}-byte limit.`);
			}

			chunks.push(chunk);
		}

		return Buffer.concat(chunks).toString("utf8");
	})(), timeoutMs);
}

export async function fetchRemoteJsonText(
	source: string | URL,
	options: FetchRemoteJsonOptions = {}
) {
	const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
	const maxRedirects = options.maxRedirects ?? 3;
	const timeoutMs = options.timeoutMs ?? 15_000;

	if (!Number.isInteger(maxBytes) || maxBytes <= 0)
		throw new Error("Remote coverage source byte limit must be a positive integer.");

	if (!Number.isInteger(maxRedirects) || maxRedirects < 0)
		throw new Error("Remote coverage source redirect limit must be a non-negative integer.");

	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
		throw new Error("Remote coverage source timeout must be a positive integer.");
	const resolveAddresses = options.resolveAddresses
		?? (hostname => lookup(hostname, { all: true, verbatim: true }));
	const transport = options.transport ?? requestPinnedRemoteJson;
	let currentUrl = parseRemoteJsonUrl(source);

	for (let redirectCount = 0; ; redirectCount += 1) {
		const addresses = await resolvePublicAddresses(currentUrl, resolveAddresses);
		const response = await withTimeout(transport({
			address: addresses[0]!.address,
			timeoutMs,
			url: currentUrl,
		}), timeoutMs);

		if (redirectStatuses.has(response.statusCode)) {
			const location = response.headers.location;
			response.body.destroy?.();

			if (!location)
				throw new Error("Remote coverage source redirect did not include a location.");

			if (redirectCount >= maxRedirects)
				throw new Error(`Remote coverage source exceeded ${maxRedirects} redirects.`);

			currentUrl = parseRemoteJsonUrl(new URL(location, currentUrl));
			continue;
		}

		if (response.statusCode < 200 || response.statusCode >= 300) {
			response.body.destroy?.();
			throw new Error(`Unable to fetch live coverage snapshot: HTTP ${response.statusCode}.`);
		}

		return await readBoundedJsonBody(response, maxBytes, timeoutMs);
	}
}
