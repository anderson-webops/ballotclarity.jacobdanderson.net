import process from "node:process";
import { readProviderResponseText } from "./fetch-response.js";
import { fetchGoogleCivic } from "./google-civic.js";
import { resolveProviderCredential } from "./provider-config.js";
import {
	summarizeGoogleCivicProviderFailure,
	summarizeProviderBody,
	summarizeProviderProbeError,
} from "./provider-diagnostic-messages.js";

type DiagnosticStatus = "fail" | "pass" | "skip";

interface DiagnosticResult {
	detail: string;
	id: string;
	label: string;
	source?: string;
	status: DiagnosticStatus;
}

const defaultProviderProbeTimeoutMs = 15000;

function providerProbeTimeoutMs() {
	const value = Number.parseInt(process.env.PROVIDER_TEST_TIMEOUT_MS || "", 10);
	return Number.isSafeInteger(value) && value > 0 ? value : defaultProviderProbeTimeoutMs;
}

async function withProviderTimeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
	const timeoutMs = providerProbeTimeoutMs();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await operation(controller.signal);
	}
	finally {
		clearTimeout(timeout);
	}
}

function formatProbeError(error: unknown) {
	return summarizeProviderProbeError(error, providerProbeTimeoutMs());
}

async function readJson(response: Response) {
	const text = await readProviderResponseText(response);

	try {
		return {
			payload: JSON.parse(text) as Record<string, unknown>,
			text
		};
	}
	catch {
		return {
			payload: null,
			text
		};
	}
}

function buildGoogleCivicVoterInfoNote(response: Response, body: string) {
	if (response.ok)
		return "Sample voterinfo probe also succeeded.";

	if (response.status === 400 || response.status === 404) {
		return `Sample voterinfo probe returned ${response.status}; this usually means the sample address/election context is not currently valid, not that the credential was rejected. Detail: ${summarizeProviderBody(body)}`;
	}

	return `Sample voterinfo probe returned ${response.status}. This does not change the credential-acceptance result from the elections endpoint. Detail: ${summarizeProviderBody(body)}`;
}

async function checkDataGov() {
	const credential = resolveProviderCredential("data-gov");

	if (!credential) {
		return {
			detail: "DATA_API_KEY is not configured.",
			id: "data-gov",
			label: "api.data.gov shared key",
			status: "skip"
		} satisfies DiagnosticResult;
	}

	try {
		const url = new URL("https://api.congress.gov/v3/member");
		url.searchParams.set("api_key", credential.value);
		url.searchParams.set("format", "json");
		url.searchParams.set("limit", "1");

		const response = await withProviderTimeout(signal => fetch(url, {
			headers: {
				Accept: "application/json"
			},
			signal
		}));
		const { payload, text } = await readJson(response);

		if (!response.ok) {
			return {
				detail: `Congress.gov probe rejected the shared key with ${response.status}: ${summarizeProviderBody(text)}`,
				id: "data-gov",
				label: "api.data.gov shared key",
				source: credential.source,
				status: "fail"
			} satisfies DiagnosticResult;
		}

		const memberName = Array.isArray(payload?.members)
			? String(payload.members[0]?.name || "unknown member")
			: "unknown member";

		return {
			detail: `Shared key accepted by Congress.gov. Sample member: ${memberName}.`,
			id: "data-gov",
			label: "api.data.gov shared key",
			source: credential.source,
			status: "pass"
		} satisfies DiagnosticResult;
	}
	catch (error) {
		return {
			detail: formatProbeError(error),
			id: "data-gov",
			label: "api.data.gov shared key",
			source: credential.source,
			status: "fail"
		} satisfies DiagnosticResult;
	}
}

async function checkGoogleCivic() {
	const credential = resolveProviderCredential("google-civic");

	if (!credential) {
		return {
			detail: "GOOGLE_CIVIC_API_KEY is not configured.",
			id: "google-civic",
			label: "Google Civic Information API",
			status: "skip"
		} satisfies DiagnosticResult;
	}

	try {
		const electionsUrl = new URL("https://www.googleapis.com/civicinfo/v2/elections");
		electionsUrl.searchParams.set("key", credential.value);

		const electionsResponse = await withProviderTimeout(signal => fetchGoogleCivic(electionsUrl, { signal }));
		const { payload, text } = await readJson(electionsResponse);

		if (!electionsResponse.ok) {
			return {
				detail: summarizeGoogleCivicProviderFailure(electionsResponse.status, text),
				id: "google-civic",
				label: "Google Civic Information API",
				source: credential.source,
				status: "fail"
			} satisfies DiagnosticResult;
		}

		const electionCount = Array.isArray(payload?.elections) ? payload.elections.length : 0;
		let voterInfoNote = "Sample voterinfo probe was not attempted.";

		try {
			const voterInfoUrl = new URL("https://www.googleapis.com/civicinfo/v2/voterinfo");
			voterInfoUrl.searchParams.set("address", "5600 Campbellton Fairburn Rd, Union City, GA 30213");
			voterInfoUrl.searchParams.set("officialOnly", "true");
			voterInfoUrl.searchParams.set("returnAllAvailableData", "true");
			voterInfoUrl.searchParams.set("key", credential.value);
			const voterInfoResponse = await withProviderTimeout(signal => fetchGoogleCivic(voterInfoUrl, { signal }));
			const voterInfoBody = await readProviderResponseText(voterInfoResponse);

			voterInfoNote = buildGoogleCivicVoterInfoNote(voterInfoResponse, voterInfoBody);
		}
		catch (error) {
			voterInfoNote = `Sample voterinfo probe could not be completed. This does not change the credential-acceptance result from the elections endpoint. Detail: ${formatProbeError(error)}`;
		}

		return {
			detail: `Credential accepted by the elections endpoint. Elections probe returned ${electionCount} election records. ${voterInfoNote}`,
			id: "google-civic",
			label: "Google Civic Information API",
			source: credential.source,
			status: "pass"
		} satisfies DiagnosticResult;
	}
	catch (error) {
		return {
			detail: formatProbeError(error),
			id: "google-civic",
			label: "Google Civic Information API",
			source: credential.source,
			status: "fail"
		} satisfies DiagnosticResult;
	}
}

async function checkCongress() {
	const credential = resolveProviderCredential("congress");

	if (!credential) {
		return {
			detail: "Neither CONGRESS_API_KEY nor DATA_API_KEY is configured.",
			id: "congress",
			label: "Congress.gov API",
			status: "skip"
		} satisfies DiagnosticResult;
	}

	try {
		const url = new URL("https://api.congress.gov/v3/member");
		url.searchParams.set("api_key", credential.value);
		url.searchParams.set("format", "json");
		url.searchParams.set("limit", "1");
		const response = await withProviderTimeout(signal => fetch(url, {
			headers: {
				Accept: "application/json"
			},
			signal
		}));
		const { payload, text } = await readJson(response);

		if (!response.ok) {
			return {
				detail: `Congress.gov probe failed with ${response.status}: ${summarizeProviderBody(text)}`,
				id: "congress",
				label: "Congress.gov API",
				source: credential.source,
				status: "fail"
			} satisfies DiagnosticResult;
		}

		const memberName = Array.isArray(payload?.members)
			? String(payload.members[0]?.name || "unknown member")
			: "unknown member";

		return {
			detail: `Member endpoint accepted the configured credential. Sample member: ${memberName}.`,
			id: "congress",
			label: "Congress.gov API",
			source: credential.source,
			status: "pass"
		} satisfies DiagnosticResult;
	}
	catch (error) {
		return {
			detail: formatProbeError(error),
			id: "congress",
			label: "Congress.gov API",
			source: credential.source,
			status: "fail"
		} satisfies DiagnosticResult;
	}
}

async function checkOpenFec() {
	const credential = resolveProviderCredential("openfec");

	if (!credential) {
		return {
			detail: "Neither OPENFEC_API_KEY nor DATA_API_KEY is configured.",
			id: "openfec",
			label: "OpenFEC",
			status: "skip"
		} satisfies DiagnosticResult;
	}

	try {
		const url = new URL("https://api.open.fec.gov/v1/candidates/search/");
		url.searchParams.set("api_key", credential.value);
		url.searchParams.set("per_page", "1");
		url.searchParams.set("q", "Warnock");
		const response = await withProviderTimeout(signal => fetch(url, {
			headers: {
				Accept: "application/json"
			},
			signal
		}));
		const { payload, text } = await readJson(response);

		if (!response.ok) {
			return {
				detail: `OpenFEC probe failed with ${response.status}: ${summarizeProviderBody(text)}`,
				id: "openfec",
				label: "OpenFEC",
				source: credential.source,
				status: "fail"
			} satisfies DiagnosticResult;
		}

		const candidateId = Array.isArray(payload?.results)
			? String(payload.results[0]?.candidate_id || "unknown candidate")
			: "unknown candidate";

		return {
			detail: `Candidate search accepted the configured credential. Sample candidate: ${candidateId}.`,
			id: "openfec",
			label: "OpenFEC",
			source: credential.source,
			status: "pass"
		} satisfies DiagnosticResult;
	}
	catch (error) {
		return {
			detail: formatProbeError(error),
			id: "openfec",
			label: "OpenFEC",
			source: credential.source,
			status: "fail"
		} satisfies DiagnosticResult;
	}
}

async function checkOpenStates() {
	const credential = resolveProviderCredential("openstates");

	if (!credential) {
		return {
			detail: "OPENSTATES_API_KEY is not configured.",
			id: "openstates",
			label: "Open States API",
			status: "skip"
		} satisfies DiagnosticResult;
	}

	try {
		const url = new URL("https://v3.openstates.org/jurisdictions");
		url.searchParams.set("apikey", credential.value);
		const response = await withProviderTimeout(signal => fetch(url, {
			headers: {
				Accept: "application/json"
			},
			signal
		}));
		const { payload, text } = await readJson(response);

		if (!response.ok) {
			if (response.status === 429) {
				return {
					detail: `Open States probe hit the current API rate limit (${response.status}): ${summarizeProviderBody(text)}. Ballot Clarity should continue validating route behavior from locally saved provider data instead of treating this as a missing-credential failure.`,
					id: "openstates",
					label: "Open States API",
					source: credential.source,
					status: "skip"
				} satisfies DiagnosticResult;
			}

			return {
				detail: `Open States probe failed with ${response.status}: ${summarizeProviderBody(text)}`,
				id: "openstates",
				label: "Open States API",
				source: credential.source,
				status: "fail"
			} satisfies DiagnosticResult;
		}

		const jurisdictionId = Array.isArray(payload?.results)
			? String(payload.results[0]?.id || "unknown jurisdiction")
			: "unknown jurisdiction";

		return {
			detail: `Jurisdictions endpoint accepted the configured credential. Sample jurisdiction: ${jurisdictionId}.`,
			id: "openstates",
			label: "Open States API",
			source: credential.source,
			status: "pass"
		} satisfies DiagnosticResult;
	}
	catch (error) {
		return {
			detail: formatProbeError(error),
			id: "openstates",
			label: "Open States API",
			source: credential.source,
			status: "fail"
		} satisfies DiagnosticResult;
	}
}

async function checkLda() {
	const credential = resolveProviderCredential("lda");

	if (!credential) {
		return {
			detail: "LDA_API_KEY is not configured.",
			id: "lda",
			label: "LDA.gov API",
			status: "skip"
		} satisfies DiagnosticResult;
	}

	try {
		const url = new URL("https://lda.senate.gov/api/v1/filings/");
		url.searchParams.set("client_name", "OpenAI");
		url.searchParams.set("page", "1");
		url.searchParams.set("page_size", "1");
		const response = await withProviderTimeout(signal => fetch(url, {
			headers: {
				Accept: "application/json",
				Authorization: `Token ${credential.value}`
			},
			signal
		}));
		const { payload, text } = await readJson(response);

		if (!response.ok) {
			return {
				detail: `LDA probe failed with ${response.status}: ${summarizeProviderBody(text)}`,
				id: "lda",
				label: "LDA.gov API",
				source: credential.source,
				status: "fail"
			} satisfies DiagnosticResult;
		}

		const count = typeof payload?.count === "number" ? payload.count : 0;

		return {
			detail: `Filings endpoint accepted the configured credential. Sample filtered result count: ${count}.`,
			id: "lda",
			label: "LDA.gov API",
			source: credential.source,
			status: "pass"
		} satisfies DiagnosticResult;
	}
	catch (error) {
		return {
			detail: formatProbeError(error),
			id: "lda",
			label: "LDA.gov API",
			source: credential.source,
			status: "fail"
		} satisfies DiagnosticResult;
	}
}

async function main() {
	const results = await Promise.all([
		checkDataGov(),
		checkGoogleCivic(),
		checkCongress(),
		checkOpenFec(),
		checkOpenStates(),
		checkLda()
	]);
	const failures = results.filter(result => result.status === "fail");

	for (const result of results) {
		const sourceNote = result.source ? ` [${result.source}]` : "";
		console.log(`${result.status.toUpperCase()} ${result.label}${sourceNote}: ${result.detail}`);
	}

	if (failures.length) {
		process.exitCode = 1;
		return;
	}

	console.log("All configured provider checks passed.");
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
