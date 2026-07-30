<script setup lang="ts">
import { analyticsTrackers, appName } from "~/constants";

const effectiveAt = "2026-07-29T00:00:00-04:00";
const runtimeConfig = useRuntimeConfig();
const siteUrl = useSiteUrl();
const currentOperatorName = String(runtimeConfig.public.operatorLegalName || "Jacob Anderson").trim();
const analyticsHostList = analyticsTrackers.map(tracker => tracker.domain);
const analyticsHosts = analyticsHostList.join(" and ");
const analyticsScriptDisclosure = analyticsHostList.length === 1
	? `the first-party analytics script loaded from ${analyticsHosts}`
	: `first-party analytics scripts loaded from ${analyticsHosts}`;
const analyticsServiceDisclosure = analyticsHostList.length === 1
	? `the analytics service hosted at ${analyticsHosts}`
	: `the analytics services hosted at ${analyticsHosts}`;

const collectionSections = [
	{
		body: [
			"When you use the ballot lookup, the address or ZIP code is sent with a POST request so the service can determine a location and ballot guide.",
			"That lookup may also trigger district matching, representative attachment, and official election verification using the civic data providers needed for the requested result.",
			"If ZIP-only operational logging is enabled, Ballot Clarity may record only an exact 5-digit ZIP entered by itself as the lookup input. Full street addresses, ZIP+4 entries, city names, mixed address strings, provider-normalized ZIPs, raw lookup text, IP address, and user agent are not added to that ZIP-only log.",
			"The site may also use coarse geolocation derived from request metadata to make an approximate default location guess before you enter anything manually.",
			"The application is designed not to publish the raw lookup text in public content records. Exact street addresses and address-specific ballot previews or polling logistics are removed from durable browser storage; an exact 5-digit ZIP may be retained for ZIP-based navigation."
		],
		title: "Address or ZIP lookup input"
	},
	{
		body: [
			"The app stores public area labels and results, compare selections, saved ballot-plan choices, issue filters, and reading mode in local browser storage so the guide remains usable across refreshes. It strips exact street-address input, address-specific ballot previews, and address-specific polling logistics before writing that state.",
			"The site also sets first-party cookies for saved area results, display timezone, and private editorial access sessions. The saved-area result cookie is authenticated ciphertext, is unavailable to browser scripts, and omits exact street-address input.",
			"This browser-side state is tied to the browser on your device. Ballot Clarity does not maintain a public server-side user account for that state."
		],
		title: "Browser storage and cookies"
	},
	{
		body: [
			"Hosting and runtime infrastructure may process technical data such as IP address, user agent, endpoint path, timestamp, and basic error or request metadata needed for security, integrity, and reliability.",
			`On deployed versions of the site, ${analyticsScriptDisclosure} may receive page usage and technical request metadata needed to understand adoption, performance, and reliability.`,
			"That operational metadata is different from the election-guide content itself and is handled as infrastructure telemetry rather than published civic data.",
			"Private editorial authentication also creates limited operational records such as last-login timestamps and failed-login throttling signals."
		],
		title: "Operational metadata"
	},
	{
		body: [
			"The public site now offers a hosted contact and correction form in addition to protected email links.",
			"If you submit the form, the project receives your name, email address, subject, page URL, message, and any supporting links you provide so the issue can be reviewed and answered.",
			"If you email the project directly, the message, attachments, and any source links you send may be handled in the project inbox so the team can review, verify, and respond."
		],
		title: "Messages you send us"
	},
	{
		body: [
			"The site includes private editorial and operations accounts used to review corrections, source health, and local-guide publication status.",
			"Those access accounts are not public user accounts, but they do use authentication cookies and server-side account records for access control and auditability."
		],
		title: "Editorial access accounts"
	}
];

const providerDisclosureSections = [
	{
		body: [
			"Full-address lookups may be sent to the U.S. Census Geocoder and Google Civic Information API to normalize geography, verify address handling, and return official election logistics where available.",
			"ZIP-only lookups may be resolved through the current ZIP-location service and then enriched with district and official-tool context.",
			"If optional ballot-content providers such as CTCL BIP, Ballotpedia, BallotReady CivicEngine, or Democracy Works are configured later, full-address or location-derived area details may be sent to the configured provider only to return ballot, contest, candidate, measure, or election-logistics data for the requested lookup.",
			"Provider-returned ballot previews are shown as informational previews until Ballot Clarity completes local review. Users should verify the exact ballot with the linked official state or local voter/ballot tool before relying on provider ballot content."
		],
		title: "Lookup and official verification providers"
	},
	{
		body: [
			"District and representative attachment may use Open States together with Ballot Clarity's reviewed local-officeholder records.",
			"These requests support district matching, officeholder identity, chamber or jurisdiction context, and representative pages."
		],
		title: "Representative and district matching providers"
	},
	{
		body: [
			"Representative profile enrichment may query Congress.gov, OpenFEC, and LDA.gov once a page or lookup has already resolved a person or officeholder record.",
			"Those requests are used for federal office context, campaign-finance detail, and lobbying or disclosure context. They are not used for advertising or profiling."
		],
		title: "Federal office, finance, and disclosure providers"
	},
	{
		body: [
			`Ballot Clarity also relies on hosting, delivery, logging, database providers, and ${analyticsServiceDisclosure} to serve the site, understand usage, process correction submissions, and operate the private editorial workspace.`,
			"When you follow external links, the destination site operates under its own privacy practices."
		],
		title: "Infrastructure and external destinations"
	}
];

const useSections = [
	"Provide location-based ballot guides and related civic-information pages.",
	"Preserve local usability features such as saved ballot-plan choices, compare state, and reading preferences.",
	"Operate, secure, debug, and improve the website and its reliability.",
	"Review and respond to correction requests, privacy questions, public-interest inquiries, and publication workflow."
];

const sharingSections = [
	"Ballot Clarity discloses lookup or page-derived data only to the service providers and public-interest civic-data systems needed to produce the requested page or official verification result.",
	`Third-party recipients in active flows include the U.S. Census Geocoder, Google Civic Information API, Open States, Congress.gov, OpenFEC, LDA.gov, and ${analyticsServiceDisclosure}, plus hosting, logging, and delivery providers needed to run the service. Optional ballot-content providers are disclosed on the data-sources page and are active recipients only when configured.`,
	"Ballot Clarity does not disclose address lookup input to advertising networks and is not designed to sell or share personal data for cross-context behavioral advertising.",
	"When you follow external source links, official agencies, filing systems, campaigns, or other third-party sites operate under their own privacy practices.",
	"If Ballot Clarity materially changes the current provider stack or starts sharing data for a new purpose, this policy will be updated before that change goes live."
];

const retentionRows = [
	{
		access: "Request-time handling, provider processing, and—when the encrypted cache is enabled—restricted backend access to authenticated ciphertext.",
		category: "Raw ballot lookup input",
		deletion: "The current app flow avoids adding an exact street address to published source records, URLs, the saved-area cookie payload, or durable browser preference state. Encrypted backend cache records expire automatically; provider-side retention depends on the recipient's system and policy.",
		retention: "Request-time processing, plus up to 7 days for encrypted normalized-address cache data when that optional backend cache is enabled.",
		scope: "Street address or ZIP entered into the lookup."
	},
	{
		access: "Sent automatically to the backend as a first-party HttpOnly cookie; browser scripts cannot read it.",
		category: "Saved lookup cookie",
		deletion: "Clear browser cookies or submit a new lookup that replaces or clears the stored context.",
		retention: "Up to 7 days.",
		scope: "Authenticated encrypted first-party cookie containing public area-result continuity details such as an exact 5-digit ZIP when applicable, matched districts, representative matches, official actions, and lookup timing. Exact street-address input is omitted."
	},
	{
		access: "Restricted backend database access; the payload is stored as authenticated ciphertext and the lookup identifier is keyed.",
		category: "Encrypted address lookup cache",
		deletion: "Records expire automatically after 7 days and are deleted on later cache access or replacement. Legacy plaintext rows are removed during schema migration.",
		retention: "Up to 7 days when the optional Postgres cache and its dedicated encryption key are configured.",
		scope: "Provider-normalized address geography, district matches, representative matches, and lookup metadata needed to avoid repeating the same provider calls."
	},
	{
		access: "Operational access only for reliability, coverage planning, and abuse monitoring.",
		category: "ZIP-only lookup operations log",
		deletion: "Removed through operational log rotation or retention cleanup; not published as civic content.",
		retention: "Short-term operational retention, generally days to weeks rather than permanent publication.",
		scope: "Timestamp, exact normalized 5-digit ZIP input, lookup result, guide-availability status, and whether a ZIP area selection was required. The log does not include raw lookup text, full street addresses, ZIP+4 entries, city names, mixed address strings, provider-normalized ZIPs, IP address, or user agent."
	},
	{
		access: "Stored in your browser on the current device.",
		category: "Display timezone cookie",
		deletion: "Clear browser cookies or override the stored timezone with a later visit.",
		retention: "Up to 1 year.",
		scope: "First-party cookie containing the browser-reported timezone used for SSR-safe date display."
	},
	{
		access: "Stored in your browser on the current device.",
		category: "Saved guide preferences",
		deletion: "Clear browser storage, use a private session, or overwrite the saved state.",
		retention: "Until you clear it or replace it on your device.",
		scope: "Selected public location label, compare list, ballot plan, issue filters, reading mode, and sanitized area-result details. Exact street addresses, address-specific ballot previews, and address-specific polling logistics are excluded."
	},
	{
		access: "Stored in the editor's browser and private access-control layer.",
		category: "Editorial access session cookie",
		deletion: "Sign out, clear browser cookies, or allow the session to expire.",
		retention: "Up to 12 hours per session.",
		scope: "Private editorial authentication cookie for editorial and operations access."
	},
	{
		access: `Hosting, operations, security tooling, and ${analyticsServiceDisclosure}.`,
		category: "Operational request metadata",
		deletion: "Managed through service settings, with longer retention permitted for active abuse handling, incident response, or legal obligations.",
		retention: "Short-term operational retention, generally days to weeks rather than permanent publication.",
		scope: "IP address, user agent, endpoint path, referrer, timestamps, pageview metadata, and similar request metadata."
	},
	{
		access: "Backend memory only, for public form abuse prevention.",
		category: "Contact form rate-limit metadata",
		deletion: "Cleared automatically when the short rate-limit window expires or the server process restarts.",
		retention: "Short-lived in-memory retention, defaulting to about 10 minutes unless the operator changes the rate-limit window.",
		scope: "Connection-derived rate-limit key, request count, and reset time for repeated contact or correction form submissions."
	},
	{
		access: "Backend memory only, for lookup abuse prevention.",
		category: "Civic lookup rate-limit metadata",
		deletion: "Cleared automatically when the short rate-limit window expires or the server process restarts.",
		retention: "Short-lived in-memory retention, defaulting to about 10 minutes unless the operator changes the rate-limit window.",
		scope: "Connection-derived rate-limit key, request count, and reset time for repeated civic lookup requests. This does not add raw addresses to the ZIP-only operational lookup log."
	},
	{
		access: "Project inbox, review store, and editorial reviewers handling the issue.",
		category: "Contact and correction submissions",
		deletion: "Archived or deleted when no longer needed for support, verification, auditability, or the public corrections process.",
		retention: "Until the issue is resolved and the supporting review record is no longer operationally needed.",
		scope: "Name, email address, subject, page URL, message, attachments, and source links you provide through email or the contact form."
	}
];

const rightsNotes = [
	"You can browse much of the site without using the ballot lookup.",
	"You can clear browser storage and cookies on your device to remove saved ballot-plan state, selected location labels, timezone state, and area-result cookies kept locally by the app.",
	"Because Ballot Clarity does not create public self-service accounts and is designed to keep some data ephemeral, the project may have limited ability to associate a privacy request with operational logs or transient lookup activity.",
	"If applicable law gives you rights to request access, deletion, correction, or appeal, contact the project and describe the data or interaction as specifically as possible."
];

const cookieNotes = [
	"Ballot Clarity does not use an advertising-cookie stack and is not designed for targeted advertising or sale or sharing of personal data.",
	"The site currently uses first-party cookies for saved area-result continuity, display timezone, and private editorial access sessions, and it uses local browser storage for public-facing preference state.",
	"Infrastructure providers may also use technical cookies or similar mechanisms needed for delivery, security, and basic functionality.",
	`Deployed versions of the site load ${analyticsScriptDisclosure} to understand usage and performance. This service may receive technical request data and pageview metadata, but it is not used for targeted advertising.`
];

const childrenNotes = [
	"Ballot Clarity is a general-audience civic-information site and is not designed for children under 13.",
	"The site does not offer child-directed accounts, community posting, or other features intended to collect personal information from children.",
	"If you believe a child has sent personal information to the project through email or another channel, contact the project so the issue can be reviewed."
];

const securityNotes = [
	"Ballot Clarity aims to use reasonable administrative, technical, and organizational safeguards appropriate to the service.",
	"Those safeguards are intended to reduce unnecessary data collection, limit retention, and protect the integrity of the service and its operational systems.",
	"The service also uses staff login throttling, signed editorial-access session cookies, authenticated encryption for saved lookup continuity and optional address caching, and structured request logging that excludes URL query strings.",
	"No internet service can guarantee absolute security. If the project's data practices or incident posture changes materially, this policy will be updated as well."
];

usePageSeo({
	description: "Privacy Policy for Ballot Clarity, covering address lookup handling, browser storage, operational metadata, third-party disclosures, retention, user choices, and service limits.",
	path: "/privacy",
	title: "Privacy Policy"
});
</script>

<template>
	<section class="legal-page app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<div class="flex flex-wrap gap-2">
				<TrustBadge label="Current policy" tone="accent" />
				<TrustBadge label="Lookup handling disclosed" />
				<TrustBadge label="No targeted advertising" tone="warning" />
			</div>
			<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
				Privacy Policy
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 max-w-3xl dark:text-app-muted-dark">
				This policy describes how {{ appName }}, currently operated by {{ currentOperatorName }}, handles address lookup input, any optional approximate location-guessing configured for the site, browser-stored guide preferences, hosted contact or correction submissions, operational metadata, and direct contact messages. It applies to the public site at {{ siteUrl }}, not to any future product that collects more data than the current public site collects.
			</p>
			<div class="mt-5">
				<UpdatedAt label="Effective" :value="effectiveAt" />
			</div>
		</header>

		<InfoCallout title="Plain-language summary">
			Ballot Clarity uses address or ZIP input, plus any optional approximate location guess configured for the site, only to match ballot coverage and official verification context. It does not create public user accounts, does not run targeted advertising, and is not designed to sell or share personal data. The app does save selected location labels and ballot-plan preferences locally in your browser so the guide remains usable across refreshes.
		</InfoCallout>

		<section class="surface-panel">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				What data we handle
			</p>
			<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
				What data Ballot Clarity currently handles
			</h2>
			<div class="mt-6 gap-4 grid lg:grid-cols-2">
				<article v-for="item in collectionSections" :key="item.title" class="px-5 py-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
					<h3 class="text-xl text-app-ink font-serif dark:text-app-text-dark">
						{{ item.title }}
					</h3>
					<div class="text-sm text-app-muted leading-7 mt-4 space-y-3 dark:text-app-muted-dark">
						<p v-for="paragraph in item.body" :key="paragraph">
							{{ paragraph }}
						</p>
					</div>
				</article>
			</div>
		</section>

		<section class="surface-panel">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				Current third-party recipients
			</p>
			<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
				Current third-party processors and civic-data recipients
			</h2>
			<div class="mt-6 gap-4 grid lg:grid-cols-2">
				<article v-for="item in providerDisclosureSections" :key="item.title" class="px-5 py-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
					<h3 class="text-xl text-app-ink font-serif dark:text-app-text-dark">
						{{ item.title }}
					</h3>
					<div class="text-sm text-app-muted leading-7 mt-4 space-y-3 dark:text-app-muted-dark">
						<p v-for="paragraph in item.body" :key="paragraph">
							{{ paragraph }}
						</p>
					</div>
				</article>
			</div>
		</section>

		<section class="gap-6 grid lg:grid-cols-2">
			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					How we use data
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Why the site uses data
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in useSections" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>

			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					How we share or disclose data
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Service providers, external links, and current limits
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in sharingSections" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>
		</section>

		<section class="gap-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Cookies and tracking
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					No sale, sharing, or targeted advertising
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in cookieNotes" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>

			<InfoCallout title="Address lookup sensitivity" tone="warning">
				An address lookup can reveal precise household or location context. Ballot Clarity therefore treats the lookup flow as a narrow, high-sensitivity feature and keeps the explanation near the lookup form instead of burying it only in legal copy.
			</InfoCallout>
		</section>

		<section class="surface-panel">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				Retention and deletion
			</p>
			<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
				How long information lasts and who can access it
			</h2>
			<div class="mt-6 overflow-x-auto">
				<table class="text-left min-w-full">
					<thead>
						<tr class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
							<th class="px-4 py-3 border-b border-app-line dark:border-app-line-dark">
								Category
							</th>
							<th class="px-4 py-3 border-b border-app-line dark:border-app-line-dark">
								Scope
							</th>
							<th class="px-4 py-3 border-b border-app-line dark:border-app-line-dark">
								Retention
							</th>
							<th class="px-4 py-3 border-b border-app-line dark:border-app-line-dark">
								Access
							</th>
							<th class="px-4 py-3 border-b border-app-line dark:border-app-line-dark">
								Removal path
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="row in retentionRows" :key="row.category" class="align-top">
							<td class="text-sm text-app-ink font-semibold px-4 py-4 border-b border-app-line/70 dark:text-app-text-dark dark:border-app-line-dark">
								{{ row.category }}
							</td>
							<td class="text-sm text-app-muted leading-7 px-4 py-4 border-b border-app-line/70 dark:text-app-muted-dark dark:border-app-line-dark">
								{{ row.scope }}
							</td>
							<td class="text-sm text-app-muted leading-7 px-4 py-4 border-b border-app-line/70 dark:text-app-muted-dark dark:border-app-line-dark">
								{{ row.retention }}
							</td>
							<td class="text-sm text-app-muted leading-7 px-4 py-4 border-b border-app-line/70 dark:text-app-muted-dark dark:border-app-line-dark">
								{{ row.access }}
							</td>
							<td class="text-sm text-app-muted leading-7 px-4 py-4 border-b border-app-line/70 dark:text-app-muted-dark dark:border-app-line-dark">
								{{ row.deletion }}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>

		<section class="gap-6 grid lg:grid-cols-2">
			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Your choices and requests
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Rights requests and no-account limits
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in rightsNotes" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>

			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Children and families
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Children's privacy
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in childrenNotes" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>
		</section>

		<section class="gap-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Security
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					How Ballot Clarity approaches privacy and security controls
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in securityNotes" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>

			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Changes and contact
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					How to reach the project and when this policy changes
				</h2>
				<div class="text-sm text-app-muted leading-7 mt-5 space-y-4 dark:text-app-muted-dark">
					<p>
						Questions, privacy concerns, and correction requests can be sent through the contact page or the protected email link below.
					</p>
					<p>
						<ProtectedEmailLink
							loading-label="Email link loads in your browser."
							loading-class="text-app-muted dark:text-app-muted-dark"
							link-class="underline underline-offset-3 rounded-md focus-ring"
							subject="Ballot Clarity privacy question"
						/>
					</p>
					<p>
						If Ballot Clarity materially changes how lookup input, browser storage, analytics, vendors, or future account-based features work, this Privacy Policy will be updated before those changes go live.
					</p>
					<p>
						Read this page together with the on-page explanation near the ballot lookup form, the contact and corrections workflow, and the public methodology notes.
					</p>
				</div>
				<div class="mt-6 flex flex-wrap gap-3">
					<NuxtLink to="/contact" class="btn-primary">
						Open contact page
					</NuxtLink>
					<NuxtLink to="/methodology" class="btn-secondary">
						Review methodology
					</NuxtLink>
				</div>
			</div>
		</section>
	</section>
</template>
