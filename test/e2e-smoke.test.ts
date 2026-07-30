import type { ChildProcessWithoutNullStreams } from "node:child_process";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test, { after, before } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { buildActiveNationwideLookupCookieFromContext } from "../back-end/src/active-nationwide-lookup.ts";
import {
	staleClientBuildStorageKey,
	staleClientReloadKeyPrefix,
} from "../front-end/src/utils/deploy-recovery.ts";

const repoRoot = process.cwd();

let apiProcess: ChildProcessWithoutNullStreams | null = null;
let appProcess: ChildProcessWithoutNullStreams | null = null;
let apiBaseUrl = "";
let appBaseUrl = "";
const adminApiKey = "smoke-admin-key";
const adminPassword = "smoke-password";
const adminSessionSecret = "smoke-session-secret";
const adminUsername = "smoke-admin";
const activeLookupCookieSecret = "smoke-active-lookup-cookie-secret-that-is-long-enough";
const e2eTempDir = mkdtempSync(join(tmpdir(), "ballot-clarity-e2e-"));
const adminDbPath = join(e2eTempDir, "e2e-smoke.sqlite");
const localCoverageFile = join(repoRoot, "back-end/data/live-coverage.local.json");
const displayTimeZoneCookieName = "ballot-clarity-display-time-zone";
const activeNationwideLookupCookieName = "ballot-clarity-nationwide-lookup";
const deployRecoveryUnloadCountKey = "ballot-clarity:test-unload-count";
const deployRecoverySeenReloadKey = "ballot-clarity:test-seen-reload-key";
const nationwideLookupSnapshot = {
	ballotPlan: {},
	ballotViewMode: "quick",
	compareList: [],
	lookupContext: {
		guideAvailability: "not-published",
		result: "resolved"
	},
	nationwideLookupResult: {
		actions: [
			{
				badge: "Official",
				description: "Official Utah voter portal for registration status, address updates, polling location lookup, and related voter tools.",
				id: "utah-voter-portal",
				kind: "official-verification",
				title: "Utah voter registration portal",
				url: "https://vote.utah.gov/"
			},
			{
				badge: "Official",
				description: "Official directory for county clerks and local election contacts across Utah.",
				id: "utah-county-election-officials",
				kind: "official-verification",
				title: "Utah county election officials",
				url: "https://vote.utah.gov/county-election-officials/"
			}
		],
		availability: {
			ballotCandidates: {
				detail: "Ballot candidate pages are not published for this area yet.",
				label: "Ballot candidate data",
				status: "unavailable"
			},
			financeInfluence: {
				detail: "Finance and influence pages are only published where Ballot Clarity has source-backed local candidate records.",
				label: "Finance and influence",
				status: "unavailable"
			},
			guideShell: {
				detail: "No local guide is published for this area yet.",
				label: "Local guide",
				status: "unavailable"
			},
			fullLocalGuide: {
				detail: "A full local contest and measure guide is not published for this area yet.",
				label: "Local guide coverage",
				status: "unavailable"
			},
			nationwideCivicResults: {
				detail: "Civic results and official election tools are available for this ZIP lookup even though a published local guide is not available for this area yet.",
				label: "Civic results for your area",
				status: "available"
			},
			officialLogistics: {
				detail: "Official election logistics or verification tools are attached for this lookup.",
				label: "Official logistics",
				status: "available"
			},
			representatives: {
				detail: "Current representative data is available for this lookup from Open States (5 matches).",
				label: "Representative data",
				status: "available"
			},
			verifiedContestPackage: {
				detail: "No verified local contest pages are published for this area yet.",
				label: "Verified contest pages",
				status: "unavailable"
			}
		},
		detectedFromIp: false,
		districtMatches: [
			{
				districtCode: "049",
				districtType: "County",
				id: "utah-county",
				label: "Utah County",
				sourceSystem: "U.S. Census Geocoder"
			},
			{
				districtCode: "03",
				districtType: "Congressional District",
				id: "ut-cd-03",
				label: "Congressional District 3",
				sourceSystem: "U.S. Census Geocoder"
			},
			{
				districtCode: "24",
				districtType: "State Senate District",
				id: "ut-senate-24",
				label: "State Senate District 24",
				sourceSystem: "U.S. Census Geocoder"
			},
			{
				districtCode: "60",
				districtType: "State House District",
				id: "ut-house-60",
				label: "State House District 60",
				sourceSystem: "U.S. Census Geocoder"
			},
			{
				districtCode: "84604",
				districtType: "Provo city",
				id: "provo-city",
				label: "Provo city",
				sourceSystem: "U.S. Census Geocoder"
			}
		],
		election: null,
		electionSlug: undefined,
		fromCache: false,
		guideAvailability: "not-published",
		inputKind: "zip",
		lookupQuery: "84604",
		location: {
			coverageLabel: "Civic results available",
			displayName: "Provo, Utah",
			lookupMode: "zip-preview",
			requiresOfficialConfirmation: false,
			slug: "provo-utah",
			state: "Utah"
		},
		normalizedAddress: "84604",
		note: "Civic results ready.",
		representativeMatches: [
			{
				districtLabel: "Senator Utah",
				id: "ocd-person:ut-sen-statewide-1",
				name: "John Curtis",
				officeTitle: "Senator",
				openstatesUrl: "https://openstates.org/person/john-curtis/",
				party: "Republican",
				sourceSystem: "Open States"
			},
			{
				districtLabel: "Senator 24",
				id: "ocd-person:ut-sen-24",
				name: "Keven Stratton",
				officeTitle: "Senator",
				openstatesUrl: "https://openstates.org/person/keven-stratton/",
				party: "Republican",
				sourceSystem: "Open States"
			},
			{
				districtLabel: "Representative UT-3",
				id: "ocd-person:ut-cd-3",
				name: "Mike Kennedy",
				officeTitle: "Representative",
				openstatesUrl: "https://openstates.org/person/mike-kennedy/",
				party: "Republican",
				sourceSystem: "Open States"
			},
			{
				districtLabel: "Senator Utah",
				id: "ocd-person:ut-sen-statewide-2",
				name: "Mike Lee",
				officeTitle: "Senator",
				openstatesUrl: "https://openstates.org/person/mike-lee/",
				party: "Republican",
				sourceSystem: "Open States"
			},
			{
				districtLabel: "Representative 60",
				id: "ocd-person:ut-house-60",
				name: "Tyler Clancy",
				officeTitle: "Representative",
				openstatesUrl: "https://openstates.org/person/tyler-clancy/",
				party: "Republican",
				sourceSystem: "Open States"
			}
		],
		resolvedAt: "2026-04-18T12:43:00.000Z",
		result: "resolved",
		selectionOptions: []
	},
	selectedElection: null,
	selectedIssues: [],
	selectedLocation: null
};

const guideShellOnlySnapshot = {
	ballotPlan: {},
	ballotViewMode: "quick",
	compareList: [],
	lookupContext: {
		guideAvailability: "published",
		hasPublishedGuideShell: true,
		hasVerifiedContestPackage: false,
		result: "resolved"
	},
	nationwideLookupResult: null,
	selectedElection: {
		date: "2026-11-03",
		jurisdictionSlug: "fulton-county-georgia",
		locationName: "Fulton County, Georgia",
		name: "2026 Fulton County General Election",
		slug: "2026-fulton-county-general",
		updatedAt: "2026-03-30T18:00:00.000Z"
	},
	selectedIssues: [],
	selectedLocation: {
		coverageLabel: "Current area: Fulton County, Georgia",
		displayName: "Fulton County, Georgia",
		lookupMode: "address-verified",
		requiresOfficialConfirmation: true,
		slug: "fulton-county-georgia",
		state: "Georgia"
	}
};

const activeNationwideLookupCookieValue = buildActiveNationwideLookupCookieFromContext(
	nationwideLookupSnapshot.nationwideLookupResult as Parameters<typeof buildActiveNationwideLookupCookieFromContext>[0],
	activeLookupCookieSecret
);
assert.ok(activeNationwideLookupCookieValue);
const activeNationwideLookupCookie = `${activeNationwideLookupCookieName}=${activeNationwideLookupCookieValue}`;
const easternDisplayTimeZoneCookie = `${displayTimeZoneCookieName}=America%2FNew_York`;

async function getFreePort() {
	return await new Promise<number>((resolve, reject) => {
		const server = createServer();

		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();

			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Unable to resolve a free port."));
				return;
			}

			server.close(error => error ? reject(error) : resolve(address.port));
		});
	});
}

function startProcess(command: string, args: string[], env: NodeJS.ProcessEnv) {
	const child = spawn(command, args, {
		cwd: repoRoot,
		env,
		stdio: ["ignore", "pipe", "pipe"]
	});

	const output: string[] = [];
	const collect = (chunk: Buffer) => output.push(chunk.toString());

	child.stdout.on("data", collect);
	child.stderr.on("data", collect);

	return {
		child,
		getOutput: () => output.join("")
	};
}

function findChromeExecutable() {
	const candidates = [
		process.env.CHROME_PATH,
		process.env.GOOGLE_CHROME_BIN,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		if (existsSync(candidate))
			return candidate;
	}

	return null;
}

async function waitForJson(url: string, label: string) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(url);

			if (response.ok)
				return await response.json();
		}
		catch {
			// Keep polling until the process is ready.
		}

		await delay(500);
	}

	throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function startChromeProcess(command: string, args: string[]) {
	const child = spawn(command, args, {
		cwd: repoRoot,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"]
	});

	const output: string[] = [];
	const collect = (chunk: Buffer) => output.push(chunk.toString());

	child.stdout.on("data", collect);
	child.stderr.on("data", collect);

	return {
		child,
		getOutput: () => output.join("")
	};
}

async function stopChromeProcess(processHandle: ChildProcessWithoutNullStreams | null, userDataDir?: string) {
	if (processHandle && processHandle.exitCode === null) {
		await stopChildProcess(processHandle, "Chrome");
	}

	if (userDataDir)
		rmSync(userDataDir, {
			force: true,
			maxRetries: 5,
			recursive: true,
			retryDelay: 100
		});
}

async function getDocumentBodyText(cdp: CdpSession) {
	const evaluation = await cdp.send("Runtime.evaluate", {
		awaitPromise: false,
		expression: "document.body.innerText",
		returnByValue: true
	});

	return String(evaluation.result?.value ?? "");
}

async function countSelectorMatches(cdp: CdpSession, selector: string) {
	const evaluation = await cdp.send("Runtime.evaluate", {
		awaitPromise: false,
		expression: `document.querySelectorAll(${JSON.stringify(selector)}).length`,
		returnByValue: true
	});

	return Number(evaluation.result?.value ?? 0);
}

interface CdpSession {
	close: () => Promise<void>;
	on: (method: string, handler: (params: any) => void) => () => void;
	send: (method: string, params?: Record<string, unknown>) => Promise<any>;
}

async function connectToCdp(webSocketUrl: string): Promise<CdpSession> {
	const socket = new WebSocket(webSocketUrl);
	const pending = new Map<number, { reject: (error: Error) => void; resolve: (value: any) => void }>();
	const listeners = new Map<string, Set<(params: any) => void>>();
	let nextId = 0;

	await new Promise<void>((resolve, reject) => {
		const handleOpen = () => {
			socket.removeEventListener("error", handleError);
			resolve();
		};
		const handleError = () => {
			socket.removeEventListener("open", handleOpen);
			reject(new Error(`Unable to open Chrome DevTools socket at ${webSocketUrl}`));
		};

		socket.addEventListener("open", handleOpen, { once: true });
		socket.addEventListener("error", handleError, { once: true });
	});

	socket.addEventListener("message", (event) => {
		const rawMessage = typeof event.data === "string"
			? event.data
			: Buffer.from(event.data as ArrayBuffer).toString("utf8");
		const message = JSON.parse(rawMessage) as {
			error?: { message?: string };
			id?: number;
			method?: string;
			params?: any;
			result?: any;
		};

		if (typeof message.id === "number") {
			const request = pending.get(message.id);

			if (!request)
				return;

			pending.delete(message.id);

			if (message.error)
				request.reject(new Error(message.error.message || `Chrome DevTools call ${message.id} failed.`));
			else
				request.resolve(message.result);

			return;
		}

		if (!message.method)
			return;

		for (const listener of listeners.get(message.method) ?? [])
			listener(message.params);
	});

	function on(method: string, handler: (params: any) => void) {
		const methodListeners = listeners.get(method) ?? new Set<(params: any) => void>();
		methodListeners.add(handler);
		listeners.set(method, methodListeners);

		return () => methodListeners.delete(handler);
	}

	function send(method: string, params: Record<string, unknown> = {}) {
		return new Promise<any>((resolve, reject) => {
			const id = nextId += 1;

			pending.set(id, { reject, resolve });
			socket.send(JSON.stringify({
				id,
				method,
				params
			}));
		});
	}

	async function close() {
		if (socket.readyState === WebSocket.CLOSED)
			return;

		await new Promise<void>((resolve) => {
			socket.addEventListener("close", () => resolve(), { once: true });
			socket.close();
		});
	}

	return {
		close,
		on,
		send
	};
}

async function waitForRuntimeCondition(
	cdp: CdpSession,
	expression: string,
	predicate: (value: unknown) => boolean,
	label: string,
	timeoutMs = 15000
) {
	const deadline = Date.now() + timeoutMs;
	let lastValue: unknown = "runtime value unavailable";

	while (Date.now() < deadline) {
		try {
			const evaluation = await cdp.send("Runtime.evaluate", {
				awaitPromise: false,
				expression,
				returnByValue: true
			});

			if (evaluation.exceptionDetails)
				throw new Error(evaluation.exceptionDetails.text || "Chrome runtime evaluation failed.");

			lastValue = evaluation.result?.value;

			if (predicate(lastValue))
				return lastValue;
		}
		catch (error) {
			lastValue = String(error);
		}

		await delay(100);
	}

	throw new Error(`${label}: timed out; last value: ${JSON.stringify(lastValue)}`);
}

async function waitForBodyText(cdp: CdpSession, pattern: RegExp, label: string) {
	return waitForRuntimeCondition(
		cdp,
		"document.body?.innerText ?? ''",
		(value) => {
			pattern.lastIndex = 0;
			return typeof value === "string" && pattern.test(value);
		},
		label
	);
}

async function waitForDocumentReady(
	cdp: CdpSession,
	expectedUrl: string,
	label: string,
	timeoutMs = 15000
) {
	const deadline = Date.now() + timeoutMs;
	const normalizedExpectedUrl = new URL(expectedUrl).href;
	let lastState = "document state unavailable";

	while (Date.now() < deadline) {
		try {
			const evaluation = await cdp.send("Runtime.evaluate", {
				awaitPromise: false,
				expression: `({
					hasNuxtDocument: Boolean(document.body && document.querySelector("#__nuxt")),
					href: window.location.href,
					readyState: document.readyState
				})`,
				returnByValue: true
			});
			const state = evaluation.result?.value as {
				hasNuxtDocument?: boolean;
				href?: string;
				readyState?: string;
			} | undefined;

			lastState = JSON.stringify(state ?? {});

			if (
				state?.hasNuxtDocument
				&& state.href
				&& new URL(state.href).href === normalizedExpectedUrl
				&& state.readyState !== "loading"
			)
				return;
		}
		catch (error) {
			lastState = String(error);
		}

		await delay(100);
	}

	throw new Error(`${label}: timed out waiting for ${normalizedExpectedUrl}; last state: ${lastState}`);
}

async function navigateAndWait(cdp: CdpSession, url: string, label: string) {
	await cdp.send("Page.navigate", { url });
	await waitForDocumentReady(cdp, url, label);
}

async function waitForUrl(url: string, label: string) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(url);

			if (response.ok)
				return;
		}
		catch {
			// Keep polling until the process is ready.
		}

		await delay(500);
	}

	throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function waitForChildExit(processHandle: ChildProcessWithoutNullStreams, timeoutMs: number) {
	if (processHandle.exitCode !== null || processHandle.signalCode !== null)
		return Promise.resolve(true);

	return new Promise<boolean>((resolve) => {
		const cleanup = () => {
			clearTimeout(timeout);
			processHandle.off("exit", handleExit);
		};
		const handleExit = () => {
			cleanup();
			resolve(true);
		};
		const timeout = setTimeout(() => {
			cleanup();
			resolve(processHandle.exitCode !== null || processHandle.signalCode !== null);
		}, timeoutMs);

		timeout.unref();
		processHandle.once("exit", handleExit);
	});
}

async function stopChildProcess(processHandle: ChildProcessWithoutNullStreams, label: string) {
	if (processHandle.exitCode !== null)
		return;

	processHandle.kill("SIGTERM");

	if (await waitForChildExit(processHandle, 3000))
		return;

	processHandle.kill("SIGKILL");

	if (!await waitForChildExit(processHandle, 3000))
		throw new Error(`${label} process did not exit after SIGKILL.`);
}

async function stopProcess(processHandle: ChildProcessWithoutNullStreams | null) {
	if (!processHandle)
		return;

	await stopChildProcess(processHandle, "child");
}

before(async () => {
	const apiPort = await getFreePort();
	const appPort = await getFreePort();

	apiBaseUrl = `http://127.0.0.1:${apiPort}`;
	appBaseUrl = `http://127.0.0.1:${appPort}`;

	const api = startProcess(process.execPath, ["back-end/dist/server.js"], {
		...process.env,
		ADMIN_API_KEY: adminApiKey,
		ADMIN_BOOTSTRAP_DISPLAY_NAME: "Smoke Admin",
		ADMIN_BOOTSTRAP_PASSWORD: adminPassword,
		ADMIN_BOOTSTRAP_ROLE: "admin",
		ADMIN_BOOTSTRAP_USERNAME: adminUsername,
		ADMIN_DB_PATH: adminDbPath,
		ADMIN_DATABASE_URL: "",
		ADMIN_SESSION_SECRET: adminSessionSecret,
		ADMIN_STORE_DRIVER: "sqlite",
		ACTIVE_LOOKUP_COOKIE_SECRET: activeLookupCookieSecret,
		DATABASE_URL: "",
		LIVE_COVERAGE_FILE: localCoverageFile,
		PORT: String(apiPort)
	});
	apiProcess = api.child;

	await waitForUrl(`${apiBaseUrl}/health`, "API");

	const app = startProcess(process.execPath, ["front-end/.output/server/index.mjs"], {
		...process.env,
		ADMIN_API_BASE: `${apiBaseUrl}/api`,
		ADMIN_API_KEY: adminApiKey,
		ADMIN_SESSION_SECRET: adminSessionSecret,
		NUXT_PUBLIC_SITE_URL: appBaseUrl,
		PORT: String(appPort),
		NUXT_PUBLIC_API_BASE: `${apiBaseUrl}/api`
	});
	appProcess = app.child;

	try {
		await waitForUrl(`${appBaseUrl}/`, "Nuxt application");
	}
	catch (error) {
		throw new Error(`${String(error)}\n\nAPI output:\n${api.getOutput()}\n\nApp output:\n${app.getOutput()}`);
	}
});

after(async () => {
	await Promise.all([
		stopProcess(appProcess),
		stopProcess(apiProcess)
	]);
	rmSync(e2eTempDir, { force: true, recursive: true });
});

test("built app renders the key ballot guide pages against the built API", async () => {
	assert.equal(existsSync(join(repoRoot, "back-end/dist/admin-schema.sql")), true);
	assert.equal(existsSync(join(repoRoot, "back-end/dist/admin-schema.postgres.sql")), true);
	assert.equal(existsSync(join(repoRoot, "back-end/dist/live-data-schema.sql")), true);

	const ballotResponse = await fetch(`${apiBaseUrl}/api/ballot?election=2026-fulton-county-general`);
	const ballot = await ballotResponse.json();
	const homePage = await fetch(`${appBaseUrl}/`);
	const homeHtml = await homePage.text();
	const resultsPage = await fetch(`${appBaseUrl}/results`);
	const resultsHtml = await resultsPage.text();
	const ballotPage = await fetch(`${appBaseUrl}/ballot/2026-fulton-county-general`);
	const ballotHtml = await ballotPage.text();
	const electionPage = await fetch(`${appBaseUrl}/elections/2026-fulton-county-general`);
	const electionHtml = await electionPage.text();
	const locationPage = await fetch(`${appBaseUrl}/locations/fulton-county-georgia`);
	const locationHtml = await locationPage.text();
	const dataSourcesPage = await fetch(`${appBaseUrl}/data-sources`);
	const dataSourcesHtml = await dataSourcesPage.text();
	const coveragePage = await fetch(`${appBaseUrl}/coverage`);
	const coverageHtml = await coveragePage.text();
	const statusPage = await fetch(`${appBaseUrl}/status`);
	const statusHtml = await statusPage.text();
	const correctionsPage = await fetch(`${appBaseUrl}/corrections`);
	const correctionsHtml = await correctionsPage.text();
	const sourcesDirectoryPage = await fetch(`${appBaseUrl}/sources`);
	const sourcesDirectoryHtml = await sourcesDirectoryPage.text();
	assert.match(sourcesDirectoryHtml, /Open States/);
	assert.match(sourcesDirectoryHtml, /Core source systems/);
	const publishedSourcePage = await fetch(`${appBaseUrl}/sources/open-states`);
	const publishedSourceHtml = await publishedSourcePage.text();
	const publishedRouteSourcePage = await fetch(`${appBaseUrl}/sources/supplemental:shawn-still:bio`);
	const publishedRouteSourceHtml = await publishedRouteSourcePage.text();
	const unpublishedSourcePage = await fetch(`${appBaseUrl}/sources/district:state-senate-48`);
	const unpublishedSourceHtml = await unpublishedSourcePage.text();
	const contestPage = await fetch(`${appBaseUrl}/contest/us-house-district-7`);
	const contestHtml = await contestPage.text();
	const districtsPage = await fetch(`${appBaseUrl}/districts`);
	const districtsHtml = await districtsPage.text();
	const districtPage = await fetch(`${appBaseUrl}/districts/us-house-district-7`);
	const districtHtml = await districtPage.text();
	const representativesPage = await fetch(`${appBaseUrl}/representatives`);
	const representativesHtml = await representativesPage.text();
	const candidatePage = await fetch(`${appBaseUrl}/candidate/elena-torres`);
	const candidateHtml = await candidatePage.text();
	const candidateFundingPage = await fetch(`${appBaseUrl}/candidate/elena-torres/funding`);
	const candidateFundingHtml = await candidateFundingPage.text();
	const candidateInfluencePage = await fetch(`${appBaseUrl}/candidate/elena-torres/influence`);
	const candidateInfluenceHtml = await candidateInfluencePage.text();
	const measurePage = await fetch(`${appBaseUrl}/measure/charter-amendment-a`);
	const measureHtml = await measurePage.text();
	const helpPage = await fetch(`${appBaseUrl}/help`);
	const helpHtml = await helpPage.text();
	const methodologyPage = await fetch(`${appBaseUrl}/methodology`);
	const methodologyHtml = await methodologyPage.text();
	const neutralityPage = await fetch(`${appBaseUrl}/neutrality`);
	const neutralityHtml = await neutralityPage.text();
	const accessibilityPage = await fetch(`${appBaseUrl}/accessibility`);
	const accessibilityHtml = await accessibilityPage.text();
	const privacyPage = await fetch(`${appBaseUrl}/privacy`);
	const privacyHtml = await privacyPage.text();
	const termsPage = await fetch(`${appBaseUrl}/terms`);
	const termsHtml = await termsPage.text();
	const contactPage = await fetch(`${appBaseUrl}/contact`);
	const contactHtml = await contactPage.text();
	const planPage = await fetch(`${appBaseUrl}/plan`);
	const planHtml = await planPage.text();
	const compareEmptyPage = await fetch(`${appBaseUrl}/compare`);
	const compareEmptyHtml = await compareEmptyPage.text();
	const comparePage = await fetch(`${appBaseUrl}/compare?slugs=elena-torres,daniel-brooks`);
	const compareHtml = await comparePage.text();
	const missingPage = await fetch(`${appBaseUrl}/missing-public-page`);
	const missingHtml = await missingPage.text();

	assert.equal(ballotResponse.status, 200);
	assert.equal(homePage.status, 200);
	assert.match(homePage.headers.get("content-security-policy-report-only") ?? "", /default-src 'self'/);
	assert.match(homePage.headers.get("content-security-policy-report-only") ?? "", /frame-ancestors 'none'/);
	assert.match(homePage.headers.get("content-security-policy-report-only") ?? "", /script-src 'self' 'unsafe-inline'/);
	assert.equal(homePage.headers.get("cross-origin-opener-policy"), "same-origin");
	assert.equal(homePage.headers.get("cross-origin-resource-policy"), "same-origin");
	assert.equal(homePage.headers.get("origin-agent-cluster"), "?1");
	assert.equal(homePage.headers.get("x-content-type-options"), "nosniff");
	assert.equal(homePage.headers.get("x-permitted-cross-domain-policies"), "none");
	assert.equal(homePage.headers.get("x-frame-options"), "DENY");
	assert.equal(homePage.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
	assert.equal(homePage.headers.get("strict-transport-security"), "max-age=31536000");
	assert.match(homePage.headers.get("permissions-policy") || "", /camera=\(\)/);
	assert.equal(resultsPage.status, 200);
	assert.equal(resultsPage.headers.get("x-robots-tag"), "noindex, nofollow");
	assert.match(resultsHtml, /Results for your area are not loaded/);
	assert.match(resultsHtml, /noindex,nofollow/);
	assert.equal(missingPage.status, 404);
	assert.equal(missingPage.headers.get("x-robots-tag"), "noindex, nofollow");
	assert.match(missingHtml, /This page could not be found/);
	assert.match(missingHtml, /noindex,nofollow/);
	assert.match(ballotResponse.headers.get("content-security-policy-report-only") ?? "", /default-src 'none'/);
	assert.match(ballotResponse.headers.get("content-security-policy-report-only") ?? "", /frame-ancestors 'none'/);
	assert.equal(ballotResponse.headers.get("cross-origin-opener-policy"), "same-origin");
	assert.equal(ballotResponse.headers.get("cross-origin-resource-policy"), "same-origin");
	assert.equal(ballotResponse.headers.get("origin-agent-cluster"), "?1");
	assert.equal(ballotResponse.headers.get("x-content-type-options"), "nosniff");
	assert.equal(ballotResponse.headers.get("x-permitted-cross-domain-policies"), "none");
	assert.equal(ballotResponse.headers.get("x-frame-options"), "DENY");
	assert.equal(ballotResponse.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
	assert.equal(ballotResponse.headers.get("strict-transport-security"), "max-age=31536000");
	assert.match(ballotResponse.headers.get("permissions-policy") || "", /camera=\(\)/);
	assert.match(homeHtml, /Location lookup|Civic results|Ballot guide/i);
	assert.match(homeHtml, /Fulton County, Georgia/);
	assert.match(homeHtml, /Choose your area/);
	assert.match(homeHtml, /Start from your location\./);
	assert.doesNotMatch(homeHtml, /Popular pages/);
	assert.doesNotMatch(homeHtml, /Choose the page you need\./i);
	assert.match(homeHtml, /Choose a location with a full street address or 5-digit ZIP code/);
	assert.match(homeHtml, /Enter a street address or ZIP code to see districts, current officials, and official election links for your area/i);
	assert.match(homeHtml, /Lookup data is used only to load civic results/i);
	assert.match(homeHtml, /og:image/);
	assert.match(homeHtml, /twitter:image/);
	assert.match(homeHtml, /social-card\.svg/);
	assert.match(ballotPage.headers.get("content-security-policy-report-only") ?? "", /default-src 'self'/);
	assert.match(ballotPage.headers.get("content-security-policy-report-only") ?? "", /frame-ancestors 'none'/);
	assert.match(ballotHtml, /Key dates and official links/);
	assert.match(ballotHtml, /Election overview/);
	assert.match(ballotHtml, /Official links are live for this area/);
	assert.doesNotMatch(ballotHtml, /Need a page reviewed/);
	assert.match(ballotHtml, /Verified contest, candidate, and measure pages are still under local review|Verified contest pages are still under local review|Verified contest pages pending/);
	assert.doesNotMatch(ballotHtml, /Ballot-plan tools open after verified contest pages are published/);
	assert.doesNotMatch(ballotHtml, /Questions to ask before you vote/);
	assert.doesNotMatch(ballotHtml, /Ballot contents/);
	assert.doesNotMatch(ballotHtml, /Reading mode/);
	assert.doesNotMatch(ballotHtml, /Quick view/);
	assert.doesNotMatch(ballotHtml, /Recent updates/);
	assert.doesNotMatch(ballotHtml, /How verification is handled/);
	assert.match(ballotHtml, /Fulton County, Georgia/);
	assert.match(ballotHtml, /unverified review material|local review|verified Fulton-specific ballot content/i);
	assert.match(electionHtml, /Official links and notices/);
	assert.match(electionHtml, /Verified contest pages are still under local review|Verified contest pages pending/);
	assert.doesNotMatch(electionHtml, /Contest index/);
	assert.doesNotMatch(electionHtml, /Open canonical contest page/);
	assert.match(electionHtml, /Data sources/);
	assert.match(locationHtml, /Key election dates/);
	assert.match(locationHtml, /Official election office/);
	assert.match(locationHtml, /Official links and notices/);
	assert.doesNotMatch(locationHtml, /Voting methods in this area/);
	assert.equal(dataSourcesPage.status, 200);
	assert.match(dataSourcesHtml, /Data sources/);
	assert.match(dataSourcesHtml, /Core source rules/);
	assert.match(dataSourcesHtml, /What each source class is used for/);
	assert.match(dataSourcesHtml, /Fulton County, Georgia/);
	assert.match(dataSourcesHtml, /Census Geocoder with geoLookup/);
	assert.match(dataSourcesHtml, /FEC OpenFEC API and bulk files/);
	assert.match(dataSourcesHtml, /Google Representatives API ended on April 30, 2025/);
	assert.match(dataSourcesHtml, /June 30, 2026/);
	assert.equal(coveragePage.status, 200);
	assert.match(coverageHtml, /Coverage/);
	assert.match(coverageHtml, /Fulton County, Georgia/);
	assert.match(coverageHtml, /Election coverage/);
	assert.match(coverageHtml, /Official links attached/);
	assert.match(coverageHtml, /official election tools/i);
	assert.match(coverageHtml, /Known limits/);
	assert.equal(statusPage.status, 200);
	assert.match(statusHtml, /Public status/);
	assert.match(statusHtml, /No source-monitor metrics are published right now/);
	assert.match(statusHtml, /Public notes/);
	assert.doesNotMatch(statusHtml, /Tracked public sources/);
	assert.doesNotMatch(statusHtml, /Active notices/);
	assert.match(statusHtml, /source health, coverage, and current review notices/i);
	assert.match(statusHtml, /No published local guide package is active right now|Active coverage package status:/i);
	assert.doesNotMatch(statusHtml, /activeSnapshotPath|configuredSnapshotPath|\/srv\/|\/Users\//);
	assert.equal(correctionsPage.status, 200);
	assert.match(correctionsHtml, /Corrections log/);
	assert.match(correctionsHtml, /Reporter identity withheld/);
	assert.match(correctionsHtml, /What appears here/);
	assert.match(correctionsHtml, /No public corrections have been posted/);
	assert.match(correctionsHtml, /Private contact details, unverified attachments, and operational notes are not published here/);
	assert.doesNotMatch(correctionsHtml, /admin queue|internal queue/i);
	assert.equal(sourcesDirectoryPage.status, 200);
	assert.match(sourcesDirectoryHtml, /Source directory/);
	assert.equal(publishedSourcePage.status, 200);
	assert.match(publishedSourceHtml, /Pages that use this record/);
	assert.match(publishedSourceHtml, /What Ballot Clarity uses it for/);
	assert.equal(publishedRouteSourcePage.status, 200);
	assert.match(publishedRouteSourceHtml, /Shawn Still/);
	assert.match(publishedRouteSourceHtml, /state-senate-48/);
	assert.equal(unpublishedSourcePage.status, 404);
	assert.doesNotMatch(unpublishedSourceHtml, /Source record unavailable/);
	assert.equal(contestPage.status, 200);
	assert.match(contestHtml, /Canonical contest page/);
	assert.equal(districtsPage.status, 200);
	assert.match(districtsHtml, /District pages/);
	assert.match(
		districtsHtml,
		/Open each matched office area to review the office, current officials, candidates, and official election links for your area\.|Open each office area to review the office, current representative, and candidate field in one place\./
	);
	assert.equal(districtPage.status, 200);
	assert.match(districtHtml, /Current representatives/);
	assert.match(districtHtml, /Candidate field/);
	assert.match(districtHtml, /District sources/);
	assert.doesNotMatch(districtHtml, /href="\/sources\/district:state-senate-48"/);
	assert.equal(representativesPage.status, 200);
	assert.match(representativesHtml, /Representative directory/);
	assert.match(representativesHtml, /Current area|Start with lookup|Refresh results for this page/);
	assert.match(representativesHtml, /Current officials for your saved area\.|This directory lists current officeholders and links to their district, profile, funding, and influence pages where available\./);
	assert.equal(candidatePage.status, 200);
	assert.equal(candidateFundingPage.status, 200);
	assert.equal(candidateInfluencePage.status, 200);
	assert.equal(measurePage.status, 200);
	assert.match(helpHtml, /Voting help and ballot basics/);
	assert.match(helpHtml, /What is the difference between an official ballot listing and a voter guide/);
	assert.match(helpHtml, /What happens to the address or ZIP code I enter/);
	assert.match(helpHtml, /Neutrality policy/);
	assert.match(helpHtml, /Accessibility/);
	assert.match(neutralityHtml, /How Ballot Clarity operationalizes neutrality/);
	assert.match(neutralityHtml, /Source hierarchy/);
	assert.match(neutralityHtml, /Red-flag review/);
	assert.match(neutralityHtml, /Claims that need extra scrutiny/);
	assert.match(neutralityHtml, /Guardrails around candidate and measure coverage/);
	assert.equal(accessibilityPage.status, 200);
	assert.match(accessibilityHtml, /Accessibility and print standards/);
	assert.match(accessibilityHtml, /WCAG 2\.2 Level AA/);
	assert.match(accessibilityHtml, /44 by 44 pixel minimum target|44 x 44 pixel minimum target|44 x 44 px/);
	assert.match(accessibilityHtml, /does not generate a downloadable tagged PDF/);
	assert.match(methodologyHtml, /How to read page signals/);
	assert.match(methodologyHtml, /How summaries are generated/);
	assert.equal(privacyPage.status, 200);
	assert.match(privacyHtml, /Privacy Policy/);
	assert.match(privacyHtml, /What data Ballot Clarity currently handles/);
	assert.match(privacyHtml, /The application is designed not to publish the raw lookup text/);
	assert.match(privacyHtml, /No sale, sharing, or targeted advertising/);
	assert.match(privacyHtml, /Current third-party processors and civic-data recipients/);
	assert.match(privacyHtml, /Google Civic Information API/);
	assert.match(privacyHtml, /Rights requests and no-account limits/);
	assert.match(privacyHtml, /Children(?:&#39;|&apos;|’|')s privacy/);
	assert.match(privacyHtml, /analytics\.ballotclarity\.org/);
	assert.doesNotMatch(privacyHtml, /analytics\.jacobdanderson\.net/);
	assert.equal(termsPage.status, 200);
	assert.match(termsHtml, /Terms of Service/);
	assert.match(termsHtml, /How the service may and may not be used/);
	assert.match(termsHtml, /Permitted use and limited license/);
	assert.match(termsHtml, /By accessing or using the Ballot Clarity website/);
	assert.match(termsHtml, /Who operates the site and how to send notice/);
	assert.match(termsHtml, /Jacob Anderson/);
	assert.match(termsHtml, /official government publication/);
	assert.match(termsHtml, /The site is provided on an (?:\"|&quot;)as is(?:\"|&quot;) and (?:\"|&quot;)as available(?:\"|&quot;) basis/);
	assert.match(contactHtml, /Contact and corrections/);
	assert.match(contactHtml, /acknowledge correction requests within 2 business days/);
	assert.match(contactHtml, /What to include in a correction request/);
	assert.match(planHtml, /My ballot plan/);
	assert.match(planHtml, /Not the right location\? Select a new district\./);
	assert.match(planHtml, /The ballot plan opens after Ballot Clarity publishes a local guide for this area\./);
	assert.equal(compareEmptyPage.status, 200);
	assert.match(compareEmptyHtml, /No compare candidates selected/);
	assert.match(compareEmptyHtml, /needs candidate slugs in the URL/i);
	assert.match(compareHtml, /Compare candidates side by side/);
	assert.match(compareHtml, /candidate-provided statements by attribute/i);
	assert.match(compareHtml, /Candidate comparison is not available yet/);
	assert.match(compareHtml, /not published for comparison yet/i);
	assert.match(compareHtml, /verified candidate comparison is available/i);
});

test("built app exposes a protected admin portal when admin env is configured", async () => {
	const loginPage = await fetch(`${appBaseUrl}/admin/login`);
	const loginHtml = await loginPage.text();
	const unauthorizedOverview = await fetch(`${appBaseUrl}/api/admin/overview`);
	const loginResponse = await fetch(`${appBaseUrl}/api/admin/session`, {
		body: JSON.stringify({
			password: adminPassword,
			username: adminUsername
		}),
		headers: {
			"Content-Type": "application/json",
			Origin: appBaseUrl
		},
		method: "POST"
	});
	const loginBody = await loginResponse.json();
	const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
	const dashboardPage = await fetch(`${appBaseUrl}/admin`, {
		headers: {
			cookie: sessionCookie || ""
		}
	});
	const dashboardHtml = await dashboardPage.text();
	const accountPage = await fetch(`${appBaseUrl}/admin/account`, {
		headers: {
			cookie: sessionCookie || ""
		}
	});
	const accountHtml = await accountPage.text();
	const correctionsPage = await fetch(`${appBaseUrl}/admin/corrections`, {
		headers: {
			cookie: sessionCookie || ""
		}
	});
	const correctionsHtml = await correctionsPage.text();
	const adminOverviewResponse = await fetch(`${appBaseUrl}/api/admin/overview`, {
		headers: {
			cookie: sessionCookie || ""
		}
	});
	const adminOverview = await adminOverviewResponse.json();

	assert.equal(loginPage.status, 200);
	assert.match(loginHtml, /Editorial and source operations/);
	assert.match(loginHtml, /Sign in to admin/);
	assert.equal(unauthorizedOverview.status, 401);
	assert.equal(loginResponse.status, 200);
	assert.ok(sessionCookie);
	assert.equal(dashboardPage.status, 200);
	assert.match(dashboardHtml, /Internal editorial control room/);
	assert.match(dashboardHtml, /Current operational priorities/);
	assert.match(dashboardHtml, /Latest queue and publish events/);
	assert.match(dashboardHtml, /Open corrections/);
	assert.equal(accountPage.status, 200);
	assert.match(accountHtml, /Change password/);
	assert.match(accountHtml, /Account security/);
	assert.match(accountHtml, /Ballot Clarity Admin/);
	assert.equal(correctionsPage.status, 200);
	assert.match(correctionsHtml, /Reported issues and next steps/);
	assert.match(correctionsHtml, /Reader and internal reports/);
	assert.equal(adminOverviewResponse.status, 200);
	assert.equal(adminOverview.metrics[0].label, "Open corrections");
	assert.ok(Array.isArray(adminOverview.recentActivity));

	const passwordChangeResponse = await fetch(`${appBaseUrl}/api/admin/session/password`, {
		body: JSON.stringify({
			currentPassword: adminPassword,
			newPassword: "changed-smoke-password"
		}),
		headers: {
			"Content-Type": "application/json",
			cookie: sessionCookie || "",
			Origin: appBaseUrl
		},
		method: "POST"
	});
	const changedSessionCookie = passwordChangeResponse.headers.get("set-cookie")?.split(";")[0];
	const passwordChangeBody = await passwordChangeResponse.json();
	const staleOverviewResponse = await fetch(`${appBaseUrl}/api/admin/overview`, {
		headers: {
			cookie: sessionCookie || ""
		}
	});
	const freshOverviewResponse = await fetch(`${appBaseUrl}/api/admin/overview`, {
		headers: {
			cookie: changedSessionCookie || ""
		}
	});

	assert.equal(passwordChangeResponse.status, 200);
	assert.ok(changedSessionCookie);
	assert.equal(passwordChangeBody.authenticated, true);
	assert.notEqual(passwordChangeBody.credentialsUpdatedAt, loginBody.credentialsUpdatedAt);
	assert.equal(staleOverviewResponse.status, 401);
	assert.equal(freshOverviewResponse.status, 200);
});

test("built app does not log a hydration mismatch when dark mode is stored before first load", async (t) => {
	const chromeExecutable = findChromeExecutable();

	if (!chromeExecutable) {
		t.skip("Chrome is not available for the hydration regression test.");
		return;
	}

	const chromePort = await getFreePort();
	const chromeUserDataDir = mkdtempSync(join(tmpdir(), "ballot-clarity-chrome-"));
	const chrome = startChromeProcess(chromeExecutable, [
		`--remote-debugging-port=${chromePort}`,
		`--user-data-dir=${chromeUserDataDir}`,
		"--headless=new",
		"--disable-background-networking",
		"--disable-default-apps",
		"--disable-gpu",
		"--disable-sync",
		"--metrics-recording-only",
		"--no-first-run",
		"--no-default-browser-check",
		"about:blank"
	]);

	let cdp: CdpSession | null = null;

	try {
		const versionInfo = await waitForJson(`http://127.0.0.1:${chromePort}/json/version`, "Chrome DevTools version");
		const targets = await waitForJson(`http://127.0.0.1:${chromePort}/json/list`, "Chrome DevTools targets") as Array<{
			type?: string;
			webSocketDebuggerUrl?: string;
		}>;
		const pageTarget = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);

		assert.equal(typeof versionInfo.Browser, "string");
		assert.ok(pageTarget?.webSocketDebuggerUrl);

		cdp = await connectToCdp(pageTarget.webSocketDebuggerUrl as string);

		const consoleMessages: string[] = [];
		const cleanupConsoleListener = cdp.on("Runtime.consoleAPICalled", (params) => {
			const text = (params.args ?? [])
				.map((entry: { value?: unknown }) => typeof entry.value === "string" ? entry.value : "")
				.filter(Boolean)
				.join(" ");

			consoleMessages.push(`${params.type || "log"} ${text}`.trim());
		});
		const cleanupLogListener = cdp.on("Log.entryAdded", (params) => {
			consoleMessages.push(`${params.entry?.level || "log"} ${params.entry?.text || ""}`.trim());
		});

		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");
		await cdp.send("Log.enable");

		await navigateAndWait(cdp, appBaseUrl, "dark-mode initial page load");
		await delay(500);

		consoleMessages.length = 0;

		await cdp.send("Runtime.evaluate", {
			awaitPromise: false,
			expression: `localStorage.setItem('nuxt-color-mode', 'dark'); location.reload();`,
			returnByValue: true
		});
		await waitForRuntimeCondition(
			cdp,
			`({
				colorModeClass: document.documentElement.className,
				navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null,
				themeToggleLabel: document.querySelector('[aria-label^="Switch to "]')?.getAttribute("aria-label") ?? null
			})`,
			(value) => {
				const state = value as {
					colorModeClass?: string;
					navigationType?: string;
					themeToggleLabel?: null | string;
				} | undefined;

				return state?.navigationType === "reload"
					&& /\bdark\b/.test(state.colorModeClass ?? "")
					&& state.themeToggleLabel === "Switch to light mode";
			},
			"dark-mode preference reload"
		);
		await delay(1200);

		const evaluation = await cdp.send("Runtime.evaluate", {
			awaitPromise: false,
			expression: `(() => ({
				colorModeClass: document.documentElement.className,
				themeToggleLabel: document.querySelector('[aria-label^="Switch to "]')?.getAttribute('aria-label') ?? null
			}))()`,
			returnByValue: true
		});
		const pageState = evaluation.result?.value as {
			colorModeClass?: string;
			themeToggleLabel?: null | string;
		};

		assert.match(pageState.colorModeClass ?? "", /\bdark\b/);
		assert.equal(pageState.themeToggleLabel, "Switch to light mode");
		assert.equal(
			consoleMessages.some(message => /hydration|mismatch/i.test(message)),
			false,
			`Unexpected hydration console output:\n${consoleMessages.join("\n")}`
		);

		cleanupConsoleListener();
		cleanupLogListener();
		await cdp.close();
		cdp = null;
	}
	catch (error) {
		throw new Error(`${String(error)}\n\nChrome output:\n${chrome.getOutput()}`);
	}
	finally {
		if (cdp)
			await cdp.close().catch(() => {});

		await stopChromeProcess(chrome.child, chromeUserDataDir);
	}
});

test("stale client tabs recover cleanly when the stored build id is older than the served HTML", async (t) => {
	const chromeExecutable = findChromeExecutable();

	if (!chromeExecutable) {
		t.skip("Chrome is not available for the deploy recovery regression test.");
		return;
	}

	const chromePort = await getFreePort();
	const chromeUserDataDir = mkdtempSync(join(tmpdir(), "ballot-clarity-chrome-"));
	const chrome = startChromeProcess(chromeExecutable, [
		`--remote-debugging-port=${chromePort}`,
		`--user-data-dir=${chromeUserDataDir}`,
		"--headless=new",
		"--disable-background-networking",
		"--disable-default-apps",
		"--disable-gpu",
		"--disable-sync",
		"--metrics-recording-only",
		"--no-first-run",
		"--no-default-browser-check",
		"about:blank"
	]);

	let cdp: CdpSession | null = null;

	try {
		const targets = await waitForJson(`http://127.0.0.1:${chromePort}/json/list`, "Chrome DevTools targets") as Array<{
			type?: string;
			webSocketDebuggerUrl?: string;
		}>;
		const pageTarget = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);

		assert.ok(pageTarget?.webSocketDebuggerUrl);
		cdp = await connectToCdp(pageTarget.webSocketDebuggerUrl as string);
		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");
		await cdp.send("Log.enable");
		await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
			source: `(() => {
				const originalSetItem = Storage.prototype.setItem;
				Storage.prototype.setItem = function(key, value) {
					if (this === window.sessionStorage && typeof key === "string" && key.startsWith(${JSON.stringify(staleClientReloadKeyPrefix)}))
						originalSetItem.call(this, ${JSON.stringify(deployRecoverySeenReloadKey)}, key);

					return originalSetItem.call(this, key, value);
				};

				window.addEventListener("beforeunload", () => {
				try {
					const count = Number(window.sessionStorage.getItem(${JSON.stringify(deployRecoveryUnloadCountKey)}) || "0") + 1;
					window.sessionStorage.setItem(${JSON.stringify(deployRecoveryUnloadCountKey)}, String(count));
				}
				catch {}
				});
			})();`
		});

		const consoleMessages: string[] = [];
		const cleanupConsoleListener = cdp.on("Runtime.consoleAPICalled", (params) => {
			const text = (params.args ?? [])
				.map((entry: { value?: unknown }) => typeof entry.value === "string" ? entry.value : "")
				.filter(Boolean)
				.join(" ");

			consoleMessages.push(`${params.type || "log"} ${text}`.trim());
		});
		const cleanupLogListener = cdp.on("Log.entryAdded", (params) => {
			consoleMessages.push(`${params.entry?.level || "log"} ${params.entry?.text || ""}`.trim());
		});

		await navigateAndWait(cdp, appBaseUrl, "stale-client initial page load");
		await delay(500);

		consoleMessages.length = 0;

		await cdp.send("Runtime.evaluate", {
			awaitPromise: false,
			expression: `(() => {
				window.sessionStorage.setItem(${JSON.stringify(staleClientBuildStorageKey)}, "stale-build-from-prior-release");
				window.sessionStorage.setItem(${JSON.stringify(deployRecoveryUnloadCountKey)}, "0");
				window.location.reload();
			})()`,
			returnByValue: true
		});
		const pageState = await waitForRuntimeCondition(
			cdp,
			`(() => {
				const currentBuildId = document.documentElement.getAttribute("data-app-build") || "";
				return {
					currentBuildId,
					hasStaleRecoveryAttr: document.documentElement.hasAttribute("data-stale-client-recovery"),
					recoveryMarker: window.sessionStorage.getItem(${JSON.stringify(deployRecoveryUnloadCountKey)}),
					reloadMarkerCleared: window.sessionStorage.getItem(${JSON.stringify(staleClientReloadKeyPrefix)} + (currentBuildId || "unknown")),
					reloadMarkerSeen: window.sessionStorage.getItem(${JSON.stringify(deployRecoverySeenReloadKey)}),
					storedBuildId: window.sessionStorage.getItem(${JSON.stringify(staleClientBuildStorageKey)}),
				};
			})()`,
			(value) => {
				const state = value as {
					currentBuildId?: string;
					hasStaleRecoveryAttr?: boolean;
					recoveryMarker?: null | string;
					reloadMarkerCleared?: null | string;
					reloadMarkerSeen?: null | string;
					storedBuildId?: null | string;
				} | undefined;
				const currentBuildId = state?.currentBuildId ?? "";

				return currentBuildId.length > 0
					&& state?.storedBuildId === currentBuildId
					&& state.hasStaleRecoveryAttr === false
					&& state.recoveryMarker === "1"
					&& state.reloadMarkerCleared === null
					&& state.reloadMarkerSeen === `${staleClientReloadKeyPrefix}${currentBuildId}`;
			},
			"stale-client recovery reload"
		) as {
			currentBuildId?: string;
			hasStaleRecoveryAttr?: boolean;
			recoveryMarker?: null | string;
			reloadMarkerCleared?: null | string;
			reloadMarkerSeen?: null | string;
			storedBuildId?: null | string;
		};
		await delay(300);
		const currentBuildId = pageState.currentBuildId ?? "";

		assert.ok(currentBuildId.length > 0);
		assert.equal(pageState.storedBuildId, currentBuildId);
		assert.equal(pageState.hasStaleRecoveryAttr, false);
		assert.equal(pageState.recoveryMarker, "1");
		assert.equal(pageState.reloadMarkerCleared, null);
		assert.equal(pageState.reloadMarkerSeen, `${staleClientReloadKeyPrefix}${currentBuildId}`);
		assert.equal(
			consoleMessages.some(message => /hydration|mismatch|failed to fetch dynamically imported module|chunkloaderror/i.test(message)),
			false,
			`Unexpected stale-client console output:\n${consoleMessages.join("\n")}`
		);

		cleanupConsoleListener();
		cleanupLogListener();
		await cdp.close();
		cdp = null;
	}
	catch (error) {
		throw new Error(`${String(error)}\n\nChrome output:\n${chrome.getOutput()}`);
	}
	finally {
		if (cdp)
			await cdp.close().catch(() => {});

		await stopChromeProcess(chrome.child, chromeUserDataDir);
	}
});

test("nationwide lookup context survives client navigation across results, districts, district detail, and representative routes", async (t) => {
	const chromeExecutable = findChromeExecutable();

	if (!chromeExecutable) {
		t.skip("Chrome is not available for the nationwide route coverage test.");
		return;
	}

	const chromePort = await getFreePort();
	const chromeUserDataDir = mkdtempSync(join(tmpdir(), "ballot-clarity-chrome-"));
	const chrome = startChromeProcess(chromeExecutable, [
		`--remote-debugging-port=${chromePort}`,
		`--user-data-dir=${chromeUserDataDir}`,
		"--headless=new",
		"--disable-background-networking",
		"--disable-default-apps",
		"--disable-gpu",
		"--disable-sync",
		"--metrics-recording-only",
		"--no-first-run",
		"--no-default-browser-check",
		"about:blank"
	]);

	let cdp: CdpSession | null = null;

	try {
		const targets = await waitForJson(`http://127.0.0.1:${chromePort}/json/list`, "Chrome DevTools targets") as Array<{
			type?: string;
			webSocketDebuggerUrl?: string;
		}>;
		const pageTarget = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);

		assert.ok(pageTarget?.webSocketDebuggerUrl);
		cdp = await connectToCdp(pageTarget.webSocketDebuggerUrl as string);
		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");

		await navigateAndWait(cdp, appBaseUrl, "nationwide-context initial page load");
		await delay(500);
		await cdp.send("Network.enable");
		await cdp.send("Network.setCookie", {
			httpOnly: true,
			name: activeNationwideLookupCookieName,
			sameSite: "Strict",
			url: appBaseUrl,
			value: activeNationwideLookupCookieValue
		});

		await cdp.send("Runtime.evaluate", {
			awaitPromise: false,
			expression: `localStorage.setItem('ballot-clarity:civic-store', ${JSON.stringify(JSON.stringify(nationwideLookupSnapshot))}); location.assign('${appBaseUrl}/results');`,
			returnByValue: true
		});
		await waitForDocumentReady(cdp, `${appBaseUrl}/results`, "nationwide-context results navigation");
		await waitForBodyText(cdp, /Representative data/, "nationwide-context results hydration");

		const resultsText = await getDocumentBodyText(cdp);
		assert.match(resultsText, /Provo, Utah/);
		assert.match(resultsText, /Representative data/);
		assert.match(resultsText, /5 representative matches/);
		assert.match(resultsText, /Civic results ready/i);

		await navigateAndWait(cdp, `${appBaseUrl}/districts`, "nationwide-context districts navigation");
		await waitForBodyText(cdp, /Marsha Judkins/, "nationwide-context districts hydration");
		const districtsText = await getDocumentBodyText(cdp);
		assert.match(districtsText, /Provo, Utah/);
		assert.match(districtsText, /Mike Kennedy/);
		assert.match(districtsText, /Marsha Judkins/);
		assert.doesNotMatch(districtsText, /Local officials not attached yet/);

		await navigateAndWait(cdp, `${appBaseUrl}/districts/provo-city`, "nationwide-context district-detail navigation");
		await waitForBodyText(cdp, /Marsha Judkins/, "nationwide-context district-detail hydration");
		const districtDetailText = await getDocumentBodyText(cdp);
		assert.doesNotMatch(districtDetailText, /District page unavailable/);
		assert.match(districtDetailText, /Provo city/);
		assert.match(districtDetailText, /Marsha Judkins/);
		assert.match(districtDetailText, /1 current representative/);

		await navigateAndWait(cdp, `${appBaseUrl}/representatives`, "nationwide-context representatives navigation");
		await waitForBodyText(cdp, /7 current officials across 5 district matches/, "nationwide-context representatives hydration");
		const representativesText = await getDocumentBodyText(cdp);
		assert.match(representativesText, /Representative directory/);
		assert.match(representativesText, /Mike Kennedy/);
		assert.match(representativesText, /Marsha Judkins/);
		assert.match(representativesText, /7 current officials across 5 district matches/);

		await navigateAndWait(cdp, `${appBaseUrl}/representatives/mike-kennedy`, "nationwide-context representative-detail navigation");
		await waitForBodyText(cdp, /Provider record/, "nationwide-context representative-detail hydration");
		const representativeDetailText = await getDocumentBodyText(cdp);
		assert.match(representativeDetailText, /Mike Kennedy/);
		assert.doesNotMatch(representativeDetailText, /Representative profile not available/);
		assert.match(representativeDetailText, /Provider record/);
		assert.equal(await countSelectorMatches(cdp, "[data-representative-layout='profile']"), 1);
		assert.equal(await countSelectorMatches(cdp, "#at-a-glance"), 1);
		assert.equal(await countSelectorMatches(cdp, "[data-representative-sidebar='record-details']"), 1);

		await navigateAndWait(cdp, `${appBaseUrl}/representatives/mike-kennedy/funding`, "nationwide-context funding navigation");
		await waitForBodyText(cdp, /Mike Kennedy funding/, "nationwide-context funding hydration");
		const fundingText = await getDocumentBodyText(cdp);
		assert.match(fundingText, /Mike Kennedy funding/);
		assert.match(fundingText, /Funding unavailable|No campaign-finance summary is attached to this officeholder yet/);

		await navigateAndWait(cdp, `${appBaseUrl}/representatives/mike-kennedy/influence`, "nationwide-context influence navigation");
		await waitForBodyText(cdp, /Mike Kennedy influence/, "nationwide-context influence hydration");
		const influenceText = await getDocumentBodyText(cdp);
		assert.match(influenceText, /Mike Kennedy influence/);
		assert.match(influenceText, /Influence unavailable|No lobbying or disclosure summary is attached to this officeholder yet/);

		await cdp.close();
		cdp = null;
	}
	catch (error) {
		throw new Error(`${String(error)}\n\nChrome output:\n${chrome.getOutput()}`);
	}
	finally {
		if (cdp)
			await cdp.close().catch(() => {});

		await stopChromeProcess(chrome.child, chromeUserDataDir);
	}
});

test("saved guide shell context loads district and representative hubs without a fresh lookup result", async (t) => {
	const chromeExecutable = findChromeExecutable();

	if (!chromeExecutable) {
		t.skip("Chrome is not available for the guide-shell route coverage test.");
		return;
	}

	const chromePort = await getFreePort();
	const chromeUserDataDir = mkdtempSync(join(tmpdir(), "ballot-clarity-chrome-"));
	const chrome = startChromeProcess(chromeExecutable, [
		`--remote-debugging-port=${chromePort}`,
		`--user-data-dir=${chromeUserDataDir}`,
		"--headless=new",
		"--disable-background-networking",
		"--disable-default-apps",
		"--disable-gpu",
		"--disable-sync",
		"--metrics-recording-only",
		"--no-first-run",
		"--no-default-browser-check",
		"about:blank"
	]);

	let cdp: CdpSession | null = null;

	try {
		const targets = await waitForJson(`http://127.0.0.1:${chromePort}/json/list`, "Chrome DevTools targets") as Array<{
			type?: string;
			webSocketDebuggerUrl?: string;
		}>;
		const pageTarget = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);

		assert.ok(pageTarget?.webSocketDebuggerUrl);
		cdp = await connectToCdp(pageTarget.webSocketDebuggerUrl as string);
		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");

		await cdp.send("Log.enable");
		const consoleMessages: string[] = [];
		const cleanupConsoleListener = cdp.on("Runtime.consoleAPICalled", (params) => {
			const text = (params.args ?? [])
				.map((entry: { description?: string; value?: unknown }) => typeof entry.value === "string"
					? entry.value
					: entry.description ?? "")
				.filter(Boolean)
				.join(" ");

			consoleMessages.push(`${params.type || "log"} ${text}`.trim());
		});
		const cleanupLogListener = cdp.on("Log.entryAdded", (params) => {
			consoleMessages.push(`${params.entry?.level || "log"} ${params.entry?.text || ""}`.trim());
		});

		await navigateAndWait(cdp, appBaseUrl, "saved-guide initial page load");
		await delay(500);
		consoleMessages.length = 0;

		await cdp.send("Runtime.evaluate", {
			awaitPromise: false,
			expression: `document.cookie = ${JSON.stringify(`${activeNationwideLookupCookieName}=; Max-Age=0; path=/`)}; localStorage.setItem('ballot-clarity:civic-store', ${JSON.stringify(JSON.stringify(guideShellOnlySnapshot))}); location.assign('${appBaseUrl}/representatives');`,
			returnByValue: true
		});
		await waitForDocumentReady(cdp, `${appBaseUrl}/representatives`, "saved-guide representatives navigation");
		await waitForBodyText(cdp, /4 current officials across 4 district matches/, "saved-guide representatives hydration");

		const representativesText = await getDocumentBodyText(cdp);
		assert.match(representativesText, /Fulton County, Georgia/);
		assert.match(representativesText, /Using the saved guide area in this browser/);
		assert.match(representativesText, /Representative directory/);
		assert.match(representativesText, /4 current officials across 4 district matches/);
		assert.match(representativesText, /Robb Pitts|Shawn Still/);
		assert.doesNotMatch(representativesText, /Start with lookup|Refresh results for this page/);

		await navigateAndWait(cdp, `${appBaseUrl}/districts`, "saved-guide districts navigation");
		await waitForBodyText(cdp, /Fulton County|State Senate District 48/, "saved-guide districts hydration");

		const districtsText = await getDocumentBodyText(cdp);
		assert.match(districtsText, /Fulton County, Georgia/);
		assert.match(districtsText, /District pages/);
		assert.match(districtsText, /Fulton County|State Senate District 48|Johns Creek city/);
		assert.doesNotMatch(districtsText, /Start with lookup|Refresh results for this page/);
		assert.equal(
			consoleMessages.some(message => /hydration|mismatch/i.test(message)),
			false,
			`Unexpected saved-guide console output:\n${consoleMessages.join("\n")}`
		);

		cleanupConsoleListener();
		cleanupLogListener();
		await cdp.close();
		cdp = null;
	}
	catch (error) {
		throw new Error(`${String(error)}\n\nChrome output:\n${chrome.getOutput()}`);
	}
	finally {
		if (cdp)
			await cdp.close().catch(() => {});

		await stopChromeProcess(chrome.child, chromeUserDataDir);
	}
});

test("built app server-renders district and representative routes when the active lookup cookie is present", async () => {
	const requestHeaders = {
		cookie: `${activeNationwideLookupCookie}; ${easternDisplayTimeZoneCookie}`
	};
	const [
		districtsPage,
		districtPage,
		representativesPage,
		representativePage,
		fundingPage,
		influencePage
	] = await Promise.all([
		fetch(`${appBaseUrl}/districts`, { headers: requestHeaders }),
		fetch(`${appBaseUrl}/districts/provo-city`, { headers: requestHeaders }),
		fetch(`${appBaseUrl}/representatives`, { headers: requestHeaders }),
		fetch(`${appBaseUrl}/representatives/mike-kennedy`, { headers: requestHeaders }),
		fetch(`${appBaseUrl}/representatives/mike-kennedy/funding`, { headers: requestHeaders }),
		fetch(`${appBaseUrl}/representatives/mike-kennedy/influence`, { headers: requestHeaders })
	]);
	const [
		districtsHtml,
		districtHtml,
		representativesHtml,
		representativeHtml,
		fundingHtml,
		influenceHtml
	] = await Promise.all([
		districtsPage.text(),
		districtPage.text(),
		representativesPage.text(),
		representativePage.text(),
		fundingPage.text(),
		influencePage.text()
	]);

	assert.equal(districtsPage.status, 200);
	assert.match(districtsHtml, /Provo, Utah/);
	assert.match(
		districtsHtml,
		/Open each matched office area to review the office, current officials, candidates, and official election links for your area\.|Open each office area to review the office, current representative, and candidate field in one place\./
	);
	assert.equal(districtPage.status, 200);
	assert.match(districtHtml, /Provo city/);
	assert.doesNotMatch(districtHtml, /District detail not available yet/);
	assert.match(districtHtml, /No city officeholder data is attached here yet\. This does not mean the city has no officials\.|CURRENT REPRESENTATIVE|Open representative/i);
	assert.equal(representativesPage.status, 200);
	assert.match(representativesHtml, /Mike Kennedy/);
	assert.match(representativesHtml, /5 current officials across 5 district matches/);
	assert.equal(representativePage.status, 200);
	assert.match(representativeHtml, /Mike Kennedy/);
	assert.doesNotMatch(representativeHtml, /Representative profile not available/);
	assert.match(representativeHtml, /Provider record/);
	assert.equal((representativeHtml.match(/data-representative-layout="profile"/g) ?? []).length, 1);
	assert.equal((representativeHtml.match(/data-representative-sidebar="record-details"/g) ?? []).length, 1);
	assert.equal(fundingPage.status, 200);
	assert.match(fundingHtml, /Mike Kennedy funding/);
	assert.match(fundingHtml, /Funding unavailable|No campaign-finance summary is attached to this officeholder yet/);
	assert.equal(influencePage.status, 200);
	assert.match(influenceHtml, /Mike Kennedy influence/);
	assert.match(influenceHtml, /Influence unavailable|No lobbying or disclosure summary is attached to this officeholder yet/);
});

test("fresh SSR district and representative hubs stay nationwide-safe without browser lookup state", async () => {
	const [districtsPage, representativesPage] = await Promise.all([
		fetch(`${appBaseUrl}/districts`),
		fetch(`${appBaseUrl}/representatives`)
	]);
	const [districtsHtml, representativesHtml] = await Promise.all([
		districtsPage.text(),
		representativesPage.text()
	]);

	assert.equal(districtsPage.status, 200);
	assert.match(districtsHtml, /Start with lookup/);

	assert.equal(representativesPage.status, 200);
	assert.match(representativesHtml, /Start with lookup/);
});

test("public district and representative routes resolve direct loads without generic lookup-required shells", async () => {
	const [
		districtPage,
		representativePage,
		fundingPage,
		influencePage
	] = await Promise.all([
		fetch(`${appBaseUrl}/districts/congressional-7`),
		fetch(`${appBaseUrl}/representatives/rich-mccormick`),
		fetch(`${appBaseUrl}/representatives/rich-mccormick/funding`),
		fetch(`${appBaseUrl}/representatives/rich-mccormick/influence`)
	]);
	const [
		districtHtml,
		representativeHtml,
		fundingHtml,
		influenceHtml
	] = await Promise.all([
		districtPage.text(),
		representativePage.text(),
		fundingPage.text(),
		influencePage.text()
	]);

	assert.equal(districtPage.status, 200);
	assert.match(districtHtml, /Congressional District 7/);
	assert.match(districtHtml, /Current representatives/);
	assert.doesNotMatch(districtHtml, /District page not found/i);

	assert.equal(representativePage.status, 200);
	assert.match(representativeHtml, /Rich McCormick/);
	assert.doesNotMatch(representativeHtml, /pending lookup context/i);
	assert.doesNotMatch(representativeHtml, /Representative profile not found/i);

	assert.equal(fundingPage.status, 200);
	assert.match(fundingHtml, /Rich McCormick funding/);
	assert.match(fundingHtml, /Source note|Funding unavailable/);
	assert.doesNotMatch(fundingHtml, /Representative profile not found/i);

	assert.equal(influencePage.status, 200);
	assert.match(influenceHtml, /Rich McCormick influence/);
	assert.match(influenceHtml, /Influence notes|Influence unavailable/);
	assert.doesNotMatch(influenceHtml, /Representative profile not found/i);
});

test("sitemap returns 200 and only advertises valid source-backed public routes", async () => {
	const response = await fetch(`${appBaseUrl}/sitemap.xml`);
	const body = await response.text();

	assert.equal(response.status, 200);
	assert.match(body, /<urlset[^>]*>/);
	assert.match(body, new RegExp(`<loc>${appBaseUrl}/elections/2026-fulton-county-general</loc>`));
	assert.match(body, new RegExp(`<loc>${appBaseUrl}/locations/fulton-county-georgia</loc>`));
	assert.match(body, new RegExp(`<loc>${appBaseUrl}/sources/open-states</loc>`));
	assert.match(body, new RegExp(`<loc>${appBaseUrl}/sources/supplemental:shawn-still:bio</loc>`));
	assert.doesNotMatch(body, /\/results/);
	assert.doesNotMatch(body, /\/ballot\/2026-fulton-county-general/);
	assert.doesNotMatch(body, /\/candidate\/elena-torres/);
	assert.doesNotMatch(body, /\/measure\/charter-amendment-a/);
	assert.doesNotMatch(body, /\/contest\/us-house-district-7/);
	assert.doesNotMatch(body, new RegExp(`<loc>${appBaseUrl}/sources/district:state-senate-48</loc>`));
});

test("security.txt returns a current responsible-disclosure contact policy", async () => {
	const beforeRequest = Date.now();
	const response = await fetch(`${appBaseUrl}/.well-known/security.txt`);
	const body = await response.text();
	const expiresMatch = body.match(/^Expires: (.+)$/m);

	assert.equal(response.status, 200);
	assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
	assert.match(response.headers.get("cache-control") ?? "", /max-age=86400/);
	assert.match(body, /^Contact: https:\/\/ballotclarity\.org\/contact$/m);
	assert.match(body, /^Preferred-Languages: en$/m);
	assert.match(body, /^Canonical: https:\/\/ballotclarity\.org\/\.well-known\/security\.txt$/m);
	assert.match(body, /^Policy: https:\/\/ballotclarity\.org\/terms$/m);
	assert.doesNotMatch(body, /mailto:|hello@|jacob@|gmail\.com/i);
	assert.ok(expiresMatch);

	const expiresAt = Date.parse(expiresMatch[1]);
	assert.ok(Number.isFinite(expiresAt));
	assert.ok(expiresAt > beforeRequest);
	assert.ok(expiresAt <= beforeRequest + 181 * 24 * 60 * 60 * 1000);
});
