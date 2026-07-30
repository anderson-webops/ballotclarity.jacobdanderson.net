import { resolveRequestTimeoutMs } from "~/utils/request-timeout";

interface ElectionSummaryResponse {
	elections?: Array<{ slug: string }>;
}

interface JurisdictionSummaryResponse {
	jurisdictions?: Array<{ slug: string }>;
}

interface SourcesDirectoryResponse {
	sources?: Array<{ id: string }>;
}

interface RepresentativeDirectoryResponse {
	districts?: Array<{ slug: string }>;
	representatives?: Array<{ slug: string }>;
}

interface BallotContestRoute {
	candidates?: Array<{ slug: string }>;
	measures?: Array<{ slug: string }>;
	slug: string;
	type: "candidate" | "measure";
}

interface BallotRouteResponse {
	election?: {
		contests?: BallotContestRoute[];
		slug: string;
	};
}

const trailingSlashesPattern = /\/+$/u;

function xmlEscape(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&apos;");
}

function unique<T>(values: T[]) {
	return Array.from(new Set(values));
}

async function fetchPublicApiJson<T>(apiBase: string, path: string, timeout: number): Promise<T | null> {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;

	try {
		return await $fetch<unknown>(`${apiBase}${normalizedPath}`, { timeout }) as T;
	}
	catch {
		return null;
	}
}

export default defineEventHandler(async (event): Promise<string> => {
	const origin = getRequestURL(event).origin;
	const runtimeConfig = useRuntimeConfig(event);
	const apiBase = String(runtimeConfig.public.apiBase || "").replace(trailingSlashesPattern, "");
	const apiFetchTimeoutMs = resolveRequestTimeoutMs(runtimeConfig.public.apiFetchTimeoutMs);
	const siteUrl = String(runtimeConfig.public.siteUrl || origin).replace(trailingSlashesPattern, "");
	const staticRoutes: string[] = [
		"/",
		"/about",
		"/accessibility",
		"/contact",
		"/corrections",
		"/coverage",
		"/data-sources",
		"/districts",
		"/help",
		"/methodology",
		"/neutrality",
		"/privacy",
		"/representatives",
		"/status",
		"/sources",
		"/terms",
	];

	if (!apiBase) {
		setHeader(event, "content-type", "application/xml; charset=utf-8");
		const fallbackBody: string = staticRoutes
			.map((route) => {
				const loc = new URL(route, `${siteUrl}/`).toString();
				return `<url><loc>${xmlEscape(loc)}</loc></url>`;
			})
			.join("");

		return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${fallbackBody}</urlset>`;
	}

	const [electionsResponse, jurisdictionsResponse, representativesResponse, sourcesResponse]: [
		ElectionSummaryResponse | null,
		JurisdictionSummaryResponse | null,
		RepresentativeDirectoryResponse | null,
		SourcesDirectoryResponse | null,
	] = await Promise.all([
		fetchPublicApiJson<ElectionSummaryResponse>(apiBase, "/elections", apiFetchTimeoutMs),
		fetchPublicApiJson<JurisdictionSummaryResponse>(apiBase, "/jurisdictions", apiFetchTimeoutMs),
		fetchPublicApiJson<RepresentativeDirectoryResponse>(apiBase, "/representatives", apiFetchTimeoutMs),
		fetchPublicApiJson<SourcesDirectoryResponse>(apiBase, "/sources", apiFetchTimeoutMs),
	]);

	const electionSummaries: Array<{ slug: string }> = electionsResponse?.elections ?? [];
	const primaryElectionSlug: string | undefined = electionSummaries[0]?.slug;
	const ballotResponse: BallotRouteResponse | null = primaryElectionSlug
		? await fetchPublicApiJson<BallotRouteResponse>(apiBase, `/ballot?election=${encodeURIComponent(primaryElectionSlug)}`, apiFetchTimeoutMs)
		: null;
	const contests: BallotContestRoute[] = ballotResponse?.election?.contests ?? [];
	const candidateRoutes: string[] = unique(
		contests.flatMap(contest => (contest.candidates ?? []).map(candidate => `/candidate/${candidate.slug}`))
	);
	const candidateSubRoutes: string[] = unique(
		contests.flatMap(contest => (contest.candidates ?? []).flatMap(candidate => [
			`/candidate/${candidate.slug}/funding`,
			`/candidate/${candidate.slug}/influence`,
		]))
	);
	const contestRoutes: string[] = unique(contests.map(contest => `/contest/${contest.slug}`));
	const districtRoutes: string[] = unique([
		...contests
			.filter(contest => contest.type === "candidate")
			.map(contest => `/districts/${contest.slug}`),
		...(representativesResponse?.districts ?? []).map(district => `/districts/${district.slug}`),
	]);
	const measureRoutes: string[] = unique(
		contests.flatMap(contest => (contest.measures ?? []).map(measure => `/measure/${measure.slug}`))
	);
	const representativeRoutes: string[] = unique(
		(representativesResponse?.representatives ?? []).map(representative => `/representatives/${representative.slug}`)
	);
	const representativeSubRoutes: string[] = unique(
		(representativesResponse?.representatives ?? []).flatMap(representative => [
			`/representatives/${representative.slug}/funding`,
			`/representatives/${representative.slug}/influence`,
		])
	);
	const electionRoutes: string[] = electionSummaries.map(({ slug }) => `/elections/${slug}`);
	const jurisdictionRoutes: string[] = (jurisdictionsResponse?.jurisdictions ?? []).map(({ slug }) => `/locations/${slug}`);
	const sourceRoutes: string[] = (sourcesResponse?.sources ?? []).map(({ id }) => `/sources/${id}`);
	const routeFamilies: string[] = [
		...staticRoutes,
		...electionRoutes,
		...jurisdictionRoutes,
		...candidateRoutes,
		...candidateSubRoutes,
		...contestRoutes,
		...districtRoutes,
		...measureRoutes,
		...representativeRoutes,
		...representativeSubRoutes,
		...sourceRoutes,
	];

	const body: string = unique(routeFamilies)
		.map((route) => {
			const loc = new URL(route, `${siteUrl}/`).toString();
			return `<url><loc>${xmlEscape(loc)}</loc></url>`;
		})
		.join("");

	setHeader(event, "content-type", "application/xml; charset=utf-8");

	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
});
