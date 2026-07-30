export interface AdminMutationOriginInput {
	expectedOrigin: string;
	fetchSite?: string;
	origin?: string;
	production: boolean;
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

export function isAllowedAdminMutationOrigin({
	expectedOrigin,
	fetchSite = "",
	origin = "",
	production,
}: AdminMutationOriginInput) {
	const parsedExpectedOrigin = parseOrigin(expectedOrigin);

	if (!parsedExpectedOrigin.present || !parsedExpectedOrigin.value)
		return false;

	const normalizedFetchSite = fetchSite.trim().toLowerCase();

	if (normalizedFetchSite && !["none", "same-origin"].includes(normalizedFetchSite))
		return false;

	const parsedOrigin = parseOrigin(origin);

	if (
		parsedOrigin.present
		&& (!parsedOrigin.value || parsedOrigin.value !== parsedExpectedOrigin.value)
	) {
		return false;
	}

	return !production || Boolean(parsedOrigin.value) || normalizedFetchSite === "same-origin";
}
