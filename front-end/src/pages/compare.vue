<script setup lang="ts">
import type { Candidate, Source } from "~/types/civic";
import { storeToRefs } from "pinia";
import { buildCompareRoute, normalizeCompareSlugs, parseCompareQuerySlugs } from "~/stores/civic";

const civicStore = useCivicStore();
const route = useRoute();
const router = useRouter();
const { backToLayerLink, layerBreadcrumbLink, openLayerLink } = useRouteLayerNavigation();
const { allowsGuideEntryPoints, hasNationwideResultContext } = useGuideEntryGate();
const { compareList, isHydrated } = storeToRefs(civicStore);

const selectedSlugs = computed(() => parseCompareQuerySlugs(route.query.slugs));
const cachedCompareSlugs = computed(() => normalizeCompareSlugs(isHydrated.value ? compareList.value : []));
const hasCanonicalSelection = computed(() => selectedSlugs.value.length > 0);
const hasSavedCompareSelection = computed(() => !hasCanonicalSelection.value && cachedCompareSlugs.value.length >= 2);
const resumeCompareHref = computed(() => buildCompareRoute(cachedCompareSlugs.value));

watch(selectedSlugs, (slugs) => {
	if (slugs.length)
		civicStore.replaceCompare(slugs);
}, { immediate: true });

const { data, pending } = await useCandidates(selectedSlugs);

const selectedCategory = ref<string | null>(null);
const showOnlyDifferences = ref(false);
const showOnlyMutualResponses = ref(false);

const sortedCandidates = computed(() => {
	return [...(data.value?.candidates ?? [])].sort((left, right) => {
		return left.comparison.ballotOrder - right.comparison.ballotOrder
			|| left.comparison.displayName.localeCompare(right.comparison.displayName);
	});
});

const questionCategories = computed(() => {
	return Array.from(new Set(
		sortedCandidates.value.flatMap(candidate => candidate.comparison.questionnaireResponses.map(response => response.category))
	));
});

watchEffect(() => {
	if (selectedCategory.value && !questionCategories.value.includes(selectedCategory.value))
		selectedCategory.value = null;
});

const sameContest = computed(() => Boolean(data.value?.sameContest));
const compareBreadcrumbs = computed(() => [
	{ label: "Home", to: "/" },
	layerBreadcrumbLink.value,
	{ label: "Compare" }
]);
const hasUnavailableSelection = computed(() => {
	return selectedSlugs.value.length >= 2 && (data.value?.candidates.length ?? 0) === 0;
});
const emptyStateTitle = computed(() => {
	if (hasUnavailableSelection.value)
		return "Candidate comparison is not available yet";

	if (selectedSlugs.value.length === 1)
		return "Select one more candidate to compare";

	return "No compare candidates selected";
});
const emptyStateBody = computed(() => {
	if (hasUnavailableSelection.value) {
		return allowsGuideEntryPoints.value
			? "These candidate records are not published for comparison yet. Use the ballot guide or profile pages until verified candidate comparison is available."
			: hasNationwideResultContext.value
				? "These candidate records are not published for comparison yet. Use the results page or profile pages until verified candidate comparison is available."
				: "These candidate records are not published for comparison yet. Use the available profile or overview pages until verified candidate comparison is available.";
	}

	if (selectedSlugs.value.length === 1) {
		return allowsGuideEntryPoints.value
			? "This compare link includes only one candidate. Add one or two more candidates from the ballot guide or a candidate profile, then reopen compare with the updated URL."
			: hasNationwideResultContext.value
				? "This compare link includes only one candidate. Add one or two more candidates from a candidate profile or the results page, then reopen compare with the updated URL."
				: "This compare link includes only one candidate. Add one or two more candidates from a candidate profile, then reopen compare with the updated URL.";
	}

	if (hasSavedCompareSelection.value) {
		return allowsGuideEntryPoints.value
			? "This compare link does not include any selected candidates yet. You can reopen the saved compare selection from this browser, or start a fresh compare from the ballot guide."
			: hasNationwideResultContext.value
				? "This compare link does not include any selected candidates yet. You can reopen the saved compare selection from this browser, or start a fresh compare from the results page or a candidate profile."
				: "This compare link does not include any selected candidates yet. You can reopen the saved compare selection from this browser, or start a fresh compare from a candidate profile.";
	}

	return allowsGuideEntryPoints.value
		? "This compare page needs candidate slugs in the URL to render a side-by-side view. Start from the ballot guide or a candidate profile and open compare with two or three selected candidates."
		: hasNationwideResultContext.value
			? "This compare page needs candidate slugs in the URL to render a side-by-side view. Start from the results page or a candidate profile and open compare with two or three selected candidates."
			: "This compare page needs candidate slugs in the URL to render a side-by-side view. Start from a candidate profile and open compare with two or three selected candidates.";
});

function uniqueSources(...groups: Source[][]) {
	return Array.from(new Map(groups.flat().map(source => [source.id, source])).values());
}

function publicRecordSources(candidate: Candidate) {
	return uniqueSources(
		candidate.sources.filter(source => ["hearing transcript", "official record", "research brief"].includes(source.type)),
		candidate.keyActions.flatMap(action => action.sources)
	);
}

function financeSources(candidate: Candidate) {
	return uniqueSources(
		candidate.funding.sources,
		candidate.lobbyingContext.flatMap(block => block.sources)
	);
}

async function clearCompareSelection() {
	civicStore.clearCompare();
	await router.push("/compare");
}

usePageSeo({
	description: "Compare candidates with verified ballot facts, candidate-provided statements, and source-backed context without scores, polls, or rankings.",
	path: "/compare",
	title: "Compare Candidates"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<AppBreadcrumbs :items="compareBreadcrumbs" />

		<header class="max-w-5xl">
			<div class="flex flex-wrap gap-2">
				<TrustBadge label="Neutral compare view" tone="accent" />
				<TrustBadge label="No scores or rankings" />
				<TrustBadge label="Source-backed" />
			</div>
			<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
				Compare candidates side by side.
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 max-w-4xl dark:text-app-muted-dark">
				This page compares verified ballot facts and candidate-provided statements by attribute. It is designed to stay neutral: no polls, no win probabilities, no fundraising leaderboard, and no fit score.
			</p>
		</header>

		<div v-if="pending" class="surface-panel bg-white/70 h-96 animate-pulse dark:bg-app-panel-dark/70" />

		<div v-else-if="(data?.candidates.length ?? 0) < 2" class="max-w-3xl">
			<InfoCallout :title="emptyStateTitle" tone="warning">
				{{ emptyStateBody }}
			</InfoCallout>
			<div class="mt-6 flex flex-wrap gap-3">
				<NuxtLink :to="openLayerLink.to" class="btn-primary">
					{{ openLayerLink.label }}
				</NuxtLink>
				<NuxtLink v-if="hasSavedCompareSelection" :to="resumeCompareHref" class="btn-secondary">
					Resume saved compare
				</NuxtLink>
				<button
					v-if="cachedCompareSlugs.length"
					type="button"
					class="btn-secondary"
					@click="clearCompareSelection"
				>
					Clear saved compare list
				</button>
			</div>
		</div>

		<template v-else-if="!sameContest">
			<InfoCallout title="Standardized comparison works best within one contest" tone="warning">
				The selected candidates are from different races. Ballot Clarity avoids forcing a side-by-side questionnaire comparison when candidates are not running for the same office.
			</InfoCallout>

			<section class="gap-6 grid xl:grid-cols-3">
				<article v-for="candidate in sortedCandidates" :key="candidate.slug" class="surface-panel">
					<div class="flex flex-wrap gap-3 items-center">
						<h2 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
							{{ candidate.comparison.displayName }}
						</h2>
						<IncumbentBadge v-if="candidate.incumbent" />
					</div>
					<p class="text-sm text-app-muted mt-2 dark:text-app-muted-dark">
						{{ candidate.officeSought }} · {{ candidate.comparison.partyOnBallot }}
					</p>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						{{ candidate.comparison.whyRunning.text }}
					</p>
					<div class="mt-5 flex flex-wrap gap-3">
						<NuxtLink :to="`/candidate/${candidate.slug}`" class="btn-secondary">
							Open profile
						</NuxtLink>
						<SafeExternalLink :href="candidate.comparison.campaignWebsiteUrl" class="btn-secondary">
							Campaign website
						</SafeExternalLink>
					</div>
				</article>
			</section>
		</template>

		<template v-else>
			<section class="surface-panel">
				<div class="flex flex-wrap gap-4 items-center justify-between">
					<div>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Comparable core
						</p>
						<h2 class="text-3xl text-app-ink font-serif mt-2 dark:text-app-text-dark">
							{{ data?.office }}
						</h2>
						<p class="text-sm text-app-muted leading-7 mt-3 max-w-3xl dark:text-app-muted-dark">
							These candidates share the same contest, so the comparison can use a standardized question set instead of editorially selected highlights.
						</p>
					</div>
					<div class="flex flex-wrap gap-3">
						<NuxtLink :to="backToLayerLink.to" class="btn-secondary">
							{{ backToLayerLink.label }}
						</NuxtLink>
						<NuxtLink v-if="allowsGuideEntryPoints" to="/plan" class="btn-secondary">
							Open ballot plan
						</NuxtLink>
						<button type="button" class="btn-primary" @click="clearCompareSelection">
							Clear compare list
						</button>
					</div>
				</div>

				<div class="mt-6 gap-6 grid xl:grid-cols-[minmax(0,1fr)_auto]">
					<div>
						<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
							Filter by question category
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<button
								type="button"
								class="text-xs font-semibold px-3 py-2 border rounded-full transition focus-ring"
								:class="selectedCategory === null
									? 'border-app-accent bg-app-accent text-app-action-text'
									: 'border-app-line bg-white text-app-muted hover:border-app-accent hover:text-app-accent dark:border-app-line-dark dark:bg-app-panel-dark dark:text-app-muted-dark'"
								@click="selectedCategory = null"
							>
								All questions
							</button>
							<button
								v-for="category in questionCategories"
								:key="category"
								type="button"
								class="text-xs font-semibold px-3 py-2 border rounded-full transition focus-ring"
								:class="selectedCategory === category
									? 'border-app-accent bg-app-accent text-app-action-text'
									: 'border-app-line bg-white text-app-muted hover:border-app-accent hover:text-app-accent dark:border-app-line-dark dark:bg-app-panel-dark dark:text-app-muted-dark'"
								@click="selectedCategory = category"
							>
								{{ category }}
							</button>
						</div>
					</div>

					<div class="flex flex-col gap-3">
						<label class="text-sm text-app-muted px-4 py-3 border border-app-line rounded-2xl bg-white flex gap-3 items-center self-start dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-panel-dark">
							<input v-model="showOnlyDifferences" type="checkbox" class="accent-app-accent h-4 w-4">
							Show only rows with meaningful differences
						</label>
						<label class="text-sm text-app-muted px-4 py-3 border border-app-line rounded-2xl bg-white flex gap-3 items-center self-start dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-panel-dark">
							<input v-model="showOnlyMutualResponses" type="checkbox" class="accent-app-accent h-4 w-4">
							Show only questions answered by all selected candidates
						</label>
					</div>
				</div>
			</section>

			<CompareTable
				:candidates="sortedCandidates"
				:question-category="selectedCategory"
				:show-only-differences="showOnlyDifferences"
				:show-only-mutual-responses="showOnlyMutualResponses"
			/>

			<ExpandableSection
				eyebrow="Source deep dives"
				title="Open source-heavy context only when needed"
				description="The comparison table is the primary reading surface. Use the profiles below only when you want campaign links, disclosure sources, or quoted issue context."
			>
				<div class="gap-6 grid xl:grid-cols-3">
					<article v-for="candidate in sortedCandidates" :key="candidate.slug" class="surface-panel">
						<div class="flex flex-wrap gap-3 items-center justify-between">
							<div>
								<div class="flex flex-wrap gap-2 items-center">
									<h3 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
										{{ candidate.comparison.displayName }}
									</h3>
									<IncumbentBadge v-if="candidate.incumbent" />
								</div>
								<p class="text-sm text-app-muted mt-2 dark:text-app-muted-dark">
									Context deep dive
								</p>
							</div>
							<NuxtLink :to="`/candidate/${candidate.slug}`" class="btn-secondary">
								Full profile
							</NuxtLink>
						</div>

						<div class="mt-6 space-y-5">
							<div>
								<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
									Campaign links
								</p>
								<ul class="mt-3 space-y-2">
									<li v-for="item in candidate.comparison.contactChannels" :key="item.url">
										<SafeExternalLink :href="item.url" class="text-sm text-app-accent rounded-md inline-flex gap-2 items-center hover:text-app-ink focus-ring dark:hover:text-white">
											<span class="i-carbon-launch" />
											<span>{{ item.label }}</span>
										</SafeExternalLink>
									</li>
								</ul>
							</div>

							<div>
								<SourceList
									:sources="publicRecordSources(candidate)"
									compact
									title="Official and public record links"
									note="Shown here as linked source material, not summarized into a score or ranking."
								/>
							</div>

							<div>
								<SourceList
									:sources="financeSources(candidate)"
									compact
									title="Finance and disclosure links"
									note="Included as context deep dives outside the default side-by-side frame."
								/>
							</div>

							<div>
								<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
									Candidate-quoted issue context
								</p>
								<div class="mt-3 space-y-3">
									<article v-for="statement in candidate.publicStatements" :key="statement.id" class="p-4 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
										<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
											{{ statement.title }}
										</p>
										<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
											{{ statement.summary }}
										</p>
										<div class="mt-3">
											<SourceDrawer :sources="statement.sources" :title="statement.title" button-label="Sources" />
										</div>
									</article>
								</div>
							</div>
						</div>
					</article>
				</div>
			</ExpandableSection>
		</template>
	</section>
</template>
