import { defaultRequestTimeoutMs } from "./request-timeout";

export const contactAddressEndpoint = "/api/contact-address";
export const contactAddressNonceCookieName = "ballot_clarity_contact_nonce";
export const contactAddressNonceHeaderName = "x-ballot-clarity-contact-nonce";

interface ContactAddressResponse {
	address?: unknown;
}

type ContactAddressFetcher = typeof fetch;
type ContactAddressCookieReader = () => string;

function normalizeSubject(subject?: string) {
	return subject?.trim() || "";
}

export function buildProtectedContactHref(address: string, subject?: string) {
	const normalizedAddress = address.trim();
	const normalizedSubject = normalizeSubject(subject);

	return normalizedSubject
		? `mailto:${normalizedAddress}?subject=${encodeURIComponent(normalizedSubject)}`
		: `mailto:${normalizedAddress}`;
}

export function readContactAddressNonce(cookieSource = globalThis.document?.cookie || "") {
	const prefix = `${contactAddressNonceCookieName}=`;
	const cookie = cookieSource
		.split(";")
		.map(value => value.trim())
		.find(value => value.startsWith(prefix));

	return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

async function fetchContactAddress(fetcher: ContactAddressFetcher, nonce: string) {
	const headers: Record<string, string> = {
		"Accept": "application/json",
		"X-Requested-With": "fetch"
	};

	if (nonce)
		headers[contactAddressNonceHeaderName] = nonce;

	const response = await fetcher(contactAddressEndpoint, {
		cache: "no-store",
		credentials: "same-origin",
		headers,
		signal: AbortSignal.timeout(defaultRequestTimeoutMs)
	});

	if (!response.ok)
		return null;

	const payload = await response.json() as ContactAddressResponse;
	const address = typeof payload.address === "string" ? payload.address.trim() : "";

	return address || null;
}

export async function requestProtectedContactAddress(
	fetcher: ContactAddressFetcher = globalThis.fetch,
	readCookie: ContactAddressCookieReader = () => globalThis.document?.cookie || ""
) {
	const firstAttempt = await fetchContactAddress(fetcher, readContactAddressNonce(readCookie()));

	if (firstAttempt)
		return firstAttempt;

	const secondAttempt = await fetchContactAddress(fetcher, readContactAddressNonce(readCookie()));

	if (secondAttempt)
		return secondAttempt;

	throw new Error("Contact address is unavailable.");
}
