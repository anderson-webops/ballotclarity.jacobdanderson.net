import process from "node:process";
import { readProviderResponseJson, readProviderResponseText } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";

export interface LdaContributionItem {
	amount: number;
	contributionType?: string;
	contributorName: string;
	date?: string;
	honoreeName?: string;
	payeeName?: string;
}

export interface LdaContributionReport {
	contributionItems: LdaContributionItem[];
	filingDocumentUrl?: string;
	filingPeriodDisplay?: string;
	filingUuid: string;
	filingYear: number;
	postedAt?: string;
	registrantName: string;
	url: string;
}

export interface LdaClient {
	listContributionReports: (filters: {
		contributionHonoree?: string;
		contributionPayee?: string;
		filingYear: number;
		maxPages?: number;
		pageSize?: number;
	}) => Promise<LdaContributionReport[]>;
}

interface LdaClientOptions {
	apiKey?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

interface LdaContributionResponse {
	count?: number;
	results?: Array<{
		contribution_items?: Array<{
			amount?: number | string | null;
			contribution_type_display?: string;
			contributor_name?: string;
			date?: string;
			honoree_name?: string;
			payee_name?: string;
		}>;
		dt_posted?: string;
		filing_document_url?: string;
		filing_period_display?: string;
		filing_uuid?: string;
		filing_year?: number;
		registrant?: {
			name?: string;
		};
		url?: string;
	}>;
}

function toNumber(value: number | string | null | undefined) {
	if (typeof value === "number" && Number.isFinite(value))
		return value;

	const parsed = Number.parseFloat(String(value ?? "").trim());
	return Number.isFinite(parsed) ? parsed : 0;
}

export function createLdaClient({
	apiKey = process.env.LDA_API_KEY?.trim(),
	fetchImpl = fetch,
	timeoutMs = resolveFetchTimeoutMs(process.env.LDA_FETCH_TIMEOUT_MS),
}: LdaClientOptions = {}): LdaClient | null {
	const resolvedApiKey = apiKey?.trim();

	if (!resolvedApiKey)
		return null;

	const resolvedTimeoutMs = resolveFetchTimeoutMs(timeoutMs);

	async function fetchContributionPage(query: Record<string, string>) {
		const requestUrl = new URL("https://lda.senate.gov/api/v1/contributions/");

		for (const [key, value] of Object.entries(query)) {
			if (value)
				requestUrl.searchParams.set(key, value);
		}

		const response = await fetchImpl(requestUrl, {
			headers: {
				Accept: "application/json",
				Authorization: `Token ${resolvedApiKey}`,
			},
			signal: createFetchTimeoutSignal(resolvedTimeoutMs),
		});

		if (!response.ok) {
			const detail = await readProviderResponseText(response);
			throw new Error(`LDA contribution lookup failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`.slice(0, 500));
		}

		return await readProviderResponseJson<LdaContributionResponse>(response);
	}

	return {
		async listContributionReports({ contributionHonoree, contributionPayee, filingYear, maxPages = 5, pageSize = 100 }) {
			const resolvedPageSize = Math.min(Math.max(pageSize, 1), 100);
			const firstPage = await fetchContributionPage({
				contribution_honoree: contributionHonoree || "",
				contribution_payee: contributionPayee || "",
				filing_year: String(filingYear),
				page: "1",
				page_size: String(resolvedPageSize),
			});
			const count = Number.isFinite(firstPage.count) ? Number(firstPage.count) : 0;
			const pages = Math.max(1, Math.ceil(count / resolvedPageSize));
			const lastPage = Math.min(pages, maxPages);
			const results = [...(firstPage.results ?? [])];

			for (let page = 2; page <= lastPage; page += 1) {
				const payload = await fetchContributionPage({
					contribution_honoree: contributionHonoree || "",
					contribution_payee: contributionPayee || "",
					filing_year: String(filingYear),
					page: String(page),
					page_size: String(resolvedPageSize),
				});

				results.push(...(payload.results ?? []));
			}

			return results.map(report => ({
				contributionItems: (report.contribution_items ?? []).map(item => ({
					amount: toNumber(item.amount),
					contributionType: item.contribution_type_display?.trim() || undefined,
					contributorName: item.contributor_name?.trim() || "Unknown contributor",
					date: item.date?.trim() || undefined,
					honoreeName: item.honoree_name?.trim() || undefined,
					payeeName: item.payee_name?.trim() || undefined,
				})),
				filingDocumentUrl: report.filing_document_url?.trim() || undefined,
				filingPeriodDisplay: report.filing_period_display?.trim() || undefined,
				filingUuid: report.filing_uuid?.trim() || "unknown-filing",
				filingYear: report.filing_year ?? filingYear,
				postedAt: report.dt_posted?.trim() || undefined,
				registrantName: report.registrant?.name?.trim() || "Unknown registrant",
				url: report.url?.trim() || "",
			}));
		},
	};
}
