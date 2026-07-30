import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { serializeJsonLd } from "../src/utils/json-ld.ts";

const appSource = readFileSync(resolve("src/app.vue"), "utf8");
const pageSeoSource = readFileSync(resolve("src/composables/usePageSeo.ts"), "utf8");

test("JSON-LD serialization cannot escape its script element", () => {
	const maliciousValue = {
		query: "</script><script>alert('xss')</script>",
		separators: "\u2028\u2029",
		text: "one & two > zero"
	};
	const serialized = serializeJsonLd(maliciousValue);

	assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/u);
	assert.match(serialized, /\\u003C\/script\\u003E/);
	assert.deepEqual(JSON.parse(serialized), maliciousValue);
});

test("all shared JSON-LD head entries use script-safe serialization", () => {
	assert.match(appSource, /innerHTML: serializeJsonLd\(siteSchema\)/);
	assert.match(pageSeoSource, /innerHTML: serializeJsonLd\(entry\)/);
	assert.doesNotMatch(appSource, /innerHTML: JSON\.stringify\(siteSchema\)/);
	assert.doesNotMatch(pageSeoSource, /innerHTML: JSON\.stringify\(entry\)/);
});
