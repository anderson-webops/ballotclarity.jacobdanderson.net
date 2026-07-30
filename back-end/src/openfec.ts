import process from "node:process";
import { readProviderResponseJson, readProviderResponseText } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";

export interface OpenFecPrincipalCommittee {
	committeeId: string;
	name: string;
	lastFileDate?: string;
	party?: string;
}

export interface OpenFecCandidateSearchRecord {
	candidateId: string;
	cycles: number[];
	district?: string;
	incumbentChallengeFull?: string;
	name: string;
	office: string;
	principalCommittees: OpenFecPrincipalCommittee[];
	state: string;
}

export interface OpenFecCommitteeTotalsRecord {
	candidateContribution: number;
	cashOnHandBeginningPeriod: number;
	committeeId: string;
	committeeName: string;
	contributions: number;
	coverageEndDate?: string;
	coverageStartDate?: string;
	cycle: number;
	disbursements: number;
	individualContributions: number;
	individualItemizedContributions: number;
	individualUnitemizedContributions: number;
	lastCashOnHandEndPeriod: number;
	lastReportYear?: number;
	otherPoliticalCommitteeContributions: number;
	otherReceipts: number;
	politicalPartyCommitteeContributions: number;
	receipts: number;
	transfersFromOtherAuthorizedCommittee: number;
}

export interface OpenFecClient {
	getCommitteeTotals: (committeeId: string, cycle: number) => Promise<OpenFecCommitteeTotalsRecord | null>;
	searchCandidates: (filters: {
		district?: string;
		name: string;
		office: "H" | "S";
		state: string;
	}) => Promise<OpenFecCandidateSearchRecord[]>;
}

interface OpenFecClientOptions {
	apiKey?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

interface OpenFecCandidateSearchResponse {
	results?: Array<{
		candidate_id?: string;
		cycles?: number[];
		district?: string;
		incumbent_challenge_full?: string;
		name?: string;
		office?: string;
		principal_committees?: Array<{
			committee_id?: string;
			last_file_date?: string;
			name?: string;
			party_full?: string;
		}>;
		state?: string;
	}>;
}

interface OpenFecCommitteeTotalsResponse {
	results?: Array<{
		candidate_contribution?: number | string | null;
		cash_on_hand_beginning_period?: number | string | null;
		committee_id?: string;
		committee_name?: string;
		contributions?: number | string | null;
		coverage_end_date?: string;
		coverage_start_date?: string;
		cycle?: number;
		disbursements?: number | string | null;
		individual_contributions?: number | string | null;
		individual_itemized_contributions?: number | string | null;
		individual_unitemized_contributions?: number | string | null;
		last_cash_on_hand_end_period?: number | string | null;
		last_report_year?: number;
		other_political_committee_contributions?: number | string | null;
		other_receipts?: number | string | null;
		political_party_committee_contributions?: number | string | null;
		receipts?: number | string | null;
		transfers_from_other_authorized_committee?: number | string | null;
	}>;
}

function toNumber(value: number | string | null | undefined) {
	if (typeof value === "number" && Number.isFinite(value))
		return value;

	const parsed = Number.parseFloat(String(value ?? "").trim());
	return Number.isFinite(parsed) ? parsed : 0;
}

export function createOpenFecClient({
	apiKey = process.env.OPENFEC_API_KEY?.trim() || process.env.DATA_API_KEY?.trim(),
	fetchImpl = fetch,
	timeoutMs = resolveFetchTimeoutMs(process.env.OPENFEC_FETCH_TIMEOUT_MS),
}: OpenFecClientOptions = {}): OpenFecClient | null {
	const resolvedApiKey = apiKey?.trim();

	if (!resolvedApiKey)
		return null;

	const apiKeyValue = resolvedApiKey;
	const resolvedTimeoutMs = resolveFetchTimeoutMs(timeoutMs);

	async function fetchOpenFec<T>(pathname: string, query: Record<string, string>) {
		const requestUrl = new URL(pathname, "https://api.open.fec.gov/v1/");
		requestUrl.searchParams.set("api_key", apiKeyValue);

		for (const [key, value] of Object.entries(query)) {
			if (value)
				requestUrl.searchParams.set(key, value);
		}

		const response = await fetchImpl(requestUrl, {
			headers: {
				Accept: "application/json",
			},
			signal: createFetchTimeoutSignal(resolvedTimeoutMs),
		});

		if (!response.ok) {
			const detail = await readProviderResponseText(response);
			throw new Error(`OpenFEC request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`.slice(0, 500));
		}

		return await readProviderResponseJson<T>(response);
	}

	return {
		async getCommitteeTotals(committeeId, cycle) {
			let payload: OpenFecCommitteeTotalsResponse;

			try {
				payload = await fetchOpenFec<OpenFecCommitteeTotalsResponse>(`committee/${committeeId}/totals/`, {
					cycle: String(cycle),
				});
			}
			catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				if (message.includes("OpenFEC request failed: 404"))
					return null;

				throw error;
			}

			const record = payload.results?.[0];

			if (!record)
				return null;

			return {
				candidateContribution: toNumber(record.candidate_contribution),
				cashOnHandBeginningPeriod: toNumber(record.cash_on_hand_beginning_period),
				committeeId: record.committee_id?.trim() || committeeId,
				committeeName: record.committee_name?.trim() || committeeId,
				contributions: toNumber(record.contributions),
				coverageEndDate: record.coverage_end_date?.trim() || undefined,
				coverageStartDate: record.coverage_start_date?.trim() || undefined,
				cycle: record.cycle ?? cycle,
				disbursements: toNumber(record.disbursements),
				individualContributions: toNumber(record.individual_contributions),
				individualItemizedContributions: toNumber(record.individual_itemized_contributions),
				individualUnitemizedContributions: toNumber(record.individual_unitemized_contributions),
				lastCashOnHandEndPeriod: toNumber(record.last_cash_on_hand_end_period),
				lastReportYear: record.last_report_year,
				otherPoliticalCommitteeContributions: toNumber(record.other_political_committee_contributions),
				otherReceipts: toNumber(record.other_receipts),
				politicalPartyCommitteeContributions: toNumber(record.political_party_committee_contributions),
				receipts: toNumber(record.receipts),
				transfersFromOtherAuthorizedCommittee: toNumber(record.transfers_from_other_authorized_committee),
			};
		},
		async searchCandidates({ district, name, office, state }) {
			const payload = await fetchOpenFec<OpenFecCandidateSearchResponse>("candidates/search/", {
				district: district || "",
				office,
				page: "1",
				per_page: "10",
				q: name,
				state,
			});

			return (payload.results ?? []).map(candidate => ({
				candidateId: candidate.candidate_id?.trim() || "unknown-candidate",
				cycles: Array.isArray(candidate.cycles)
					? candidate.cycles.filter((cycle): cycle is number => Number.isFinite(cycle))
					: [],
				district: candidate.district?.trim() || undefined,
				incumbentChallengeFull: candidate.incumbent_challenge_full?.trim() || undefined,
				name: candidate.name?.trim() || "Unknown candidate",
				office: candidate.office?.trim() || office,
				principalCommittees: (candidate.principal_committees ?? [])
					.map(committee => ({
						committeeId: committee.committee_id?.trim() || "",
						lastFileDate: committee.last_file_date?.trim() || undefined,
						name: committee.name?.trim() || "",
						party: committee.party_full?.trim() || undefined,
					}))
					.filter(committee => committee.committeeId && committee.name),
				state: candidate.state?.trim() || state,
			}));
		},
	};
}
