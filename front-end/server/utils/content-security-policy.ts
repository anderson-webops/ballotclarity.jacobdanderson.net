import { createHash } from "node:crypto";

interface ContentSecurityPolicyOptions {
	analyticsOrigins: string[];
	inlineScriptHashes?: string[];
	publicApiBase: string;
}

interface InlineScript {
	attributes: string;
	body: string;
}

const inlineScriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;
const allowedScriptIds = new Set([
	"ballot-clarity-deploy-recovery",
	"ballot-clarity-display-time-zone",
]);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const nuxtColorModeMarker = "__NUXT_COLOR_MODE__";
const nuxtConfigScriptPattern = /^window\.__NUXT__=\{\};window\.__NUXT__\.config=/u;

function uniqueSourceList(...sources: string[]) {
	return Array.from(new Set(sources.filter(Boolean))).join(" ");
}

function readAttribute(attributes: string, name: string) {
	const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`, "iu");
	const match = attributes.match(pattern);

	return match?.[1] ?? match?.[2] ?? "";
}

function hasAttribute(attributes: string, name: string) {
	return new RegExp(`\\b${name}(?:\\s*=|\\s|$)`, "iu").test(attributes);
}

function isTrustedInlineScript({ attributes, body }: InlineScript) {
	if (hasAttribute(attributes, "src"))
		return false;

	const id = readAttribute(attributes, "id");
	const type = (readAttribute(attributes, "type") || "text/javascript").toLowerCase();

	if (allowedScriptIds.has(id))
		return type === "text/javascript";

	if (type === "importmap")
		return true;

	if (type === "application/ld+json")
		return hasAttribute(attributes, "data-hid");

	if (id === "__NUXT_DATA__")
		return type === "application/json" && hasAttribute(attributes, "data-nuxt-data");

	if (attributes.trim())
		return false;

	return (
		(body.startsWith("\"use strict\";(()=>") && body.includes(nuxtColorModeMarker))
		|| nuxtConfigScriptPattern.test(body)
	);
}

export function resolveContentSecurityPolicyApiSources(publicApiBase: string) {
	try {
		const publicApiUrl = new URL(publicApiBase);

		if (publicApiUrl.protocol !== "http:" && publicApiUrl.protocol !== "https:")
			return [];

		const sources = [publicApiUrl.origin];

		if (loopbackHosts.has(publicApiUrl.hostname))
			sources.push(`${publicApiUrl.protocol}//${publicApiUrl.hostname}:*`);

		return sources;
	}
	catch {
		return [];
	}
}

export function collectTrustedInlineScriptHashes(html: string) {
	const hashes = new Set<string>();

	for (const match of html.matchAll(inlineScriptPattern)) {
		const script = {
			attributes: match[1] ?? "",
			body: match[2] ?? "",
		};

		if (!isTrustedInlineScript(script))
			continue;

		hashes.add(`sha256-${createHash("sha256").update(script.body).digest("base64")}`);
	}

	return Array.from(hashes);
}

export function buildContentSecurityPolicy({
	analyticsOrigins,
	inlineScriptHashes = [],
	publicApiBase,
}: ContentSecurityPolicyOptions) {
	const scriptHashes = inlineScriptHashes.map(hash => `'${hash}'`);

	return [
		"base-uri 'self'",
		`connect-src ${uniqueSourceList("'self'", ...resolveContentSecurityPolicyApiSources(publicApiBase), ...analyticsOrigins)}`,
		"default-src 'self'",
		"font-src 'self' data:",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"frame-src 'none'",
		"img-src 'self' data: blob: https:",
		"manifest-src 'self'",
		"object-src 'none'",
		`script-src ${uniqueSourceList("'self'", ...scriptHashes, ...analyticsOrigins)}`,
		"style-src 'self' 'unsafe-inline'",
		"worker-src 'self' blob:",
	].join("; ");
}
