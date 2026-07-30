import type { H3Event } from "h3";
import { Buffer } from "node:buffer";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { createError } from "h3";
import { useRuntimeConfig } from "#imports";
import { createBoundedRequestThrottle } from "./bounded-request-throttle";
import { isAllowedContactAddressOrigin } from "./contact-origin";
import { getTrustedClientAddress } from "./proxy-address";

export const contactAddressNonceCookieName = "ballot_clarity_contact_nonce";
export const contactAddressNonceHeaderName = "x-ballot-clarity-contact-nonce";

const contactAddressSessionCookieName = "ballot_clarity_contact_session";
const contactAddressSessionMaxAgeSeconds = 10 * 60;
const contactAddressSessionVersion = 1;
const startupContactAddressSessionSecret = randomBytes(32).toString("base64url");
const defaultContactAddressCodes = [
	104,
	101,
	108,
	108,
	111,
	64,
	98,
	97,
	108,
	108,
	111,
	116,
	99,
	108,
	97,
	114,
	105,
	116,
	121,
	46,
	111,
	114,
	103
] as const;

function getPositiveIntegerEnv(name: string, fallback: number) {
	const value = Number(process.env[name]);
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

const contactAddressRateLimiter = createBoundedRequestThrottle({
	maxBuckets: getPositiveIntegerEnv("CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS", 10_000),
	maxRequests: getPositiveIntegerEnv("CONTACT_ADDRESS_RATE_LIMIT_MAX", 12),
	windowMs: getPositiveIntegerEnv("CONTACT_ADDRESS_RATE_LIMIT_WINDOW_MS", 60 * 1000)
});

interface ContactAddressSessionPayload {
	expiresAt: number;
	nonceHash: string;
	version: typeof contactAddressSessionVersion;
}

interface CookieOptions {
	httpOnly?: boolean;
	maxAge?: number;
	path?: string;
	sameSite?: "lax" | "strict" | "none";
	secure?: boolean;
}

function decodeCharacterCodes(codes: readonly number[]) {
	return String.fromCharCode(...codes);
}

function constantTimeEqual(left: string, right: string) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length)
		return false;

	return timingSafeEqual(leftBuffer, rightBuffer);
}

function hashNonce(nonce: string) {
	return createHash("sha256").update(nonce).digest("base64url");
}

function signPayload(payload: string, sessionSecret: string) {
	return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function serializeSession(payload: ContactAddressSessionPayload, sessionSecret: string) {
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = signPayload(encodedPayload, sessionSecret);

	return `${encodedPayload}.${signature}`;
}

function parseSession(rawValue: string | undefined, sessionSecret: string) {
	if (!rawValue || rawValue.length > 2048)
		return null;

	const tokenParts = rawValue.split(".");

	if (tokenParts.length !== 2)
		return null;

	const [encodedPayload, signature] = tokenParts;

	if (
		!encodedPayload
		|| encodedPayload.length > 1024
		|| !/^[\w-]+$/u.test(encodedPayload)
		|| !signature
		|| !/^[\w-]{43}$/u.test(signature)
	) {
		return null;
	}

	const expectedSignature = signPayload(encodedPayload, sessionSecret);

	if (!constantTimeEqual(signature, expectedSignature))
		return null;

	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<ContactAddressSessionPayload>;

		if (
			payload.version !== contactAddressSessionVersion
			|| typeof payload.expiresAt !== "number"
			|| !Number.isSafeInteger(payload.expiresAt)
			|| typeof payload.nonceHash !== "string"
			|| !/^[\w-]{43}$/u.test(payload.nonceHash)
		) {
			return null;
		}

		if (payload.expiresAt <= Date.now())
			return null;

		return payload as ContactAddressSessionPayload;
	}
	catch {
		return null;
	}
}

function getNodeRequestHeader(event: H3Event, name: string) {
	const value = event.node?.req.headers[name.toLowerCase()];

	if (Array.isArray(value))
		return value.join(", ");

	return value;
}

function getFirstHeaderValue(value: string | undefined) {
	return value?.split(",")[0]?.trim() || "";
}

function getNodeRequestURL(event: H3Event) {
	const host = getFirstHeaderValue(getNodeRequestHeader(event, "x-forwarded-host"))
		|| getFirstHeaderValue(getNodeRequestHeader(event, "host"))
		|| "localhost";
	const forwardedProto = getFirstHeaderValue(getNodeRequestHeader(event, "x-forwarded-proto"));
	const socket = event.node.req.socket;
	const protocol = forwardedProto || ("encrypted" in socket && socket.encrypted ? "https" : "http");
	const rawUrl = event.node?.req.url || "/";

	try {
		return new URL(rawUrl, `${protocol}://${host}`);
	}
	catch {
		return new URL("/", `${protocol}://${host}`);
	}
}

function setNodeResponseHeader(event: H3Event, name: string, value: string) {
	event.node?.res.setHeader(name, value);
}

function setNodeResponseStatus(event: H3Event, statusCode: number, statusMessage: string) {
	if (!event.node?.res)
		return;

	event.node.res.statusCode = statusCode;
	event.node.res.statusMessage = statusMessage;
}

function getNodeCookie(event: H3Event, name: string) {
	const cookieHeader = getNodeRequestHeader(event, "cookie");

	if (!cookieHeader)
		return undefined;

	for (const part of cookieHeader.split(";")) {
		const [rawName, ...rawValueParts] = part.trim().split("=");

		if (rawName !== name)
			continue;

		const rawValue = rawValueParts.join("=");

		try {
			return decodeURIComponent(rawValue);
		}
		catch {
			return rawValue;
		}
	}

	return undefined;
}

function serializeCookie(name: string, value: string, options: CookieOptions) {
	const parts = [`${name}=${encodeURIComponent(value)}`];

	if (typeof options.maxAge === "number")
		parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);

	if (options.path)
		parts.push(`Path=${options.path}`);

	if (options.sameSite)
		parts.push(`SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`);

	if (options.httpOnly)
		parts.push("HttpOnly");

	if (options.secure)
		parts.push("Secure");

	return parts.join("; ");
}

function setNodeCookie(event: H3Event, name: string, value: string, options: CookieOptions) {
	const response = event.node?.res;

	if (!response)
		return;

	const serialized = serializeCookie(name, value, options);
	const existing = response.getHeader("Set-Cookie");
	const cookies = Array.isArray(existing)
		? existing.map(String)
		: existing
			? [String(existing)]
			: [];

	response.setHeader("Set-Cookie", [...cookies, serialized]);
}

function getContactAddressSessionSecret(event: H3Event) {
	const runtimeConfig = useRuntimeConfig(event);
	const configuredSecret = process.env.NUXT_CONTACT_ADDRESS_SESSION_SECRET
		|| process.env.CONTACT_ADDRESS_SESSION_SECRET
		|| String(runtimeConfig.contactAddressSessionSecret || "");
	const normalizedSecret = configuredSecret.trim();

	if (process.env.NODE_ENV === "production" && normalizedSecret.length < 32) {
		throw createError({
			statusCode: 503,
			statusMessage: "Protected contact lookup is unavailable."
		});
	}

	return normalizedSecret || startupContactAddressSessionSecret;
}

function getConfiguredContactAddress(event: H3Event) {
	const runtimeConfig = useRuntimeConfig(event);
	const configuredAddress = process.env.NUXT_CONTACT_ADDRESS
		|| process.env.CONTACT_ADDRESS
		|| String(runtimeConfig.contactAddress || "");

	return configuredAddress.trim() || decodeCharacterCodes(defaultContactAddressCodes);
}

function getExpectedRequestOrigin(event: H3Event) {
	if (process.env.NODE_ENV !== "production")
		return getNodeRequestURL(event).origin;

	const configuredSiteUrl = String(useRuntimeConfig(event).public.siteUrl || "").trim();

	try {
		return new URL(configuredSiteUrl).origin;
	}
	catch {
		throw createError({
			statusCode: 503,
			statusMessage: "Protected contact lookup is unavailable."
		});
	}
}

function getClientRateLimitKey(event: H3Event) {
	return event.node?.req
		? getTrustedClientAddress(event.node.req)
		: "unknown";
}

function enforceSameOrigin(event: H3Event) {
	if (!isAllowedContactAddressOrigin({
		expectedOrigin: getExpectedRequestOrigin(event),
		fetchSite: getNodeRequestHeader(event, "sec-fetch-site"),
		origin: getNodeRequestHeader(event, "origin"),
		production: process.env.NODE_ENV === "production",
		referrer: getNodeRequestHeader(event, "referer"),
	})) {
		throw createError({
			statusCode: 403,
			statusMessage: "Same-origin contact lookup required."
		});
	}
}

function enforceRateLimit(event: H3Event) {
	const key = getClientRateLimitKey(event);
	const throttleState = contactAddressRateLimiter.attempt(key);

	if (throttleState.allowed)
		return;

	setNodeResponseHeader(event, "Retry-After", String(throttleState.retryAfterSeconds));
	throw createError({
		statusCode: 429,
		statusMessage: "Too many contact address requests."
	});
}

function isSecureRequest(event: H3Event) {
	return new URL(getExpectedRequestOrigin(event)).protocol === "https:";
}

function issueContactAddressChallenge(event: H3Event, sessionSecret: string) {
	const nonce = randomBytes(24).toString("base64url");
	const expiresAt = Date.now() + contactAddressSessionMaxAgeSeconds * 1000;
	const session = serializeSession({
		expiresAt,
		nonceHash: hashNonce(nonce),
		version: contactAddressSessionVersion
	}, sessionSecret);
	const secure = isSecureRequest(event);

	setNodeCookie(event, contactAddressSessionCookieName, session, {
		httpOnly: true,
		maxAge: contactAddressSessionMaxAgeSeconds,
		path: "/",
		sameSite: "strict",
		secure
	});
	setNodeCookie(event, contactAddressNonceCookieName, nonce, {
		httpOnly: false,
		maxAge: contactAddressSessionMaxAgeSeconds,
		path: "/",
		sameSite: "strict",
		secure
	});
}

function isVerifiedContactAddressRequest(event: H3Event, sessionSecret: string) {
	const submittedNonce = getNodeRequestHeader(event, contactAddressNonceHeaderName)?.trim();
	const session = parseSession(getNodeCookie(event, contactAddressSessionCookieName), sessionSecret);

	if (!submittedNonce || !session)
		return false;

	return constantTimeEqual(hashNonce(submittedNonce), session.nonceHash);
}

export function getProtectedContactAddress(event: H3Event) {
	setNodeResponseHeader(event, "Cache-Control", "no-store, private");
	setNodeResponseHeader(event, "Vary", "Cookie, Origin, Referer, Sec-Fetch-Site, X-Ballot-Clarity-Contact-Nonce");

	enforceSameOrigin(event);
	enforceRateLimit(event);

	const sessionSecret = getContactAddressSessionSecret(event);

	if (!isVerifiedContactAddressRequest(event, sessionSecret)) {
		issueContactAddressChallenge(event, sessionSecret);
		setNodeResponseStatus(event, 202, "Contact address challenge issued.");
		return {
			address: null,
			challenge: "contact_nonce_required"
		};
	}

	return {
		address: getConfiguredContactAddress(event)
	};
}
