const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const displayTimeZoneCookieName = "ballot-clarity-display-time-zone";
export const displayTimeZoneHtmlAttribute = "data-display-time-zone";

export function parseDateInput(value: string) {
	if (isoDatePattern.test(value)) {
		const parts = value.split("-");
		const year = Number(parts[0]);
		const month = Number(parts[1]);
		const day = Number(parts[2]);
		return new Date(Date.UTC(year, month - 1, day, 12));
	}

	return new Date(value);
}

export function normalizeDisplayTimeZone(value: string | null | undefined) {
	if (!value)
		return null;

	try {
		return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
	}
	catch {
		return null;
	}
}

export function detectBrowserDisplayTimeZone() {
	try {
		return normalizeDisplayTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
	}
	catch {
		return null;
	}
}

export function readDisplayTimeZoneFromDocument(doc: Pick<Document, "documentElement"> = document) {
	return normalizeDisplayTimeZone(doc.documentElement.getAttribute(displayTimeZoneHtmlAttribute));
}

export function writeDisplayTimeZoneToDocument(doc: Pick<Document, "documentElement"> = document, timeZone: string) {
	const normalizedTimeZone = normalizeDisplayTimeZone(timeZone);

	if (!normalizedTimeZone)
		return null;

	doc.documentElement.setAttribute(displayTimeZoneHtmlAttribute, normalizedTimeZone);
	return normalizedTimeZone;
}

function buildIntlTimeZoneOption(timeZone: string | null | undefined) {
	return timeZone ? { timeZone } : {};
}

export function formatCivicDate(value: string, timeZone: string | null | undefined) {
	return new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		month: "long",
		...buildIntlTimeZoneOption(timeZone),
		year: "numeric",
	}).format(parseDateInput(value));
}

export function formatCivicDateTime(value: string, timeZone: string | null | undefined) {
	return new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		month: "short",
		...buildIntlTimeZoneOption(timeZone),
		year: "numeric",
	}).format(parseDateInput(value));
}

export function buildPreHydrationDisplayTimeZoneScript() {
	return "(function(){try{var timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(!timezone)return;document.documentElement.setAttribute(\"data-display-time-zone\",timezone);document.cookie=\"ballot-clarity-display-time-zone=\"+encodeURIComponent(timezone)+\"; path=/; max-age=31536000; samesite=lax\";}catch{}})();";
}
