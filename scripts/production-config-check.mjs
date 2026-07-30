import { existsSync, readFileSync } from "node:fs";
import { validateHeaderName } from "node:http";
import { isIP } from "node:net";
import process from "node:process";

const envLinePattern = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/;
const quotedValuePattern = /^(['"])(.*)\1$/;
const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const weakSecretValues = new Set([
	"admin",
	"ballotclarity",
	"changeme",
	"dev",
	"development",
	"local",
	"password",
	"secret",
	"test",
]);
const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const weakSecretPattern = /(?:example|placeholder|replace[-_ ]?with)/iu;
const weakPublicTextPattern = /(?:example|placeholder|replace[-_ ]?with|tbd|todo|coming soon)/iu;
const referenceArchiveCandidateNames = [
	"Elena Torres",
	"Daniel Brooks",
	"Naomi Park",
	"Thomas Bell",
	"Alicia Greene",
	"Marcus Hill",
	"Sandra Patel",
];
const stagedGuideStatusValues = new Set(["seeded_demo", "staged_reference"]);
const blockedSnapshotHostnameSuffixes = [".example", ".test", ".invalid", ".localhost", ".local", ".internal"];

function normalize(value) {
	return String(value ?? "").trim();
}

function parseEnvContent(content) {
	const parsed = {};

	for (const rawLine of content.split(/\r?\n/u)) {
		const line = rawLine.trim();

		if (!line || line.startsWith("#"))
			continue;

		const match = rawLine.match(envLinePattern);

		if (!match)
			continue;

		const [, key, rawValue = ""] = match;
		const quotedMatch = rawValue.match(quotedValuePattern);
		parsed[key] = quotedMatch ? quotedMatch[2] : rawValue.trim();
	}

	return parsed;
}

function parseUrl(value) {
	try {
		return new URL(value);
	}
	catch {
		return null;
	}
}

function isLocalUrl(url) {
	return Boolean(url && localHostnames.has(url.hostname));
}

function isPrivateIpv4(hostname) {
	const parts = hostname.split(".").map(part => Number(part));

	if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
		return false;

	const [first, second] = parts;

	return first === 10
		|| first === 127
		|| (first === 172 && second >= 16 && second <= 31)
		|| (first === 192 && second === 168)
		|| (first === 169 && second === 254)
		|| (first === 0 && second === 0);
}

function isPlaceholderOrInternalHostname(rawHostname) {
	const hostname = rawHostname.toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "");

	if (hostname === "localhost" || hostname === "::1" || isPrivateIpv4(hostname))
		return true;

	if (hostname === "example.com" || hostname === "example.org" || hostname === "example.net")
		return true;

	if (hostname.endsWith(".example.com") || hostname.endsWith(".example.org") || hostname.endsWith(".example.net"))
		return true;

	return blockedSnapshotHostnameSuffixes.some(suffix => hostname.endsWith(suffix));
}

function hasTruthyValue(value) {
	return ["1", "true", "yes", "on"].includes(normalize(value).toLowerCase());
}

function readConfiguredHeaderNames(env, pluralKey, singularKey) {
	return normalize(env[pluralKey] || env[singularKey])
		.split(",")
		.map(value => value.trim())
		.filter(Boolean);
}

function isValidHeaderName(value) {
	try {
		validateHeaderName(value);
		return true;
	}
	catch {
		return false;
	}
}

function checkLocationGuess({ env, errors, warnings }) {
	const mode = normalize(env.LOCATION_GUESS_MODE).toLowerCase() || "disabled";
	const supportedModes = new Set(["disabled", "browser_geolocation", "geoip_provider", "proxy_headers"]);

	if (!supportedModes.has(mode)) {
		errors.push(issue(
			"error",
			"location_guess_mode.invalid",
			"LOCATION_GUESS_MODE must be disabled, browser_geolocation, geoip_provider, or proxy_headers.",
		));
		return;
	}

	if (mode === "browser_geolocation" || mode === "geoip_provider") {
		warnings.push(issue(
			"warning",
			"location_guess_mode.inactive",
			`${mode} is reserved but does not enable automatic server-side guessing in the current release.`,
		));
		return;
	}

	if (mode !== "proxy_headers")
		return;

	if (!hasTruthyValue(env.LOCATION_GUESS_PROXY_HEADERS_TRUSTED)) {
		errors.push(issue(
			"error",
			"location_guess_proxy_headers.untrusted",
			"proxy_headers location guessing requires LOCATION_GUESS_PROXY_HEADERS_TRUSTED=true after the trusted edge is configured to remove and overwrite client-supplied geography headers.",
		));
	}

	const headerFields = {
		city: readConfiguredHeaderNames(env, "LOCATION_GUESS_PROXY_CITY_HEADERS", "LOCATION_GUESS_PROXY_CITY_HEADER"),
		country: readConfiguredHeaderNames(env, "LOCATION_GUESS_PROXY_COUNTRY_HEADERS", "LOCATION_GUESS_PROXY_COUNTRY_HEADER"),
		postalCode: readConfiguredHeaderNames(env, "LOCATION_GUESS_PROXY_POSTAL_CODE_HEADERS", "LOCATION_GUESS_PROXY_POSTAL_CODE_HEADER"),
		region: readConfiguredHeaderNames(env, "LOCATION_GUESS_PROXY_REGION_HEADERS", "LOCATION_GUESS_PROXY_REGION_HEADER"),
	};

	for (const [field, names] of Object.entries(headerFields)) {
		if (names.length > 16 || names.some(name => name.length > 128 || !isValidHeaderName(name))) {
			errors.push(issue(
				"error",
				`location_guess_proxy_headers.${field}.invalid`,
				`Configured ${field} proxy geography headers must contain at most 16 valid HTTP header names of at most 128 characters each.`,
			));
		}
	}

	if (!headerFields.postalCode.length && !(headerFields.city.length && headerFields.region.length)) {
		errors.push(issue(
			"error",
			"location_guess_proxy_headers.incomplete",
			"proxy_headers location guessing requires a postal-code header or both city and region headers.",
		));
	}
}

function isValidTrustProxyRange(value) {
	const namedRanges = new Set(["linklocal", "loopback", "uniquelocal"]);

	if (namedRanges.has(value.toLowerCase()))
		return true;

	const [address, prefix, ...extra] = value.split("/");
	const family = isIP(address ?? "");

	if (!family || extra.length)
		return false;

	if (prefix === undefined)
		return true;

	const parsedPrefix = Number(prefix);
	return Number.isInteger(parsedPrefix)
		&& parsedPrefix >= 0
		&& parsedPrefix <= (family === 4 ? 32 : 128);
}

function checkTrustProxy({ errors, value }) {
	const normalized = normalize(value);
	const lowered = normalized.toLowerCase();

	if (!normalized || ["0", "false", "no", "off"].includes(lowered)) {
		errors.push(issue(
			"error",
			"trust_proxy.missing",
			"TRUST_PROXY must list the production reverse proxy IPs, CIDR ranges, or named ranges.",
		));
		return;
	}

	if (["1", "true", "yes", "on"].includes(lowered) || /^\d+$/u.test(normalized)) {
		errors.push(issue(
			"error",
			"trust_proxy.broad",
			"TRUST_PROXY must not trust every proxy or an unverified hop count; use explicit proxy ranges.",
		));
		return;
	}

	const ranges = normalized.split(",").map(range => range.trim()).filter(Boolean);

	if (!ranges.length || ranges.some(range => !isValidTrustProxyRange(range))) {
		errors.push(issue(
			"error",
			"trust_proxy.invalid",
			"TRUST_PROXY contains an invalid proxy IP, CIDR range, or named range.",
		));
	}
}

function issue(severity, id, message) {
	return {
		id,
		message,
		severity,
	};
}

function checkPublicUrl({ errors, key, pathRequired, value }) {
	const raw = normalize(value);

	if (!raw) {
		errors.push(issue("error", `${key.toLowerCase()}.missing`, `${key} is required for production.`));
		return null;
	}

	const url = parseUrl(raw);

	if (!url) {
		errors.push(issue("error", `${key.toLowerCase()}.invalid`, `${key} must be a valid absolute URL.`));
		return null;
	}

	if (url.protocol !== "https:")
		errors.push(issue("error", `${key.toLowerCase()}.https`, `${key} must use https in production.`));

	if (isLocalUrl(url))
		errors.push(issue("error", `${key.toLowerCase()}.local`, `${key} must not point at localhost in production.`));

	if (isPlaceholderOrInternalHostname(url.hostname)) {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.placeholder`,
			`${key} must not point at a placeholder or internal hostname in production.`,
		));
	}

	if (pathRequired && !url.pathname.replace(/\/+$/u, "").endsWith(pathRequired)) {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.path`,
			`${key} must point at the public ${pathRequired} API path.`,
		));
	}

	return url;
}

function checkSecret({ errors, key, minLength = 32, value }) {
	const raw = normalize(value);

	if (!raw) {
		errors.push(issue("error", `${key.toLowerCase()}.missing`, `${key} is required for production.`));
		return;
	}

	if (raw.length < minLength)
		errors.push(issue("error", `${key.toLowerCase()}.short`, `${key} must be at least ${minLength} characters.`));

	if (weakSecretValues.has(raw.toLowerCase()) || weakSecretPattern.test(raw))
		errors.push(issue("error", `${key.toLowerCase()}.weak`, `${key} appears to use a placeholder value.`));
}

function checkDistinctSecrets({ errors, secrets }) {
	const keysByValue = new Map();

	for (const [key, value] of Object.entries(secrets)) {
		const normalized = normalize(value);

		if (!normalized)
			continue;

		const matchingKeys = keysByValue.get(normalized) ?? [];
		matchingKeys.push(key);
		keysByValue.set(normalized, matchingKeys);
	}

	const reusedKeyGroups = Array.from(keysByValue.values()).filter(keys => keys.length > 1);

	if (reusedKeyGroups.length) {
		errors.push(issue(
			"error",
			"secret.reuse",
			`Production secrets must be independently generated. Reused values were found across: ${reusedKeyGroups.map(keys => keys.join(", ")).join("; ")}.`,
		));
	}
}

function checkContactAddress({ errors, value }) {
	const raw = normalize(value);

	if (!raw) {
		errors.push(issue(
			"error",
			"contact_address.missing",
			"CONTACT_ADDRESS or NUXT_CONTACT_ADDRESS is required for the protected public contact email route.",
		));
		return;
	}

	if (!emailAddressPattern.test(raw)) {
		errors.push(issue(
			"error",
			"contact_address.invalid",
			"CONTACT_ADDRESS or NUXT_CONTACT_ADDRESS must be a single valid email address.",
		));
		return;
	}

	const domain = raw.split("@").pop() || "";

	if (isPlaceholderOrInternalHostname(domain)) {
		errors.push(issue(
			"error",
			"contact_address.placeholder",
			"CONTACT_ADDRESS or NUXT_CONTACT_ADDRESS must not use a placeholder or internal email domain.",
		));
	}
}

function checkRequiredPublicText({ errors, key, label, value }) {
	const raw = normalize(value);
	const normalizedKey = key.toLowerCase();

	if (!raw) {
		errors.push(issue(
			"error",
			`${normalizedKey}.missing`,
			`${key} is required for production ${label}.`,
		));
		return;
	}

	if (weakPublicTextPattern.test(raw)) {
		errors.push(issue(
			"error",
			`${normalizedKey}.placeholder`,
			`${key} must not use placeholder public policy text in production.`,
		));
	}
}

function checkPositiveInteger({ errors, key, value }) {
	const raw = normalize(value);

	if (!raw)
		return;

	const parsed = Number(raw);

	if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(parsed) || parsed < 1) {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.invalid`,
			`${key} must be a positive integer when set.`,
		));
	}
}

function checkOptionalHttpsUrl({ errors, key, value }) {
	const raw = normalize(value);

	if (!raw)
		return null;

	const url = parseUrl(raw);

	if (!url) {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.invalid`,
			`${key} must be a valid absolute URL when set.`,
		));
		return null;
	}

	if (url.protocol !== "https:") {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.https`,
			`${key} must use https in production when set.`,
		));
	}

	if (isLocalUrl(url)) {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.local`,
			`${key} must not point at localhost in production when set.`,
		));
	}

	if (isPlaceholderOrInternalHostname(url.hostname)) {
		errors.push(issue(
			"error",
			`${key.toLowerCase()}.placeholder`,
			`${key} must not point at a placeholder or internal hostname in production when set.`,
		));
	}

	return url;
}

function warnWhenSetWithoutPair({ key, pairKey, value, pairValue, warnings }) {
	if (!normalize(value) || normalize(pairValue))
		return;

	warnings.push(issue(
		"warning",
		`${key.toLowerCase()}.${pairKey.toLowerCase()}_missing`,
		`${key} is set but ${pairKey} is not; confirm this ballot-content provider is intentionally inactive or pending access.`,
	));
}

function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
	return normalize(value).length > 0;
}

function readSnapshotMetadata({ errors, fs, snapshotPath }) {
	const metadataPath = `${snapshotPath}.meta.json`;

	if (!fs.existsSync(metadataPath)) {
		errors.push(issue(
			"error",
			"live_coverage.metadata_missing",
			"LIVE_COVERAGE_FILE must have a matching .meta.json sidecar.",
		));
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
	}
	catch {
		errors.push(issue(
			"error",
			"live_coverage.metadata_invalid",
			"LIVE_COVERAGE_FILE metadata sidecar must be valid JSON.",
		));
		return null;
	}
}

function readSnapshotPayload({ errors, fs, snapshotPath }) {
	try {
		return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
	}
	catch {
		errors.push(issue(
			"error",
			"live_coverage.snapshot_invalid",
			"LIVE_COVERAGE_FILE must be valid JSON.",
		));
		return null;
	}
}

function findSnapshotContentIssues(value, path = "$") {
	const referenceMatches = [];
	const stagedStatusPaths = [];
	const mixedContentPaths = [];
	const placeholderUrlMatches = [];

	function visit(current, currentPath) {
		if (typeof current === "string") {
			for (const name of referenceArchiveCandidateNames) {
				if (current.includes(name))
					referenceMatches.push({ name, path: currentPath });
			}

			if (stagedGuideStatusValues.has(current))
				stagedStatusPaths.push(currentPath);

			if (/^https?:\/\//iu.test(current)) {
				try {
					const url = new URL(current);

					if (isPlaceholderOrInternalHostname(url.hostname)) {
						placeholderUrlMatches.push({
							hostname: url.hostname,
							path: currentPath,
							url: current,
						});
					}
				}
				catch {
					// Invalid URLs are handled by field-specific checks where applicable.
				}
			}

			return;
		}

		if (Array.isArray(current)) {
			current.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
			return;
		}

		if (!current || typeof current !== "object")
			return;

		for (const [key, child] of Object.entries(current)) {
			const childPath = `${currentPath}.${key}`;

			if (key === "mixedContent" && child === true)
				mixedContentPaths.push(childPath);

			visit(child, childPath);
		}
	}

	visit(value, path);

	return {
		mixedContentPaths,
		placeholderUrlMatches,
		referenceMatches,
		stagedStatusPaths,
	};
}

function hasOfficialResource(value) {
	return Array.isArray(value) && value.some((item) => {
		return isRecord(item) && hasText(item.url) && hasText(item.label || item.title || item.name);
	});
}

function checkRequiredTextFields({ missingFields, object, path, fields }) {
	for (const field of fields) {
		if (!hasText(object?.[field]))
			missingFields.push(`${path}.${field}`);
	}
}

function checkSnapshotPublicShape({ errors, snapshot }) {
	const missingFields = [];

	if (!isRecord(snapshot)) {
		errors.push(issue(
			"error",
			"live_coverage.snapshot_public_shape",
			"Production coverage snapshot must be a JSON object with public coverage fields.",
		));
		return;
	}

	for (const field of ["candidates", "measures", "sources", "electionSummaries", "jurisdictionSummaries"]) {
		if (!Array.isArray(snapshot[field]))
			missingFields.push(`${field}[]`);
	}

	if (Array.isArray(snapshot.electionSummaries) && snapshot.electionSummaries.length === 0)
		missingFields.push("electionSummaries[0]");

	if (Array.isArray(snapshot.jurisdictionSummaries) && snapshot.jurisdictionSummaries.length === 0)
		missingFields.push("jurisdictionSummaries[0]");

	if (!hasText(snapshot.updatedAt))
		missingFields.push("updatedAt");

	if (!isRecord(snapshot.dataSources)) {
		missingFields.push("dataSources");
	}
	else {
		if (!Array.isArray(snapshot.dataSources.categories))
			missingFields.push("dataSources.categories[]");
		else if (snapshot.dataSources.categories.length === 0)
			missingFields.push("dataSources.categories[0]");

		if (!hasText(snapshot.dataSources.updatedAt))
			missingFields.push("dataSources.updatedAt");
	}

	const election = snapshot.election;
	if (!isRecord(election)) {
		missingFields.push("election");
	}
	else {
		checkRequiredTextFields({
			fields: ["slug", "name", "date", "jurisdictionSlug", "locationName", "updatedAt"],
			missingFields,
			object: election,
			path: "election",
		});

		if (!Array.isArray(election.contests))
			missingFields.push("election.contests[]");
	}

	const jurisdiction = snapshot.jurisdiction;
	if (!isRecord(jurisdiction)) {
		missingFields.push("jurisdiction");
	}
	else {
		checkRequiredTextFields({
			fields: ["slug", "displayName", "state", "jurisdictionType", "updatedAt"],
			missingFields,
			object: jurisdiction,
			path: "jurisdiction",
		});
	}

	const location = snapshot.location;
	if (!isRecord(location)) {
		missingFields.push("location");
	}
	else {
		checkRequiredTextFields({
			fields: ["slug", "displayName", "state", "lookupMode"],
			missingFields,
			object: location,
			path: "location",
		});
	}

	const officialResourcesAvailable = hasOfficialResource(election?.officialResources)
		|| hasOfficialResource(jurisdiction?.officialResources)
		|| hasOfficialResource(snapshot.dataSources?.launchTarget?.officialResources);

	if (!officialResourcesAvailable)
		missingFields.push("officialResources");

	if (missingFields.length) {
		errors.push(issue(
			"error",
			"live_coverage.snapshot_public_shape",
			`Production coverage snapshot is missing required public coverage fields: ${Array.from(new Set(missingFields)).join(", ")}.`,
		));
	}
}

function checkSnapshotMetadata({ errors, metadata, warnings }) {
	const status = normalize(metadata?.status);
	const sourceType = normalize(metadata?.sourceType);

	if (status !== "reviewed" && status !== "production_approved") {
		errors.push(issue(
			"error",
			"live_coverage.status",
			"Production coverage snapshot status must be reviewed or production_approved.",
		));
	}

	if (sourceType !== "imported") {
		errors.push(issue(
			"error",
			"live_coverage.source_type",
			"Production coverage snapshot sourceType must be imported.",
		));
	}

	if (!normalize(metadata?.sourceLabel)) {
		errors.push(issue(
			"error",
			"live_coverage.source_label",
			"Production coverage snapshot metadata must include sourceLabel.",
		));
	}

	if (!normalize(metadata?.reviewedAt)) {
		errors.push(issue(
			"error",
			"live_coverage.reviewed_at",
			"Reviewed or production-approved coverage snapshot metadata must include reviewedAt.",
		));
	}

	if (status === "production_approved" && !normalize(metadata?.approvedAt)) {
		errors.push(issue(
			"error",
			"live_coverage.approved_at",
			"Production-approved coverage snapshot metadata must include approvedAt.",
		));
	}

	if (status === "reviewed") {
		warnings.push(issue(
			"warning",
			"live_coverage.reviewed_not_approved",
			"Coverage snapshot is reviewed but not production-approved; public copy must keep that editorial state visible.",
		));
	}
}

function checkSnapshotPayload({ errors, metadata, snapshot }) {
	const status = normalize(metadata?.status);

	if ((status !== "reviewed" && status !== "production_approved") || !snapshot)
		return;

	checkSnapshotPublicShape({ errors, snapshot });

	const issues = findSnapshotContentIssues(snapshot);

	if (issues.referenceMatches.length) {
		const matchedNames = Array.from(new Set(issues.referenceMatches.map(match => match.name))).join(", ");
		errors.push(issue(
			"error",
			"live_coverage.snapshot_reference_content",
			`Production coverage snapshot still contains staged/reference candidate names: ${matchedNames}.`,
		));
	}

	if (issues.stagedStatusPaths.length) {
		errors.push(issue(
			"error",
			"live_coverage.snapshot_staged_content",
			"Production coverage snapshot cannot include seeded_demo or staged_reference content markers.",
		));
	}

	if (issues.mixedContentPaths.length) {
		errors.push(issue(
			"error",
			"live_coverage.snapshot_mixed_content",
			"Production coverage snapshot cannot include guide content marked mixedContent=true.",
		));
	}

	if (issues.placeholderUrlMatches.length) {
		const matchedHosts = Array.from(new Set(issues.placeholderUrlMatches.map(match => match.hostname))).join(", ");
		errors.push(issue(
			"error",
			"live_coverage.snapshot_placeholder_url",
			`Production coverage snapshot cannot include placeholder or internal public URLs: ${matchedHosts}.`,
		));
	}
}

export function evaluateProductionConfig({
	env = process.env,
	fs = { existsSync, readFileSync },
} = {}) {
	const errors = [];
	const warnings = [];
	const publicSiteUrl = checkPublicUrl({
		errors,
		key: "NUXT_PUBLIC_SITE_URL",
		value: env.NUXT_PUBLIC_SITE_URL,
	});
	const publicApiBase = checkPublicUrl({
		errors,
		key: "NUXT_PUBLIC_API_BASE",
		pathRequired: "/api",
		value: env.NUXT_PUBLIC_API_BASE,
	});
	const adminApiBaseRaw = normalize(env.ADMIN_API_BASE);

	if (!adminApiBaseRaw) {
		errors.push(issue("error", "admin_api_base.missing", "ADMIN_API_BASE is required for production."));
	}
	else {
		const adminApiBase = parseUrl(adminApiBaseRaw);

		if (!adminApiBase) {
			errors.push(issue("error", "admin_api_base.invalid", "ADMIN_API_BASE must be a valid absolute URL."));
		}
		else if (publicApiBase && adminApiBase.href === publicApiBase.href) {
			errors.push(issue(
				"error",
				"admin_api_base.public_target",
				"ADMIN_API_BASE must be a private server-side target, not the public browser API base.",
			));
		}
	}

	if (publicSiteUrl && publicApiBase && publicSiteUrl.hostname !== publicApiBase.hostname) {
		warnings.push(issue(
			"warning",
			"public_origin.split",
			"NUXT_PUBLIC_SITE_URL and NUXT_PUBLIC_API_BASE use different hosts; confirm CORS and cookie behavior intentionally support this.",
		));
	}

	checkSecret({ errors, key: "ADMIN_API_KEY", value: env.ADMIN_API_KEY });
	checkSecret({ errors, key: "ADMIN_SESSION_SECRET", value: env.ADMIN_SESSION_SECRET });
	checkSecret({
		errors,
		key: "ADMIN_MFA_ENCRYPTION_KEY",
		value: env.ADMIN_MFA_ENCRYPTION_KEY,
	});
	checkSecret({
		errors,
		key: "ACTIVE_LOOKUP_COOKIE_SECRET",
		value: env.ACTIVE_LOOKUP_COOKIE_SECRET,
	});
	checkSecret({
		errors,
		key: "ADDRESS_CACHE_ENCRYPTION_KEY",
		value: env.ADDRESS_CACHE_ENCRYPTION_KEY,
	});
	checkSecret({
		errors,
		key: "CONTACT_ADDRESS_SESSION_SECRET",
		value: env.CONTACT_ADDRESS_SESSION_SECRET || env.NUXT_CONTACT_ADDRESS_SESSION_SECRET,
	});
	checkDistinctSecrets({
		errors,
		secrets: {
			ACTIVE_LOOKUP_COOKIE_SECRET: env.ACTIVE_LOOKUP_COOKIE_SECRET,
			ADDRESS_CACHE_ENCRYPTION_KEY: env.ADDRESS_CACHE_ENCRYPTION_KEY,
			ADMIN_API_KEY: env.ADMIN_API_KEY,
			ADMIN_MFA_ENCRYPTION_KEY: env.ADMIN_MFA_ENCRYPTION_KEY,
			ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET,
			CONTACT_ADDRESS_SESSION_SECRET: env.CONTACT_ADDRESS_SESSION_SECRET || env.NUXT_CONTACT_ADDRESS_SESSION_SECRET,
		},
	});
	checkContactAddress({
		errors,
		value: env.CONTACT_ADDRESS || env.NUXT_CONTACT_ADDRESS,
	});
	checkRequiredPublicText({
		errors,
		key: "NUXT_PUBLIC_OPERATOR_LEGAL_NAME",
		label: "Terms and Privacy operator-name copy",
		value: env.NUXT_PUBLIC_OPERATOR_LEGAL_NAME,
	});
	checkRequiredPublicText({
		errors,
		key: "NUXT_PUBLIC_GOVERNING_LAW",
		label: "Terms governing-law copy",
		value: env.NUXT_PUBLIC_GOVERNING_LAW,
	});
	checkRequiredPublicText({
		errors,
		key: "NUXT_PUBLIC_VENUE",
		label: "Terms venue copy",
		value: env.NUXT_PUBLIC_VENUE,
	});
	checkPositiveInteger({
		errors,
		key: "NUXT_PUBLIC_API_FETCH_TIMEOUT_MS",
		value: env.NUXT_PUBLIC_API_FETCH_TIMEOUT_MS,
	});
	checkPositiveInteger({
		errors,
		key: "ADMIN_API_FETCH_TIMEOUT_MS",
		value: env.ADMIN_API_FETCH_TIMEOUT_MS,
	});
	checkPositiveInteger({
		errors,
		key: "CONTACT_ADDRESS_RATE_LIMIT_WINDOW_MS",
		value: env.CONTACT_ADDRESS_RATE_LIMIT_WINDOW_MS,
	});
	checkPositiveInteger({
		errors,
		key: "CONTACT_ADDRESS_RATE_LIMIT_MAX",
		value: env.CONTACT_ADDRESS_RATE_LIMIT_MAX,
	});
	checkPositiveInteger({
		errors,
		key: "CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS",
		value: env.CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS,
	});
	checkPositiveInteger({
		errors,
		key: "PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_MS",
		value: env.PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_MS,
	});
	checkPositiveInteger({
		errors,
		key: "PUBLIC_FEEDBACK_RATE_LIMIT_MAX",
		value: env.PUBLIC_FEEDBACK_RATE_LIMIT_MAX,
	});
	checkPositiveInteger({
		errors,
		key: "PUBLIC_FEEDBACK_RATE_LIMIT_MAX_BUCKETS",
		value: env.PUBLIC_FEEDBACK_RATE_LIMIT_MAX_BUCKETS,
	});
	checkPositiveInteger({
		errors,
		key: "PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_MS",
		value: env.PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_MS,
	});
	checkPositiveInteger({
		errors,
		key: "PUBLIC_LOOKUP_RATE_LIMIT_MAX",
		value: env.PUBLIC_LOOKUP_RATE_LIMIT_MAX,
	});
	checkPositiveInteger({
		errors,
		key: "PUBLIC_LOOKUP_RATE_LIMIT_MAX_BUCKETS",
		value: env.PUBLIC_LOOKUP_RATE_LIMIT_MAX_BUCKETS,
	});
	checkPositiveInteger({
		errors,
		key: "ADMIN_LOGIN_WINDOW_MS",
		value: env.ADMIN_LOGIN_WINDOW_MS,
	});
	checkPositiveInteger({
		errors,
		key: "ADMIN_LOGIN_MAX_ATTEMPTS",
		value: env.ADMIN_LOGIN_MAX_ATTEMPTS,
	});
	checkPositiveInteger({
		errors,
		key: "ADMIN_LOGIN_IP_MAX_ATTEMPTS",
		value: env.ADMIN_LOGIN_IP_MAX_ATTEMPTS,
	});
	checkPositiveInteger({
		errors,
		key: "ADMIN_LOGIN_LOCKOUT_MS",
		value: env.ADMIN_LOGIN_LOCKOUT_MS,
	});
	checkPositiveInteger({
		errors,
		key: "ADMIN_LOGIN_MAX_BUCKETS",
		value: env.ADMIN_LOGIN_MAX_BUCKETS,
	});
	for (const key of [
		"GOOGLE_CIVIC_FETCH_TIMEOUT_MS",
		"CONGRESS_FETCH_TIMEOUT_MS",
		"OPENFEC_FETCH_TIMEOUT_MS",
		"OPENSTATES_FETCH_TIMEOUT_MS",
		"LDA_FETCH_TIMEOUT_MS",
		"CENSUS_GEOCODER_FETCH_TIMEOUT_MS",
		"ZIP_LOCATION_FETCH_TIMEOUT_MS",
		"PROVIDER_RESPONSE_MAX_BYTES",
		"ADDRESS_CACHE_MAX_ROWS",
		"REPRESENTATIVE_MODULE_CACHE_MAX_ENTRIES",
		"REPRESENTATIVE_MODULE_CACHE_TTL_MS",
		"PUBLIC_REPRESENTATIVE_CACHE_MAX_ENTRIES",
		"PUBLIC_REPRESENTATIVE_CACHE_TTL_MS",
		"BALLOTCLARITY_ZIP_LOOKUP_LOG_MAX_BYTES",
		"LIVE_COVERAGE_FETCH_TIMEOUT_MS",
		"LIVE_COVERAGE_FETCH_MAX_BYTES",
	]) {
		checkPositiveInteger({
			errors,
			key,
			value: env[key],
		});
	}
	checkOptionalHttpsUrl({
		errors,
		key: "CTCL_BIP_API_URL",
		value: env.CTCL_BIP_API_URL,
	});
	checkOptionalHttpsUrl({
		errors,
		key: "BALLOTPEDIA_API_BASE_URL",
		value: env.BALLOTPEDIA_API_BASE_URL,
	});
	checkOptionalHttpsUrl({
		errors,
		key: "BALLOTREADY_API_URL",
		value: env.BALLOTREADY_API_URL,
	});
	checkOptionalHttpsUrl({
		errors,
		key: "DEMOCRACY_WORKS_API_BASE_URL",
		value: env.DEMOCRACY_WORKS_API_BASE_URL,
	});
	warnWhenSetWithoutPair({
		key: "CTCL_BIP_API_KEY",
		pairKey: "CTCL_BIP_API_URL",
		pairValue: env.CTCL_BIP_API_URL,
		value: env.CTCL_BIP_API_KEY,
		warnings,
	});
	warnWhenSetWithoutPair({
		key: "BALLOTPEDIA_API_BASE_URL",
		pairKey: "BALLOTPEDIA_API_KEY",
		pairValue: env.BALLOTPEDIA_API_KEY,
		value: env.BALLOTPEDIA_API_BASE_URL,
		warnings,
	});
	warnWhenSetWithoutPair({
		key: "BALLOTREADY_API_KEY",
		pairKey: "BALLOTREADY_API_URL",
		pairValue: env.BALLOTREADY_API_URL,
		value: env.BALLOTREADY_API_KEY,
		warnings,
	});
	warnWhenSetWithoutPair({
		key: "BALLOTREADY_API_URL",
		pairKey: "BALLOTREADY_API_KEY",
		pairValue: env.BALLOTREADY_API_KEY,
		value: env.BALLOTREADY_API_URL,
		warnings,
	});
	warnWhenSetWithoutPair({
		key: "DEMOCRACY_WORKS_API_BASE_URL",
		pairKey: "DEMOCRACY_WORKS_API_KEY",
		pairValue: env.DEMOCRACY_WORKS_API_KEY,
		value: env.DEMOCRACY_WORKS_API_BASE_URL,
		warnings,
	});

	const adminStoreDriver = normalize(env.ADMIN_STORE_DRIVER).toLowerCase();
	const adminDatabaseUrl = normalize(env.ADMIN_DATABASE_URL || env.DATABASE_URL);

	if (adminStoreDriver !== "postgres") {
		errors.push(issue(
			"error",
			"admin_store.driver",
			"ADMIN_STORE_DRIVER must be postgres for production.",
		));
	}

	if (!adminDatabaseUrl) {
		errors.push(issue(
			"error",
			"admin_store.database_url_missing",
			"ADMIN_DATABASE_URL or DATABASE_URL is required for production admin/editor persistence.",
		));
	}
	else if (!/^postgres(?:ql)?:\/\//iu.test(adminDatabaseUrl)) {
		errors.push(issue(
			"error",
			"admin_store.database_url_scheme",
			"ADMIN_DATABASE_URL or DATABASE_URL must use a postgres:// or postgresql:// URL.",
		));
	}

	if (!hasTruthyValue(env.LIVE_COVERAGE_REQUIRED)) {
		errors.push(issue(
			"error",
			"live_coverage.required",
			"LIVE_COVERAGE_REQUIRED must be true so production fails closed when the active snapshot is missing.",
		));
	}

	const liveCoverageFile = normalize(env.LIVE_COVERAGE_FILE);

	if (!liveCoverageFile) {
		errors.push(issue("error", "live_coverage.file_missing", "LIVE_COVERAGE_FILE is required for production."));
	}
	else if (!fs.existsSync(liveCoverageFile)) {
		errors.push(issue("error", "live_coverage.file_not_found", "LIVE_COVERAGE_FILE does not exist."));
	}
	else {
		const metadata = readSnapshotMetadata({ errors, fs, snapshotPath: liveCoverageFile });
		const snapshot = readSnapshotPayload({ errors, fs, snapshotPath: liveCoverageFile });

		if (metadata) {
			checkSnapshotMetadata({ errors, metadata, warnings });
			checkSnapshotPayload({ errors, metadata, snapshot });
		}
	}

	if (!normalize(env.SOURCE_ASSET_BASE_URL)) {
		warnings.push(issue(
			"warning",
			"source_asset_base_url.missing",
			"SOURCE_ASSET_BASE_URL is not set; mirrored source files will rely on bundled static assets.",
		));
	}
	else {
		checkOptionalHttpsUrl({
			errors,
			key: "SOURCE_ASSET_BASE_URL",
			value: env.SOURCE_ASSET_BASE_URL,
		});
	}

	checkTrustProxy({ errors, value: env.TRUST_PROXY });
	checkLocationGuess({ env, errors, warnings });

	if (hasTruthyValue(env.BALLOTCLARITY_ZIP_LOOKUP_LOG_ENABLED) && !normalize(env.BALLOTCLARITY_ZIP_LOOKUP_LOG_PATH)) {
		warnings.push(issue(
			"warning",
			"zip_lookup_log.default_path",
			"ZIP-only lookup logging is enabled without an explicit path; the backend will use its default JSONL path.",
		));
	}

	return {
		errors,
		ok: errors.length === 0,
		warnings,
	};
}

export function formatProductionConfigEvaluation(evaluation) {
	const lines = [
		evaluation.ok ? "Production config check: pass" : "Production config check: fail",
		`Errors: ${evaluation.errors.length}`,
		`Warnings: ${evaluation.warnings.length}`,
	];

	for (const error of evaluation.errors)
		lines.push(`Error [${error.id}]: ${error.message}`);

	for (const warning of evaluation.warnings)
		lines.push(`Warning [${warning.id}]: ${warning.message}`);

	return lines.join("\n");
}

function readFlag(flag, argv = process.argv.slice(2)) {
	const index = argv.indexOf(flag);

	if (index === -1)
		return undefined;

	return argv[index + 1];
}

function buildCliEnv() {
	const envPath = readFlag("--env-file");

	if (!envPath)
		return process.env;

	return {
		...process.env,
		...parseEnvContent(readFileSync(envPath, "utf8")),
	};
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("production-config-check.mjs");

if (isDirectRun) {
	const evaluation = evaluateProductionConfig({ env: buildCliEnv() });

	if (process.argv.includes("--json"))
		console.log(JSON.stringify(evaluation, null, 2));
	else
		console.log(formatProductionConfigEvaluation(evaluation));

	if (!evaluation.ok)
		process.exit(1);
}
