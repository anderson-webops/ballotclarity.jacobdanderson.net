<script setup lang="ts">
import type { Source } from "~/types/civic";
import { storeToRefs } from "pinia";

import { buildNationwidePersonProfileResponse } from "~/utils/nationwide-person-profile";
import { buildLookupContextFromNationwideResult, buildNationwideLookupRouteQuery, buildNationwideRouteTarget } from "~/utils/nationwide-route-context";
import { hasPersonInfluence } from "~/utils/person-profile";

const route = useRoute();
const civicStore = useCivicStore();
const { isHydrated, nationwideLookupResult } = storeToRefs(civicStore);
const { layerBreadcrumbLink } = useRouteLayerNavigation();
const representativeSlug = useRouteStringParam("slug");
const { formatCurrency, formatDate, formatDateTime } = useFormatters();
const activeNationwideLookupResult = computed(() => isHydrated.value ? nationwideLookupResult.value : null);
const activeLookupQuery = computed(() => buildNationwideLookupRouteQuery(
	buildLookupContextFromNationwideResult(activeNationwideLookupResult.value),
	route.query
));
const { data, error, pending } = await useRepresentative(representativeSlug, activeLookupQuery);

function uniqueSources(sources: Source[]) {
	return Array.from(new Map(sources.map(source => [source.id, source])).values());
}

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
const influence = computed(() => person.value?.influence ?? null);
const influenceAvailable = computed(() => person.value ? hasPersonInfluence(person.value) : false);
const influenceUnavailableSummary = computed(() => person.value
	? person.value.enrichmentStatus?.influence.summary || "No lobbying or disclosure summary is attached to this officeholder yet."
	: "");
const influenceSources = computed(() => person.value
	? uniqueSources([
			...person.value.lobbyingContext.flatMap(item => item.sources),
			...person.value.publicStatements.flatMap(item => item.sources)
		])
	: []);
function buildLookupAwareTarget(path: string) {
	return buildNationwideRouteTarget(path, buildLookupContextFromNationwideResult(activeNationwideLookupResult.value), route.query);
}
const breadcrumbs = computed(() => [
	{ label: "Home", to: "/" },
	{ label: layerBreadcrumbLink.value.label, to: buildLookupAwareTarget(layerBreadcrumbLink.value.to) },
	{ label: person.value?.name ?? "Representative profile", to: person.value ? buildLookupAwareTarget(`/representatives/${person.value.slug}`) : undefined },
	{ label: "Influence" }
]);

const summaryItems = computed(() => {
	if (!person.value)
		return [];

	if (!influenceAvailable.value) {
		return [
			{ label: "Current office", note: "Current office.", value: person.value.officeDisplayLabel || person.value.officeSought },
			{ label: "Updated", note: "Profile freshness.", value: formatDateTime(person.value.updatedAt) }
		];
	}

	return [
		{ label: "Current office", note: "Current office.", value: person.value.officeDisplayLabel || person.value.officeSought },
		{ label: "Reports", note: "Disclosure reports matched to this officeholder.", value: influence.value?.reportCount ?? person.value.lobbyingContext.length },
		{ label: "Contribution items", note: "Contribution items kept after officeholder matching.", value: influence.value?.contributionCount ?? person.value.publicStatements.length },
		{ label: "Matched total", note: "Total dollar amount across the attached disclosure context.", value: typeof influence.value?.totalMatched === "number" ? formatCurrency(influence.value.totalMatched) : "Not published" },
		{ label: "Updated", note: "Profile freshness.", value: formatDateTime(person.value.updatedAt) }
	];
});

usePageSeo({
	description: person.value?.lobbyingContext[0]?.summary ?? "Representative influence page with lobbying context, public statements, and source links.",
	path: `/representatives/${representativeSlug.value}/influence`,
	title: person.value ? `${person.value.name} Influence` : "Representative influence"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<div v-if="pagePending" class="space-y-6">
			<div class="surface-panel bg-white/70 h-80 animate-pulse dark:bg-app-panel-dark/70" />
			<div class="surface-panel bg-white/70 h-64 animate-pulse dark:bg-app-panel-dark/70" />
		</div>

		<div v-else-if="(error && !fallbackData) || !person" class="max-w-3xl">
			<InfoCallout title="Influence page unavailable" tone="warning">
				This representative influence page could not be loaded. Return to the representative profile and try again.
			</InfoCallout>
		</div>

		<div v-else class="space-y-8">
			<header class="surface-panel">
				<AppBreadcrumbs :items="breadcrumbs" />
				<div class="flex flex-wrap gap-2">
					<VerificationBadge label="Influence page" tone="accent" />
					<VerificationBadge label="Context, not causation" />
				</div>
				<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
					{{ person.name }} influence
				</h1>
				<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
					{{
						influenceAvailable
							? "This page collects the lobbying, disclosure, and public-statement context attached to this officeholder. Treat it as context, not proof."
							: influenceUnavailableSummary
					}}
				</p>
				<div class="mt-6 flex flex-wrap gap-3">
					<NuxtLink :to="buildLookupAwareTarget(`/representatives/${person.slug}`)" class="btn-secondary">
						Back to profile
					</NuxtLink>
					<NuxtLink :to="buildLookupAwareTarget(`/representatives/${person.slug}/funding`)" class="btn-secondary">
						Open funding page
					</NuxtLink>
					<SourceDrawer :sources="influenceSources.length ? influenceSources : person.sources" :title="`${person.name} influence sources`" button-label="Influence sources" />
				</div>
				<div class="mt-6">
					<PageSummaryStrip :items="summaryItems" />
				</div>
			</header>

			<section v-if="influenceAvailable" class="gap-6 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
				<div class="surface-panel">
					<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
						Influence notes
					</h2>
					<div v-if="influence" class="mt-6 gap-3 grid sm:grid-cols-2">
						<div class="p-4 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
							<p class="text-xs text-app-muted tracking-[0.14em] font-semibold uppercase dark:text-app-muted-dark">
								Coverage
							</p>
							<p class="text-base text-app-ink mt-2 dark:text-app-text-dark">
								{{ influence.coverageLabel }}
							</p>
						</div>
						<div class="p-4 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
							<p class="text-xs text-app-muted tracking-[0.14em] font-semibold uppercase dark:text-app-muted-dark">
								Match mode
							</p>
							<p class="text-base text-app-ink mt-2 dark:text-app-text-dark">
								{{ influence.matchMode === "committee" ? "Committee crosswalk" : influence.matchMode === "honoree" ? "Direct officeholder-name match" : "Not published" }}
							</p>
						</div>
					</div>
					<div class="mt-6 space-y-4">
						<article
							v-for="item in person.lobbyingContext"
							:key="item.id"
							class="p-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70"
						>
							<div class="flex flex-wrap gap-3 items-start justify-between">
								<div>
									<h3 class="text-xl text-app-ink font-semibold dark:text-app-text-dark">
										{{ item.title }}
									</h3>
									<p class="text-sm text-app-muted mt-2 dark:text-app-muted-dark">
										{{ formatDate(person.freshness.dataLastUpdatedAt ?? person.updatedAt) }}
									</p>
								</div>
								<SourceDrawer :sources="item.sources" :title="item.title" button-label="Sources" />
							</div>
							<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
								{{ item.summary }}
							</p>
						</article>
						<article v-if="influence?.topRegistrants?.length" class="p-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
							<h3 class="text-xl text-app-ink font-semibold dark:text-app-text-dark">
								Top reporting registrants
							</h3>
							<ul class="mt-4 space-y-3">
								<li
									v-for="registrant in influence.topRegistrants"
									:key="registrant.name"
									class="text-sm text-app-muted flex flex-wrap gap-3 items-center justify-between dark:text-app-muted-dark"
								>
									<span class="text-app-ink font-semibold dark:text-app-text-dark">{{ registrant.name }}</span>
									<span>{{ formatCurrency(registrant.amount) }}</span>
								</li>
							</ul>
						</article>
					</div>
				</div>

				<div class="space-y-6">
					<div class="surface-panel">
						<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
							Related public statements
						</h2>
						<div class="mt-6 space-y-4">
							<article
								v-for="statement in person.publicStatements"
								:key="statement.id"
								class="p-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70"
							>
								<h3 class="text-xl text-app-ink font-semibold dark:text-app-text-dark">
									{{ statement.title }}
								</h3>
								<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
									{{ statement.summary }}
								</p>
							</article>
						</div>
					</div>

					<div class="surface-panel">
						<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
							Source note
						</h2>
						<ul class="readable-list text-sm text-app-muted mt-5 pl-5 dark:text-app-muted-dark">
							<li><strong class="text-app-ink dark:text-app-text-dark">Coverage:</strong> {{ influence?.coverageLabel || "Public disclosures and source-backed statements where available." }}</li>
							<li><strong class="text-app-ink dark:text-app-text-dark">Match mode:</strong> {{ influence?.matchMode === "committee" ? "Committee crosswalk" : influence?.matchMode === "honoree" ? "Direct officeholder-name match" : "Not published" }}</li>
							<li><strong class="text-app-ink dark:text-app-text-dark">Data through:</strong> {{ formatDate(person.freshness.dataLastUpdatedAt ?? person.updatedAt) }}</li>
						</ul>
						<p class="text-sm text-app-muted leading-7 mt-5 dark:text-app-muted-dark">
							Treat sector and donor overlap as context, not proof. Disclosure filings do not show every form of contact or influence.
						</p>
					</div>
				</div>
			</section>

			<section v-else class="max-w-4xl">
				<InfoCallout title="Influence unavailable" tone="warning">
					{{ person.enrichmentStatus?.influence.summary || influenceUnavailableSummary }}
					<span class="mt-2 block">Last reviewed {{ formatDate(person.freshness.dataLastUpdatedAt ?? person.updatedAt) }}.</span>
				</InfoCallout>
			</section>
		</div>
	</section>
</template>
