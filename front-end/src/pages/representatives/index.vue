<script setup lang="ts">
import type { RepresentativesResponse } from "~/types/civic";
import { storeToRefs } from "pinia";

import { buildActiveLookupSummary } from "~/utils/active-lookup";
import { isExternalHref } from "~/utils/link";
import { buildNationwideDirectoryResponses, mergeNationwideDirectoryResponses } from "~/utils/nationwide-directory";
import { buildLookupContextFromNationwideResult, buildNationwideLookupRouteQuery, buildNationwideRouteTarget } from "~/utils/nationwide-route-context";
import { groupRepresentativeSummariesByGovernmentLevel, resolveRepresentativePresentation } from "~/utils/representative-presentation";
import { formatSourceCountLabel } from "~/utils/source-label";

const route = useRoute();
const civicStore = useCivicStore();
const { isHydrated, nationwideLookupResult, selectedLocation } = storeToRefs(civicStore);
const { hasGuideShellContext, hasNationwideResultContext } = useGuideEntryGate();
const activeNationwideLookupResult = computed(() => isHydrated.value ? nationwideLookupResult.value : null);
const activeLookupQuery = computed(() => buildNationwideLookupRouteQuery(
	buildLookupContextFromNationwideResult(activeNationwideLookupResult.value),
	route.query
));
const activeGuideAreaQuery = computed(() => isHydrated.value && hasGuideShellContext.value && selectedLocation.value?.slug
	? { area: selectedLocation.value.slug }
	: null
);
const directoryApiQuery = computed(() => activeLookupQuery.value ?? activeGuideAreaQuery.value);
const { data: guideData, error: guideError, pending: guidePending, refresh: refreshGuideData } = await useRepresentatives(directoryApiQuery);

if (import.meta.client) {
	watch(activeGuideAreaQuery, (query, previousQuery) => {
		if (!query?.area || query.area === previousQuery?.area || activeLookupQuery.value)
			return;

		void refreshGuideData();
	}, { immediate: true });
}
const emptyNationwideRepresentativesResponse: RepresentativesResponse = { districts: [], mode: "nationwide", note: "", representatives: [], updatedAt: "" };
const emptyGuideRepresentativesResponse: RepresentativesResponse = { districts: [], mode: "guide", note: "", representatives: [], updatedAt: "" };
const apiUsesNationwide = computed(() => guideData.value?.mode === "nationwide");
const showGuideDirectory = computed(() => hasGuideShellContext.value);
const storeUsesNationwide = computed(() => {
	if (!activeNationwideLookupResult.value || activeNationwideLookupResult.value.result !== "resolved")
		return false;

	return isHydrated.value
		? hasNationwideResultContext.value && !hasGuideShellContext.value
		: activeNationwideLookupResult.value.guideAvailability !== "published";
});
const directoryUsesNationwide = computed(() => apiUsesNationwide.value || storeUsesNationwide.value);
const directoryBundle = computed(() => {
	if (storeUsesNationwide.value) {
		const storedDirectory = buildNationwideDirectoryResponses(activeNationwideLookupResult.value);

		return apiUsesNationwide.value
			? mergeNationwideDirectoryResponses(storedDirectory, {
				representatives: guideData.value
			}).representatives
			: storedDirectory.representatives;
	}

	if (apiUsesNationwide.value)
		return guideData.value ?? emptyNationwideRepresentativesResponse;

	if (showGuideDirectory.value)
		return guideData.value ?? emptyGuideRepresentativesResponse;

	return emptyNationwideRepresentativesResponse;
});

const directoryPending = computed(() => directoryUsesNationwide.value ? false : showGuideDirectory.value ? guidePending.value : false);
const directoryError = computed(() => showGuideDirectory.value || directoryUsesNationwide.value
	? directoryUsesNationwide.value && directoryBundle.value ? null : guideError.value
	: null);
const directoryData = computed(() => directoryBundle.value);
const groupedRepresentatives = computed(() => groupRepresentativeSummariesByGovernmentLevel(
	directoryData.value.representatives,
	activeNationwideLookupResult.value?.location?.state ?? null
));
const activeLookupSummary = computed(() => buildActiveLookupSummary({
	nationwideLookupResult: activeNationwideLookupResult.value,
	routeLookupQuery: activeLookupQuery.value?.lookup ?? null,
	selectedLocation: isHydrated.value ? selectedLocation.value : null
}));
const representativeLinkIsExternal = (href: string) => isExternalHref(href);
const introCopy = computed(() => directoryUsesNationwide.value
	? "Current officials for your saved area."
	: "This directory lists current officeholders and links to their district, profile, funding, and influence pages where available."
);
const requiresLookupPrompt = computed(() => !directoryUsesNationwide.value && !showGuideDirectory.value);
const lookupPrompt = computed(() => activeLookupSummary.value.mode === "none"
	? {
			body: "Enter an address or ZIP code first so this page can show current officials for your area.",
			title: "Start with lookup"
		}
	: {
			body: "A saved area is present, but this page needs a current address or ZIP result to load the matching officials.",
			title: "Refresh results for this page"
		}
);
const directorySummary = computed(() => `${directoryData.value.representatives.length} current official${directoryData.value.representatives.length === 1 ? "" : "s"} across ${directoryData.value.districts.length} district match${directoryData.value.districts.length === 1 ? "" : "es"}.`);

function buildLookupAwareTarget(path: string) {
	return buildNationwideRouteTarget(path, buildLookupContextFromNationwideResult(activeNationwideLookupResult.value), route.query);
}

function getRepresentativePresentation(representative: RepresentativesResponse["representatives"][number]) {
	return resolveRepresentativePresentation(representative, activeNationwideLookupResult.value?.location?.state ?? null);
}
usePageSeo({
	description: "Directory of current representatives with district links, person pages, and attached public-record context.",
	path: "/representatives",
	title: "Representatives"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="gap-6 grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
			<div class="surface-panel">
				<div class="flex flex-wrap gap-2">
					<VerificationBadge label="Representative directory" tone="accent" />
					<VerificationBadge label="Incumbents only" />
				</div>
				<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
					Representatives
				</h1>
				<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
					{{ introCopy }}
				</p>
			</div>

			<div v-if="activeLookupSummary.mode !== 'none'" class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Current area
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					{{ activeLookupSummary.label }}
				</h2>
				<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
					{{ activeLookupSummary.note }}
				</p>
				<div class="mt-5 flex flex-wrap gap-3 items-center">
					<TrustBadge
						:label="activeLookupSummary.mode === 'nationwide' ? 'Lookup results' : activeLookupSummary.mode === 'guide' ? 'Local guide' : 'No saved location'"
						:tone="activeLookupSummary.mode === 'nationwide' ? 'accent' : activeLookupSummary.mode === 'guide' ? undefined : 'warning'"
					/>
					<UpdatedAt v-if="activeLookupSummary.resolvedAt" :value="activeLookupSummary.resolvedAt" label="Lookup updated" />
				</div>
				<div class="mt-6">
					<NuxtLink :to="buildLookupAwareTarget('/districts')" class="btn-secondary">
						Open district hub
					</NuxtLink>
				</div>
			</div>
		</header>

		<div v-if="directoryPending && !directoryData.representatives.length" class="gap-6 grid lg:grid-cols-2">
			<div class="surface-panel bg-white/70 h-56 animate-pulse dark:bg-app-panel-dark/70" />
			<div class="surface-panel bg-white/70 h-56 animate-pulse dark:bg-app-panel-dark/70" />
		</div>

		<div v-else-if="directoryError || !directoryData" class="max-w-3xl">
			<InfoCallout title="Representative directory unavailable" tone="warning">
				The representative directory could not be loaded. Open a district or contest page and try again.
			</InfoCallout>
		</div>

		<div v-else-if="requiresLookupPrompt" class="max-w-3xl">
			<InfoCallout :title="lookupPrompt.title" tone="warning">
				{{ lookupPrompt.body }}
			</InfoCallout>
			<div class="mt-6 flex flex-wrap gap-3">
				<NuxtLink to="/" class="btn-primary">
					Open lookup
				</NuxtLink>
				<NuxtLink to="/results" class="btn-secondary">
					Results for your area
				</NuxtLink>
			</div>
		</div>

		<div v-else class="space-y-6">
			<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
				{{ directorySummary }}
			</p>

			<div class="space-y-8">
				<section
					v-for="group in groupedRepresentatives"
					:key="group.label"
					class="space-y-5"
				>
					<div class="flex flex-wrap gap-3 items-center justify-between">
						<div>
							<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
								{{ group.label }}
							</h2>
							<p class="text-sm text-app-muted mt-3 dark:text-app-muted-dark">
								{{ group.representatives.length }} current official{{ group.representatives.length === 1 ? "" : "s" }} in this section.
							</p>
						</div>
						<VerificationBadge :label="`${group.representatives.length} official${group.representatives.length === 1 ? '' : 's'}`" tone="accent" />
					</div>
					<div class="gap-6 grid lg:grid-cols-2">
						<article
							v-for="representative in group.representatives"
							:key="representative.slug"
							class="surface-row"
						>
							<div class="flex flex-wrap gap-2 items-center">
								<VerificationBadge :label="getRepresentativePresentation(representative).levelLabel" tone="accent" />
								<IncumbentBadge />
							</div>
							<div class="mt-4 flex gap-4 items-start">
								<ProfileImageStack
									v-if="representative.profileImages?.length"
									:images="representative.profileImages"
									:name="representative.name"
									size="md"
								/>
								<div class="min-w-0">
									<h3 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
										{{ representative.name }}
									</h3>
									<p class="text-sm text-app-muted mt-3 dark:text-app-muted-dark">
										{{ representative.party }} · {{ getRepresentativePresentation(representative).officeDisplayLabel }}
									</p>
								</div>
							</div>
							<div class="mt-5 flex flex-wrap gap-2">
								<VerificationBadge :label="representative.districtLabel" />
								<VerificationBadge :label="formatSourceCountLabel(representative.sourceCount)" tone="accent" />
							</div>
							<div class="mt-6 flex flex-wrap gap-3">
								<NuxtLink v-if="!representativeLinkIsExternal(representative.href)" :to="buildLookupAwareTarget(representative.href)" class="btn-secondary">
									Profile
								</NuxtLink>
								<SafeExternalLink
									v-else
									:href="representative.href"
									class="btn-secondary inline-flex gap-2 items-center"
								>
									Open record
									<span class="i-carbon-launch" />
								</SafeExternalLink>
								<NuxtLink :to="buildLookupAwareTarget(`/districts/${representative.districtSlug}`)" class="btn-secondary">
									District page
								</NuxtLink>
								<NuxtLink
									v-if="!representativeLinkIsExternal(representative.href) && representative.fundingAvailable"
									:to="buildLookupAwareTarget(`${representative.href}/funding`)"
									class="btn-primary"
								>
									Funding
								</NuxtLink>
								<NuxtLink
									v-if="!representativeLinkIsExternal(representative.href) && representative.influenceAvailable"
									:to="buildLookupAwareTarget(`${representative.href}/influence`)"
									class="btn-secondary"
								>
									Influence
								</NuxtLink>
							</div>
							<details
								v-if="representative.summary || representative.fundingAvailable || representative.influenceAvailable"
								class="mt-4"
							>
								<summary class="text-sm text-app-ink font-semibold cursor-pointer dark:text-app-text-dark focus-ring">
									More context
								</summary>
								<div class="text-sm text-app-muted leading-6 mt-3 space-y-2 dark:text-app-muted-dark">
									<p v-if="representative.summary">
										{{ representative.summary }}
									</p>
									<p v-if="representative.fundingAvailable">
										<strong class="text-app-ink dark:text-app-text-dark">Funding:</strong> {{ representative.fundingSummary }}
									</p>
									<p v-if="representative.influenceAvailable">
										<strong class="text-app-ink dark:text-app-text-dark">Influence:</strong> {{ representative.influenceSummary }}
									</p>
								</div>
							</details>
						</article>
					</div>
				</section>
			</div>
		</div>
	</section>
</template>
