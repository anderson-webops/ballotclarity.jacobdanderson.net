import type { LocationLookupResponse, NationwideLookupResultContext } from "~/types/civic";

export interface NationwideLookupRouteQuery {
	lookup: string;
	selection?: string;
}

type QueryCarrier = {
	lookupQuery?: string;
	selectionId?: string;
} | null | undefined;
const exactZipPattern = /^\d{5}$/u;
const selectionIdPattern = /^\w[\w.:-]{0,255}$/u;

function readTrimmedQueryValue(value: unknown) {
	if (Array.isArray(value))
		return typeof value[0] === "string" ? value[0].trim() : "";

	return typeof value === "string" ? value.trim() : "";
}

export function extractNationwideLookupRouteQuery(query: Record<string, unknown> | null | undefined): NationwideLookupRouteQuery | null {
	const lookup = readTrimmedQueryValue(query?.lookup);
	const selection = readTrimmedQueryValue(query?.selection);

	if (!exactZipPattern.test(lookup))
		return null;

	return selectionIdPattern.test(selection)
		? { lookup, selection }
		: { lookup };
}

export function buildNationwideLookupRouteQuery(
	context: QueryCarrier,
	routeQuery?: Record<string, unknown> | null | undefined
): NationwideLookupRouteQuery | undefined {
	const queryFromRoute = extractNationwideLookupRouteQuery(routeQuery);

	if (queryFromRoute)
		return queryFromRoute;

	const lookup = context?.lookupQuery?.trim();
	const selection = context?.selectionId?.trim();

	if (!lookup || !exactZipPattern.test(lookup))
		return undefined;

	return selection && selectionIdPattern.test(selection)
		? { lookup, selection }
		: { lookup };
}

export function buildNationwideRouteTarget(
	path: string,
	context: QueryCarrier,
	routeQuery?: Record<string, unknown> | null | undefined
) {
	const query = buildNationwideLookupRouteQuery(context, routeQuery);

	if (!query)
		return path;

	const [pathWithoutHash, hash = ""] = path.split("#", 2);
	const searchParams = new URLSearchParams();

	searchParams.set("lookup", query.lookup);

	if (query.selection)
		searchParams.set("selection", query.selection);

	const serializedQuery = searchParams.toString();
	return `${pathWithoutHash}${serializedQuery ? `?${serializedQuery}` : ""}${hash ? `#${hash}` : ""}`;
}

export function buildLookupDestinationFromResponse(response: Pick<LocationLookupResponse, "lookupQuery" | "selectionId">) {
	const query = buildNationwideLookupRouteQuery({
		lookupQuery: response.lookupQuery,
		selectionId: response.selectionId
	});

	return query
		? buildNationwideRouteTarget("/results", {
				lookupQuery: response.lookupQuery,
				selectionId: response.selectionId
			})
		: "/results";
}

export function buildLookupContextFromNationwideResult(context: NationwideLookupResultContext | null | undefined) {
	return context
		? {
				lookupQuery: context.lookupQuery,
				selectionId: context.selectionId
			}
		: null;
}
