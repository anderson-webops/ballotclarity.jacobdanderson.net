import assert from "node:assert/strict";
import test from "node:test";
import {
	buildContentSecurityPolicy,
	collectTrustedInlineScriptHashes,
	resolveContentSecurityPolicyApiSources,
} from "../server/utils/content-security-policy.ts";

function getDirectiveSources(policy: string, directiveName: string) {
	const directive = policy
		.split(";")
		.map(item => item.trim())
		.find(item => item.split(/\s+/u)[0] === directiveName);

	return directive?.split(/\s+/u).slice(1) ?? [];
}

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
		"<script id=\"ballot-clarity-display-time-zone\" type=\"text/javascript\">timezone()</script >",
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
	const scriptSources = new Set(getDirectiveSources(policy, "script-src"));
	assert.equal(scriptSources.has("https://analytics.ballotclarity.org"), true);
	assert.equal(scriptSources.has("'unsafe-inline'"), false);
});

test("malformed script closing tags fail closed", () => {
	const html = [
		"<html><head>",
		"<script id=\"ballot-clarity-display-time-zone\">timezone()</scriptx>",
		"<script id=\"ballot-clarity-deploy-recovery\">recovery()</script>",
		"</head></html>",
	].join("");

	assert.deepEqual(collectTrustedInlineScriptHashes(html), []);
});
