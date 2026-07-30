import { isIP } from "node:net";

const maximumPublicHrefLength = 8_192;
const localHostnameSuffixes = [".internal", ".local", ".localhost"];

export function hasUnsafeHrefCharacters(value: string) {
	return [...value].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127 || character === "\\";
	});
}

function isPrivateIpv4(hostname: string) {
	const parts = hostname.split(".").map(part => Number(part));

	if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
		return false;

	const first = parts[0] ?? -1;
	const second = parts[1] ?? -1;

	return first === 0
		|| first === 10
		|| first === 127
		|| (first === 100 && second >= 64 && second <= 127)
		|| (first === 169 && second === 254)
		|| (first === 172 && second >= 16 && second <= 31)
		|| (first === 192 && second === 0)
		|| (first === 192 && second === 168)
		|| first >= 224;
}

function isPrivateIpv6(hostname: string) {
	const normalized = hostname.toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "");

	return normalized === "::"
		|| normalized === "::1"
		|| normalized.startsWith("fc")
		|| normalized.startsWith("fd")
		|| /^fe[89ab]/u.test(normalized)
		|| normalized.startsWith("::ffff:");
}

export function isPublicHostname(rawHostname: string) {
	const hostname = rawHostname.toLowerCase().replace(/\.$/u, "").replace(/^\[/u, "").replace(/\]$/u, "");

	if (!hostname || hostname === "localhost" || localHostnameSuffixes.some(suffix => hostname.endsWith(suffix)))
		return false;

	const addressFamily = isIP(hostname);

	if (addressFamily === 4)
		return !isPrivateIpv4(hostname);

	if (addressFamily === 6)
		return !isPrivateIpv6(hostname);

	return true;
}

function hasUnsafePath(value: string) {
	let candidate = value.split(/[?#]/u, 1)[0] ?? "";

	for (let attempt = 0; attempt < 4; attempt += 1) {
		if (hasUnsafeHrefCharacters(candidate))
			return true;

		if (candidate.split("/").includes(".."))
			return true;

		let decoded: string;

		try {
			decoded = decodeURIComponent(candidate);
		}
		catch {
			return true;
		}

		if (decoded === candidate)
			return false;

		candidate = decoded;
	}

	return hasUnsafeHrefCharacters(candidate) || candidate.split("/").includes("..");
}

export function normalizePublicHref(value: unknown) {
	if (typeof value !== "string")
		return "";

	const href = value.trim();

	if (!href || href.length > maximumPublicHrefLength || hasUnsafeHrefCharacters(href) || hasUnsafePath(href))
		return "";

	if (href.startsWith("#"))
		return href;

	if (href.startsWith("/")) {
		if (href.startsWith("//"))
			return "";

		try {
			const parsed = new URL(href, "https://ballotclarity.invalid");

			if (parsed.origin !== "https://ballotclarity.invalid")
				return "";

			return `${parsed.pathname}${parsed.search}${parsed.hash}`;
		}
		catch {
			return "";
		}
	}

	let parsed: URL;

	try {
		parsed = new URL(href);
	}
	catch {
		return "";
	}

	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:")
		|| parsed.username
		|| parsed.password
		|| !isPublicHostname(parsed.hostname)
	) {
		return "";
	}

	return parsed.href;
}
