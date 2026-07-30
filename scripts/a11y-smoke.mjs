import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { buildFultonOfficialLogisticsOnlySnapshot } from "../back-end/src/fulton-reviewed-coverage.js";

const require = createRequire(import.meta.url);
const axeSourcePath = require.resolve("axe-core/axe.min.js");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const frontendPackagePath = resolve(projectRoot, "front-end/package.json");
const frontendPackage = JSON.parse(readFileSync(frontendPackagePath, "utf8"));

const siteName = "Ballot Clarity";
const frontendKind = "nuxt";
const frontendPort = Number(process.env.A11Y_FRONTEND_PORT || 3346);
const apiPort = Number(process.env.A11Y_API_PORT || 3046);
const browserLaunchTimeoutMs = Number(process.env.A11Y_BROWSER_LAUNCH_TIMEOUT_MS || 60_000);
const pageTimeoutMs = Number(process.env.A11Y_PAGE_TIMEOUT_MS || 45_000);
const baseUrl = `http://127.0.0.1:${frontendPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}/api`;
const defaultRoutes = [
	"/",
	"/ballot/2026-fulton-county-general",
	"/elections/2026-fulton-county-general",
	"/locations/fulton-county-georgia",
	"/results",
	"/coverage",
	"/status",
	"/sources",
	"/sources/official-election-verification",
	"/data-sources",
	"/districts",
	"/representatives",
	"/corrections",
	"/help",
	"/about",
	"/accessibility",
	"/methodology",
	"/neutrality",
	"/privacy",
	"/terms",
	"/contact",
	"/plan",
	"/compare",
	"/search"
];
const routes = process.env.A11Y_ROUTES
	? process.env.A11Y_ROUTES
			.split(",")
			.map(route => route.trim())
			.filter(Boolean)
	: defaultRoutes;
const colorSchemes = (process.env.A11Y_COLOR_SCHEMES || "light,dark")
	.split(",")
	.map(scheme => scheme.trim())
	.filter(Boolean);

const chromeCandidates = [
	process.env.PUPPETEER_EXECUTABLE_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome-stable",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium-browser",
	"/usr/bin/chromium"
].filter(Boolean);

const chromePath = chromeCandidates.find(candidate => existsSync(candidate));
if (chromePath) process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;

const updatedAt = "2026-06-12T12:00:00.000Z";
const reviewedSnapshot = buildFultonOfficialLogisticsOnlySnapshot(updatedAt);
const reviewedElection = reviewedSnapshot.election;
const reviewedJurisdiction = reviewedSnapshot.jurisdiction;
const reviewedLocation = reviewedSnapshot.location;

const mockLaunchTarget = {
	currentElectionDate: "2026-11-03",
	currentElectionName: "November 3, 2026 Fulton County election guide",
	displayName: "Fulton County, Georgia",
	name: "Fulton County",
	nextElectionDate: "2026-11-03",
	nextElectionName: "November 3, 2026 Fulton County election guide",
	officialResources: [
		{
			authority: "official-government",
			label: "Georgia My Voter Page",
			sourceLabel: "Georgia Secretary of State",
			sourceSystem: "Official state voter portal",
			url: "https://mvp.sos.ga.gov/"
		}
	],
	phase: "launching",
	phaseLabel: "Election overview available",
	referenceLinks: [
		{
			label: "Fulton County Elections",
			note: "Official county election office.",
			url: "https://www.fultoncountyga.gov/inside-fulton-county/fulton-county-departments/registration-and-elections"
		}
	],
	slug: "fulton-county",
	state: "GA",
	summary: "Official election links and representative lookup are available while reviewed contest content remains under local review."
};

function guideLayer(label, status, detail, count = 0) {
	return {
		count,
		detail,
		hasContent: count > 0 || status === "official_logistics_only" || status === "verified_local",
		label,
		status
	};
}

const mockGuideContent = {
	ballotCandidates: guideLayer("Ballot candidate data", "official_logistics_only", "Verified local candidate roster is pending."),
	candidates: guideLayer("Candidates", "official_logistics_only", "Candidate pages are not published in this mock coverage."),
	contests: guideLayer("Contests", "official_logistics_only", "Contest pages are still under review."),
	guideShell: guideLayer("Election overview", "official_logistics_only", "Official logistics and jurisdiction context are available.", 1),
	measures: guideLayer("Measures", "official_logistics_only", "No verified local measures are published in this mock coverage."),
	mixedContent: false,
	officialLogistics: guideLayer("Official logistics", "official_logistics_only", "Official election links are attached.", 2),
	publishedGuideShell: true,
	summary: "This mock a11y fixture represents an official-logistics-only election overview.",
	verifiedContestPackage: false
};

const mockCoverage = {
	collections: [
		{
			href: "/sources",
			id: "sources",
			label: "Source directory",
			status: "canonical",
			summary: "Published source records and provider classes."
		}
	],
	coverageMode: "snapshot",
	coverageUpdatedAt: updatedAt,
	currentState: "Official election logistics are available; verified contest content is pending review.",
	guideContent: mockGuideContent,
	launchTarget: mockLaunchTarget,
	limitations: [
		{
			id: "official-verification",
			summary: "Use official state and county tools for final ballot, deadline, and polling-place confirmation.",
			title: "Verify with official election tools"
		}
	],
	locationGuess: {
		canGuessOnLoad: false,
		mode: "disabled"
	},
	nextSteps: [
		"Verify official ballot materials before publishing contest pages."
	],
	routeFamilies: [
		{
			activeSources: ["official-election-verification"],
			id: "overview",
			label: "Election overview",
			note: "Official links are visible.",
			routes: ["/coverage", "/results"],
			status: "live-now",
			summary: "Core election overview routes are available."
		}
	],
	scopeNote: "Mock a11y fixture for public-route rendering.",
	snapshotProvenance: {
		configuredSnapshotMissing: false,
		loadedAt: updatedAt,
		note: "A11y smoke fixture.",
		sourceLabel: "A11y smoke fixture",
		sourceType: "imported",
		status: "reviewed"
	},
	supportedContentTypes: [
		{
			id: "official-logistics",
			label: "Official election logistics",
			status: "live-now",
			summary: "Official voter portals and local election-office links are available."
		},
		{
			id: "representatives",
			label: "Representative data",
			status: "live-now",
			summary: "Current representative lookup and district context are available."
		},
		{
			id: "verified-contests",
			label: "Verified contest package",
			status: "in-build",
			summary: "Contest, candidate, and measure pages require local review before publication."
		}
	],
	updatedAt
};

const mockSource = {
	authority: "official-government",
	citationCount: 2,
	citedBy: [
		{
			href: "/coverage",
			id: "coverage",
			label: "Coverage profile",
			type: "page"
		}
	],
	date: "2026-06-12",
	geographicScope: "United States",
	id: "official-election-verification",
	limitations: [
		"Availability and exact ballot records vary by state and county."
	],
	note: "Official election tools remain the final authority.",
	primarySourceLabel: "Official election tools",
	publicationKind: "curated-global",
	publisher: "State and county election offices",
	publisherType: "official",
	reviewNote: "Reviewed as a public a11y fixture.",
	routeFamilies: ["coverage", "results", "official-tools"],
	sourceSystem: "Official election verification layer",
	summary: "Official state and county election tools used for voter-facing verification links.",
	title: "Official election verification layer",
	type: "official record",
	url: "https://www.usa.gov/state-election-office",
	usedFor: "Final ballot, registration, polling-place, and deadline verification."
};

const mockDistrictSummary = {
	candidateCount: 0,
	href: "/districts/us-house-district-7",
	jurisdiction: "Federal",
	office: "U.S. Representative",
	representativeCount: 1,
	slug: "us-house-district-7",
	summary: "U.S. House district context for the a11y smoke fixture.",
	title: "U.S. House District 7",
	updatedAt
};

const mockRepresentativeSummary = {
	ballotStatusLabel: "Incumbent",
	districtLabel: "Georgia's 7th Congressional District",
	districtSlug: mockDistrictSummary.slug,
	fundingAvailable: true,
	fundingSummary: "Federal campaign-finance context is available where provider matching succeeds.",
	governmentLevel: "federal",
	href: "/representatives/jon-ossoff",
	incumbent: true,
	influenceAvailable: true,
	influenceSummary: "Federal disclosure context is available where provider matching succeeds.",
	location: "Georgia",
	name: "Jon Ossoff",
	officeDisplayLabel: "U.S. Senator for Georgia",
	officeSought: "U.S. Senator",
	officeType: "us_senate",
	officeholderLabel: "Senator",
	onCurrentBallot: false,
	openstatesUrl: "https://openstates.org/person/jon-ossoff/",
	party: "Democratic",
	provenance: {
		label: "Matched from public official records",
		note: "A11y fixture representative record.",
		status: "direct"
	},
	slug: "jon-ossoff",
	sourceCount: 1,
	sources: [mockSource],
	summary: "Current federal representative context shown for accessibility validation.",
	updatedAt
};

const mockDataSources = {
	architectureStages: [
		{
			details: ["Provider records are labeled and reviewed before publication."],
			id: "review",
			summary: "Provider-backed data is not treated as final ballot content without review.",
			title: "Review before publication"
		}
	],
	ballotContentProviders: [
		{
			authority: "third-party civic infrastructure",
			bestUse: "Provider ballot previews can help prepare review packages before official verification.",
			capabilities: ["Address-based ballot lookup", "Candidate records", "Measure records"],
			configured: false,
			connectionStatus: "needs_key",
			docsUrl: "https://developers.google.com/civic-information",
			envVars: ["GOOGLE_CIVIC_API_KEY"],
			id: "google-civic",
			label: "Google Civic Information API",
			limitations: ["Coverage is election-window dependent.", "Official sources remain final authority."],
			setupUrl: "https://developers.google.com/civic-information"
		}
	],
	categories: [
		{
			authoritativeRule: "Official election offices are the final authority for ballot and logistics details.",
			liveApproach: "Show official links first and label provider records clearly.",
			options: [
				{
					accessMethod: "Public web and API records",
					authority: "official-government",
					bestUse: "Voter portal, ballot, deadline, and polling-place verification.",
					coverage: "State and local",
					id: "official-election-tools",
					links: [
						{
							label: "Find state election office",
							url: "https://www.usa.gov/state-election-office"
						}
					],
					name: "Official election tools",
					notes: ["Use these records for final confirmation."],
					status: "planned-live",
					summary: "Official sources used for final verification.",
					updatePattern: "Election-office dependent"
				}
			],
			slug: "official-election-tools",
			summary: "Official ballot and voting logistics records.",
			title: "Official election tools"
		}
	],
	launchTarget: mockLaunchTarget,
	migrationWatch: [
		{
			id: "ballot-content",
			implication: "Reviewed contest packages should stay separated from provider previews.",
			summary: "Provider availability changes by election window.",
			title: "Ballot data coverage"
		}
	],
	principles: [
		"Official sources are preferred for final voter-facing decisions.",
		"Provider records must be labeled and reviewed before publication."
	],
	roadmap: [
		{
			id: "verified-contests",
			summary: "Publish reviewed contest packages only after official source checks.",
			title: "Verified local contest packages"
		}
	],
	updatedAt
};

const mockStatus = {
	coverageMode: "snapshot",
	coverageUpdatedAt: updatedAt,
	incidents: [],
	nextPublishWindow: "After official ballot review",
	nextReviewAt: updatedAt,
	notes: [
		"Official election logistics are available in the a11y fixture.",
		"Verified contest content remains pending review."
	],
	overallStatus: "healthy",
	snapshotProvenance: mockCoverage.snapshotProvenance,
	sourceSummary: {
		healthy: 1,
		incident: 0,
		"review-soon": 0,
		stale: 0
	},
	sources: [
		{
			authority: "official-government",
			health: "healthy",
			id: "official-election-verification",
			label: "Official election verification layer",
			lastCheckedAt: updatedAt,
			nextCheckAt: updatedAt,
			note: "Official election tools are reachable in the mock status fixture."
		}
	],
	updatedAt
};

const mockCorrections = {
	corrections: [
		{
			entityLabel: "Coverage profile",
			entityType: "policy",
			id: "a11y-correction-coverage-copy",
			outcome: "Public wording now distinguishes official logistics from reviewed local contest content.",
			pageLabel: "Coverage profile",
			pageUrl: "/coverage",
			priority: "medium",
			status: "resolved",
			subject: "Clarified guide coverage wording",
			submittedAt: updatedAt,
			summary: "A public copy review identified wording that could overstate local guide completeness."
		}
	],
	updatedAt
};

function writeServerLine(prefix, data) {
	const text = data.toString().trim();
	if (text) process.stderr.write(`[${prefix}] ${text}\n`);
}

function sendJson(res, body, status = 200) {
	res.writeHead(status, {
		"content-type": "application/json",
		"access-control-allow-origin": baseUrl,
		"access-control-allow-credentials": "true",
		"access-control-allow-headers": "authorization,content-type",
		"access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
	});
	res.end(JSON.stringify(body));
}

function emptyCollection() {
	return {
		items: [],
		results: [],
		data: [],
		records: [],
		total: 0
	};
}

function responseFor(url) {
	const pathname = url.pathname.replace(/\/+/g, "/");
	const apiPathname = pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
	if (apiPathname === "/ballot" && reviewedElection && reviewedLocation) {
		return {
			election: reviewedElection,
			guideContent: mockGuideContent,
			location: reviewedLocation,
			note: `${mockGuideContent.summary} Verify official election logistics with the linked election office.`,
			updatedAt: reviewedElection.updatedAt
		};
	}
	if (apiPathname === "/coverage") return mockCoverage;
	if (apiPathname === "/status") return mockStatus;
	if (apiPathname === "/corrections") return mockCorrections;
	if (apiPathname === "/data-sources") return mockDataSources;
	if (apiPathname === "/sources") return { sources: [mockSource], updatedAt };
	if (apiPathname === `/sources/${mockSource.id}`) return { source: mockSource, updatedAt };
	if (apiPathname === "/elections") return { elections: reviewedSnapshot.electionSummaries };
	if (apiPathname === "/jurisdictions") return { jurisdictions: reviewedSnapshot.jurisdictionSummaries };
	if (reviewedJurisdiction && apiPathname === `/jurisdictions/${reviewedJurisdiction.slug}`) return reviewedJurisdiction;
	if (apiPathname === "/districts") {
		return {
			districts: [mockDistrictSummary],
			mode: "guide",
			note: "A11y smoke fixture district directory.",
			updatedAt
		};
	}
	if (apiPathname === "/representatives") {
		return {
			districts: [mockDistrictSummary],
			mode: "guide",
			note: "A11y smoke fixture representative directory.",
			representatives: [mockRepresentativeSummary],
			updatedAt
		};
	}
	if (apiPathname.endsWith("/pageview")) return { pageview: 0, startAt: Date.now() };
	if (apiPathname.includes("/session")) return { authenticated: false, user: null, admin: null };
	if (apiPathname.includes("/auth") || apiPathname.includes("/login")) return { authenticated: false, user: null, token: "" };
	if (apiPathname.includes("/me") || apiPathname.includes("/account")) return { user: null, authenticated: false };
	if (apiPathname.includes("/quotes")) return [];
	if (apiPathname.includes("/availability")) {
		const start = new Date(Date.now() + 24 * 60 * 60_000);
		start.setMinutes(0, 0, 0);
		const end = new Date(start.getTime() + 60 * 60_000);
		return [{ id: "a11y-slot", title: "Available", start: start.toISOString(), end: end.toISOString() }];
	}
	if (apiPathname.includes("/topics")) return { topics: [], claims: [], ...emptyCollection() };
	if (apiPathname.includes("/claims")) return { claims: [], ...emptyCollection() };
	if (apiPathname.includes("/search")) return { query: url.searchParams.get("q") || "", ...emptyCollection() };
	if (apiPathname.includes("/submissions") || apiPathname.includes("/board") || apiPathname.includes("/items")) return emptyCollection();
	if (apiPathname.includes("/service-directory")) return { services: [], categories: [], ...emptyCollection() };
	if (apiPathname.includes("/elections")) return { elections: [], ...emptyCollection() };
	if (apiPathname.includes("/jurisdictions") || apiPathname.includes("/locations") || apiPathname.includes("/districts")) return { jurisdictions: [], locations: [], districts: [], ...emptyCollection() };
	if (apiPathname.includes("/representatives") || apiPathname.includes("/candidate")) return { representatives: [], candidates: [], districts: [], ...emptyCollection() };
	if (apiPathname.includes("/sources")) return { sources: [], ...emptyCollection() };
	if (apiPathname.includes("/products")) return [];
	if (apiPathname.includes("/contact") || apiPathname.includes("/cart") || apiPathname.includes("/orders")) return { ok: true };
	return { ok: true, ...emptyCollection() };
}

function createMockApiServer() {
	return http.createServer((req, res) => {
		const url = new URL(req.url || "/", `http://127.0.0.1:${apiPort}`);
		if (req.method === "OPTIONS") {
			sendJson(res, {}, 204);
			return;
		}
		sendJson(res, responseFor(url));
	});
}

async function listen(server, port) {
	await new Promise((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", resolveListen);
	});
}

async function waitForHttp(url, timeoutMs = 45_000) {
	const start = Date.now();
	let lastError;
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
			lastError = new Error(`${url} returned ${response.status}`);
		}
		catch (error) {
			lastError = error;
		}
		await new Promise(resolveWait => setTimeout(resolveWait, 400));
	}
	throw lastError || new Error(`Timed out waiting for ${url}`);
}

function startFrontend() {
	const isNuxt = frontendKind === "nuxt" || Object.values(frontendPackage.scripts || {}).some(script => String(script).includes("nuxt"));
	const args = isNuxt
		? ["exec", "-w", "front-end", "--", "nuxt", "dev", "--host", "127.0.0.1", "--port", String(frontendPort)]
		: ["exec", "-w", "front-end", "--", "vite", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"];

	const child = spawn("npm", args, {
		cwd: projectRoot,
		detached: process.platform !== "win32",
		env: {
			...process.env,
			BROWSER: "none",
			DISABLE_ANALYTICS: "true",
			NUXT_TELEMETRY_DISABLED: "1",
			NUXT_PUBLIC_APP_URL: baseUrl,
			NUXT_PUBLIC_SITE_URL: baseUrl,
			NUXT_PUBLIC_API_BASE: apiUrl,
			NUXT_PUBLIC_API_BASE_URL: apiUrl,
			PUBLIC_API_BASE: apiUrl,
			INTERNAL_API_BASE: apiUrl,
			API_INTERNAL_BASE: apiUrl,
			ADMIN_API_BASE: apiUrl,
			NUXT_ADMIN_API_BASE: apiUrl,
			ADMIN_API_KEY: "a11y-smoke",
			NUXT_ADMIN_API_KEY: "a11y-smoke",
			ADMIN_SESSION_SECRET: "a11y-smoke-session-secret",
			NUXT_ADMIN_SESSION_SECRET: "a11y-smoke-session-secret",
			NUXT_SESSION_SIGNING_SECRET: "a11y-smoke-session-secret",
			SESSION_SIGNING_SECRET: "a11y-smoke-session-secret",
			NUXT_PUBLIC_BACKEND_MODE: "mock",
			NUXT_PUBLIC_BILLING_MODE: "mock",
			NUXT_PUBLIC_ENABLE_DEMO_ACCESS: "true",
			NUXT_PUBLIC_FEATURE_INVESTMENT_MODULE: "true",
			NUXT_PUBLIC_PORTAL_URL: baseUrl,
			VITE_API_BASE_URL: apiUrl,
			VITE_API_URL: apiUrl,
			VITE_SSG_API_BASE_URL: apiUrl,
			VITE_PUBLIC_SITE_ORIGIN: baseUrl,
			VITE_SHOW_AD_SLOTS: "false"
		},
		stdio: ["ignore", "pipe", "pipe"]
	});
	child.stdout.on("data", data => writeServerLine(isNuxt ? "nuxt" : "vite", data));
	child.stderr.on("data", data => writeServerLine(isNuxt ? "nuxt" : "vite", data));
	return child;
}

function waitForChildExit(child, timeoutMs) {
	if (child.exitCode !== null || child.signalCode !== null)
		return Promise.resolve(true);

	return new Promise(resolveExit => {
		const timeout = setTimeout(() => {
			child.off("exit", onExit);
			resolveExit(false);
		}, timeoutMs);

		function onExit() {
			clearTimeout(timeout);
			resolveExit(true);
		}

		child.once("exit", onExit);
	});
}

async function stopFrontend(child) {
	if (child.exitCode !== null || child.signalCode !== null)
		return;

	function signalChild(signal) {
		if (process.platform !== "win32" && child.pid) {
			try {
				process.kill(-child.pid, signal);
				return;
			}
			catch {
				// Fall back to the direct child if process-group signaling is unavailable.
			}
		}

		child.kill(signal);
	}

	signalChild("SIGTERM");

	if (await waitForChildExit(child, 5_000))
		return;

	signalChild("SIGKILL");
	await waitForChildExit(child, 2_000);
}

function closeServer(server) {
	return new Promise(resolveClose => server.close(resolveClose));
}

async function analyzePage(browser, route, scheme) {
	const url = `${baseUrl}${route}`;
	const page = await browser.newPage();
	const pageErrors = [];
	page.on("pageerror", error => pageErrors.push(error.message));
	page.setDefaultNavigationTimeout(pageTimeoutMs);
	page.setDefaultTimeout(pageTimeoutMs);
	await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
	if (scheme === "dark" || scheme === "light") {
		await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
	}
	const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: pageTimeoutMs });
	if (!response?.ok()) {
		const status = response?.status() ?? "no response";
		await page.close();
		throw new Error(`${url} returned ${status}`);
	}
	await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 }).catch(() => {});
	if (pageErrors.length) {
		await page.close();
		throw new Error(`${url} produced page errors: ${pageErrors.join(" | ")}`);
	}
	await page.addScriptTag({ path: axeSourcePath });
	const result = await page.evaluate(async () => {
		return await globalThis.axe.run(document, {
			resultTypes: ["violations"],
			runOnly: {
				type: "tag",
				values: ["wcag2a", "wcag2aa"]
			}
		});
	});
	await page.close();
	return {
		url,
		scheme,
		violations: result.violations.filter(violation => violation.id !== "frame-tested")
	};
}

const apiServer = createMockApiServer();
const frontendProcess = startFrontend();
let browser;

try {
	await listen(apiServer, apiPort);
	await waitForHttp(baseUrl);

	browser = await puppeteer.launch({
		executablePath: chromePath,
		headless: "new",
		timeout: browserLaunchTimeoutMs,
		args: ["--no-sandbox", "--disable-dev-shm-usage"]
	});

	const failures = [];
	for (const route of routes) {
		for (const scheme of colorSchemes) {
			const result = await analyzePage(browser, route, scheme);
			if (result.violations.length) {
				failures.push(result);
				continue;
			}
			console.log(`a11y ok: ${result.url} [${scheme}]`);
		}
	}

	if (failures.length) {
		for (const failure of failures) {
			console.error(`\nAccessibility issues for ${siteName} at ${failure.url} [${failure.scheme}]`);
			for (const violation of failure.violations) {
				console.error(`- [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}`);
				console.error(`  ${violation.helpUrl}`);
				for (const node of violation.nodes) {
					console.error(`  ${node.target.join(", ")}`);
				}
			}
		}
		process.exitCode = 1;
	}
}
finally {
	if (browser) await browser.close();
	await stopFrontend(frontendProcess);
	await closeServer(apiServer);
}
