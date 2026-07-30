import type { H3Event } from "h3";
import type {
	AdminAuditResponse,
	AdminContentHistoryResponse,
	AdminContentResponse,
	AdminCorrectionsResponse,
	AdminMfaSetupResponse,
	AdminOverviewResponse,
	AdminReviewResponse,
	AdminSessionResponse,
	AdminSourceMonitorResponse,
	AdminUserRole,
	AdminUsersResponse,
	GuidePackageDiagnosticsResponse,
	GuidePackageListResponse,
	GuidePackageRecordResponse,
} from "~/types/civic";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { createError, deleteCookie, getCookie, setCookie } from "h3";
import { $fetch, FetchError } from "ofetch";
import { useRuntimeConfig } from "#imports";
import { resolveRequestTimeoutMs } from "~/utils/request-timeout";
import { readBoundedJsonRequestBody } from "./bounded-json-body";
import { buildForwardedForHeader } from "./proxy-address";

const adminCookieName = process.env.NODE_ENV === "production"
	? "__Host-ballot_clarity_admin_session"
	: "ballot_clarity_admin_session";
const adminSessionMaxAge = 60 * 60 * 12;
const adminSessionTokenHeaderName = "x-admin-session-token";
const adminUsernamePattern = /^[a-z\d](?:[a-z\d._-]{0,62}[a-z\d])?$/u;

interface AdminConfig {
	apiBase: string;
	apiKey: string;
	requestTimeoutMs: number;
	sessionSecret: string;
}

interface BackendLoginResponse {
	authenticated: boolean;
	configured: boolean;
	credentialsUpdatedAt?: string;
	displayName: string | null;
	mfaEnabledAt?: string;
	mfaRequired?: boolean;
	passwordChangeRequiredAt?: string;
	role: AdminUserRole | null;
	username: string | null;
}

type BackendSessionResponse = BackendLoginResponse;

interface CompleteBackendSessionResponse extends BackendLoginResponse {
	credentialsUpdatedAt: string;
	displayName: string;
	mfaEnabledAt?: string;
	passwordChangeRequiredAt?: string;
	role: AdminUserRole;
	username: string;
}

interface AdminSessionPayload {
	credentialsUpdatedAt: string;
	displayName: string;
	expiresAt: number;
	mfaEnabledAt?: string;
	passwordChangeRequiredAt?: string;
	role: AdminUserRole;
	username: string;
}

function constantTimeEqual(left: string, right: string) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length)
		return false;

	return timingSafeEqual(leftBuffer, rightBuffer);
}

function getAdminConfig(event: H3Event): AdminConfig {
	const runtimeConfig = useRuntimeConfig(event);

	return {
		apiBase: process.env.NUXT_ADMIN_API_BASE || process.env.ADMIN_API_BASE || String(runtimeConfig.adminApiBase || ""),
		apiKey: process.env.NUXT_ADMIN_API_KEY || process.env.ADMIN_API_KEY || String(runtimeConfig.adminApiKey || ""),
		requestTimeoutMs: resolveRequestTimeoutMs(
			process.env.ADMIN_API_FETCH_TIMEOUT_MS || Number(runtimeConfig.adminApiFetchTimeoutMs)
		),
		sessionSecret: process.env.NUXT_ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || String(runtimeConfig.adminSessionSecret || "")
	};
}

function isAdminConfigured(config: AdminConfig) {
	return Boolean(config.apiBase && config.apiKey && config.sessionSecret);
}

function normalizeHeaderValue(value: string | string[] | undefined) {
	return Array.isArray(value) ? value.join(", ") : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAdminUsername(value: unknown) {
	const username = typeof value === "string" ? value.trim().toLowerCase() : "";

	if (!adminUsernamePattern.test(username)) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin username is invalid."
		});
	}

	return username;
}

export function parseAdminPassword(value: unknown, fieldLabel: string) {
	const password = typeof value === "string" ? value : "";

	if (!password || password.length > 256 || password.includes("\0")) {
		throw createError({
			statusCode: 400,
			statusMessage: `${fieldLabel} is invalid.`
		});
	}

	return password;
}

export function parseAdminMfaCode(value: unknown, options: { required?: boolean } = {}) {
	if ((value === undefined || value === "") && !options.required)
		return undefined;

	const code = typeof value === "string" ? value.replace(/\s+/gu, "") : "";

	if (!/^\d{6}$/u.test(code)) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin verification code must contain exactly six digits."
		});
	}

	return code;
}

function parseAdminMfaSecret(value: unknown) {
	const secret = typeof value === "string" ? value.trim().toUpperCase() : "";

	if (!/^[A-Z2-7]{32}$/u.test(secret)) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin MFA secret is invalid."
		});
	}

	return secret;
}

function getForwardHeaders(event: H3Event, extraHeaders: Record<string, string> = {}) {
	const request = event.node?.req;
	const forwardedFor = request ? buildForwardedForHeader(request) : undefined;
	const userAgent = normalizeHeaderValue(request?.headers["user-agent"]);
	const requestId = normalizeHeaderValue(request?.headers["x-request-id"]);

	return {
		...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
		...(requestId ? { "x-request-id": requestId } : {}),
		...(userAgent ? { "user-agent": userAgent } : {}),
		...extraHeaders
	};
}

function getAdminDelegationHeaders(event: H3Event): Record<string, string> {
	const session = getAdminSession(event);
	const sessionToken = getCookie(event, adminCookieName);

	if (!session.authenticated || !sessionToken)
		return {};

	return {
		[adminSessionTokenHeaderName]: sessionToken
	};
}

export async function readAdminRequestBody(event: H3Event) {
	const body = await readBoundedJsonRequestBody(event);

	if (!isRecord(body)) {
		throw createError({
			statusCode: 400,
			statusMessage: "JSON request body is required."
		});
	}

	return body;
}

function signPayload(payload: string, sessionSecret: string) {
	return createHmac("sha256", sessionSecret).update(payload).digest("hex");
}

function serializeSession(payload: AdminSessionPayload, sessionSecret: string) {
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = signPayload(encodedPayload, sessionSecret);

	return `${encodedPayload}.${signature}`;
}

function isCompleteBackendSession(response: BackendLoginResponse): response is CompleteBackendSessionResponse {
	return Boolean(
		response.authenticated
		&& response.username
		&& response.displayName
		&& response.role
		&& response.credentialsUpdatedAt
	);
}

function setAdminSessionCookie(event: H3Event, sessionResponse: CompleteBackendSessionResponse, sessionSecret: string) {
	const serializedSession = serializeSession({
		credentialsUpdatedAt: sessionResponse.credentialsUpdatedAt,
		displayName: sessionResponse.displayName,
		expiresAt: Date.now() + (adminSessionMaxAge * 1000),
		mfaEnabledAt: sessionResponse.mfaEnabledAt,
		passwordChangeRequiredAt: sessionResponse.passwordChangeRequiredAt,
		role: sessionResponse.role,
		username: sessionResponse.username
	}, sessionSecret);

	setCookie(event, adminCookieName, serializedSession, {
		httpOnly: true,
		maxAge: adminSessionMaxAge,
		path: "/",
		sameSite: "strict",
		secure: process.env.NODE_ENV === "production"
	});
}

function deleteAdminSessionCookie(event: H3Event) {
	deleteCookie(event, adminCookieName, {
		httpOnly: true,
		path: "/",
		sameSite: "strict",
		secure: process.env.NODE_ENV === "production"
	});
}

function parseSession(rawValue: string | undefined, sessionSecret: string) {
	if (!rawValue || rawValue.length > 4096)
		return null;

	const tokenParts = rawValue.split(".");

	if (tokenParts.length !== 2)
		return null;

	const [encodedPayload, signature] = tokenParts;

	if (
		!encodedPayload
		|| encodedPayload.length > 3072
		|| !/^[\w-]+$/u.test(encodedPayload)
		|| !signature
		|| !/^[a-f\d]{64}$/u.test(signature)
	) {
		return null;
	}

	const expectedSignature = signPayload(encodedPayload, sessionSecret);

	if (!constantTimeEqual(signature, expectedSignature))
		return null;

	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;

		if (
			typeof payload.username !== "string"
			|| !adminUsernamePattern.test(payload.username)
			|| typeof payload.displayName !== "string"
			|| !payload.displayName.trim()
			|| payload.displayName.length > 200
			|| (payload.role !== "admin" && payload.role !== "editor")
			|| typeof payload.credentialsUpdatedAt !== "string"
			|| payload.credentialsUpdatedAt.length > 64
			|| !Number.isFinite(Date.parse(payload.credentialsUpdatedAt))
			|| typeof payload.expiresAt !== "number"
			|| !Number.isSafeInteger(payload.expiresAt)
			|| (payload.mfaEnabledAt !== undefined && (
				typeof payload.mfaEnabledAt !== "string"
				|| payload.mfaEnabledAt.length > 64
				|| !Number.isFinite(Date.parse(payload.mfaEnabledAt))
			))
			|| (payload.passwordChangeRequiredAt !== undefined && (
				typeof payload.passwordChangeRequiredAt !== "string"
				|| payload.passwordChangeRequiredAt.length > 64
				|| !Number.isFinite(Date.parse(payload.passwordChangeRequiredAt))
			))
		) {
			return null;
		}

		if (payload.expiresAt <= Date.now())
			return null;

		return payload as AdminSessionPayload;
	}
	catch {
		return null;
	}
}

export function getAdminSession(event: H3Event): AdminSessionResponse {
	const config = getAdminConfig(event);

	if (!isAdminConfigured(config)) {
		return {
			authenticated: false,
			configured: false,
			displayName: null,
			role: null,
			username: null
		};
	}

	const cookieValue = getCookie(event, adminCookieName);
	const session = parseSession(cookieValue, config.sessionSecret);

	if (!session) {
		return {
			authenticated: false,
			configured: true,
			displayName: null,
			role: null,
			username: null
		};
	}

	return {
		authenticated: true,
		configured: true,
		credentialsUpdatedAt: session.credentialsUpdatedAt,
		displayName: session.displayName,
		mfaEnabledAt: session.mfaEnabledAt,
		passwordChangeRequiredAt: session.passwordChangeRequiredAt,
		role: session.role,
		username: session.username
	};
}

function buildAdminSessionResponse(response: CompleteBackendSessionResponse): AdminSessionResponse {
	return {
		authenticated: true,
		configured: true,
		credentialsUpdatedAt: response.credentialsUpdatedAt,
		displayName: response.displayName,
		mfaEnabledAt: response.mfaEnabledAt,
		passwordChangeRequiredAt: response.passwordChangeRequiredAt,
		role: response.role,
		username: response.username
	};
}

export function requireAdminSession(event: H3Event) {
	const session = getAdminSession(event);

	if (!session.configured) {
		throw createError({
			statusCode: 503,
			statusMessage: "Admin portal is not configured."
		});
	}

	if (!session.authenticated) {
		throw createError({
			statusCode: 401,
			statusMessage: "Admin authentication required."
		});
	}

	return session;
}

export async function getValidatedAdminSession(event: H3Event): Promise<AdminSessionResponse> {
	const session = getAdminSession(event);

	if (!session.configured || !session.authenticated || !session.username)
		return session;

	const config = getAdminConfig(event);
	const searchParams = new URLSearchParams({
		credentialsUpdatedAt: session.credentialsUpdatedAt || ""
	});

	try {
		const backendSession = await $fetch<BackendSessionResponse>(
			`${config.apiBase}/admin/auth/session/${encodeURIComponent(session.username)}?${searchParams.toString()}`,
			{
				headers: getForwardHeaders(event, {
					"x-admin-api-key": config.apiKey
				}),
				timeout: config.requestTimeoutMs
			}
		);

		if (backendSession.authenticated && backendSession.credentialsUpdatedAt)
			return backendSession;
	}
	catch (error) {
		if (!(error instanceof FetchError) || error.statusCode !== 401)
			throw error;
	}

	deleteAdminSessionCookie(event);

	return {
		authenticated: false,
		configured: true,
		displayName: null,
		role: null,
		username: null
	};
}

export async function requireActiveAdminSession(event: H3Event) {
	const session = await getValidatedAdminSession(event);

	if (!session.configured) {
		throw createError({
			statusCode: 503,
			statusMessage: "Admin portal is not configured."
		});
	}

	if (!session.authenticated) {
		throw createError({
			statusCode: 401,
			statusMessage: "Admin authentication required."
		});
	}

	return session;
}

async function requirePrivilegedAdminSession(event: H3Event) {
	const session = await requireActiveAdminSession(event);

	if (session.role !== "admin") {
		throw createError({
			statusCode: 403,
			statusMessage: "Only admin users can perform this action."
		});
	}

	if (!session.mfaEnabledAt) {
		throw createError({
			statusCode: 403,
			statusMessage: "Enable multi-factor authentication before performing this admin action."
		});
	}

	return session;
}

export function clearAdminSession(event: H3Event): AdminSessionResponse {
	const currentSession = getAdminSession(event);

	deleteAdminSessionCookie(event);

	return {
		authenticated: false,
		configured: currentSession.configured,
		displayName: null,
		role: null,
		username: null
	};
}

export async function createAdminSession(event: H3Event, username: string, password: string, mfaCode?: string) {
	const config = getAdminConfig(event);

	if (!isAdminConfigured(config)) {
		throw createError({
			statusCode: 503,
			statusMessage: "Admin portal is not configured."
		});
	}

	let loginResponse: BackendLoginResponse;

	try {
		loginResponse = await $fetch<BackendLoginResponse>(`${config.apiBase}/admin/auth/login`, {
			body: {
				...(mfaCode ? { mfaCode } : {}),
				password,
				username
			},
			headers: getForwardHeaders(event, {
				"x-admin-api-key": config.apiKey
			}),
			method: "POST",
			timeout: config.requestTimeoutMs
		});
	}
	catch (error) {
		if (error instanceof FetchError) {
			throw createError({
				statusCode: error.statusCode || 500,
				statusMessage: error.data?.message || error.statusMessage || "Unable to verify admin credentials."
			});
		}

		throw error;
	}

	if (loginResponse.mfaRequired) {
		return {
			authenticated: false,
			configured: true,
			displayName: null,
			mfaRequired: true,
			role: null,
			username: null
		} satisfies AdminSessionResponse;
	}

	if (!isCompleteBackendSession(loginResponse)) {
		throw createError({
			statusCode: 401,
			statusMessage: "Invalid admin credentials."
		});
	}

	setAdminSessionCookie(event, loginResponse, config.sessionSecret);

	return buildAdminSessionResponse(loginResponse);
}

export async function changeAdminPassword(event: H3Event, body: Record<string, unknown>) {
	const session = await requireActiveAdminSession(event);
	const config = getAdminConfig(event);
	const currentPassword = parseAdminPassword(body.currentPassword, "Current password");
	const newPassword = parseAdminPassword(body.newPassword, "New password");

	if (!session.username) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin username is required."
		});
	}

	let passwordResponse: BackendLoginResponse;

	try {
		passwordResponse = await $fetch<BackendLoginResponse>(`${config.apiBase}/admin/auth/password`, {
			body: {
				currentPassword,
				newPassword,
				username: session.username
			},
			headers: getForwardHeaders(event, {
				...getAdminDelegationHeaders(event),
				"x-admin-api-key": config.apiKey
			}),
			method: "POST",
			timeout: config.requestTimeoutMs
		});
	}
	catch (error) {
		if (error instanceof FetchError) {
			throw createError({
				statusCode: error.statusCode || 500,
				statusMessage: error.data?.message || error.statusMessage || "Unable to change admin password."
			});
		}

		throw error;
	}

	if (!isCompleteBackendSession(passwordResponse)) {
		throw createError({
			statusCode: 500,
			statusMessage: "Password changed, but the updated admin session could not be created."
		});
	}

	setAdminSessionCookie(event, passwordResponse, config.sessionSecret);

	return buildAdminSessionResponse(passwordResponse);
}

export async function createAdminMfaSetup(event: H3Event) {
	const session = await requireActiveAdminSession(event);

	if (!session.username) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin username is required."
		});
	}

	return await fetchAdminApi<AdminMfaSetupResponse>(event, "/admin/auth/mfa/setup", {
		body: {
			username: session.username
		},
		method: "POST"
	});
}

export async function enableAdminMfa(event: H3Event, body: Record<string, unknown>) {
	const session = await requireActiveAdminSession(event);
	const config = getAdminConfig(event);
	const currentPassword = parseAdminPassword(body.currentPassword, "Current password");
	const secret = parseAdminMfaSecret(body.secret);
	const mfaCode = parseAdminMfaCode(body.mfaCode, { required: true });

	if (!session.username) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin username is required."
		});
	}

	const mfaResponse = await fetchAdminApi<BackendLoginResponse>(event, "/admin/auth/mfa/enable", {
		body: {
			currentPassword,
			mfaCode,
			secret,
			username: session.username
		},
		method: "POST"
	});

	if (!isCompleteBackendSession(mfaResponse)) {
		throw createError({
			statusCode: 500,
			statusMessage: "MFA was enabled, but the updated admin session could not be created."
		});
	}

	setAdminSessionCookie(event, mfaResponse, config.sessionSecret);

	return buildAdminSessionResponse(mfaResponse);
}

export async function disableAdminMfa(event: H3Event, body: Record<string, unknown>) {
	const session = await requireActiveAdminSession(event);
	const config = getAdminConfig(event);
	const currentPassword = parseAdminPassword(body.currentPassword, "Current password");
	const mfaCode = parseAdminMfaCode(body.mfaCode, { required: true });

	if (!session.username) {
		throw createError({
			statusCode: 400,
			statusMessage: "Admin username is required."
		});
	}

	const mfaResponse = await fetchAdminApi<BackendLoginResponse>(event, "/admin/auth/mfa/disable", {
		body: {
			currentPassword,
			mfaCode,
			username: session.username
		},
		method: "POST"
	});

	if (!isCompleteBackendSession(mfaResponse)) {
		throw createError({
			statusCode: 500,
			statusMessage: "MFA was disabled, but the updated admin session could not be created."
		});
	}

	setAdminSessionCookie(event, mfaResponse, config.sessionSecret);

	return buildAdminSessionResponse(mfaResponse);
}

async function fetchAdminApi<T>(event: H3Event, path: string, options?: {
	body?: Record<string, unknown>;
	method?: "GET" | "PATCH" | "POST";
}) {
	const config = getAdminConfig(event);

	if (!isAdminConfigured(config)) {
		throw createError({
			statusCode: 503,
			statusMessage: "Admin API proxy is not configured."
		});
	}

	return await $fetch<T>(`${config.apiBase}${path}`, {
		body: options?.body,
		headers: getForwardHeaders(event, {
			...getAdminDelegationHeaders(event),
			"x-admin-api-key": config.apiKey
		}),
		method: options?.method,
		timeout: config.requestTimeoutMs
	});
}

export async function getAdminOverview(event: H3Event) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminOverviewResponse>(event, "/admin/overview");
}

export async function getAdminAudit(event: H3Event) {
	const session = await requireActiveAdminSession(event);

	if (session.role !== "admin") {
		throw createError({
			statusCode: 403,
			statusMessage: "Only admin users can view the immutable audit trail."
		});
	}

	return await fetchAdminApi<AdminAuditResponse>(event, "/admin/audit");
}

export async function getAdminCorrections(event: H3Event) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminCorrectionsResponse>(event, "/admin/corrections");
}

export async function updateAdminCorrection(event: H3Event, id: string, body: Record<string, unknown>) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminCorrectionsResponse>(event, `/admin/corrections/${id}`, {
		body,
		method: "PATCH"
	});
}

export async function getAdminReview(event: H3Event) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminReviewResponse>(event, "/admin/review");
}

export async function getAdminContent(event: H3Event) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminContentResponse>(event, "/admin/content");
}

export async function updateAdminContent(event: H3Event, id: string, body: Record<string, unknown>) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminContentResponse>(event, `/admin/content/${id}`, {
		body,
		method: "PATCH"
	});
}

export async function getAdminContentHistory(event: H3Event, id: string) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminContentHistoryResponse>(event, `/admin/content/${id}/history`);
}

export async function rollbackAdminContent(event: H3Event, id: string, body: Record<string, unknown>) {
	await requirePrivilegedAdminSession(event);
	return await fetchAdminApi<AdminContentResponse>(event, `/admin/content/${id}/rollback`, {
		body,
		method: "POST"
	});
}

export async function getAdminGuidePackages(event: H3Event) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<GuidePackageListResponse>(event, "/admin/packages");
}

export async function getAdminGuidePackage(event: H3Event, id: string) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<GuidePackageRecordResponse>(event, `/admin/packages/${id}`);
}

export async function getAdminGuidePackageDiagnostics(event: H3Event, id: string) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<GuidePackageDiagnosticsResponse>(event, `/admin/packages/${id}/diagnostics`);
}

export async function createAdminGuidePackage(event: H3Event, body: Record<string, unknown>) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<GuidePackageRecordResponse>(event, "/admin/packages", {
		body,
		method: "POST"
	});
}

export async function updateAdminGuidePackage(event: H3Event, id: string, body: Record<string, unknown>) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<GuidePackageRecordResponse>(event, `/admin/packages/${id}`, {
		body,
		method: "PATCH"
	});
}

export async function publishAdminGuidePackage(event: H3Event, id: string, body: Record<string, unknown>) {
	await requirePrivilegedAdminSession(event);
	return await fetchAdminApi<GuidePackageRecordResponse>(event, `/admin/packages/${id}/publish`, {
		body,
		method: "POST"
	});
}

export async function unpublishAdminGuidePackage(event: H3Event, id: string, body: Record<string, unknown>) {
	await requirePrivilegedAdminSession(event);
	return await fetchAdminApi<GuidePackageRecordResponse>(event, `/admin/packages/${id}/unpublish`, {
		body,
		method: "POST"
	});
}

export async function getAdminSourceMonitor(event: H3Event) {
	await requireActiveAdminSession(event);
	return await fetchAdminApi<AdminSourceMonitorResponse>(event, "/admin/sources");
}

export async function updateAdminSource(event: H3Event, id: string, body: Record<string, unknown>) {
	await requirePrivilegedAdminSession(event);
	return await fetchAdminApi<AdminSourceMonitorResponse>(event, `/admin/sources/${id}`, {
		body,
		method: "PATCH"
	});
}

export async function getAdminUsers(event: H3Event) {
	const session = await requireActiveAdminSession(event);

	if (session.role !== "admin") {
		throw createError({
			statusCode: 403,
			statusMessage: "Only admin users can manage accounts."
		});
	}

	return await fetchAdminApi<AdminUsersResponse>(event, "/admin/users");
}

export async function createAdminUser(event: H3Event, body: Record<string, unknown>) {
	await requirePrivilegedAdminSession(event);

	return await fetchAdminApi<AdminUsersResponse>(event, "/admin/users", {
		body,
		method: "POST"
	});
}

export async function updateAdminUser(event: H3Event, id: string, body: Record<string, unknown>) {
	await requirePrivilegedAdminSession(event);

	return await fetchAdminApi<AdminUsersResponse>(event, `/admin/users/${id}`, {
		body,
		method: "PATCH"
	});
}
