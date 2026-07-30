import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequestId, sanitizeLogText } from "../src/logger.js";

test("request IDs accept a bounded safe token and replace untrusted values", () => {
	assert.equal(normalizeRequestId("request-123:edge.4"), "request-123:edge.4");
	assert.match(normalizeRequestId("contains spaces"), /^[a-f0-9-]{36}$/u);
	assert.match(normalizeRequestId("x".repeat(129)), /^[a-f0-9-]{36}$/u);
});

test("log text removes control characters and enforces a maximum length", () => {
	assert.equal(sanitizeLogText("  browser\nagent\u0000value  ", 64), "browser agent value");
	assert.equal(sanitizeLogText("abcdefgh", 5), "abcde");
});
