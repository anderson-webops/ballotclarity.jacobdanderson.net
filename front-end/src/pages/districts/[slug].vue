<script setup lang="ts">
import { storeToRefs } from "pinia";

import { buildActiveLookupSummary } from "~/utils/active-lookup";
import { buildGuideDistrictPageRecord, buildNationwideDistrictPageRecord } from "~/utils/district-page";
import { isExternalHref } from "~/utils/link";
import { buildLookupContextFromNationwideResult, buildNationwideLookupRouteQuery, buildNationwideRouteTarget } from "~/utils/nationwide-route-context";
import { resolveRepresentativePresentation } from "~/utils/representative-presentation";

const route = useRoute();
const civicStore = useCivicStore();
const { isHydrated, nationwideLookupResult, selectedLocation } = storeToRefs(civicStore);
const { hasGuideShellContext, hasNationwideResultContext } = useGuideEntryGate();
const districtSlug = useRouteStringParam("slug");
const activeNationwideLookupResult = computed(() => isHydrated.value ? nationwideLookupResult.value : null);
const activeLookupQuery = computed(() => buildNationwideLookupRouteQuery(
	buildLookupContextFromNationwideResult(activeNationwideLookupResult.value),
	route.query
));
const { data: guideData, error: guideError, pending: guidePending } = await useDistrict(districtSlug, activeLookupQuery);
const lookupFallbackData = computed(() => buildNationwideDistrictPageRecord(activeNationwideLookupResult.value, districtSlug.value));

const districtPageData = computed(() => {
	if (!guideData.value)
		return lookupFallbackData.value;

	if (guideData.value.mode === "guide")
		return buildGuideDistrictPageRecord(guideData.value);

	if (guideData.value.districtOriginLabel === "Lookup context required" && lookupFallbackData.value)
		return lookupFallbackData.value;

	return guideData.value;
});
const activeLookupSummary = computed(() => buildActiveLookupSummary({
	nationwideLookupResult: activeNationwideLookupResult.value,
	routeLookupQuery: activeLookupQuery.value?.lookup ?? null,
	selectedLocation: isHydrated.value ? selectedLocation.value : null
}));
const pagePending = computed(() => guidePending.value || (!guideData.value && !lookupFallbackData.value));
const pageError = computed(() => districtPageData.value ? null : guideError.value);
function buildLookupAwareTarget(path: string) {
	return buildNationwideRouteTarget(path, buildLookupContextFromNationwideResult(activeNationwideLookupResult.value), route.query);
}

function getRepresentativePresentation(representative: NonNullable<typeof districtPageData.value>["representatives"][number]) {
	return resolveRepresentativePresentation(representative, activeNationwideLookupResult.value?.location?.state ?? null);
}

const breadcrumbs = computed(() => [
	{ label: "Home", to: "/" },
	{ label: "Districts", to: "/districts" },
	{ label: districtPageData.value?.district.title ?? "District page" }
]);

const sectionLinks = computed(() => (districtPageData.value
	? [
			{ href: "#overview", label: "Overview", note: "District and office context" },
			{ href: "#representatives", label: "Current representatives", badge: String(districtPageData.value.representatives.length) },
			...(districtPageData.value.candidates.length
				? [{ href: "#candidates", label: "Candidate field", badge: String(districtPageData.value.candidates.length) }]
				: []),
			...(districtPageData.value.officialResources.length
				? [{ href: "#official-tools", label: "Official tools", badge: String(districtPageData.value.officialResources.length) }]
				: []),
			{ href: "#sources", label: "Sources", badge: String(districtPageData.value.sources.length) }
		]
	: []));

const districtContextLink = computed(() => {
	if (districtPageData.value?.mode === "nationwide" || hasNationwideResultContext.value) {
		return {
			label: "Open results",
			to: "/results"
		};
	}

	if (hasGuideShellContext.value && districtPageData.value) {
		return {
			label: "Open current election coverage",
			to: `/elections/${districtPageData.value.election.slug}`
		};
	}

	return {
		label: "Open coverage profile",
		to: "/coverage"
	};
});

usePageSeo({
	description: districtPageData.value?.district.summary ?? "District page with office context, current representative, candidate field, and source links.",
	path: `/districts/${districtSlug.value}`,
	title: districtPageData.value?.district.title ?? "District page"
});
</script>

<template>
	<section class="app-shell section-gap">
		<div v-if="pagePending" class="gap-6 grid xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
			<div class="space-y-6">
				<div class="surface-panel bg-white/70 h-80 animate-pulse dark:bg-app-panel-dark/70" />
				<div class="surface-panel bg-white/70 h-72 animate-pulse dark:bg-app-panel-dark/70" />
			</div>
			<div class="surface-panel bg-white/70 h-72 animate-pulse dark:bg-app-panel-dark/70" />
		</div>

		<div v-else-if="pageError || !districtPageData" class="max-w-3xl">
			<InfoCallout title="District detail not available yet" tone="warning">
				This district could not be loaded right now. Return to the district hub or results page and try again.
			</InfoCallout>
		</div>

		<div v-else class="gap-8 grid xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
			<div class="space-y-8">
				<header id="overview" class="surface-panel">
					<AppBreadcrumbs :items="breadcrumbs" />
					<div class="flex flex-wrap gap-2">
						<VerificationBadge label="District page" tone="accent" />
						<VerificationBadge :label="districtPageData.district.jurisdiction" />
						<UpdatedAt :value="districtPageData.updatedAt" label="Updated" />
					</div>
					<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
						{{ districtPageData.district.title }}
					</h1>
					<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
						{{ districtPageData.district.description }}
					</p>
					<div class="mt-6 flex flex-wrap gap-3">
						<NuxtLink v-if="districtPageData.mode === 'guide'" :to="`/contest/${districtPageData.district.slug}`" class="btn-primary">
							Open contest page
						</NuxtLink>
						<NuxtLink :to="buildLookupAwareTarget(districtContextLink.to)" class="btn-secondary">
							{{ districtContextLink.label }}
						</NuxtLink>
						<NuxtLink :to="buildLookupAwareTarget('/representatives')" class="btn-secondary">
							Representative directory
						</NuxtLink>
					</div>
					<div class="mt-6 flex flex-wrap gap-2">
						<VerificationBadge :label="`${districtPageData.representatives.length} current representative${districtPageData.representatives.length === 1 ? '' : 's'}`" tone="accent" />
						<VerificationBadge v-if="districtPageData.candidates.length" :label="`${districtPageData.candidates.length} candidate${districtPageData.candidates.length === 1 ? '' : 's'}`" />
						<VerificationBadge :label="`${districtPageData.sources.length} source${districtPageData.sources.length === 1 ? '' : 's'}`" />
					</div>
					<p v-if="!districtPageData.candidates.length" class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						<strong class="text-app-ink dark:text-app-text-dark">Candidate field:</strong> {{ districtPageData.candidateAvailabilityNote }}
					</p>
				</header>

				<section id="representatives" class="surface-panel">
					<div class="flex flex-wrap gap-4 items-center justify-between">
						<div>
							<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
								Current representatives
							</h2>
							<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
								{{ districtPageData.representativeAvailabilityNote }}
							</p>
						</div>
						<NuxtLink to="/representatives" class="btn-secondary">
							All representatives
						</NuxtLink>
					</div>
					<div v-if="districtPageData.representatives.length" class="mt-6 gap-5 grid lg:grid-cols-2">
						<article v-for="representative in districtPageData.representatives" :key="representative.slug" class="p-5 border border-app-line/70 rounded-3xl bg-white/80 dark:border-app-line-dark dark:bg-app-panel-dark/70">
							<div class="flex gap-4 items-start">
								<ProfileImageStack
									v-if="representative.profileImages?.length"
									:images="representative.profileImages"
									:name="representative.name"
									size="md"
								/>
								<div class="min-w-0">
									<div class="flex flex-wrap gap-3 items-center">
										<p class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
											{{ representative.name }}
										</p>
										<VerificationBadge :label="getRepresentativePresentation(representative).levelLabel" tone="accent" />
										<IncumbentBadge />
									</div>
									<p class="text-sm text-app-muted mt-3 dark:text-app-muted-dark">
										{{ representative.party }} · {{ getRepresentativePresentation(representative).officeDisplayLabel }}
									</p>
								</div>
							</div>
							<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
								{{ representative.summary }}
							</p>
							<div class="mt-5 flex flex-wrap gap-3">
								<SafeExternalLink
									v-if="isExternalHref(representative.href)"
									:href="representative.href"
									class="btn-secondary inline-flex gap-2 items-center"
								>
									Open record
									<span class="i-carbon-launch" />
								</SafeExternalLink>
								<NuxtLink v-else :to="buildLookupAwareTarget(representative.href)" class="btn-secondary">
									Profile
								</NuxtLink>
								<SafeExternalLink
									v-if="representative.openstatesUrl"
									:href="representative.openstatesUrl"
									class="btn-secondary inline-flex gap-2 items-center"
								>
									Provider record
									<span class="i-carbon-launch" />
								</SafeExternalLink>
								<NuxtLink
									v-if="!isExternalHref(representative.href) && representative.fundingAvailable"
									:to="buildLookupAwareTarget(`${representative.href}/funding`)"
									class="btn-secondary"
								>
									Funding
								</NuxtLink>
								<NuxtLink
									v-if="!isExternalHref(representative.href) && representative.influenceAvailable"
									:to="buildLookupAwareTarget(`${representative.href}/influence`)"
									class="btn-secondary"
								>
									Influence
								</NuxtLink>
							</div>
							<div v-if="representative.fundingAvailable || representative.influenceAvailable" class="mt-4 space-y-2">
								<p v-if="representative.fundingAvailable" class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
									<strong class="text-app-ink dark:text-app-text-dark">Funding:</strong> {{ representative.fundingSummary }}
								</p>
								<p v-if="representative.influenceAvailable" class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
									<strong class="text-app-ink dark:text-app-text-dark">Influence:</strong> {{ representative.influenceSummary }}
								</p>
							</div>
						</article>
					</div>
					<InfoCallout
						v-else
						:title="districtPageData.mode === 'nationwide' ? 'No linked official is attached yet' : 'No current representative in this field'"
						tone="warning"
						class="mt-6"
					>
						{{ districtPageData.representativeAvailabilityNote }}
					</InfoCallout>
				</section>

				<section v-if="districtPageData.candidates.length" id="candidates" class="surface-panel">
					<div class="flex flex-wrap gap-4 items-center justify-between">
						<div>
							<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
								Candidate field
							</h2>
							<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
								{{ districtPageData.candidateAvailabilityNote }}
							</p>
						</div>
						<NuxtLink v-if="districtPageData.mode === 'guide'" :to="`/contest/${districtPageData.district.slug}`" class="btn-secondary">
							Open contest page
						</NuxtLink>
					</div>
					<div v-if="districtPageData.candidates.length" class="mt-6 gap-6 grid xl:grid-cols-2">
						<CandidateCard
							v-for="candidate in districtPageData.candidates"
							:key="candidate.slug"
							:candidate="candidate"
						/>
					</div>
				</section>

				<section v-if="districtPageData.officialResources.length" id="official-tools" class="surface-panel">
					<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
						Official verification tools
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						Official election links for this office area.
					</p>
					<div class="mt-6">
						<OfficialResourceList :resources="districtPageData.officialResources" />
					</div>
				</section>

				<details id="sources" class="surface-panel scroll-mt-28">
					<summary class="text-2xl text-app-ink font-serif cursor-pointer dark:text-app-text-dark focus-ring">
						District sources
					</summary>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						{{ districtPageData.mode === "guide"
							? "Sources for the candidate and official information on this page."
							: "Sources for the district match, linked officials, and official election links on this page." }}
					</p>
					<div class="mt-6">
						<SourceList :sources="districtPageData.sources" />
					</div>
				</details>
			</div>

			<div class="space-y-6 xl:pt-[4.5rem]">
				<PageSectionNav
					:breadcrumbs="breadcrumbs"
					compact
					:items="sectionLinks"
					:show-breadcrumbs="false"
					title="District page"
				>
					<template #actions>
						<div class="flex flex-wrap gap-3">
							<NuxtLink :to="districtContextLink.to" class="btn-secondary">
								{{ districtContextLink.label }}
							</NuxtLink>
							<NuxtLink to="/districts" class="btn-secondary">
								All districts
							</NuxtLink>
						</div>
					</template>
				</PageSectionNav>

				<div v-if="activeLookupSummary.mode !== 'none'" class="surface-row">
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
						Area
					</p>
					<h2 class="text-2xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
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
				</div>

				<details class="surface-row">
					<summary class="text-sm text-app-ink font-semibold cursor-pointer dark:text-app-text-dark focus-ring">
						What this office does
					</summary>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						{{ districtPageData.district.roleGuide.summary }}
					</p>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						<strong class="text-app-ink dark:text-app-text-dark">Why it matters:</strong> {{ districtPageData.district.roleGuide.whyItMatters }}
					</p>
					<ul class="readable-list text-sm text-app-muted mt-4 pl-5 dark:text-app-muted-dark">
						<li v-for="area in districtPageData.district.roleGuide.decisionAreas" :key="area">
							{{ area }}
						</li>
					</ul>
				</details>

				<details v-if="districtPageData.relatedContests.length" class="surface-row">
					<summary class="text-xl text-app-ink font-serif cursor-pointer dark:text-app-text-dark focus-ring">
						Related ballot pages
					</summary>
					<div class="mt-5 space-y-4">
						<NuxtLink
							v-for="contest in districtPageData.relatedContests"
							:key="contest.slug"
							:to="contest.href"
							class="px-5 py-4 border border-app-line/70 rounded-3xl bg-white/80 block transition dark:border-app-line-dark hover:border-app-accent dark:bg-app-panel-dark/70 focus-ring"
						>
							<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
								{{ contest.jurisdiction }}
							</p>
							<p class="text-lg text-app-ink font-semibold mt-3 dark:text-app-text-dark">
								{{ contest.office }}
							</p>
						</NuxtLink>
					</div>
				</details>
			</div>
		</div>
	</section>
</template>
