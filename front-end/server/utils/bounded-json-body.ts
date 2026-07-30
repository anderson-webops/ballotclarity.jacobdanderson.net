import type { H3Event } from "h3";
import { Buffer } from "node:buffer";
import { createError } from "h3";

export const adminRequestBodyMaxBytes = 64 * 1024;

function getContentType(event: H3Event) {
	const value = event.node.req.headers["content-type"];
	return (Array.isArray(value) ? value[0] : value)?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isJsonContentType(value: string) {
	return value === "application/json" || value.endsWith("+json");
}

function payloadTooLargeError() {
	return createError({
		statusCode: 413,
		statusMessage: `Admin request body exceeds the ${adminRequestBodyMaxBytes}-byte limit.`
	});
}

async function readBoundedRequestBody(event: H3Event) {
	const request = event.node.req;
	const rawContentLength = request.headers["content-length"];
	const contentLength = Number(Array.isArray(rawContentLength) ? rawContentLength[0] : rawContentLength);

	if (Number.isFinite(contentLength) && contentLength > adminRequestBodyMaxBytes)
		throw payloadTooLargeError();

	return await new Promise<string>((resolve, reject) => {
		const chunks: Buffer[] = [];
		let totalBytes = 0;
		let settled = false;

		function cleanup() {
			request.off("aborted", onAborted);
			request.off("data", onData);
			request.off("end", onEnd);
			request.off("error", onError);
		}

		function settleError(error: unknown) {
			if (settled)
				return;

			settled = true;
			cleanup();
			request.resume();
			reject(error);
		}

		function onAborted() {
			settleError(createError({
				statusCode: 400,
				statusMessage: "Admin request body was interrupted."
			}));
		}

		function onData(rawChunk: Buffer | string) {
			const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
			totalBytes += chunk.length;

			if (totalBytes > adminRequestBodyMaxBytes) {
				settleError(payloadTooLargeError());
				return;
			}

			chunks.push(chunk);
		}

		function onEnd() {
			if (settled)
				return;

			settled = true;
			cleanup();
			resolve(Buffer.concat(chunks).toString("utf8"));
		}

		function onError(error: Error) {
			settleError(error);
		}

		request.once("aborted", onAborted);
		request.on("data", onData);
		request.once("end", onEnd);
		request.once("error", onError);
	});
}

export async function readBoundedJsonRequestBody(event: H3Event): Promise<unknown> {
	if (!isJsonContentType(getContentType(event))) {
		throw createError({
			statusCode: 415,
			statusMessage: "Admin requests must use an application/json content type."
		});
	}

	const rawBody = await readBoundedRequestBody(event);

	try {
		return JSON.parse(rawBody) as unknown;
	}
	catch {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin request body must contain valid JSON."
		});
	}
}
