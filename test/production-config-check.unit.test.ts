import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	evaluateProductionConfig,
	formatProductionConfigEvaluation,
} from "../scripts/production-config-check.mjs";

function buildMinimalCoverageSnapshot(overrides: Record<string, unknown> = {}) {
	const updatedAt = "2026-04-19T19:36:50.252Z";
	const electionSlug = "2026-fulton-county-general";
	const jurisdictionSlug = "fulton-county-georgia";
	const officialResources = [
		{
			label: "Georgia My Voter Page",
			url: "https://mvp.sos.ga.gov/s/",
		},
	];

	return {
		candidates: [],
		dataSources: {
			categories: [
				{
					slug: "official-election-resources",
					summary: "Official election resources attached for public verification.",
					title: "Official election resources",
				},
			],
			launchTarget: {
				displayName: "Fulton County, Georgia",
				name: "Fulton County",
				officialResources,
				slug: jurisdictionSlug,
				state: "Georgia",
			},
			updatedAt,
		},
		election: {
			contests: [],
			date: "2026-11-03",
			jurisdictionSlug,
			locationName: "Fulton County, Georgia",
			name: "November 3, 2026 Fulton County election guide",
			officialResources,
			slug: electionSlug,
			updatedAt,
		},
		electionSummaries: [
			{
				date: "2026-11-03",
				jurisdictionSlug,
				locationName: "Fulton County, Georgia",
				name: "November 3, 2026 Fulton County election guide",
				slug: electionSlug,
				updatedAt,
			},
		],
		jurisdiction: {
			displayName: "Fulton County, Georgia",
			jurisdictionType: "County",
			officialResources,
			slug: jurisdictionSlug,
			state: "Georgia",
			updatedAt,
		},
		jurisdictionSummaries: [
			{
				displayName: "Fulton County, Georgia",
				jurisdictionType: "County",
				name: "Fulton County",
				slug: jurisdictionSlug,
				state: "Georgia",
				updatedAt,
			},
		],
		location: {
			displayName: "Fulton County, Georgia",
			lookupMode: "address-verified",
			slug: jurisdictionSlug,
			state: "Georgia",
		},
		measures: [],
		sources: [],
		updatedAt,
		...overrides,
	};
}

function writeSnapshot(
	status = "production_approved",
	overrides: Record<string, unknown> = {},
	payload: Record<string, unknown> = buildMinimalCoverageSnapshot(),
) {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-prod-check-"));
	const snapshotPath = join(root, "live-coverage.active.json");
	writeFileSync(snapshotPath, JSON.stringify(payload), "utf8");
	writeFileSync(`${snapshotPath}.meta.json`, JSON.stringify({
		approvedAt: status === "production_approved" ? "2026-04-19T19:36:50.252Z" : undefined,
		importedAt: "2026-04-19T19:36:50.252Z",
		reviewedAt: "2026-04-19T19:36:50.252Z",
		sourceLabel: "Reviewed Fulton coverage package",
		sourceType: "imported",
		status,
		...overrides,
	}), "utf8");
	return snapshotPath;
}

function buildProductionEnv(overrides: Record<string, string | undefined> = {}) {
	return {
		ACTIVE_LOOKUP_COOKIE_SECRET: "d".repeat(48),
		ADDRESS_CACHE_ENCRYPTION_KEY: "e".repeat(48),
		ADDRESS_CACHE_MAX_ROWS: "100000",
		ADMIN_API_BASE: "http://127.0.0.1:3001/api",
		ADMIN_API_FETCH_TIMEOUT_MS: "15000",
		ADMIN_API_KEY: "a".repeat(48),
		ADMIN_API_RATE_LIMIT_MAX: "1000",
		ADMIN_API_RATE_LIMIT_MAX_BUCKETS: "10000",
		ADMIN_API_RATE_LIMIT_WINDOW_MS: "900000",
		ADMIN_DATABASE_URL: "postgres://ballotclarity:secret@db.internal:5432/ballotclarity",
		ADMIN_LOGIN_LOCKOUT_MS: "1800000",
		ADMIN_LOGIN_IP_MAX_ATTEMPTS: "25",
		ADMIN_LOGIN_MAX_ATTEMPTS: "5",
		ADMIN_LOGIN_MAX_BUCKETS: "10000",
		ADMIN_LOGIN_WINDOW_MS: "900000",
		ADMIN_MFA_ENCRYPTION_KEY: "f".repeat(48),
		ADMIN_SESSION_SECRET: "b".repeat(48),
		ADMIN_STORE_DRIVER: "postgres",
		CONTACT_ADDRESS: "hello@ballotclarity.org",
		CONTACT_ADDRESS_RATE_LIMIT_MAX: "12",
		CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS: "10000",
		CONTACT_ADDRESS_RATE_LIMIT_WINDOW_MS: "60000",
		CONTACT_ADDRESS_SESSION_SECRET: "c".repeat(48),
		CENSUS_GEOCODER_FETCH_TIMEOUT_MS: "15000",
		CONGRESS_FETCH_TIMEOUT_MS: "15000",
		GOOGLE_CIVIC_FETCH_TIMEOUT_MS: "15000",
		LDA_FETCH_TIMEOUT_MS: "15000",
		LIVE_COVERAGE_FETCH_MAX_BYTES: "5242880",
		LIVE_COVERAGE_FETCH_TIMEOUT_MS: "15000",
		LIVE_COVERAGE_FILE: writeSnapshot(),
		LIVE_COVERAGE_REQUIRED: "true",
		NUXT_PUBLIC_API_BASE: "https://ballotclarity.org/api/",
		NUXT_PUBLIC_API_FETCH_TIMEOUT_MS: "15000",
		NUXT_PUBLIC_GOVERNING_LAW: "State of Georgia",
		NUXT_PUBLIC_OPERATOR_LEGAL_NAME: "Jacob Anderson",
		NUXT_PUBLIC_SITE_URL: "https://ballotclarity.org",
		NUXT_PUBLIC_VENUE: "state or federal courts located in Georgia",
		PUBLIC_FEEDBACK_RATE_LIMIT_MAX: "5",
		PUBLIC_FEEDBACK_RATE_LIMIT_MAX_BUCKETS: "10000",
		PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_MS: "600000",
		PUBLIC_LOOKUP_RATE_LIMIT_MAX: "60",
		PUBLIC_LOOKUP_RATE_LIMIT_MAX_BUCKETS: "10000",
		PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_MS: "600000",
		PUBLIC_REPRESENTATIVE_CACHE_MAX_ENTRIES: "1000",
		PUBLIC_REPRESENTATIVE_CACHE_TTL_MS: "900000",
		OPENFEC_FETCH_TIMEOUT_MS: "15000",
		OPENSTATES_FETCH_TIMEOUT_MS: "15000",
		PROVIDER_RESPONSE_MAX_BYTES: "5242880",
		REPRESENTATIVE_MODULE_CACHE_MAX_ENTRIES: "1000",
		REPRESENTATIVE_MODULE_CACHE_TTL_MS: "900000",
		SOURCE_ASSET_BASE_URL: "https://assets.ballotclarity.org/source-files",
		TRUST_PROXY: "loopback",
		BALLOTCLARITY_ZIP_LOOKUP_LOG_MAX_BYTES: "10485760",
		ZIP_LOCATION_FETCH_TIMEOUT_MS: "15000",
		...overrides,
	};
}

function issueIds(evaluation: ReturnType<typeof evaluateProductionConfig>, severity: "errors" | "warnings") {
	return evaluation[severity].map(issue => issue.id);
}

test("production config check passes a hardened production environment", () => {
	const evaluation = evaluateProductionConfig({ env: buildProductionEnv() });

	assert.equal(evaluation.ok, true);
	assert.deepEqual(evaluation.errors, []);
	assert.deepEqual(evaluation.warnings, []);
	assert.match(formatProductionConfigEvaluation(evaluation), /Production config check: pass/);
});

test("production config check fails local public origins and public admin API target", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			ADMIN_API_BASE: "http://127.0.0.1:3001/api",
			NUXT_PUBLIC_API_BASE: "http://127.0.0.1:3001/api",
			NUXT_PUBLIC_SITE_URL: "http://localhost:3333",
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_site_url.https"));
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_site_url.local"));
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_api_base.https"));
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_api_base.local"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_api_base.public_target"));
});

test("production config check fails placeholder public origins", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			NUXT_PUBLIC_API_BASE: "https://api.example.com/api",
			NUXT_PUBLIC_SITE_URL: "https://example.com",
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_site_url.placeholder"));
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_api_base.placeholder"));
});

test("production config check fails sqlite admin persistence and weak secrets", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			ACTIVE_LOOKUP_COOKIE_SECRET: "short",
			ADDRESS_CACHE_ENCRYPTION_KEY: "replace-with-an-address-cache-key",
			ADMIN_API_KEY: "replace-with-a-long-random-internal-key",
			ADMIN_DATABASE_URL: "",
			ADMIN_MFA_ENCRYPTION_KEY: "replace-with-a-long-random-admin-mfa-encryption-key",
			ADMIN_SESSION_SECRET: "short",
			ADMIN_STORE_DRIVER: "sqlite",
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("active_lookup_cookie_secret.short"));
	assert.ok(issueIds(evaluation, "errors").includes("address_cache_encryption_key.weak"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_api_key.weak"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_mfa_encryption_key.weak"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_session_secret.short"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_store.driver"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_store.database_url_missing"));
});

test("production config check fails missing or weak protected contact configuration", () => {
	const missingEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			CONTACT_ADDRESS: "",
			CONTACT_ADDRESS_SESSION_SECRET: "",
		}),
	});

	assert.equal(missingEvaluation.ok, false);
	assert.ok(issueIds(missingEvaluation, "errors").includes("contact_address.missing"));
	assert.ok(issueIds(missingEvaluation, "errors").includes("contact_address_session_secret.missing"));

	const invalidEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			CONTACT_ADDRESS: "hello at ballotclarity dot org",
			CONTACT_ADDRESS_SESSION_SECRET: "replace-with-a-long-random-contact-session-secret",
		}),
	});

	assert.equal(invalidEvaluation.ok, false);
	assert.ok(issueIds(invalidEvaluation, "errors").includes("contact_address.invalid"));
	assert.ok(issueIds(invalidEvaluation, "errors").includes("contact_address_session_secret.weak"));

	const placeholderEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			CONTACT_ADDRESS: "reader@example.com",
		}),
	});

	assert.equal(placeholderEvaluation.ok, false);
	assert.ok(issueIds(placeholderEvaluation, "errors").includes("contact_address.placeholder"));
});

test("production config check fails missing or placeholder public legal policy configuration", () => {
	const missingEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			NUXT_PUBLIC_GOVERNING_LAW: "",
			NUXT_PUBLIC_OPERATOR_LEGAL_NAME: "",
			NUXT_PUBLIC_VENUE: "",
		}),
	});

	assert.equal(missingEvaluation.ok, false);
	assert.ok(issueIds(missingEvaluation, "errors").includes("nuxt_public_operator_legal_name.missing"));
	assert.ok(issueIds(missingEvaluation, "errors").includes("nuxt_public_governing_law.missing"));
	assert.ok(issueIds(missingEvaluation, "errors").includes("nuxt_public_venue.missing"));

	const placeholderEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			NUXT_PUBLIC_GOVERNING_LAW: "TBD",
			NUXT_PUBLIC_OPERATOR_LEGAL_NAME: "Example Operator",
			NUXT_PUBLIC_VENUE: "replace with venue",
		}),
	});

	assert.equal(placeholderEvaluation.ok, false);
	assert.ok(issueIds(placeholderEvaluation, "errors").includes("nuxt_public_operator_legal_name.placeholder"));
	assert.ok(issueIds(placeholderEvaluation, "errors").includes("nuxt_public_governing_law.placeholder"));
	assert.ok(issueIds(placeholderEvaluation, "errors").includes("nuxt_public_venue.placeholder"));
});

test("production config check fails invalid throttle values", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			ADMIN_API_FETCH_TIMEOUT_MS: "forever",
			ADMIN_API_RATE_LIMIT_MAX: "unbounded",
			ADMIN_API_RATE_LIMIT_MAX_BUCKETS: "0",
			ADMIN_API_RATE_LIMIT_WINDOW_MS: "-1",
			ADDRESS_CACHE_MAX_ROWS: "unbounded",
			ADMIN_LOGIN_LOCKOUT_MS: "-1000",
			ADMIN_LOGIN_IP_MAX_ATTEMPTS: "none",
			ADMIN_LOGIN_MAX_ATTEMPTS: "many",
			ADMIN_LOGIN_MAX_BUCKETS: "0",
			ADMIN_LOGIN_WINDOW_MS: "0",
			CENSUS_GEOCODER_FETCH_TIMEOUT_MS: "0",
			CONGRESS_FETCH_TIMEOUT_MS: "none",
			CONTACT_ADDRESS_RATE_LIMIT_MAX: "0",
			CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS: "unbounded",
			CONTACT_ADDRESS_RATE_LIMIT_WINDOW_MS: "-1",
			GOOGLE_CIVIC_FETCH_TIMEOUT_MS: "-1",
			LDA_FETCH_TIMEOUT_MS: "none",
			LIVE_COVERAGE_FETCH_MAX_BYTES: "unbounded",
			LIVE_COVERAGE_FETCH_TIMEOUT_MS: "-1",
			NUXT_PUBLIC_API_FETCH_TIMEOUT_MS: "0",
			OPENFEC_FETCH_TIMEOUT_MS: "none",
			OPENSTATES_FETCH_TIMEOUT_MS: "0",
			PROVIDER_RESPONSE_MAX_BYTES: "unbounded",
			PUBLIC_FEEDBACK_RATE_LIMIT_MAX: "0",
			PUBLIC_FEEDBACK_RATE_LIMIT_MAX_BUCKETS: "unbounded",
			PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_MS: "ten-minutes",
			PUBLIC_LOOKUP_RATE_LIMIT_MAX: "60.5",
			PUBLIC_LOOKUP_RATE_LIMIT_MAX_BUCKETS: "-1",
			PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_MS: "-1",
			PUBLIC_REPRESENTATIVE_CACHE_MAX_ENTRIES: "unbounded",
			PUBLIC_REPRESENTATIVE_CACHE_TTL_MS: "forever",
			REPRESENTATIVE_MODULE_CACHE_MAX_ENTRIES: "unbounded",
			REPRESENTATIVE_MODULE_CACHE_TTL_MS: "forever",
			BALLOTCLARITY_ZIP_LOOKUP_LOG_MAX_BYTES: "forever",
			ZIP_LOCATION_FETCH_TIMEOUT_MS: "none",
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("address_cache_max_rows.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_login_lockout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_login_max_attempts.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_login_ip_max_attempts.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_login_max_buckets.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_login_window_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_api_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_api_rate_limit_max.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_api_rate_limit_max_buckets.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("admin_api_rate_limit_window_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("contact_address_rate_limit_max.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("contact_address_rate_limit_max_buckets.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("contact_address_rate_limit_window_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("census_geocoder_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("congress_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("google_civic_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("lda_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage_fetch_max_bytes.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("nuxt_public_api_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("openfec_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("openstates_fetch_timeout_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("provider_response_max_bytes.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_feedback_rate_limit_max.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_feedback_rate_limit_max_buckets.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_feedback_rate_limit_window_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_lookup_rate_limit_max.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_lookup_rate_limit_max_buckets.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_lookup_rate_limit_window_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_representative_cache_max_entries.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("public_representative_cache_ttl_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("representative_module_cache_max_entries.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("representative_module_cache_ttl_ms.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("ballotclarity_zip_lookup_log_max_bytes.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("zip_location_fetch_timeout_ms.invalid"));
});

test("production config check rejects missing or overly broad proxy trust", () => {
	const missing = evaluateProductionConfig({
		env: buildProductionEnv({ TRUST_PROXY: "false" }),
	});
	const broad = evaluateProductionConfig({
		env: buildProductionEnv({ TRUST_PROXY: "true" }),
	});
	const invalid = evaluateProductionConfig({
		env: buildProductionEnv({ TRUST_PROXY: "not-a-range" }),
	});

	assert.ok(issueIds(missing, "errors").includes("trust_proxy.missing"));
	assert.ok(issueIds(broad, "errors").includes("trust_proxy.broad"));
	assert.ok(issueIds(invalid, "errors").includes("trust_proxy.invalid"));
});

test("production config check requires verified provenance for proxy geography headers", () => {
	const untrusted = evaluateProductionConfig({
		env: buildProductionEnv({
			LOCATION_GUESS_MODE: "proxy_headers",
			LOCATION_GUESS_PROXY_POSTAL_CODE_HEADERS: "x-geo-postal-code",
		}),
	});
	const incomplete = evaluateProductionConfig({
		env: buildProductionEnv({
			LOCATION_GUESS_MODE: "proxy_headers",
			LOCATION_GUESS_PROXY_HEADERS_TRUSTED: "true",
		}),
	});
	const trusted = evaluateProductionConfig({
		env: buildProductionEnv({
			LOCATION_GUESS_MODE: "proxy_headers",
			LOCATION_GUESS_PROXY_HEADERS_TRUSTED: "true",
			LOCATION_GUESS_PROXY_POSTAL_CODE_HEADERS: "x-geo-postal-code",
		}),
	});

	assert.ok(issueIds(untrusted, "errors").includes("location_guess_proxy_headers.untrusted"));
	assert.ok(issueIds(incomplete, "errors").includes("location_guess_proxy_headers.incomplete"));
	assert.equal(trusted.ok, true);
});

test("production config check rejects secret reuse across security boundaries", () => {
	const reusedSecret = "r".repeat(48);
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			ADMIN_API_KEY: reusedSecret,
			ADMIN_SESSION_SECRET: reusedSecret,
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("secret.reuse"));
	assert.match(
		evaluation.errors.find(issue => issue.id === "secret.reuse")?.message ?? "",
		/ADMIN_API_KEY, ADMIN_SESSION_SECRET/u
	);
});

test("production config check allows valid optional ballot-content provider endpoints", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			BALLOTPEDIA_API_BASE_URL: "https://api4.ballotpedia.org/data",
			BALLOTPEDIA_API_KEY: "ballotpedia-key",
			BALLOTREADY_API_KEY: "ballotready-key",
			BALLOTREADY_API_URL: "https://bpi.civicengine.com/graphql",
			CTCL_BIP_API_KEY: "ctcl-key",
			CTCL_BIP_API_URL: "https://bip.techandciviclife.org/api",
			DEMOCRACY_WORKS_API_BASE_URL: "https://api.democracy.works/v2",
			DEMOCRACY_WORKS_API_KEY: "democracy-key",
		}),
	});

	assert.equal(evaluation.ok, true);
	assert.deepEqual(evaluation.errors, []);
	assert.deepEqual(evaluation.warnings, []);
});

test("production config check fails unsafe optional ballot-content provider endpoint URLs", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			BALLOTPEDIA_API_BASE_URL: "http://api4.ballotpedia.org/data",
			BALLOTREADY_API_URL: "https://localhost:4000/graphql",
			CTCL_BIP_API_URL: "not a url",
			DEMOCRACY_WORKS_API_BASE_URL: "https://api.example.net/v2",
			SOURCE_ASSET_BASE_URL: "https://assets.example.com/source-files",
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("ctcl_bip_api_url.invalid"));
	assert.ok(issueIds(evaluation, "errors").includes("ballotpedia_api_base_url.https"));
	assert.ok(issueIds(evaluation, "errors").includes("ballotready_api_url.local"));
	assert.ok(issueIds(evaluation, "errors").includes("ballotready_api_url.placeholder"));
	assert.ok(issueIds(evaluation, "errors").includes("democracy_works_api_base_url.placeholder"));
	assert.ok(issueIds(evaluation, "errors").includes("source_asset_base_url.placeholder"));
});

test("production config check warns for one-sided ballot-content provider configuration", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			BALLOTPEDIA_API_BASE_URL: "https://api4.ballotpedia.org/data",
			BALLOTREADY_API_KEY: "ballotready-key",
			CTCL_BIP_API_KEY: "ctcl-key",
			DEMOCRACY_WORKS_API_BASE_URL: "https://api.democracy.works/v2",
		}),
	});

	assert.equal(evaluation.ok, true);
	assert.deepEqual(issueIds(evaluation, "warnings"), [
		"ctcl_bip_api_key.ctcl_bip_api_url_missing",
		"ballotpedia_api_base_url.ballotpedia_api_key_missing",
		"ballotready_api_key.ballotready_api_url_missing",
		"democracy_works_api_base_url.democracy_works_api_key_missing",
	]);

	const ballotReadyEndpointOnlyEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			BALLOTREADY_API_URL: "https://bpi.civicengine.com/graphql",
		}),
	});

	assert.equal(ballotReadyEndpointOnlyEvaluation.ok, true);
	assert.deepEqual(issueIds(ballotReadyEndpointOnlyEvaluation, "warnings"), [
		"ballotready_api_url.ballotready_api_key_missing",
	]);
});

test("production config check fails missing live coverage and seed metadata", () => {
	const missingEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: join(tmpdir(), `missing-${randomUUID()}.json`),
			LIVE_COVERAGE_REQUIRED: "false",
		}),
	});

	assert.equal(missingEvaluation.ok, false);
	assert.ok(issueIds(missingEvaluation, "errors").includes("live_coverage.required"));
	assert.ok(issueIds(missingEvaluation, "errors").includes("live_coverage.file_not_found"));

	const seedEvaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("seed", {
				approvedAt: undefined,
				reviewedAt: undefined,
				sourceType: "seed",
			}),
		}),
	});

	assert.equal(seedEvaluation.ok, false);
	assert.ok(issueIds(seedEvaluation, "errors").includes("live_coverage.status"));
	assert.ok(issueIds(seedEvaluation, "errors").includes("live_coverage.source_type"));
	assert.ok(issueIds(seedEvaluation, "errors").includes("live_coverage.reviewed_at"));
});

test("production config check allows reviewed snapshots with an explicit warning", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("reviewed"),
		}),
	});

	assert.equal(evaluation.ok, true);
	assert.deepEqual(issueIds(evaluation, "warnings"), ["live_coverage.reviewed_not_approved"]);
});

test("production config check requires approvedAt for production-approved snapshots", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("production_approved", {
				approvedAt: undefined,
			}),
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.approved_at"));
});

test("production config check rejects skeletal production snapshots without public coverage shape", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("production_approved", {}, {
				updatedAt: "2026-04-19T19:36:50.252Z",
			}),
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_public_shape"));
});

test("production config check rejects reviewed snapshots with placeholder public URLs", () => {
	const snapshot = buildMinimalCoverageSnapshot();
	const jurisdiction = snapshot.jurisdiction as { officialResources: Array<{ url: string }> };
	jurisdiction.officialResources[0].url = "https://sample-ballot.example";

	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("reviewed", {}, snapshot),
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "warnings").includes("live_coverage.reviewed_not_approved"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_placeholder_url"));
});

test("production config check rejects approved snapshots with reference or staged guide content", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("production_approved", {}, buildMinimalCoverageSnapshot({
				contentStatus: {
					contests: {
						hasContent: true,
						status: "staged_reference",
					},
					mixedContent: true,
				},
				candidates: [
					{
						name: "Elena Torres",
					},
				],
				updatedAt: "2026-04-19T19:36:50.252Z",
			})),
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_reference_content"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_staged_content"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_mixed_content"));
});

test("production config check rejects reviewed snapshots with reference or staged guide content", () => {
	const evaluation = evaluateProductionConfig({
		env: buildProductionEnv({
			LIVE_COVERAGE_FILE: writeSnapshot("reviewed", {}, buildMinimalCoverageSnapshot({
				contentStatus: {
					candidates: {
						hasContent: true,
						status: "seeded_demo",
					},
					mixedContent: true,
				},
				candidates: [
					{
						name: "Daniel Brooks",
					},
				],
				updatedAt: "2026-04-19T19:36:50.252Z",
			})),
		}),
	});

	assert.equal(evaluation.ok, false);
	assert.ok(issueIds(evaluation, "warnings").includes("live_coverage.reviewed_not_approved"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_reference_content"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_staged_content"));
	assert.ok(issueIds(evaluation, "errors").includes("live_coverage.snapshot_mixed_content"));
});
