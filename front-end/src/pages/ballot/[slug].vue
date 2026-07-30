<script setup lang="ts">
import type { Contest } from "~/types/civic";
import { storeToRefs } from "pinia";
import { buildCompareRoute } from "~/stores/civic";

const civicStore = useCivicStore();
const route = useRoute();
const { formatDate, formatDateTime } = useFormatters();
const { ballotPlan, ballotPlanCount, ballotViewMode, compareList, isHydrated, selectedIssues } = storeToRefs(civicStore);

const ballotSlug = useRouteStringParam("slug");
const locationSlug = computed(() => typeof route.query.location === "string" ? route.query.location : undefined);

const { data, error, pending } = await useBallot(ballotSlug, locationSlug);
const effectiveBallotPlan = computed(() => isHydrated.value ? ballotPlan.value : {});
const effectiveBallotPlanCount = computed(() => isHydrated.value ? ballotPlanCount.value : 0);
const effectiveBallotViewMode = computed(() => isHydrated.value ? ballotViewMode.value : "quick");
const effectiveCompareList = computed(() => isHydrated.value ? compareList.value : []);
const effectiveSelectedIssues = computed(() => isHydrated.value ? selectedIssues.value : []);
const showPersistedBallotState = computed(() => isHydrated.value);
const hasVerifiedContestPackage = computed(() => Boolean(data.value?.guideContent?.verifiedContestPackage));
const hasPublishedGuideShell = computed(() => Boolean(data.value?.guideContent?.publishedGuideShell));
const hasContestContent = computed(() => Boolean(data.value?.election.contests.length));
const shellOnlyGuideNote = computed(() => data.value?.guideContent?.summary
	?? "Official election links are current for this area. Verified contest, candidate, and measure pages are still under local review.");

watchEffect(() => {
	if (data.value) {
		civicStore.setGuideSurfaceContext({
			date: data.value.election.date,
			jurisdictionSlug: data.value.election.jurisdictionSlug,
			locationName: data.value.election.locationName,
			name: data.value.election.name,
			slug: data.value.election.slug,
			updatedAt: data.value.election.updatedAt,
		}, data.value.location, data.value.guideContent);
	}
});

usePageSeo({
	description: data.value?.election.description ?? "Review the ballot, candidates, measures, and attached sources.",
	canonicalPath: `/elections/${ballotSlug.value}`,
	path: `/ballot/${ballotSlug.value}`,
	robots: "noindex,follow",
	title: data.value?.election.name ?? "Ballot",
});

const searchQuery = ref("");

const issueOptions = computed(() => {
	const options = new Map<string, string>();

	data.value?.election.contests.forEach((contest) => {
		contest.candidates?.forEach((candidate) => {
			candidate.topIssues.forEach((issue) => {
				options.set(issue.slug, issue.label);
			});
		});
	});

	return Array.from(options.entries()).map(([slug, label]) => ({ label, slug }));
});

const filteredContests = computed<Contest[]>(() => {
	if (!data.value)
		return [];

	const query = searchQuery.value.trim().toLowerCase();

	return data.value.election.contests
		.map((contest) => {
			if (contest.type === "candidate") {
				const candidates = contest.candidates?.filter((candidate) => {
					const matchesQuery = !query || [
						candidate.name,
						candidate.officeSought,
						candidate.party,
						candidate.ballotSummary,
						candidate.topIssues.map(issue => issue.label).join(" "),
					].join(" ").toLowerCase().includes(query);

					const matchesIssue = !effectiveSelectedIssues.value.length
						|| candidate.topIssues.some(issue => effectiveSelectedIssues.value.includes(issue.slug));

					return matchesQuery && matchesIssue;
				}) ?? [];

				return {
					...contest,
					candidates,
				};
			}

			const measures = contest.measures?.filter((measure) => {
				if (!query)
					return true;

				return [
					measure.title,
					measure.ballotSummary,
					measure.plainLanguageExplanation,
					measure.yesMeaning,
					measure.noMeaning,
				].join(" ").toLowerCase().includes(query);
			}) ?? [];

			return {
				...contest,
				measures,
			};
		})
		.filter(contest => (contest.type === "candidate"
			? Boolean(contest.candidates?.length)
			: Boolean(contest.measures?.length)));
});

const filteredCandidateContests = computed(() => filteredContests.value.filter(contest => contest.type === "candidate"));
const filteredMeasureContests = computed(() => filteredContests.value.filter(contest => contest.type === "measure"));

const compareHref = computed(() => buildCompareRoute(effectiveCompareList.value));
const planHref = computed(() => ({
	path: "/plan",
	query: {
		election: ballotSlug.value
	}
}));

const electionOverviewHref = computed(() => data.value ? `/elections/${data.value.election.slug}` : "/ballot");
const jurisdictionHref = computed(() => data.value ? `/locations/${data.value.election.jurisdictionSlug}` : "/");
const ballotCounts = computed(() => {
	if (!data.value) {
		return {
			candidateCount: 0,
			contestCount: 0,
			measureCount: 0,
			sourceLinkedItems: 0
		};
	}

	return data.value.election.contests.reduce((counts, contest) => ({
		candidateCount: counts.candidateCount + (contest.candidates?.length ?? 0),
		contestCount: counts.contestCount + 1,
		measureCount: counts.measureCount + (contest.measures?.length ?? 0),
		sourceLinkedItems: counts.sourceLinkedItems
			+ (contest.candidates?.length ?? 0)
			+ (contest.measures?.length ?? 0)
	}), {
		candidateCount: 0,
		contestCount: 0,
		measureCount: 0,
		sourceLinkedItems: 0
	});
});
const personalizationLabel = computed(() => data.value?.location.lookupInput ?? data.value?.location.displayName ?? "");
const personalizationNote = computed(() => {
	if (!data.value)
		return "Use a full address for the most specific district match.";

	if (data.value.location.lookupMode === "zip-preview")
		return "ZIP-only preview. Confirm district-specific contests in the official election tools.";

	if (data.value.location.lookupMode === "address-verified")
		return "Official provider accepted this address. Ballot Clarity still opens the current guide surface until exact contest packaging is live.";

	if (data.value.location.lookupMode === "address-submitted")
		return "Full address submitted. Official verification is still recommended until exact ballot matching is live.";

	return "Use a full address for the most specific district match.";
});
const guideSummaryItems = computed(() => {
	if (!hasContestContent.value) {
		return [
			{
				label: "Personalized to",
				note: personalizationNote.value,
				value: personalizationLabel.value
			},
			{
				label: "Official links",
				href: "#guide-logistics",
				note: "Election-office links attached to this overview.",
				value: data.value?.election.officialResources.length ?? 0
			},
			{
				label: "Key dates",
				href: "#guide-logistics",
				note: "Calendar items attached to this page.",
				value: data.value?.election.keyDates.length ?? 0
			},
			{
				label: "Guide status",
				note: hasPublishedGuideShell.value
					? "Verified contest pages are still under local review."
					: "No local guide is published for this area yet.",
				value: hasVerifiedContestPackage.value ? "Verified" : hasPublishedGuideShell.value ? "In review" : "Not yet"
			},
		];
	}

	return [
		{
			label: "Personalized to",
			note: personalizationNote.value,
			value: personalizationLabel.value
		},
		{
			label: "Contests",
			href: "#contests-section",
			note: "Total sections in this ballot guide.",
			value: ballotCounts.value.contestCount
		},
		{
			label: "Candidates",
			href: filteredCandidateContests.value.length ? "#candidate-contests-section" : "#contests-section",
			note: "Candidate profiles linked from this ballot.",
			value: ballotCounts.value.candidateCount
		},
		{
			label: "Measures",
			href: filteredMeasureContests.value.length ? "#measure-contests-section" : "#contests-section",
			note: "Measure explainers with yes / no summaries.",
			value: ballotCounts.value.measureCount
		},
		{
			label: "Saved to plan",
			note: showPersistedBallotState.value
				? "Contests currently saved in your checklist."
				: "Saved-plan state appears after this browser syncs.",
			value: showPersistedBallotState.value ? effectiveBallotPlanCount.value : "—"
		}
	];
});
const coverageNotes = computed(() => {
	if (!data.value)
		return [];

	if (!hasContestContent.value) {
		return [
			`This overview is personalized to ${personalizationLabel.value}. ${personalizationNote.value}`,
			shellOnlyGuideNote.value,
			`${data.value.election.officialResources.length} official link${data.value.election.officialResources.length === 1 ? "" : "s"} are attached for election logistics, notices, and office contact details.`,
			`${data.value.election.keyDates.length} key date${data.value.election.keyDates.length === 1 ? "" : "s"} are attached for deadlines and election logistics.`,
			"Verified contest, candidate, and measure pages will appear here after the local review clears."
		];
	}

	return [
		`This ballot is personalized to ${personalizationLabel.value}. ${personalizationNote.value}`,
		...(data.value.guideContent ? [data.value.guideContent.summary] : []),
		`${data.value.election.officialResources.length} official links are attached for election logistics, notices, and office contact details.`,
		`${ballotCounts.value.sourceLinkedItems} contest items in this guide link to attached source records or supporting notes.`,
		`${effectiveBallotPlanCount.value} contest${effectiveBallotPlanCount.value === 1 ? "" : "s"} saved to your ballot plan so far.`,
		"Time-sensitive deadlines, polling logistics, and late campaign activity should still be verified in official election-office notices."
	];
});
const ballotContentsGroups = computed(() => {
	const contests = filteredContests.value.map(contest => ({
		countLabel: contest.type === "candidate"
			? `${contest.candidates?.length ?? 0} candidate${contest.candidates?.length === 1 ? "" : "s"}`
			: `${contest.measures?.length ?? 0} measure${contest.measures?.length === 1 ? "" : "s"}`,
		href: `#${contest.slug}`,
		label: contest.office,
		meta: contest.jurisdiction,
		saved: Boolean(effectiveBallotPlan.value[contest.slug]),
		slug: contest.slug,
		type: contest.type
	}));

	return [
		{
			items: contests.filter(contest => contest.type === "candidate"),
			label: "Offices and races"
		},
		{
			items: contests.filter(contest => contest.type === "measure"),
			label: "Ballot measures"
		}
	].filter(group => group.items.length);
});

function clearFilters() {
	searchQuery.value = "";
	civicStore.clearIssues();
}
</script>

<template>
	<div class="pb-16 space-y-8">
		<ElectionHero
			v-if="data"
			:election="data.election"
			:guide-content="data.guideContent"
			:location="data.location"
			:note="data.note"
		/>

		<section v-if="data && hasContestContent" class="print-only app-shell">
			<div class="print-guide">
				<header class="print-guide-header">
					<p class="print-guide-kicker">
						Ballot Clarity print guide
					</p>
					<h1 class="text-4xl font-serif mt-3">
						{{ data.election.name }}
					</h1>
					<p class="text-sm mt-3">
						{{ data.location.displayName }} · {{ formatDate(data.election.date) }}
					</p>
					<p class="text-sm mt-4">
						What appears on this ballot? This print view keeps each contest in a short, source-aware guide. Use official election office notices for final deadlines, locations, and ballot-return rules.
					</p>
				</header>

				<div class="print-guide-grid mt-6">
					<article v-for="contest in filteredContests" :key="contest.slug" class="print-guide-card">
						<p class="text-xs tracking-[0.2em] font-semibold uppercase">
							{{ contest.office }}
						</p>
						<p class="text-sm mt-2">
							{{ contest.jurisdiction }}
						</p>
						<p class="text-sm mt-3">
							{{ contest.roleGuide.whyItMatters }}
						</p>

						<ul v-if="contest.type === 'candidate'" class="print-guide-list">
							<li v-for="candidate in contest.candidates" :key="candidate.slug">
								<strong>{{ candidate.name }}</strong>
								<span>{{ candidate.party }}<span v-if="candidate.incumbent"> · Incumbent</span></span>
								<span>{{ candidate.ballotSummary }}</span>
							</li>
						</ul>

						<div v-else class="print-guide-list">
							<div v-for="measure in contest.measures" :key="measure.slug">
								<strong>{{ measure.title }}</strong>
								<p class="mt-2">
									{{ measure.plainLanguageExplanation }}
								</p>
								<p class="mt-2">
									<strong>YES:</strong> {{ measure.yesMeaning }}
								</p>
								<p class="mt-1">
									<strong>NO:</strong> {{ measure.noMeaning }}
								</p>
							</div>
						</div>
					</article>
				</div>

				<p class="print-guide-footnote">
					Review original records and official notices before relying on any election information.
				</p>
			</div>
		</section>

		<section v-if="data" class="app-shell print-hidden">
			<div :class="hasContestContent ? 'gap-6 grid 2xl:grid-cols-[minmax(17rem,0.62fr)_minmax(0,1.38fr)]' : 'mx-auto max-w-5xl'">
				<div v-if="hasContestContent && ballotContentsGroups.length" class="self-start space-y-4 2xl:top-24 2xl:sticky">
					<nav
						aria-label="Ballot contents"
						class="surface-panel"
					>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Ballot contents
						</p>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							Jump directly to races and measures, then save choices to your ballot plan.
						</p>
						<div class="mt-5 gap-2 grid">
							<a href="#guide-controls" class="section-nav-link focus-ring">
								<span class="section-nav-link__label">Search and filters</span>
							</a>
							<a href="#guide-logistics" class="section-nav-link focus-ring">
								<span class="section-nav-link__label">Key dates and official links</span>
							</a>
						</div>

						<div v-for="group in ballotContentsGroups" :key="group.label" class="mt-5">
							<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
								{{ group.label }}
							</p>
							<ol class="mt-3 space-y-2">
								<li v-for="item in group.items" :key="item.slug">
									<SafeExternalLink
										:href="item.href"
										:new-tab="false"
										class="p-3 border border-app-line/80 rounded-[1.15rem] bg-app-bg/55 flex gap-3 transition items-start justify-between dark:border-app-line-dark hover:border-app-accent/60 dark:bg-app-bg-dark/70 focus-ring"
									>
										<div class="min-w-0">
											<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
												{{ item.label }}
											</p>
											<p class="text-xs text-app-muted leading-6 mt-1 dark:text-app-muted-dark">
												{{ item.meta }}
											</p>
										</div>
										<div class="text-right flex flex-col gap-2 items-end">
											<span class="text-[11px] text-app-muted font-semibold px-2.5 py-1 rounded-full bg-white whitespace-nowrap dark:text-app-muted-dark dark:bg-app-panel-dark">
												{{ item.countLabel }}
											</span>
											<span
												class="text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex gap-1 whitespace-nowrap items-center"
												:class="item.saved
													? 'bg-app-accent text-app-action-text'
													: 'bg-app-warm/75 text-app-ink dark:bg-app-bg-dark dark:text-app-text-dark'"
											>
												<span :class="item.saved ? 'i-carbon-checkmark' : 'i-carbon-time'" aria-hidden="true" />
												{{ item.saved ? "Saved" : "Open" }}
											</span>
										</div>
									</SafeExternalLink>
								</li>
							</ol>
						</div>
						<div class="bc-action-cluster mt-6 pt-6 border-t border-app-line/80 dark:border-app-line-dark">
							<NuxtLink :to="planHref" class="btn-primary">
								Open my ballot plan
							</NuxtLink>
							<NuxtLink :to="electionOverviewHref" class="btn-secondary">
								Election overview
							</NuxtLink>
							<NuxtLink :to="jurisdictionHref" class="btn-secondary">
								Location hub
							</NuxtLink>
						</div>
					</nav>
				</div>

				<div class="space-y-6">
					<section id="guide-overview" class="surface-panel scroll-mt-28">
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							{{ hasContestContent ? "Ballot at a glance" : "Election overview" }}
						</p>
						<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
							{{ hasContestContent ? "Showing contests for your districts" : "Official links are live for this area" }}
						</h2>
						<p class="text-sm text-app-muted leading-7 mt-4 max-w-3xl dark:text-app-muted-dark">
							{{ hasContestContent
								? `This guide is personalized to ${personalizationLabel}. It is designed to reduce overload, but district matching and time-sensitive logistics should still be checked against the official election overview.`
								: `This page is personalized to ${personalizationLabel}. Official links and key dates are current here, while verified contest, candidate, and measure pages are still under local review.` }}
						</p>

						<div v-if="hasContestContent" class="mt-6">
							<PageSummaryStrip :items="guideSummaryItems" />
						</div>

						<details v-if="hasContestContent" class="mt-6 surface-row">
							<summary class="text-sm text-app-ink font-semibold cursor-pointer dark:text-app-text-dark focus-ring">
								Coverage notes and limits
							</summary>
							<ul class="text-sm text-app-muted leading-7 mt-4 space-y-2 dark:text-app-muted-dark">
								<li v-for="item in coverageNotes" :key="item">
									{{ item }}
								</li>
							</ul>
						</details>

						<InfoCallout v-else title="Verified contest pages pending" tone="warning" class="mt-6">
							Use the official links and key dates below for logistics and deadline checks. Contest, candidate, and measure pages open after the local package is verified.
						</InfoCallout>
					</section>

					<details id="guide-logistics" class="surface-panel scroll-mt-28">
						<summary class="text-sm text-app-ink font-semibold cursor-pointer dark:text-app-text-dark focus-ring">
							Key dates and official links
						</summary>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Key dates and official links
						</p>
						<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
							{{ hasContestContent ? "Use the ballot guide with the election overview" : "Use the official links on this page" }}
						</h2>
						<div class="mt-6 gap-4 grid 2xl:grid-cols-4 sm:grid-cols-2">
							<div v-for="item in data.election.keyDates" :key="item.label" class="p-4 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
								<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
									{{ item.label }}
								</p>
								<p class="text-sm text-app-ink font-semibold mt-3 dark:text-app-text-dark">
									{{ item.date.includes("T") ? formatDateTime(item.date) : formatDate(item.date) }}
								</p>
								<p class="text-xs text-app-muted leading-6 mt-2 dark:text-app-muted-dark">
									{{ item.note || "Review the official notice for details." }}
								</p>
							</div>
						</div>
						<div
							class="mt-6 gap-5 grid"
							:class="hasContestContent ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]' : ''"
						>
							<OfficialResourceList
								:resources="data.election.officialResources"
								:title="hasContestContent ? 'Official notices linked in this guide' : 'Official notices and voter tools'"
								:note="hasContestContent
									? 'The printable ballot guide is useful for reading contests. Use the official notices for time-sensitive logistics.'
									: 'Use these official notices for deadlines, logistics, and final ballot confirmation.'"
							/>
							<div v-if="hasContestContent" class="space-y-4">
								<div class="p-5 rounded-[1.5rem] bg-app-bg dark:bg-app-bg-dark/70">
									<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
										Recent updates
									</p>
									<ul class="mt-4 space-y-3">
										<li v-for="entry in data.election.changeLog" :key="entry.id" class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
											<span class="text-app-ink font-semibold dark:text-app-text-dark">{{ formatDateTime(entry.date) }}</span>
											<span class="text-app-line mx-2 dark:text-app-line-dark">·</span>
											{{ entry.summary }}
										</li>
									</ul>
								</div>
							</div>
						</div>
					</details>

					<section v-if="hasContestContent" id="guide-controls" class="surface-panel scroll-mt-28">
						<div class="gap-6 grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
							<div>
								<label for="ballot-search" class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
									Search this ballot
								</label>
								<div class="mt-3 relative">
									<span class="i-carbon-search text-app-muted pointer-events-none left-4 top-1/2 absolute dark:text-app-muted-dark -translate-y-1/2" />
									<input
										id="ballot-search"
										v-model="searchQuery"
										type="search"
										placeholder="Search candidates, measures, or issues"
										class="text-sm text-app-ink pl-11 pr-4 border border-app-line rounded-full bg-white h-[3.25rem] w-full dark:text-app-text-dark placeholder:text-app-muted dark:border-app-line-dark dark:bg-app-panel-dark focus-ring dark:placeholder:text-app-muted-dark"
									>
								</div>
							</div>

							<div>
								<div class="flex gap-4 items-center justify-between">
									<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
										Filter by issue
									</p>
									<button type="button" class="text-xs text-app-accent font-semibold rounded-full focus-ring" @click="clearFilters">
										Clear filters
									</button>
								</div>
								<div class="mt-3 flex flex-wrap gap-2">
									<button
										v-for="issue in issueOptions"
										:key="issue.slug"
										type="button"
										class="text-xs font-semibold px-3 py-2 border rounded-full transition focus-ring"
										:class="effectiveSelectedIssues.includes(issue.slug)
											? 'border-app-accent bg-app-accent text-app-action-text'
											: 'border-app-line bg-white text-app-muted hover:border-app-accent hover:text-app-accent dark:border-app-line-dark dark:bg-app-panel-dark dark:text-app-muted-dark'"
										:aria-pressed="effectiveSelectedIssues.includes(issue.slug)"
										@click="civicStore.toggleIssue(issue.slug)"
									>
										<span v-if="effectiveSelectedIssues.includes(issue.slug)" class="i-carbon-checkmark mr-1" aria-hidden="true" />
										{{ issue.label }}
									</button>
								</div>
							</div>
						</div>
					</section>
				</div>
			</div>
		</section>

		<section v-if="pending" class="app-shell space-y-6">
			<div v-for="index in 3" :key="index" class="surface-panel animate-pulse">
				<div class="rounded-full bg-app-line/70 h-6 w-48 dark:bg-app-line-dark" />
				<div class="mt-4 rounded-full bg-app-line/60 h-4 w-full dark:bg-app-line-dark" />
				<div class="mt-2 rounded-full bg-app-line/60 h-4 w-3/4 dark:bg-app-line-dark" />
				<div class="mt-8 gap-4 grid lg:grid-cols-2">
					<div class="rounded-3xl bg-app-line/50 h-56 dark:bg-app-line-dark" />
					<div class="rounded-3xl bg-app-line/50 h-56 dark:bg-app-line-dark" />
				</div>
			</div>
		</section>

		<section v-else-if="error" class="app-shell">
			<InfoCallout title="Unable to load ballot" tone="warning">
				The ballot guide could not be loaded. Refresh the page or return to the home page and try again.
			</InfoCallout>
		</section>

		<section v-else-if="filteredContests.length" id="contests-section" class="app-shell space-y-10">
			<div v-if="filteredCandidateContests.length" id="candidate-contests-section" class="scroll-mt-28 space-y-6">
				<div class="surface-panel">
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
						Candidate contests
					</p>
					<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						Races with candidate profiles
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						These sections group the offices on your ballot where voters are choosing between candidates. Each card links out to deeper profiles when available.
					</p>
				</div>
				<ContestSection
					v-for="(contest, index) in filteredCandidateContests"
					:key="contest.slug"
					:contest="contest"
					:open="index === 0"
					:view-mode="effectiveBallotViewMode"
				/>
			</div>

			<div v-if="filteredMeasureContests.length" id="measure-contests-section" class="scroll-mt-28 space-y-6">
				<div class="surface-panel">
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
						Ballot measures
					</p>
					<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						Questions and measures on this ballot
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						These sections explain what each measure would do, what a yes or no vote means, and which source records are attached to the summary.
					</p>
				</div>
				<ContestSection
					v-for="(contest, index) in filteredMeasureContests"
					:key="contest.slug"
					:contest="contest"
					:open="index === 0 && !filteredCandidateContests.length"
					:view-mode="effectiveBallotViewMode"
				/>
			</div>
		</section>

		<section v-else-if="hasContestContent" class="app-shell">
			<div class="surface-panel text-center">
				<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
					No ballot items match the current filters.
				</h2>
				<p class="text-sm text-app-muted leading-7 mx-auto mt-4 max-w-2xl dark:text-app-muted-dark">
					Try clearing the search field or removing selected issues to restore the full ballot guide.
				</p>
				<button type="button" class="btn-primary mt-6" @click="clearFilters">
					Clear filters
				</button>
			</div>
		</section>

		<section
			v-if="effectiveCompareList.length || effectiveBallotPlanCount"
			class="px-4 bottom-4 left-0 right-0 fixed z-30 print-hidden"
		>
			<div class="mx-auto px-5 py-4 border border-app-line rounded-[1.75rem] bg-white flex flex-col gap-3 max-w-4xl w-full shadow-[0_24px_50px_-36px_rgba(16,37,62,0.7)] dark:border-app-line-dark dark:bg-app-panel-dark sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
						{{ effectiveBallotPlanCount }} contest{{ effectiveBallotPlanCount === 1 ? "" : "s" }} saved · {{ effectiveCompareList.length }} candidate{{ effectiveCompareList.length === 1 ? "" : "s" }} in compare
					</p>
					<p class="text-xs text-app-muted mt-1 dark:text-app-muted-dark">
						Save a choice to your plan as you go, or compare 2 to 3 candidates from the same contest before deciding.
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<NuxtLink :to="planHref" class="btn-secondary">
						Open ballot plan
					</NuxtLink>
					<NuxtLink :to="compareHref" class="btn-primary" :class="{ 'opacity-60 pointer-events-none': effectiveCompareList.length < 2 }">
						Compare selected candidates
					</NuxtLink>
					<button type="button" class="btn-secondary" @click="civicStore.clearCompare()">
						Clear compare list
					</button>
				</div>
			</div>
		</section>
	</div>
</template>
