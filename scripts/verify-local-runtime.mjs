import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { applyProviderLocalOverrides, findEnvFiles, loadRootEnv } from "./local-env.mjs";

function runStep(label, command, args, options = {}) {
	return new Promise((resolve, reject) => {
		console.log(`\n== ${label} ==`);

		const child = spawn(command, args, {
			cwd: options.cwd || process.cwd(),
			env: options.env || process.env,
			stdio: "inherit",
		});

		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${label} terminated by signal ${signal}.`));
				return;
			}

			if (code !== 0) {
				reject(new Error(`${label} failed with exit code ${code ?? 1}.`));
				return;
			}

			resolve();
		});
	});
}

async function findAvailablePort(preferredPort) {
	async function tryPort(port) {
		return await new Promise((resolve) => {
			const probe = createServer();

			probe.once("error", () => {
				resolve(null);
			});

			probe.once("listening", () => {
				const address = probe.address();

				probe.close(() => {
					resolve(typeof address === "object" && address ? address.port : null);
				});
			});

			probe.listen(port, "127.0.0.1");
		});
	}

	const preferred = Number.parseInt(String(preferredPort || "3001"), 10);
	const safePreferred = Number.isFinite(preferred) && preferred > 0 ? preferred : 3001;
	return await tryPort(safePreferred) || await tryPort(0) || safePreferred;
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
	const startedAt = Date.now();
	let lastError = "Server did not respond.";

	while ((Date.now() - startedAt) < timeoutMs) {
		try {
			const response = await fetch(`${baseUrl}/health`);

			if (response.ok)
				return await response.json();

			lastError = `Health probe returned ${response.status}.`;
		}
		catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		await delay(500);
	}

	throw new Error(`Local API health check did not succeed within ${timeoutMs}ms. Last error: ${lastError}`);
}

async function stopProcess(child) {
	if (child.exitCode !== null)
		return;

	child.kill("SIGTERM");
	await once(child, "exit");
}

async function fetchJson(baseUrl, path, options = {}) {
	const response = await fetch(`${baseUrl}${path}`, options);
	const payload = await response.json();

	return {
		payload,
		response,
	};
}

async function main() {
	const cwd = process.cwd();
	const envFiles = findEnvFiles(cwd);

	if (!envFiles.length)
		throw new Error("No .env file was found in this worktree or the shared repo root. Set BALLOT_CLARITY_ENV_PATH or add a local env file before running local verification.");

	console.log("Using env files:");
	for (const envPath of envFiles)
		console.log(`- ${envPath}`);

	const preferredPort = loadRootEnv(cwd).PORT;
	const port = await findAvailablePort(preferredPort);
	const env = applyProviderLocalOverrides({
		...process.env,
		...loadRootEnv(cwd),
		PORT: String(port),
	}, cwd);
	const baseUrl = `http://127.0.0.1:${port}`;

	console.log(`Local API base: ${baseUrl}/api`);
	await runStep("Seed local coverage snapshot", "npm", ["run", "-w", "back-end", "export-seed-coverage:src"], { cwd, env });
	await runStep("Verify configured providers", "npm", ["run", "-w", "back-end", "providers:test:src"], { cwd, env });

	console.log("\n== Start local API ==");
	const server = spawn(resolve(cwd, "node_modules", ".bin", "tsx"), ["-r", "dotenv/config", "src/server.ts"], {
		cwd: resolve(cwd, "back-end"),
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	server.stdout.on("data", chunk => process.stdout.write(chunk));
	server.stderr.on("data", chunk => process.stderr.write(chunk));

	try {
		const health = await waitForHealth(baseUrl);

		if (!health?.ok)
			throw new Error("Health response did not report ok=true.");

		const { payload: lookupBody, response: lookupResponse } = await fetchJson(`${baseUrl}`, "/api/location", {
			body: JSON.stringify({ q: "84604" }),
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		});

		if (lookupResponse.status !== 200)
			throw new Error(`Lookup probe failed with ${lookupResponse.status}.`);

		if (lookupBody.result !== "resolved")
			throw new Error(`Lookup probe returned result=${String(lookupBody.result)} instead of resolved.`);

		if (!Array.isArray(lookupBody.districtMatches) || lookupBody.districtMatches.length === 0)
			throw new Error("Lookup probe returned no district matches for ZIP 84604.");

		if (!Array.isArray(lookupBody.representativeMatches) || lookupBody.representativeMatches.length === 0)
			throw new Error("Lookup probe returned no representative matches for ZIP 84604.");

		if (/source-backed local candidate records/i.test(String(lookupBody.availability?.financeInfluence?.detail || "")))
			throw new Error("Lookup probe still exposed stale candidate-only finance/influence copy.");

		if (lookupBody.availability?.financeInfluence?.status !== "available")
			throw new Error("Lookup probe did not expose finance/influence availability even though a matched representative module crosswalk should exist.");

		if (lookupBody.electionLogistics) {
			if (!Array.isArray(lookupBody.electionLogistics.pollingLocations) || !Array.isArray(lookupBody.electionLogistics.earlyVoteSites) || !Array.isArray(lookupBody.electionLogistics.dropOffLocations))
				throw new Error("Lookup probe exposed election logistics, but the structured polling, early-vote, or drop-off arrays were not shaped correctly.");
		}

		let liveGoogleCivicLogisticsProbe = null;
		for (const logisticsQuery of [
			"900 E Broad St, Richmond, VA 23219",
			"100 N Capitol Ave, Lansing, MI 48933",
		]) {
			const { payload, response } = await fetchJson(`${baseUrl}`, "/api/location", {
				body: JSON.stringify({ q: logisticsQuery }),
				headers: {
					"Content-Type": "application/json",
				},
				method: "POST",
			});

			if (response.status !== 200 || payload.result !== "resolved")
				continue;

			const logistics = payload.electionLogistics;
			if (
				logistics
				&& Array.isArray(logistics.pollingLocations)
				&& Array.isArray(logistics.earlyVoteSites)
				&& Array.isArray(logistics.dropOffLocations)
				&& (logistics.pollingLocations.length > 0 || logistics.earlyVoteSites.length > 0 || logistics.dropOffLocations.length > 0)
			) {
				liveGoogleCivicLogisticsProbe = {
					logistics,
					payload,
					query: logisticsQuery,
				};
				break;
			}
		}

		if (!liveGoogleCivicLogisticsProbe) {
			console.warn(
				"Google Civic live logistics probe did not return structured polling, early-vote, or drop-off data for the current verified address list. Continuing because live logistics availability is election-window dependent.",
			);
		}

		const { payload: georgiaZipBody, response: georgiaZipResponse } = await fetchJson(`${baseUrl}`, "/api/location", {
			body: JSON.stringify({ q: "30022" }),
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		});

		if (georgiaZipResponse.status !== 200)
			throw new Error(`Georgia ZIP lookup probe failed with ${georgiaZipResponse.status}.`);

		if (georgiaZipBody.result !== "resolved")
			throw new Error(`Georgia ZIP lookup probe returned result=${String(georgiaZipBody.result)} instead of resolved.`);

		if (!Array.isArray(georgiaZipBody.representativeMatches) || georgiaZipBody.representativeMatches.length === 0)
			throw new Error("Georgia ZIP lookup probe returned no representative matches for ZIP 30022.");

		if (georgiaZipBody.representativeMatches.length !== 7)
			throw new Error(`Georgia ZIP lookup probe returned ${georgiaZipBody.representativeMatches.length} representative matches instead of the expected current-officeholder set of 7 for ZIP 30022.`);

		const georgiaRepresentativeNames = georgiaZipBody.representativeMatches.map(item => String(item?.name || ""));
		const expectedGeorgiaRepresentatives = [
			/^Jon Ossoff$/i,
			/^Raphael(?:\s+G\.)?\s+Warnock$/i,
			/^(?:Rich|Richard)\s+McCormick$/i,
			/^Scott Hilton$/i,
			/^Shawn Still$/i,
			/^Robb Pitts$/i,
			/^John Bradberry$/i,
		];

		if (georgiaRepresentativeNames.some(name => /Richard Russell|Rob Woodall/i.test(name)))
			throw new Error("Georgia ZIP lookup probe still exposed historical Congress members for ZIP 30022.");

		for (const expectedNamePattern of expectedGeorgiaRepresentatives) {
			if (!georgiaRepresentativeNames.some(name => expectedNamePattern.test(name)))
				throw new Error(`Georgia ZIP lookup probe did not include the expected current officeholder pattern ${expectedNamePattern}.`);
		}

		const { payload: representativeDirectoryBody, response: representativeDirectoryResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives?lookup=84604"
		);

		if (representativeDirectoryResponse.status !== 200)
			throw new Error(`Representative directory probe failed with ${representativeDirectoryResponse.status}.`);

		if (!Array.isArray(representativeDirectoryBody.representatives) || representativeDirectoryBody.representatives.length !== lookupBody.representativeMatches.length)
			throw new Error("Representative directory probe did not preserve the active lookup representative count.");

		const moduleBackedRepresentative = representativeDirectoryBody.representatives.find(
			item => item.fundingAvailable || item.influenceAvailable,
		) || representativeDirectoryBody.representatives[0];
		const firstRepresentativeSlug = moduleBackedRepresentative?.slug;

		if (!firstRepresentativeSlug)
			throw new Error("Representative directory probe returned no representative slug to verify.");

		if (!representativeDirectoryBody.representatives.some(item => item.fundingAvailable || item.influenceAvailable))
			throw new Error("Representative directory probe did not surface any live funding or influence module availability.");

		const { payload: representativeProfileBody, response: representativeProfileResponse } = await fetchJson(
			`${baseUrl}`,
			`/api/representatives/${firstRepresentativeSlug}?lookup=84604`
		);

		if (representativeProfileResponse.status !== 200)
			throw new Error(`Representative profile probe failed with ${representativeProfileResponse.status}.`);

		if (/published local guide attached to this person record/i.test(String(representativeProfileBody.person?.whatWeDoNotKnow?.[0]?.text || "")))
			throw new Error("Representative profile probe still exposed stale guide-only finance/influence fallback copy.");

		if (!representativeProfileBody.person?.funding)
			throw new Error("Representative profile probe did not attach a finance summary from the provider-backed federal crosswalk.");

		if (!Array.isArray(representativeProfileBody.person?.lobbyingContext) || representativeProfileBody.person.lobbyingContext.length === 0)
			throw new Error("Representative profile probe did not attach lobbying or influence context from the provider-backed federal crosswalk.");

		if (
			!representativeProfileBody.person?.officeContext?.referenceLinks?.length
			&& !String(representativeProfileBody.person?.officialWebsiteUrl || "").trim()
		) {
			throw new Error("Representative profile probe did not attach either structured office-context reference links or an official office website.");
		}

		const firstDistrictSlug = representativeDirectoryBody.districts.find(
			item => item.slug === "congressional-3",
		)?.slug || representativeDirectoryBody.districts.find(
			item => item.representativeCount > 0,
		)?.slug || moduleBackedRepresentative?.districtSlug || "congressional-3";
		const { payload: directDistrictBody, response: directDistrictResponse } = await fetchJson(
			`${baseUrl}`,
			`/api/districts/${firstDistrictSlug}`
		);

		if (directDistrictResponse.status !== 200)
			throw new Error(`Direct district route probe failed with ${directDistrictResponse.status}.`);

		if (/Lookup context required/i.test(String(directDistrictBody.districtOriginLabel || "")))
			throw new Error("Direct district route probe still fell back to lookup-required district copy.");

		const { payload: directRepresentativeBody, response: directRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			`/api/representatives/${firstRepresentativeSlug}`
		);

		if (directRepresentativeResponse.status !== 200)
			throw new Error(`Direct representative route probe failed with ${directRepresentativeResponse.status}.`);

		if (String(directRepresentativeBody.person?.name || "").trim() !== String(moduleBackedRepresentative?.name || "").trim())
			throw new Error("Direct representative route probe did not preserve the expected person identity.");

		if (/pending lookup context/i.test(String(directRepresentativeBody.person?.officeholderLabel || "")))
			throw new Error("Direct representative route probe still exposed lookup-context placeholder copy.");

		if (!directRepresentativeBody.person?.funding)
			throw new Error("Direct representative route probe did not preserve finance data on the public route-backed person record.");

		if (!Array.isArray(directRepresentativeBody.person?.lobbyingContext) || directRepresentativeBody.person.lobbyingContext.length === 0)
			throw new Error("Direct representative route probe did not preserve influence data on the public route-backed person record.");

		if (
			!directRepresentativeBody.person?.officeContext?.districtLabel
			&& !String(directRepresentativeBody.person?.officeholderLabel || "").trim()
		) {
			throw new Error("Direct representative route probe did not preserve structured office context or a public officeholder label on the route-backed person record.");
		}

		const { payload: richRepresentativeBody, response: richRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/rich-mccormick"
		);

		if (richRepresentativeResponse.status !== 200)
			throw new Error(`Crosswalked representative route probe failed with ${richRepresentativeResponse.status}.`);

		if (!richRepresentativeBody.person?.funding) {
			const richFundingStatus = richRepresentativeBody.person?.enrichmentStatus?.funding;

			if (richFundingStatus?.reasonCode !== "provider_error") {
				throw new Error("Crosswalked representative route probe did not attach funding data for a nickname-vs-formal-name federal match.");
			}
		}

		if (!Array.isArray(richRepresentativeBody.person?.lobbyingContext) || richRepresentativeBody.person.lobbyingContext.length === 0)
			throw new Error("Crosswalked representative route probe did not attach influence data for a nickname-vs-formal-name federal match.");

		if (
			typeof richRepresentativeBody.person?.funding?.totalRaised !== "number"
			&& typeof richRepresentativeBody.person?.funding?.cashOnHand !== "number"
			&& typeof richRepresentativeBody.person?.funding?.totalSpent !== "number"
		) {
			throw new Error("Crosswalked representative route probe did not preserve any usable OpenFEC summary totals.");
		}

		const { payload: jonRepresentativeBody, response: jonRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/jon-ossoff"
		);

		if (jonRepresentativeResponse.status !== 200)
			throw new Error(`Jon Ossoff representative probe failed with ${jonRepresentativeResponse.status}.`);

		if (!jonRepresentativeBody.person?.funding)
			throw new Error("Direct senator route probe did not attach OpenFEC funding data for Jon Ossoff.");

		if (!Array.isArray(jonRepresentativeBody.person?.lobbyingContext) || jonRepresentativeBody.person.lobbyingContext.length === 0)
			throw new Error("Direct senator route probe did not attach LDA influence data for Jon Ossoff.");

		if (jonRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.status !== "available")
			throw new Error("Direct senator route probe did not attach Congress.gov legislative context for Jon Ossoff.");

		const { payload: tylerRepresentativeBody, response: tylerRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/tyler-clancy"
		);

		if (tylerRepresentativeResponse.status !== 200)
			throw new Error(`Tyler Clancy representative probe failed with ${tylerRepresentativeResponse.status}.`);

		if (tylerRepresentativeBody.person?.enrichmentStatus?.funding?.reasonCode !== "no_state_finance_source")
			throw new Error("State legislator route probe did not expose the precise state finance-source availability reason.");

		if (tylerRepresentativeBody.person?.enrichmentStatus?.influence?.reasonCode !== "no_state_disclosure_source")
			throw new Error("State legislator route probe did not expose the precise state disclosure-source availability reason.");

		if (tylerRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.reasonCode !== "identity_only_provider")
			throw new Error("State legislator route probe did not expose the precise state legislative-context availability reason.");

		const { payload: shawnRepresentativeBody, response: shawnRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/shawn-still"
		);

		if (shawnRepresentativeResponse.status !== 200)
			throw new Error(`Shawn Still representative probe failed with ${shawnRepresentativeResponse.status}.`);

		if (String(shawnRepresentativeBody.person?.districtLabel || "").trim() !== "State Senate District 48")
			throw new Error("State senator route probe did not attach the expected district label for Shawn Still.");

		const shawnSources = Array.isArray(shawnRepresentativeBody.person?.sources) ? shawnRepresentativeBody.person.sources : [];
		const shawnBiography = Array.isArray(shawnRepresentativeBody.person?.biography) ? shawnRepresentativeBody.person.biography : [];
		const shawnHasReviewedStateSource = shawnBiography.some((item) => /reviewed state officeholder source|reviewed officeholder record/i.test(String(item?.title || "")))
			|| shawnSources.some((item) => /georgia general assembly member bio/i.test(String(item?.sourceSystem || "")))
			|| /georgia general assembly member bio/i.test(String(shawnRepresentativeBody.person?.provenance?.label || ""));

		if (!shawnHasReviewedStateSource)
			throw new Error("State senator route probe did not preserve the reviewed Georgia state-officeholder source attachment.");

		if (shawnRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.reasonCode !== "attached")
			throw new Error("State senator route probe did not attach reviewed legislative or action context for Shawn Still.");

		if (!Array.isArray(shawnRepresentativeBody.person?.keyActions) || shawnRepresentativeBody.person.keyActions.length === 0)
			throw new Error("State senator route probe did not attach reviewed key-action records for Shawn Still.");

		const { payload: scottRepresentativeBody, response: scottRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/scott-hilton"
		);

		if (scottRepresentativeResponse.status !== 200)
			throw new Error(`Scott Hilton representative probe failed with ${scottRepresentativeResponse.status}.`);

		if (String(scottRepresentativeBody.person?.districtLabel || "").trim() !== "State House District 48")
			throw new Error("State legislator route probe did not attach the expected district label for Scott Hilton.");

		if (scottRepresentativeBody.person?.enrichmentStatus?.funding?.reasonCode !== "no_state_finance_source")
			throw new Error("State legislator route probe did not expose the expected state finance-source reason for Scott Hilton.");

		if (scottRepresentativeBody.person?.enrichmentStatus?.influence?.reasonCode !== "attached")
			throw new Error("State legislator route probe did not attach reviewed disclosure or lobbying context for Scott Hilton.");

		if (scottRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.reasonCode !== "attached")
			throw new Error("State legislator route probe did not attach reviewed legislative-context records for Scott Hilton.");

		if (!Array.isArray(scottRepresentativeBody.person?.lobbyingContext) || scottRepresentativeBody.person.lobbyingContext.length === 0)
			throw new Error("State legislator route probe did not attach reviewed lobbying context for Scott Hilton.");

		if (!Array.isArray(scottRepresentativeBody.person?.keyActions) || scottRepresentativeBody.person.keyActions.length === 0)
			throw new Error("State legislator route probe did not attach reviewed key-action records for Scott Hilton.");

		const { payload: localRepresentativeBody, response: localRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/marsha-judkins"
		);

		if (localRepresentativeResponse.status !== 200)
			throw new Error(`Marsha Judkins representative probe failed with ${localRepresentativeResponse.status}.`);

		if (localRepresentativeBody.person?.enrichmentStatus?.funding?.reasonCode !== "attached")
			throw new Error("Local officeholder route probe did not attach the reviewed local finance summary for Marsha Judkins.");

		if (localRepresentativeBody.person?.enrichmentStatus?.influence?.reasonCode !== "no_local_disclosure_source")
			throw new Error("Local officeholder route probe did not expose the expected local disclosure-source reason.");

		if (localRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.reasonCode !== "attached")
			throw new Error("Local officeholder route probe did not attach reviewed local action context for Marsha Judkins.");

		if (typeof localRepresentativeBody.person?.funding?.totalRaised !== "number")
			throw new Error("Local officeholder route probe did not attach structured funding totals for Marsha Judkins.");

		const { payload: countyRepresentativeBody, response: countyRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/robb-pitts"
		);

		if (countyRepresentativeResponse.status !== 200)
			throw new Error(`County officeholder probe failed with ${countyRepresentativeResponse.status}.`);

		if (countyRepresentativeBody.person?.enrichmentStatus?.funding?.reasonCode !== "no_local_finance_source")
			throw new Error("County officeholder probe did not expose the expected local finance-source reason.");

		if (countyRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.reasonCode !== "attached")
			throw new Error("County officeholder probe did not attach reviewed public-action context for Robb Pitts.");

		if (!Array.isArray(countyRepresentativeBody.person?.keyActions) || countyRepresentativeBody.person.keyActions.length === 0)
			throw new Error("County officeholder probe did not attach reviewed action records for Robb Pitts.");

		const { payload: cityRepresentativeBody, response: cityRepresentativeResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/representatives/john-bradberry"
		);

		if (cityRepresentativeResponse.status !== 200)
			throw new Error(`City officeholder probe failed with ${cityRepresentativeResponse.status}.`);

		if (cityRepresentativeBody.person?.enrichmentStatus?.influence?.reasonCode !== "no_local_disclosure_source")
			throw new Error("City officeholder probe did not expose the expected local disclosure-source reason.");

		if (cityRepresentativeBody.person?.enrichmentStatus?.legislativeContext?.reasonCode !== "attached")
			throw new Error("City officeholder probe did not attach reviewed public-action context for John Bradberry.");

		if (!Array.isArray(cityRepresentativeBody.person?.keyActions) || cityRepresentativeBody.person.keyActions.length === 0)
			throw new Error("City officeholder probe did not attach reviewed action records for John Bradberry.");

		const { payload: stateDistrictBody, response: stateDistrictResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/districts/state-house-60"
		);

		if (stateDistrictResponse.status !== 200)
			throw new Error(`State district route probe failed with ${stateDistrictResponse.status}.`);

		if (String(stateDistrictBody.representatives?.[0]?.slug || "").trim() !== "tyler-clancy")
			throw new Error("State district route probe did not attach the expected reviewed officeholder.");

		const { payload: localDistrictBody, response: localDistrictResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/districts/provo-city"
		);

		if (localDistrictResponse.status !== 200)
			throw new Error(`Local district route probe failed with ${localDistrictResponse.status}.`);

		if (String(localDistrictBody.representatives?.[0]?.slug || "").trim() !== "marsha-judkins")
			throw new Error("Local district route probe did not attach the expected reviewed officeholder.");

		const { payload: publishedGuidePackageBody, response: publishedGuidePackageResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/guide-packages/guide-package:2026-fulton-county-general",
		);

		if (publishedGuidePackageResponse.status !== 200)
			throw new Error(`Published guide package probe failed with ${publishedGuidePackageResponse.status}.`);

		if (String(publishedGuidePackageBody.package?.workflow?.status || "").trim() !== "published")
			throw new Error("Published guide package probe did not expose the expected published workflow state.");

		const { payload: publishedBallotBody, response: publishedBallotResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/ballot?election=2026-fulton-county-general",
		);

		if (publishedBallotResponse.status !== 200)
			throw new Error(`Published ballot guide probe failed with ${publishedBallotResponse.status}.`);

		if (String(publishedBallotBody.election?.slug || "").trim() !== "2026-fulton-county-general")
			throw new Error("Published ballot guide probe did not resolve the expected election package.");

		const { payload: sourceDirectoryBody, response: sourceDirectoryResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/sources"
		);

		if (sourceDirectoryResponse.status !== 200)
			throw new Error(`Source directory probe failed with ${sourceDirectoryResponse.status}.`);

		if (!Array.isArray(sourceDirectoryBody.sources) || sourceDirectoryBody.sources.length === 0)
			throw new Error("Source directory probe returned no published source records.");

		const shawnSourceRecord = sourceDirectoryBody.sources.find((item) => item.id === "supplemental:shawn-still:bio");

		if (!shawnSourceRecord)
			throw new Error("Source directory probe did not publish the reviewed Shawn Still route provenance record.");

		if (sourceDirectoryBody.sources.some((item) => item.id === "district:state-senate-48"))
			throw new Error("Source directory probe incorrectly published an inline-only district provenance id.");

		const { payload: shawnSourceBody, response: shawnSourceResponse } = await fetchJson(
			`${baseUrl}`,
			"/api/sources/supplemental:shawn-still:bio"
		);

		if (shawnSourceResponse.status !== 200)
			throw new Error(`Published route source probe failed with ${shawnSourceResponse.status}.`);

		if (!Array.isArray(shawnSourceBody.source?.citedBy) || !shawnSourceBody.source.citedBy.some((item) => item.href === "/representatives/shawn-still"))
			throw new Error("Published route source probe did not preserve the representative-page citation for Shawn Still.");

		if (!shawnSourceBody.source.citedBy.some((item) => item.href === "/districts/state-senate-48"))
			throw new Error("Published route source probe did not preserve the district-page citation for Shawn Still.");

		const unpublishedSourceResponse = await fetch(`${baseUrl}/api/sources/district:state-senate-48`);

		if (unpublishedSourceResponse.status !== 404)
			throw new Error(`Inline-only district provenance probe should return 404, received ${unpublishedSourceResponse.status}.`);

		console.log("\n== Local runtime verification passed ==");
		console.log(`Resolved ${lookupBody.location?.displayName || "unknown location"} with ${lookupBody.districtMatches.length} district matches and ${lookupBody.representativeMatches.length} representative matches.`);
		if (liveGoogleCivicLogisticsProbe) {
			console.log(`Verified live Google Civic logistics for ${liveGoogleCivicLogisticsProbe.query} with ${liveGoogleCivicLogisticsProbe.logistics.pollingLocations.length} polling location(s), ${liveGoogleCivicLogisticsProbe.logistics.earlyVoteSites.length} early-vote site(s), and ${liveGoogleCivicLogisticsProbe.logistics.dropOffLocations.length} drop-off location(s).`);
		}
		console.log(`Verified representative directory/profile backing for ${moduleBackedRepresentative.name}, including live finance and influence modules.`);
		console.log(`Verified direct district route backing for ${directDistrictBody.district?.title || firstDistrictSlug}, reviewed state/local district backing for ${stateDistrictBody.district?.title || "state-house-60"} and ${localDistrictBody.district?.title || "provo-city"}, the published guide package for ${publishedGuidePackageBody.package?.coverageScope?.label || "2026 Fulton County General"}, direct representative backing for ${directRepresentativeBody.person?.name || firstRepresentativeSlug}, ${shawnRepresentativeBody.person?.name || "shawn-still"}, ${scottRepresentativeBody.person?.name || "scott-hilton"}, ${countyRepresentativeBody.person?.name || "robb-pitts"}, ${cityRepresentativeBody.person?.name || "john-bradberry"}, and ${localRepresentativeBody.person?.name || "marsha-judkins"}, plus published source records for stable route provenance.`);
	}
	finally {
		await stopProcess(server);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : "Local runtime verification failed.");
	process.exit(1);
});
