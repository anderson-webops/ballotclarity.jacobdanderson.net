const localHostnameSuffixes = [".internal", ".local", ".localhost"];
const maximumExternalHrefLength = 8_192;

function hasUnsafeHrefCharacters(value: string) {
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

function isPublicHostname(rawHostname: string) {
	const hostname = rawHostname.toLowerCase().replace(/\.$/u, "").replace(/^\[/u, "").replace(/\]$/u, "");

	if (!hostname || hostname === "localhost" || localHostnameSuffixes.some(suffix => hostname.endsWith(suffix)))
		return false;

	if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname))
		return !isPrivateIpv4(hostname);

	if (hostname.includes(":"))
		return !isPrivateIpv6(hostname);

	return true;
}

export function normalizeExternalHref(value: string | null | undefined) {
	if (typeof value !== "string")
		return "";

	const href = value.trim();

	if (!href || href.length > maximumExternalHrefLength || hasUnsafeHrefCharacters(href))
		return "";

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

export function normalizePublicHref(value: string | null | undefined) {
	if (typeof value !== "string")
		return "";

	const href = value.trim();

	if (!href || href.length > maximumExternalHrefLength || hasUnsafeHrefCharacters(href))
		return "";

	if (href.startsWith("#"))
		return href;

	if (!href.startsWith("/"))
		return normalizeExternalHref(href);

	if (href.startsWith("//"))
		return "";

	let candidate = href.split(/[?#]/u, 1)[0] ?? "";

	for (let attempt = 0; attempt < 4; attempt += 1) {
		if (hasUnsafeHrefCharacters(candidate) || candidate.split("/").includes(".."))
			return "";

		let decoded: string;

		try {
			decoded = decodeURIComponent(candidate);
		}
		catch {
			return "";
		}

		if (decoded === candidate)
			break;

		candidate = decoded;
	}

	if (hasUnsafeHrefCharacters(candidate) || candidate.split("/").includes(".."))
		return "";

	try {
		const parsed = new URL(href, "https://ballotclarity.invalid");

		return parsed.origin === "https://ballotclarity.invalid"
			? `${parsed.pathname}${parsed.search}${parsed.hash}`
			: "";
	}
	catch {
		return "";
	}
}

export function normalizeImageHref(value: string | null | undefined) {
	const href = normalizePublicHref(value);
	return href && !href.startsWith("#") ? href : "";
}

export function isExternalHref(href: string): boolean {
	return Boolean(normalizeExternalHref(href));
}
