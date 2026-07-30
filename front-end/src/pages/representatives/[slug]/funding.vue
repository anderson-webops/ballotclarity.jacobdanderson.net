<script setup lang="ts">
import { storeToRefs } from "pinia";

import { buildNationwidePersonProfileResponse } from "~/utils/nationwide-person-profile";
import { buildLookupContextFromNationwideResult, buildNationwideLookupRouteQuery, buildNationwideRouteTarget } from "~/utils/nationwide-route-context";
import { hasPersonFunding } from "~/utils/person-profile";

const route = useRoute();
const civicStore = useCivicStore();
const { isHydrated, nationwideLookupResult } = storeToRefs(civicStore);
const { layerBreadcrumbLink } = useRouteLayerNavigation();
const representativeSlug = useRouteStringParam("slug");
const { formatCompactNumber, formatCurrency, formatDate, formatPercent } = useFormatters();
const activeNationwideLookupResult = computed(() => isHydrated.value ? nationwideLookupResult.value : null);
const activeLookupQuery = computed(() => buildNationwideLookupRouteQuery(
	buildLookupContextFromNationwideResult(activeNationwideLookupResult.value),
	route.query
));
const { data, error, pending } = await useRepresentative(representativeSlug, activeLookupQuery);

const fallbackData = computed(() => buildNationwidePersonProfileResponse(activeNationwideLookupResult.value, representativeSlug.value));
const profileData = computed(() => {
	if (!data.value)
		return fallbackData.value;

	if (
		data.value.person.provenance.source === "nationwide"
		&& data.value.person.provenance.status === "inferred"
		&& fallbackData.value
	) {
		return fallbackData.value;
	}

	return data.value;
});
const person = computed(() => profileData.value?.person ?? null);
const pagePending = computed(() => pending.value || (!data.value && !fallbackData.value));
const funding = computed(() => person.value?.funding ?? null);
const fundingAvailable = computed(() => person.value ? hasPersonFunding(person.value) : false);
const fundingUnavailableSummary = computed(() => person.value
	? person.value.enrichmentStatus?.funding.summary || "No campaign-finance summary is attached to this officeholder yet."
	: "");
const fundingHighlights = computed(() => {
	if (!funding.value)
		return [];

	return [
		funding.value.committeeName ? { label: "Committee", value: funding.value.committeeName } : null,
		funding.value.coverageLabel ? { label: "Coverage", value: funding.value.coverageLabel } : null,
		typeof funding.value.totalSpent === "number" ? { label: "Disbursements", value: formatCurrency(funding.value.totalSpent) } : null,
		typeof funding.value.smallDonorShare === "number" && Number.isFinite(funding.value.smallDonorShare) && funding.value.smallDonorShare > 0
			? { label: "Small-donor share", value: formatPercent(funding.value.smallDonorShare) }
			: null,
	].filter((item): item is { label: string; value: string } => Boolean(item));
});
const fundingLineItems = computed(() => {
	if (!funding.value)
		return [];

	if (funding.value.receiptBreakdown?.length)
		return funding.value.receiptBreakdown;

	return funding.value.topFunders;
});
const fundingLineItemsTitle = computed(() => funding.value?.receiptBreakdown?.length ? "Receipt breakdown" : "Top funders");
function buildLookupAwareTarget(path: string) {
	return buildNationwideRouteTarget(path, buildLookupContextFromNationwideResult(activeNationwideLookupResult.value), route.query);
}
const breadcrumbs = computed(() => [
	{ label: "Home", to: "/" },
	{ label: layerBreadcrumbLink.value.label, to: buildLookupAwareTarget(layerBreadcrumbLink.value.to) },
	{ label: person.value?.name ?? "Representative profile", to: person.value ? buildLookupAwareTarget(`/representatives/${person.value.slug}`) : undefined },
	{ label: "Funding" }
]);

const summaryItems = computed(() => {
	if (!person.value)
		return [];

	if (!fundingAvailable.value || !funding.value) {
		return [
			{ label: "Current office", note: "Current office.", value: person.value.officeDisplayLabel || person.value.officeSought },
			{ label: "Updated", note: "Profile freshness.", value: formatDate(person.value.freshness.dataLastUpdatedAt ?? person.value.updatedAt) }
		];
	}

	return [
		{ label: "Current office", note: "Current office.", value: person.value.officeDisplayLabel || person.value.officeSought },
		{ label: "Total raised", note: "Current filing-window total.", value: formatCurrency(funding.value.totalRaised) },
		{ label: "Disbursements", note: "Reported spending in the same filing window.", value: typeof funding.value.totalSpent === "number" ? formatCurrency(funding.value.totalSpent) : "Not published" },
		{ label: "Cash on hand", note: "Reported funds still available.", value: formatCurrency(funding.value.cashOnHand) }
	];
});

usePageSeo({
	description: funding.value?.summary ?? "Representative funding page with campaign-finance summary, top funders, and source links.",
	path: `/representatives/${representativeSlug.value}/funding`,
	title: person.value ? `${person.value.name} Funding` : "Representative funding"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<div v-if="pagePending" class="space-y-6">
			<div class="surface-panel bg-white/70 h-80 animate-pulse dark:bg-app-panel-dark/70" />
			<div class="surface-panel bg-white/70 h-64 animate-pulse dark:bg-app-panel-dark/70" />
		</div>

		<div v-else-if="(error && !fallbackData) || !person" class="max-w-3xl">
			<InfoCallout title="Funding page unavailable" tone="warning">
				This representative funding page could not be loaded. Return to the representative profile and try again.
			</InfoCallout>
		</div>

		<div v-else class="space-y-8">
			<header class="surface-panel">
				<AppBreadcrumbs :items="breadcrumbs" />
				<div class="flex flex-wrap gap-2">
					<VerificationBadge label="Funding page" tone="accent" />
					<VerificationBadge :label="person.officeholderLabel" />
				</div>
				<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
					{{ person.name }} funding
				</h1>
				<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
					{{ funding?.summary || fundingUnavailableSummary }}
				</p>
				<div class="mt-6 flex flex-wrap gap-3">
					<NuxtLink :to="buildLookupAwareTarget(`/representatives/${person.slug}`)" class="btn-secondary">
						Back to profile
					</NuxtLink>
					<NuxtLink :to="buildLookupAwareTarget(`/representatives/${person.slug}/influence`)" class="btn-secondary">
						Open influence page
					</NuxtLink>
					<SourceDrawer :sources="funding?.sources ?? person.sources" :title="`${person.name} funding sources`" button-label="Funding sources" />
				</div>
				<div class="mt-6">
					<PageSummaryStrip :items="summaryItems" />
				</div>
			</header>

			<section v-if="fundingAvailable && funding" class="gap-6 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
				<div class="surface-panel">
					<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
						{{ fundingLineItemsTitle }}
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						{{
							funding.receiptBreakdown?.length
								? "Largest receipt categories in the attached finance summary."
								: "Largest named or categorized funders in the attached finance summary."
						}}
					</p>
					<div v-if="fundingHighlights.length" class="mt-6 gap-3 grid sm:grid-cols-2">
						<div v-for="item in fundingHighlights" :key="item.label" class="p-4 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
							<p class="text-xs text-app-muted tracking-[0.14em] font-semibold uppercase dark:text-app-muted-dark">
								{{ item.label }}
							</p>
							<p class="text-base text-app-ink mt-2 dark:text-app-text-dark">
								{{ item.value }}
							</p>
						</div>
					</div>
					<ul class="mt-6 space-y-3">
						<li v-for="funder in fundingLineItems" :key="`${funder.name}-${funder.category}`" class="p-4 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
							<div class="flex flex-wrap gap-4 items-center justify-between">
								<div>
									<p class="text-lg text-app-ink font-semibold dark:text-app-text-dark">
										{{ funder.name }}
									</p>
									<p class="text-sm text-app-muted mt-2 dark:text-app-muted-dark">
										{{ funder.category }}
									</p>
								</div>
								<p class="text-lg text-app-ink font-semibold dark:text-app-text-dark">
									{{ formatCurrency(funder.amount) }}
								</p>
							</div>
						</li>
					</ul>
				</div>

				<div class="space-y-6">
					<div class="surface-panel">
						<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
							Committee summary
						</h2>
						<ul class="readable-list text-sm text-app-muted mt-5 pl-5 dark:text-app-muted-dark">
							<li><strong class="text-app-ink dark:text-app-text-dark">Committee:</strong> {{ funding.committeeName || "Current matched committee not published in this summary." }}</li>
							<li><strong class="text-app-ink dark:text-app-text-dark">Coverage:</strong> {{ funding.coverageLabel || funding.provenanceLabel || "Source-backed finance summary" }}</li>
							<li><strong class="text-app-ink dark:text-app-text-dark">Data through:</strong> {{ formatDate(person.freshness.dataLastUpdatedAt ?? person.updatedAt) }}</li>
						</ul>
						<p class="text-sm text-app-muted leading-7 mt-5 dark:text-app-muted-dark">
							Compare the reporting window before comparing totals across records.
						</p>
						<div class="mt-6 pt-6 border-t border-app-line/80 dark:border-app-line-dark">
							<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
								<strong class="text-app-ink dark:text-app-text-dark">Reference count:</strong> {{ formatCompactNumber(funding.sources.length) }} filing and methodology source{{ funding.sources.length === 1 ? "" : "s" }} are attached to this funding page.
							</p>
						</div>
					</div>
				</div>
			</section>

			<section v-else class="max-w-4xl">
				<InfoCallout title="Funding unavailable" tone="warning">
					{{ person.enrichmentStatus?.funding.summary || fundingUnavailableSummary }}
					<span class="mt-2 block">Last reviewed {{ formatDate(person.freshness.dataLastUpdatedAt ?? person.updatedAt) }}.</span>
				</InfoCallout>
			</section>
		</div>
	</section>
</template>
