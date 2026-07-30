import type { H3Event } from "h3";
import process from "node:process";
import { createError, defineEventHandler, getHeader, getRequestURL, setResponseHeader } from "h3";
import { useRuntimeConfig } from "#imports";
import { isAllowedAdminMutationOrigin } from "../utils/admin-origin";

const stateChangingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

function configuredSiteOrigin(event: H3Event) {
	const configuredSiteUrl = String(useRuntimeConfig(event).public.siteUrl || "").trim();

	if (configuredSiteUrl) {
		try {
			return new URL(configuredSiteUrl).origin;
		}
		catch {}
	}

	if (process.env.NODE_ENV === "production")
		return "";

	return getRequestURL(event).origin;
}

function requestOrigin(event: H3Event) {
	return getHeader(event, "origin") || "";
}

export default defineEventHandler((event) => {
	const pathname = getRequestURL(event).pathname;

	if (!pathname.startsWith("/api/admin"))
		return;

	setResponseHeader(event, "cache-control", "no-store, private");

	if (!stateChangingMethods.has(event.method))
		return;

	const fetchSite = getHeader(event, "sec-fetch-site") || "";
	const origin = requestOrigin(event);
	const expectedOrigin = configuredSiteOrigin(event);

	if (!isAllowedAdminMutationOrigin({
		expectedOrigin,
		fetchSite,
		origin,
		production: process.env.NODE_ENV === "production",
	})) {
		throw createError({
			statusCode: 403,
			statusMessage: "Same-origin admin request required."
		});
	}
});
