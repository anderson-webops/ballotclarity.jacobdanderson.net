import assert from "node:assert/strict";
import test from "node:test";
import {
	buildContentSecurityPolicy,
	collectTrustedInlineScriptHashes,
	resolveContentSecurityPolicyApiSources,
} from "../server/utils/content-security-policy.ts";

test("content security policy keeps production API origins exact", () => {
	assert.deepEqual(
		resolveContentSecurityPolicyApiSources("https://api.ballotclarity.org/api"),
		["https://api.ballotclarity.org"],
	);
	assert.deepEqual(
		resolveContentSecurityPolicyApiSources("http://127.0.0.1:3001/api"),
		["http://127.0.0.1:3001", "http://127.0.0.1:*"],
	);
	assert.deepEqual(resolveContentSecurityPolicyApiSources("javascript:alert(1)"), []);
});

test("only known framework and application inline scripts receive CSP hashes", () => {
	const html = [
		"<html><head>",
		"<script type=\"importmap\">{\"imports\":{}}</script>",
		"<script id=\"ballot-clarity-display-time-zone\" type=\"text/javascript\">timezone()</script>",
		"<script type=\"application/ld+json\" data-hid=\"jsonld-0\">{\"name\":\"Ballot Clarity\"}</script>",
		"<script>\"use strict\";(()=>{window[\"__NUXT_COLOR_MODE__\"]={}})()</script>",
		"<script>window.__NUXT__={};window.__NUXT__.config={}</script>",
		"<script type=\"application/json\" data-nuxt-data=\"nuxt-app\" id=\"__NUXT_DATA__\">[]</script>",
		"<script>alert(\"untrusted\")</script>",
		"</head></html>",
	].join("");
	const hashes = collectTrustedInlineScriptHashes(html);

	assert.equal(hashes.length, 6);
	assert.ok(hashes.every(hash => /^sha256-[A-Za-z0-9+/]+={0,2}$/u.test(hash)));

	const policy = buildContentSecurityPolicy({
		analyticsOrigins: ["https://analytics.ballotclarity.org"],
		inlineScriptHashes: hashes,
		publicApiBase: "https://api.ballotclarity.org/api",
	});

	assert.match(policy, /script-src 'self' 'sha256-/u);
	assert.match(policy, /https:\/\/analytics\.ballotclarity\.org/u);
	assert.doesNotMatch(policy.match(/script-src [^;]+/u)?.[0] ?? "", /'unsafe-inline'/u);
});
