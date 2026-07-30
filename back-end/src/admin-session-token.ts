import type { AdminUserRole } from "./types/civic.js";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

const adminUsernamePattern = /^[a-z\d](?:[a-z\d._-]{0,62}[a-z\d])?$/u;

export interface AdminSessionTokenPayload {
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

function signPayload(payload: string, sessionSecret: string) {
	return createHmac("sha256", sessionSecret).update(payload).digest("hex");
}

export function parseAdminSessionToken(rawValue: string | undefined, sessionSecret: string) {
	if (!rawValue || rawValue.length > 4096 || !sessionSecret)
		return null;

	const [encodedPayload, signature, ...extraParts] = rawValue.split(".");

	if (
		!encodedPayload
		|| encodedPayload.length > 3072
		|| !/^[\w-]+$/u.test(encodedPayload)
		|| !signature
		|| !/^[a-f\d]{64}$/u.test(signature)
		|| extraParts.length
	) {
		return null;
	}

	const expectedSignature = signPayload(encodedPayload, sessionSecret);

	if (!constantTimeEqual(signature, expectedSignature))
		return null;

	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AdminSessionTokenPayload>;

		if (
			typeof payload.username !== "string"
			|| !adminUsernamePattern.test(payload.username)
			|| typeof payload.displayName !== "string"
			|| !payload.displayName.trim()
			|| payload.displayName.length > 200
			|| typeof payload.credentialsUpdatedAt !== "string"
			|| payload.credentialsUpdatedAt.length > 64
			|| !Number.isFinite(Date.parse(payload.credentialsUpdatedAt))
			|| (payload.role !== "admin" && payload.role !== "editor")
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

		return payload as AdminSessionTokenPayload;
	}
	catch {
		return null;
	}
}
