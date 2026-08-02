import { execFileSync } from "node:child_process";
import process from "node:process";
import { defineNuxtConfig } from "nuxt/config";
import { buildContentSecurityPolicy } from "./server/utils/content-security-policy";
import { analyticsTrackers, appDescription, appName } from "./src/constants/index";
import { buildPreHydrationDeployRecoveryScript } from "./src/utils/deploy-recovery";
import { buildPreHydrationDisplayTimeZoneScript } from "./src/utils/display-time-zone";
import { resolveRequestTimeoutMs } from "./src/utils/request-timeout";

const assetVersion = "20260417";
const isDev = process.env.NODE_ENV === "development";
const buildId = process.env.NUXT_PUBLIC_BUILD_ID
	|| process.env.SOURCE_REVISION
	|| process.env.COMMIT_REF
	|| process.env.VERCEL_GIT_COMMIT_SHA
	|| process.env.GITHUB_SHA
	|| process.env.CF_PAGES_COMMIT_SHA
	|| process.env.COMMIT_SHA
	|| (() => {
		try {
			return execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: import.meta.dirname,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
		}
		catch {
			return process.env.RELEASE_VERSION
				|| process.env.SOURCE_VERSION
				|| `local-${Date.now().toString(36)}`;
		}
	})();
const publicApiBase = process.env.NUXT_PUBLIC_API_BASE || "http://127.0.0.1:3001/api";
const analyticsOrigins = analyticsTrackers.map(tracker => `https://${tracker.domain}`);
const contentSecurityPolicy = buildContentSecurityPolicy({
	analyticsOrigins,
	publicApiBase,
});
const securityHeaders = {
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
};
const noIndexHeaders = {
	...securityHeaders,
	"Cache-Control": "no-store, private",
	"X-Robots-Tag": "noindex, nofollow"
};
const noIndexFollowHeaders = {
	...securityHeaders,
	"X-Robots-Tag": "noindex, follow"
};

export default defineNuxtConfig({
	modules: [
		"@vueuse/nuxt",
		"@unocss/nuxt",
		"@pinia/nuxt",
		"@nuxtjs/color-mode",
		"@nuxt/eslint"
	],

	srcDir: "src",

	devtools: {
		enabled: isDev
	},

	app: {
		head: {
			htmlAttrs: {
				"lang": "en",
				"data-app-build": buildId
			},
			viewport: "width=device-width,initial-scale=1",
			link: [
				{ rel: "shortcut icon", href: `/favicon.ico?v=${assetVersion}` },
				{ rel: "icon", href: `/favicon.ico?v=${assetVersion}`, sizes: "any" },
				{ rel: "icon", type: "image/svg+xml", href: `/favicon.svg?v=${assetVersion}` },
				{ rel: "icon", type: "image/png", href: `/favicon-32x32.png?v=${assetVersion}`, sizes: "32x32" },
				{ rel: "icon", type: "image/png", href: `/favicon-16x16.png?v=${assetVersion}`, sizes: "16x16" },
				{ rel: "apple-touch-icon", href: `/apple-touch-icon.png?v=${assetVersion}` },
				{ rel: "manifest", href: `/site.webmanifest?v=${assetVersion}` }
			],
			meta: [
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ name: "description", content: appDescription },
				{ name: "ballot-clarity-build-id", content: buildId },
				{ name: "application-name", content: appName },
				{ name: "apple-mobile-web-app-status-bar-style", content: "default" }
			],
			script: [
				{
					innerHTML: buildPreHydrationDisplayTimeZoneScript(),
					id: "ballot-clarity-display-time-zone",
					tagPosition: "head",
					type: "text/javascript",
				},
				{
					innerHTML: buildPreHydrationDeployRecoveryScript(),
					id: "ballot-clarity-deploy-recovery",
					tagPosition: "head",
					type: "text/javascript",
				},
				...(isDev
					? []
					: analyticsTrackers.map(tracker => ({
							"async": true,
							"key": `ballot-clarity-analytics-${tracker.label}`,
							"src": `https://${tracker.domain}/script.js`,
							"data-website-id": tracker.websiteId,
						}))),
			]
		}
	},

	css: ["~/assets/styles/main.css"],

	colorMode: {
		classSuffix: "",
		preference: "system",
		fallback: "light"
	},

	runtimeConfig: {
		adminApiBase: process.env.ADMIN_API_BASE || process.env.NUXT_PUBLIC_API_BASE || "http://127.0.0.1:3001/api",
		adminApiFetchTimeoutMs: resolveRequestTimeoutMs(process.env.ADMIN_API_FETCH_TIMEOUT_MS),
		adminApiKey: process.env.ADMIN_API_KEY || "",
		adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "",
		contactAddress: process.env.CONTACT_ADDRESS || process.env.NUXT_CONTACT_ADDRESS || "",
		contactAddressSessionSecret: process.env.CONTACT_ADDRESS_SESSION_SECRET || process.env.NUXT_CONTACT_ADDRESS_SESSION_SECRET || "",
		public: {
			apiBase: publicApiBase,
			apiFetchTimeoutMs: resolveRequestTimeoutMs(process.env.NUXT_PUBLIC_API_FETCH_TIMEOUT_MS),
			buildId,
			governingLaw: process.env.NUXT_PUBLIC_GOVERNING_LAW || "State of Georgia",
			operatorLegalName: process.env.NUXT_PUBLIC_OPERATOR_LEGAL_NAME || "Jacob Anderson",
			operatorNoticeAddress: process.env.NUXT_PUBLIC_OPERATOR_NOTICE_ADDRESS || "",
			siteUrl: process.env.NUXT_PUBLIC_SITE_URL || "https://ballotclarity.org",
			venue: process.env.NUXT_PUBLIC_VENUE || "state or federal courts located in Georgia"
		}
	},

	future: {
		compatibilityVersion: 4
	},

	experimental: {
		payloadExtraction: false,
		renderJsonPayloads: true,
		typedPages: true
	},

	compatibilityDate: "2024-08-14",

	nitro: {
		esbuild: {
			options: {
				target: "esnext"
			}
		},
		routeRules: {
			"/**": {
				headers: securityHeaders
			},
			"/_nuxt/**": {
				headers: {
					...securityHeaders,
					"cache-control": "public, max-age=31536000, immutable"
				}
			},
			"/admin": {
				headers: noIndexHeaders
			},
			"/admin/**": {
				headers: noIndexHeaders
			},
			"/api/**": {
				headers: noIndexHeaders
			},
			"/ballot": {
				headers: noIndexFollowHeaders
			},
			"/ballot/**": {
				headers: noIndexFollowHeaders
			},
			"/compare": {
				headers: noIndexHeaders
			},
			"/compare/**": {
				headers: noIndexHeaders
			},
			"/plan": {
				headers: noIndexHeaders
			},
			"/plan/**": {
				headers: noIndexHeaders
			},
			"/results": {
				headers: noIndexHeaders
			},
			"/results/**": {
				headers: noIndexHeaders
			},
			"/search": {
				headers: noIndexHeaders
			},
			"/search/**": {
				headers: noIndexHeaders
			}
		},
		prerender: {
			crawlLinks: false,
			routes: []
		}
	},

	vite: {
		build: {
			modulePreload: {
				polyfill: false
			}
		}
	},

	eslint: {
		config: {
			standalone: false,
			nuxt: {
				sortConfigKeys: true
			}
		}
	}
});
