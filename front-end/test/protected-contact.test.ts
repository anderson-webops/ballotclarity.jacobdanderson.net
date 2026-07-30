import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	buildProtectedContactHref,
	contactAddressEndpoint,
	contactAddressNonceHeaderName,
	readContactAddressNonce,
	requestProtectedContactAddress
} from "../src/utils/protected-contact.ts";

test("protected contact utility builds mailto links only after an address is supplied", () => {
	assert.equal(
		buildProtectedContactHref("hello@ballotclarity.org", "Ballot Clarity privacy question"),
		"mailto:hello@ballotclarity.org?subject=Ballot%20Clarity%20privacy%20question"
	);
	assert.equal(buildProtectedContactHref("hello@ballotclarity.org"), "mailto:hello@ballotclarity.org");
});

test("protected contact utility reads the endpoint nonce from browser cookies", () => {
	assert.equal(readContactAddressNonce("theme=light; ballot_clarity_contact_nonce=abc123; other=value"), "abc123");
	assert.equal(readContactAddressNonce("theme=light; other=value"), "");
	assert.equal(readContactAddressNonce("ballot_clarity_contact_nonce=a%20b"), "a b");
});

test("protected contact request retries after the endpoint issues a nonce challenge", async () => {
	let currentCookie = "";
	const requests: Array<{ headers: HeadersInit | undefined; url: RequestInfo | URL }> = [];
	const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
		requests.push({ headers: init?.headers, url });
		assert.ok(init?.signal instanceof AbortSignal);

		if (!currentCookie) {
			currentCookie = "ballot_clarity_contact_nonce=nonce-value";
			return new Response(JSON.stringify({ code: "contact_nonce_required" }), {
				headers: { "content-type": "application/json" },
				status: 202
			});
		}

		const headers = init?.headers as Record<string, string>;
		assert.equal(headers[contactAddressNonceHeaderName], "nonce-value");

		return new Response(JSON.stringify({ address: "hello@ballotclarity.org" }), {
			headers: { "content-type": "application/json" },
			status: 200
		});
	};

	const address = await requestProtectedContactAddress(fetcher as typeof fetch, () => currentCookie);

	assert.equal(address, "hello@ballotclarity.org");
	assert.equal(requests.length, 2);
	assert.equal(requests[0]?.url, contactAddressEndpoint);
	assert.equal(requests[1]?.url, contactAddressEndpoint);
});

test("protected contact source avoids static email exposure and hydrates through the same-origin endpoint", () => {
	const utilitySource = readFileSync(new URL("../src/utils/protected-contact.ts", import.meta.url), "utf8");
	const componentSource = readFileSync(new URL("../src/components/ProtectedEmailLink.vue", import.meta.url), "utf8");
	const endpointSource = readFileSync(new URL("../server/api/contact-address.get.ts", import.meta.url), "utf8");
	const endpointUtilitySource = readFileSync(new URL("../server/utils/contact-address.ts", import.meta.url), "utf8");

	assert.equal(utilitySource.includes("hello@ballotclarity.org"), false);
	assert.equal(utilitySource.includes("mailto:hello"), false);
	assert.equal(componentSource.includes("hello@ballotclarity.org"), false);
	assert.equal(componentSource.includes(contactAddressEndpoint), false);
	assert.equal(endpointSource.includes("hello@ballotclarity.org"), false);
	assert.equal(endpointUtilitySource.includes("hello@ballotclarity.org"), false);
	assert.equal(componentSource.includes("onMounted"), true);
	assert.equal(utilitySource.includes(contactAddressEndpoint), true);
	assert.match(endpointUtilitySource, /process\.env\.NODE_ENV === "production"/);
	assert.match(endpointUtilitySource, /normalizedSecret\.length < 32/);
	assert.doesNotMatch(endpointUtilitySource, /ADMIN_SESSION_SECRET/);
	assert.match(endpointUtilitySource, /sameSite: "strict"/);
	assert.match(endpointUtilitySource, /getExpectedRequestOrigin/);
	assert.match(endpointUtilitySource, /CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS/);
});
