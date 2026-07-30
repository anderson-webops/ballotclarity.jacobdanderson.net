import type {
	LocationLookupAction,
	LocationSelection,
	NationwideLookupResultContext,
} from "~/types/civic";

const exactZipPattern = /^\d{5}$/u;

export function sanitizeLocationSelectionForStorage(location: LocationSelection | null | undefined) {
	if (!location)
		return null;

	const { lookupInput: _lookupInput, ...safeLocation } = location;
	return safeLocation;
}

function sanitizeLookupActionForStorage(action: LocationLookupAction) {
	return {
		...action,
		location: sanitizeLocationSelectionForStorage(action.location) ?? undefined,
	};
}

export function sanitizeNationwideLookupResultForStorage(
	result: NationwideLookupResultContext | null | undefined
) {
	if (!result)
		return null;

	const zip = result.inputKind === "zip"
		? [result.lookupQuery, result.normalizedAddress]
				.map(value => value?.trim() ?? "")
				.find(value => exactZipPattern.test(value)) ?? ""
		: "";

	return {
		...result,
		actions: Array.isArray(result.actions)
			? result.actions.map(sanitizeLookupActionForStorage)
			: [],
		ballotContentPreviews: [],
		electionLogistics: null,
		location: sanitizeLocationSelectionForStorage(result.location),
		lookupQuery: zip,
		normalizedAddress: zip,
		selectionOptions: result.inputKind === "zip" && Array.isArray(result.selectionOptions)
			? result.selectionOptions
			: [],
	} satisfies NationwideLookupResultContext;
}
