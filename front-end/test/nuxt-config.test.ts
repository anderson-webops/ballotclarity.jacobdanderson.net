import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyticsTrackers, appDescription, appName, appSocialImageAlt, appSocialImagePath } from "../src/constants/index.ts";
import { staleClientBuildStorageKey } from "../src/utils/deploy-recovery.ts";
import { displayTimeZoneCookieName } from "../src/utils/display-time-zone.ts";

function getLastHostnameLabels(value: string, count: number) {
	try {
		return new URL(value).hostname.toLowerCase().split(".").slice(-count).join(".");
	}
	catch {
		return "";
	}
}

function collectVueFiles(directory: string): string[] {
	return readdirSync(directory)
		.flatMap((entry) => {
			const path = join(directory, entry);
			const stats = statSync(path);

			if (stats.isDirectory())
				return collectVueFiles(path);

			return entry.endsWith(".vue") ? [path] : [];
		});
}

test("nuxt config uses srcDir and expected civic modules", async () => {
	const { default: config } = await import("../nuxt.config.ts");

	assert.equal(config.srcDir, "src");
	assert.deepEqual(
		config.modules?.sort(),
		["@nuxt/eslint", "@nuxtjs/color-mode", "@pinia/nuxt", "@unocss/nuxt", "@vueuse/nuxt"].sort()
	);
	assert.equal(config.runtimeConfig?.public?.apiBase, "http://127.0.0.1:3001/api");
	assert.equal(config.runtimeConfig?.public?.apiFetchTimeoutMs, 15_000);
	assert.equal(config.runtimeConfig?.adminApiFetchTimeoutMs, 15_000);
	assert.ok(typeof config.runtimeConfig?.public?.buildId === "string" && config.runtimeConfig.public.buildId.length > 0);
	assert.match(config.runtimeConfig?.public?.buildId || "", /^[0-9a-f]{40}$/u);
	assert.equal(config.runtimeConfig?.public?.siteUrl, "https://ballotclarity.org");
	assert.equal(config.runtimeConfig?.public?.operatorLegalName, "Jacob Anderson");
	assert.equal(config.runtimeConfig?.public?.governingLaw, "State of Georgia");
	assert.equal(config.runtimeConfig?.public?.venue, "state or federal courts located in Georgia");
	assert.equal(config.colorMode?.preference, "system");
	assert.equal(config.devtools?.enabled, false);
	assert.equal(config.experimental?.typedPages, true);
	assert.deepEqual(config.vite?.build?.modulePreload, { polyfill: false });
	assert.equal(config.app?.head?.htmlAttrs?.lang, "en");
	assert.equal(config.app?.head?.htmlAttrs?.["data-app-build"], config.runtimeConfig?.public?.buildId);
	assert.ok(config.app?.head?.meta?.some(meta => meta.name === "ballot-clarity-build-id" && meta.content === config.runtimeConfig?.public?.buildId));
	assert.ok(config.app?.head?.script?.some(script =>
		script.id === "ballot-clarity-display-time-zone"
		&& typeof script.innerHTML === "string"
		&& script.innerHTML.includes(displayTimeZoneCookieName)
		&& script.innerHTML.includes("Intl.DateTimeFormat().resolvedOptions().timeZone")
	));
	assert.ok(config.app?.head?.script?.some(script =>
		script.id === "ballot-clarity-deploy-recovery"
		&& typeof script.innerHTML === "string"
		&& script.innerHTML.includes(staleClientBuildStorageKey)
		&& script.innerHTML.includes("window.location.reload()")
	));
	assert.deepEqual(analyticsTrackers.map(tracker => tracker.domain), ["analytics.ballotclarity.org"]);
	const analyticsScripts = config.app?.head?.script?.filter(script =>
		analyticsTrackers.some(tracker => script.src === `https://${tracker.domain}/script.js`)
	) ?? [];
	assert.deepEqual(
		analyticsScripts.map(script => ({
			async: script.async,
			defer: script.defer,
			src: script.src,
			websiteId: script["data-website-id"]
		})),
		analyticsTrackers.map(tracker => ({
			async: true,
			defer: undefined,
			src: `https://${tracker.domain}/script.js`,
			websiteId: tracker.websiteId
		}))
	);
	assert.ok(!config.app?.head?.script?.some(script =>
		typeof script.src === "string" && getLastHostnameLabels(script.src, 2) === "jacobdanderson.net"
	));
	assert.ok(config.app?.head?.link?.some(link => link.rel === "manifest" && typeof link.href === "string" && link.href.startsWith("/site.webmanifest")));
	const contentSecurityPolicy = config.nitro?.routeRules?.["/**"]?.headers?.["content-security-policy"];
	assert.match(contentSecurityPolicy ?? "", /default-src 'self'/);
	assert.match(contentSecurityPolicy ?? "", /base-uri 'self'/);
	assert.match(contentSecurityPolicy ?? "", /frame-ancestors 'none'/);
	assert.match(contentSecurityPolicy ?? "", /object-src 'none'/);
	assert.match(contentSecurityPolicy ?? "", /script-src 'self' https:\/\/analytics\.ballotclarity\.org/);
	assert.doesNotMatch(contentSecurityPolicy?.match(/script-src [^;]+/)?.[0] ?? "", /'unsafe-inline'/);
	assert.match(contentSecurityPolicy ?? "", /connect-src 'self' http:\/\/127\.0\.0\.1:3001 http:\/\/127\.0\.0\.1:\* https:\/\/analytics\.ballotclarity\.org/);
	assert.deepEqual(config.nitro?.routeRules?.["/**"]?.headers, {
		"content-security-policy": contentSecurityPolicy,
		"cross-origin-opener-policy": "same-origin",
		"cross-origin-resource-policy": "same-origin",
		"origin-agent-cluster": "?1",
		"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
		"referrer-policy": "strict-origin-when-cross-origin",
		"strict-transport-security": "max-age=31536000",
		"x-content-type-options": "nosniff",
		"x-permitted-cross-domain-policies": "none",
		"x-frame-options": "DENY"
	});
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["cache-control"], "public, max-age=31536000, immutable");
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["content-security-policy"], contentSecurityPolicy);
	assert.equal(config.nitro?.routeRules?.["/**"]?.headers?.["content-security-policy-report-only"], undefined);
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["cross-origin-opener-policy"], "same-origin");
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["cross-origin-resource-policy"], "same-origin");
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["origin-agent-cluster"], "?1");
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["strict-transport-security"], "max-age=31536000");
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["x-content-type-options"], "nosniff");
	assert.equal(config.nitro?.routeRules?.["/_nuxt/**"]?.headers?.["x-permitted-cross-domain-policies"], "none");
	assert.equal(config.nitro?.routeRules?.["/admin/**"]?.headers?.["X-Robots-Tag"], "noindex, nofollow");
	assert.equal(config.nitro?.routeRules?.["/admin/**"]?.headers?.["x-frame-options"], "DENY");
	assert.equal(config.nitro?.routeRules?.["/ballot"]?.headers?.["X-Robots-Tag"], "noindex, follow");
	assert.equal(config.nitro?.routeRules?.["/ballot/**"]?.headers?.["X-Robots-Tag"], "noindex, follow");
	assert.equal(config.nitro?.routeRules?.["/results"]?.headers?.["X-Robots-Tag"], "noindex, nofollow");
	assert.equal(config.nitro?.routeRules?.["/results/**"]?.headers?.["X-Robots-Tag"], "noindex, nofollow");
});

test("web manifest preserves Ballot Clarity branding", () => {
	const manifest = JSON.parse(readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8"));

	assert.equal(manifest.name, appName);
	assert.equal(manifest.description, appDescription);
	assert.equal(manifest.short_name, "Ballot Clarity");
	assert.equal(manifest.start_url, "/");
	assert.equal(manifest.scope, "/");
	assert.equal(manifest.display, "standalone");
	assert.ok(Array.isArray(manifest.icons));
	assert.ok(manifest.icons.some(icon => typeof icon.src === "string" && icon.src.startsWith("/maskable-icon.png")));
});

test("public SEO metadata has an available share image", () => {
	const seoComposable = readFileSync(new URL("../src/composables/usePageSeo.ts", import.meta.url), "utf8");
	const socialCardPath = new URL(`../public${appSocialImagePath}`, import.meta.url);
	const socialCard = readFileSync(socialCardPath, "utf8");

	assert.equal(existsSync(socialCardPath), true);
	assert.match(appDescription, /current representatives/);
	assert.match(appDescription, /published ballot records/);
	assert.doesNotMatch(appDescription, /review ballot choices/);
	assert.match(seoComposable, /ogImage: socialImageUrl/);
	assert.match(seoComposable, /twitterImage: socialImageUrl/);
	assert.match(seoComposable, /ogImageAlt: appSocialImageAlt/);
	assert.match(seoComposable, /twitterImageAlt: appSocialImageAlt/);
	assert.match(appSocialImageAlt, /Ballot Clarity preview card/);
	assert.match(socialCard, /Civic information/);
	assert.equal(socialCard.includes(">ballotclarity.org</text>"), true);
});

test("lookup-dependent routes stay out of public search indexes without blocking ballot follow rules", () => {
	const appVue = readFileSync(new URL("../src/app.vue", import.meta.url), "utf8");
	const ballotIndexPage = readFileSync(new URL("../src/pages/ballot/index.vue", import.meta.url), "utf8");
	const ballotDetailPage = readFileSync(new URL("../src/pages/ballot/[slug].vue", import.meta.url), "utf8");
	const resultsPage = readFileSync(new URL("../src/pages/results.vue", import.meta.url), "utf8");
	const robotsTxt = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
	const sitemapRoute = readFileSync(new URL("../server/routes/sitemap.xml.ts", import.meta.url), "utf8");

	assert.ok(appVue.includes("const noindexPathPattern = /^\\/(?:admin|api|compare|plan|results|search)(?:\\/|$)/;"));
	assert.ok(!appVue.includes("const noindexPathPattern = /^\\/(?:admin|api|ballot|compare|plan|results|search)(?:\\/|$)/;"));
	assert.match(ballotIndexPage, /robots: "noindex,follow"/);
	assert.match(ballotDetailPage, /robots: "noindex,follow"/);
	assert.match(resultsPage, /robots: "noindex,nofollow"/);
	assert.doesNotMatch(robotsTxt, /Disallow: \/ballot/);
	assert.match(robotsTxt, /Disallow: \/results/);
	assert.doesNotMatch(sitemapRoute, /"\/results"/);
});

test("security.txt exposes a protected disclosure contact without publishing a raw mailbox", () => {
	const securityTxtRoute = readFileSync(new URL("../server/routes/.well-known/security.txt.ts", import.meta.url), "utf8");
	const robotsTxt = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");

	assert.match(securityTxtRoute, /Contact: \$\{contactUrl\}/);
	assert.match(securityTxtRoute, /Expires: \$\{expires\}/);
	assert.match(securityTxtRoute, /Canonical: \$\{canonicalUrl\}/);
	assert.match(securityTxtRoute, /Policy: \$\{termsUrl\}/);
	assert.match(securityTxtRoute, /securityTxtTtlMs = 180 \* 24 \* 60 \* 60 \* 1000/);
	assert.match(robotsTxt, /Allow: \/\.well-known\/security\.txt/);
	assert.doesNotMatch(securityTxtRoute, /mailto:/i);
	assert.doesNotMatch(securityTxtRoute, /hello@|jacob@|gmail\.com/i);
});

test("page components declare explicit SEO metadata", () => {
	const pagesDirectory = fileURLToPath(new URL("../src/pages", import.meta.url));
	const missingSeo = collectVueFiles(pagesDirectory)
		.filter((path) => {
			const source = readFileSync(path, "utf8");

			return !/\busePageSeo\s*\(/.test(source) && !/\buseSeoMeta\s*\(/.test(source);
		})
		.map(path => relative(pagesDirectory, path));

	assert.deepEqual(missingSeo, []);
});

test("catch-all page returns a non-indexable 404", () => {
	const catchAllPage = readFileSync(new URL("../src/pages/[...all].vue", import.meta.url), "utf8");

	assert.match(catchAllPage, /setResponseStatus\(404\)/);
	assert.match(catchAllPage, /X-Robots-Tag/);
	assert.match(catchAllPage, /robots: "noindex,nofollow"/);
});

test("new-tab links include opener isolation", () => {
	const srcDirectory = fileURLToPath(new URL("../src", import.meta.url));
	const anchorPattern = /<a\b[^>]*>/g;
	const relPattern = /\brel=(["'])([^"']*)\1/;
	const unsafeLinks = collectVueFiles(srcDirectory).flatMap((path) => {
		const source = readFileSync(path, "utf8");
		const matches = [...source.matchAll(anchorPattern)]
			.filter(match => match[0].includes("target=\"_blank\"") || match[0].includes("target='_blank'"));

		return matches.flatMap((match) => {
			const rel = match[0].match(relPattern);
			const relTokens = new Set((rel?.[2] ?? "").split(/\s+/).filter(Boolean));

			return relTokens.has("noopener") && relTokens.has("noreferrer")
				? []
				: [`${relative(srcDirectory, path)}: ${match[0]}`];
		});
	});

	assert.deepEqual(unsafeLinks, []);
});

test("public data links use the centralized safe-link boundary", () => {
	const srcDirectory = fileURLToPath(new URL("../src", import.meta.url));
	const allowedDirectBindings = new Set([
		"components/ProtectedEmailLink.vue",
		"components/SafeExternalLink.vue",
		"pages/locations/[slug].vue",
	]);
	const directDynamicAnchorPattern = /<a\b[^>]*\b:href\s*=/u;
	const unsafeBindings = collectVueFiles(srcDirectory).flatMap((path) => {
		const relativePath = relative(srcDirectory, path);

		if (allowedDirectBindings.has(relativePath))
			return [];

		const source = readFileSync(path, "utf8");
		return directDynamicAnchorPattern.test(source) ? [relativePath] : [];
	});

	assert.deepEqual(unsafeBindings, []);
});
