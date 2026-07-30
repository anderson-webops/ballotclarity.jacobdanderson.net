export interface AdminMutationOriginInput {
	expectedOrigin: string;
	fetchSite?: string;
	origin?: string;
	production: boolean;
}

export function isAllowedAdminMutationOrigin({
	expectedOrigin,
	fetchSite = "",
	origin = "",
	production,
}: AdminMutationOriginInput) {
	const normalizedFetchSite = fetchSite.trim().toLowerCase();

	if (normalizedFetchSite && !["none", "same-origin"].includes(normalizedFetchSite))
		return false;

	if (origin && origin !== expectedOrigin)
		return false;

	return !production || Boolean(origin) || normalizedFetchSite === "same-origin";
}
