import { Buffer } from "node:buffer";
import process from "node:process";

export const defaultProviderResponseMaxBytes = 5 * 1024 * 1024;

export class ProviderResponseTooLargeError extends Error {
	constructor(
		readonly maxBytes: number,
		readonly receivedBytes: number,
	) {
		super(`Provider response exceeded the ${maxBytes}-byte limit.`);
		this.name = "ProviderResponseTooLargeError";
	}
}

export function resolveProviderResponseMaxBytes(
	value: number | string | null | undefined = process.env.PROVIDER_RESPONSE_MAX_BYTES,
	fallback = defaultProviderResponseMaxBytes,
) {
	const parsed = typeof value === "number" ? value : Number(value);
	const normalized = Math.floor(parsed);

	return Number.isSafeInteger(normalized) && normalized > 0
		? normalized
		: fallback;
}

function declaredResponseLength(response: Response) {
	const contentLength = response.headers.get("content-length")?.trim();

	if (!contentLength || !/^\d+$/u.test(contentLength))
		return null;

	const parsed = Number(contentLength);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function readProviderResponseText(
	response: Response,
	maxBytes = resolveProviderResponseMaxBytes(),
) {
	const resolvedMaxBytes = resolveProviderResponseMaxBytes(maxBytes);
	const declaredLength = declaredResponseLength(response);

	if (declaredLength !== null && declaredLength > resolvedMaxBytes) {
		await response.body?.cancel().catch(() => {});
		throw new ProviderResponseTooLargeError(resolvedMaxBytes, declaredLength);
	}

	if (!response.body)
		return "";

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done)
				break;

			if (!value?.byteLength)
				continue;

			receivedBytes += value.byteLength;

			if (receivedBytes > resolvedMaxBytes) {
				await reader.cancel().catch(() => {});
				throw new ProviderResponseTooLargeError(resolvedMaxBytes, receivedBytes);
			}

			chunks.push(value);
		}
	}
	finally {
		reader.releaseLock();
	}

	return Buffer.concat(chunks, receivedBytes).toString("utf8");
}

export async function readProviderResponseJson<T>(
	response: Response,
	maxBytes = resolveProviderResponseMaxBytes(),
) {
	return JSON.parse(await readProviderResponseText(response, maxBytes)) as T;
}
