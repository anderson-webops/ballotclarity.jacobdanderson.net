export interface ContactAddressOriginInput {
	expectedOrigin: string;
	fetchSite?: string;
	origin?: string;
	production: boolean;
	referrer?: string;
}

function parseOrigin(value: string) {
	const normalizedValue = value.trim();

	if (!normalizedValue)
		return { present: false, value: "" };

	try {
		return { present: true, value: new URL(normalizedValue).origin };
	}
	catch {
		return { present: true, value: null };
	}
}

export function isAllowedContactAddressOrigin({
	expectedOrigin,
	fetchSite = "",
	origin = "",
	production,
	referrer = "",
}: ContactAddressOriginInput) {
	const parsedExpectedOrigin = parseOrigin(expectedOrigin);

	if (!parsedExpectedOrigin.present || !parsedExpectedOrigin.value)
		return false;

	const normalizedFetchSite = fetchSite.trim().toLowerCase();

	if (normalizedFetchSite && !["none", "same-origin"].includes(normalizedFetchSite))
		return false;

	let hasMatchingOrigin = false;

	for (const candidate of [origin, referrer]) {
		const parsedCandidate = parseOrigin(candidate);

		if (!parsedCandidate.present)
			continue;

		if (!parsedCandidate.value || parsedCandidate.value !== parsedExpectedOrigin.value)
			return false;

		hasMatchingOrigin = true;
	}

	return !production || hasMatchingOrigin || normalizedFetchSite === "same-origin";
}
