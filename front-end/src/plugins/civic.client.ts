import type { CoverageResponse, LocationLookupResponse } from "~/types/civic";
import { canGuessLocationOnLoad } from "~/utils/location-guess";

export default defineNuxtPlugin((nuxtApp) => {
	const civicStore = useCivicStore();
	const api = useApiClient();
	const coverageState = useNuxtData<CoverageResponse | null>("coverage-profile");
	let hasHydrated = false;

	nuxtApp.hook("page:finish", () => {
		if (hasHydrated)
			return;

		hasHydrated = true;
		civicStore.hydrateFromStorage();
		civicStore.markHydrated();

		const hasManualLookupContext = Boolean(
			civicStore.selectedLocation
			|| (civicStore.nationwideLookupResult && !civicStore.nationwideLookupResult.detectedFromIp)
			|| (civicStore.lookupContext && !civicStore.nationwideLookupResult)
		);

		if (hasManualLookupContext)
			return;

		void (coverageState.data.value
			? Promise.resolve(coverageState.data.value)
			: api<CoverageResponse>("/coverage")
					.then((coverage) => {
						coverageState.data.value = coverage;
						return coverage;
					}))
			.then((coverage) => {
				if (!canGuessLocationOnLoad(coverage?.locationGuess ?? null))
					return null;

				return api<LocationLookupResponse>("/location/guess");
			})
			.then((response) => {
				if (!response || response.result !== "resolved")
					return;

				civicStore.setLookupResponse(response, null);
			})
			.catch(() => {});
	});
});
