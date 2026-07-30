import assert from "node:assert/strict";
import test from "node:test";
import { isExternalHref, normalizeExternalHref, normalizeImageHref, normalizePublicHref } from "../src/utils/link.ts";

test("isExternalHref detects external links", () => {
	assert.equal(isExternalHref("https://openstates.org/person/test"), true);
	assert.equal(isExternalHref("http://example.com"), true);
	assert.equal(isExternalHref("/candidate/example"), false);
	assert.equal(isExternalHref("candidate/example"), false);
	assert.equal(isExternalHref("mailto:foo@example.com"), false);
});

test("normalizeExternalHref rejects executable, credentialed, malformed, and local-network links", () => {
	assert.equal(normalizeExternalHref("javascript:alert(1)"), "");
	assert.equal(normalizeExternalHref("data:text/html,test"), "");
	assert.equal(normalizeExternalHref("https://user:secret@example.com/path"), "");
	assert.equal(normalizeExternalHref("https:\\\\example.com\\path"), "");
	assert.equal(normalizeExternalHref("http://127.0.0.1/admin"), "");
	assert.equal(normalizeExternalHref("http://[::1]/admin"), "");
	assert.equal(normalizeExternalHref("http://[::ffff:7f00:1]/admin"), "");
	assert.equal(normalizeExternalHref("https://service.internal/admin"), "");
	assert.equal(normalizeExternalHref("not a URL"), "");
});

test("normalizeExternalHref canonicalizes public HTTP and HTTPS links", () => {
	assert.equal(normalizeExternalHref(" https://example.com/path?q=1#top "), "https://example.com/path?q=1#top");
	assert.equal(normalizeExternalHref("http://203.0.113.20/resource"), "http://203.0.113.20/resource");
});

test("normalizePublicHref allows safe root-relative links and rejects traversal or protocol-relative links", () => {
	assert.equal(normalizePublicHref("/source-files/report.pdf?download=1"), "/source-files/report.pdf?download=1");
	assert.equal(normalizePublicHref("#guide-logistics"), "#guide-logistics");
	assert.equal(normalizePublicHref("/source-files/../private.txt"), "");
	assert.equal(normalizePublicHref("/source-files/%252e%252e/private.txt"), "");
	assert.equal(normalizePublicHref("//attacker.example/path"), "");
});

test("normalizeImageHref rejects fragments and local-network image targets", () => {
	assert.equal(normalizeImageHref("/images/candidate.jpg"), "/images/candidate.jpg");
	assert.equal(normalizeImageHref("https://cdn.example.com/candidate.jpg"), "https://cdn.example.com/candidate.jpg");
	assert.equal(normalizeImageHref("#candidate-photo"), "");
	assert.equal(normalizeImageHref("data:image/svg+xml,test"), "");
	assert.equal(normalizeImageHref("http://[::ffff:7f00:1]/camera.jpg"), "");
});
