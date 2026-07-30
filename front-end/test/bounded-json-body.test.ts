import type { H3Event } from "h3";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import test from "node:test";
import {
	adminRequestBodyMaxBytes,
	readBoundedJsonRequestBody
} from "../server/utils/bounded-json-body.ts";

function createBodyEvent(
	body: string,
	headers: Record<string, string> = { "content-type": "application/json" }
) {
	const request = Readable.from([Buffer.from(body)]);
	Object.assign(request, { headers });

	return {
		node: {
			req: request
		}
	} as unknown as H3Event;
}

test("bounded JSON body reader parses object payloads", async () => {
	assert.deepEqual(
		await readBoundedJsonRequestBody(createBodyEvent("{\"username\":\"editor\"}")),
		{ username: "editor" }
	);
});

test("bounded JSON body reader rejects unsupported content types and malformed JSON", async () => {
	await assert.rejects(
		readBoundedJsonRequestBody(createBodyEvent("username=editor", {
			"content-type": "application/x-www-form-urlencoded"
		})),
		(error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 415)
	);
	await assert.rejects(
		readBoundedJsonRequestBody(createBodyEvent("{")),
		(error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 400)
	);
});

test("bounded JSON body reader rejects chunked payloads over the byte ceiling", async () => {
	await assert.rejects(
		readBoundedJsonRequestBody(createBodyEvent(JSON.stringify({
			value: "x".repeat(adminRequestBodyMaxBytes)
		}))),
		(error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 413)
	);
});
