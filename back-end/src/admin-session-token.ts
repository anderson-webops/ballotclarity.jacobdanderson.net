import type { AdminUserRole } from "./types/civic.js";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface AdminSessionTokenPayload {
	credentialsUpdatedAt: string;
	displayName: string;
	expiresAt: number;
	mfaEnabledAt?: string;
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
	if (!rawValue || !sessionSecret)
		return null;

	const [encodedPayload, signature, ...extraParts] = rawValue.split(".");

	if (!encodedPayload || !signature || extraParts.length)
		return null;

	const expectedSignature = signPayload(encodedPayload, sessionSecret);

	if (!constantTimeEqual(signature, expectedSignature))
		return null;

	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AdminSessionTokenPayload>;

		if (
			!payload.username
			|| !payload.displayName
			|| !payload.credentialsUpdatedAt
			|| (payload.role !== "admin" && payload.role !== "editor")
			|| typeof payload.expiresAt !== "number"
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
