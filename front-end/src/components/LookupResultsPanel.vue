<script setup lang="ts">
import type {
	LocationLookupAction,
	LocationLookupSelectionOption,
	NationwideLookupResultContext
} from "~/types/civic";
import { buildLookupPresentation, filterLookupActionsForPresentation } from "~/utils/location-lookup";
import { buildNationwideDistrictHref, buildNationwideRepresentativeHref } from "~/utils/lookup-links";
import { buildNationwideRouteTarget } from "~/utils/nationwide-route-context";
import { resolveRepresentativePresentation } from "~/utils/representative-presentation";

const props = defineProps<{
	compact?: boolean;
	lookup: NationwideLookupResultContext;
}>();

const emit = defineEmits<{
	openGuide: [action: LocationLookupAction];
	selectOption: [option: LocationLookupSelectionOption];
}>();
const { formatDate } = useFormatters();
const NuxtLinkComponent = resolveComponent("NuxtLink");

const externalHrefPattern = /^https?:\/\//;

function isExternalHref(href: string) {
	return externalHrefPattern.test(href);
}

const lookupResolution = computed(() => ({
	electionSlug: props.lookup.electionSlug,
	guideContent: props.lookup.guideContent,
	guideAvailability: props.lookup.guideAvailability,
	location: props.lookup.location ?? undefined,
	result: props.lookup.result
}));
const lookupPresentation = computed(() => buildLookupPresentation(lookupResolution.value));
const visibleLookupActions = computed(() => filterLookupActionsForPresentation(props.lookup.actions, lookupResolution.value));
const selectionOptions = computed(() => props.lookup.selectionOptions ?? []);
const hasSelectionOptions = computed(() => selectionOptions.value.length > 0);
const electionLogistics = computed(() => props.lookup.electionLogistics);
const ballotContentPreviews = computed(() => props.lookup.ballotContentPreviews ?? []);
const hasBallotContentPreviews = computed(() => ballotContentPreviews.value.length > 0);
const primaryAvailabilityIds = new Set(["official-logistics", "representatives", "local-guide"]);
const hasElectionLogistics = computed(() => Boolean(
	electionLogistics.value
	&& (
		electionLogistics.value.electionName
		|| electionLogistics.value.electionDay
		|| electionLogistics.value.pollingLocations.length
		|| electionLogistics.value.earlyVoteSites.length
		|| electionLogistics.value.dropOffLocations.length
		|| electionLogistics.value.candidatePreviews?.length
		|| electionLogistics.value.additionalElectionNames.length
		|| electionLogistics.value.mailOnly
	)
));
const availabilityItems = computed(() => {
	if (!props.lookup.availability)
		return [];

	return [
		{
			actionLabel: "Open results",
			href: buildLookupAwareTarget("/results"),
			id: "civic-results",
			item: props.lookup.availability.nationwideCivicResults,
		},
		{
			actionLabel: "Open logistics",
			href: buildOfficialLogisticsHref(),
			id: "official-logistics",
			item: props.lookup.availability.officialLogistics,
		},
		{
			actionLabel: "Open representatives",
			href: props.lookup.representativeMatches.length ? buildLookupAwareTarget("/representatives") : undefined,
			id: "representatives",
			item: props.lookup.availability.representatives,
		},
		{
			actionLabel: props.lookup.guideContent?.verifiedContestPackage ? "Open candidates" : "Review status",
			href: buildCandidateDataHref(),
			id: "ballot-candidates",
			item: props.lookup.availability.ballotCandidates,
		},
		{
			actionLabel: "Open representative pages",
			href: props.lookup.representativeMatches.length ? buildLookupAwareTarget("/representatives") : undefined,
			id: "finance-influence",
			item: props.lookup.availability.financeInfluence,
		},
		{
			actionLabel: props.lookup.guideContent?.verifiedContestPackage ? "Open guide" : "Open overview",
			href: buildLocalGuideHref(),
			id: "local-guide",
			item: props.lookup.availability.fullLocalGuide,
		},
	];
});
const visibleAvailabilityItems = computed(() => availabilityItems.value.filter((card) => {
	if (!card.href || card.item.status === "unavailable")
		return false;

	if (primaryAvailabilityIds.has(card.id))
		return true;

	return card.item.status === "available";
}));
const hasLookupDetails = computed(() => Boolean(
	hasElectionLogistics.value
	|| hasBallotContentPreviews.value
	|| props.lookup.normalizedAddress
	|| props.lookup.districtMatches.length
	|| props.lookup.representativeMatches.length
));

function availabilityTone(status: "available" | "limited" | "unavailable") {
	return status === "available" ? "accent" : status === "limited" ? "warning" : "neutral";
}

function openGuideAction(action: LocationLookupAction) {
	if (action.kind !== "ballot-guide")
		return;

	emit("openGuide", action);
}

function selectLookupOption(option: LocationLookupSelectionOption) {
	emit("selectOption", option);
}

function buildLookupAwareTarget(path: string) {
	return buildNationwideRouteTarget(path, props.lookup);
}

function buildElectionOverviewHref() {
	return props.lookup.electionSlug ? `/elections/${props.lookup.electionSlug}` : undefined;
}

function buildOfficialLogisticsHref() {
	if (!props.lookup.electionSlug)
		return undefined;

	return props.lookup.guideContent?.verifiedContestPackage
		? `/ballot/${props.lookup.electionSlug}#guide-logistics`
		: buildElectionOverviewHref();
}

function buildCandidateDataHref() {
	if (!props.lookup.electionSlug || props.lookup.availability?.ballotCandidates.status === "unavailable")
		return undefined;

	return props.lookup.guideContent?.verifiedContestPackage
		? `/ballot/${props.lookup.electionSlug}#candidate-contests-section`
		: buildElectionOverviewHref();
}

function buildLocalGuideHref() {
	if (!props.lookup.electionSlug)
		return undefined;

	return props.lookup.guideContent?.verifiedContestPackage
		? `/ballot/${props.lookup.electionSlug}`
		: buildElectionOverviewHref();
}

function buildDistrictHref(match: NationwideLookupResultContext["districtMatches"][number]) {
	return buildNationwideDistrictHref(match, props.lookup);
}

function buildRepresentativeHref(match: NationwideLookupResultContext["representativeMatches"][number]) {
	return buildNationwideRepresentativeHref(match, props.lookup);
}

function getRepresentativePresentation(match: NationwideLookupResultContext["representativeMatches"][number]) {
	return resolveRepresentativePresentation(match, props.lookup.location?.state);
}
</script>

<template>
	<div class="mt-5 p-4 border border-app-line rounded-3xl bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/60">
		<p class="text-xs text-app-muted tracking-[0.2em] font-semibold uppercase dark:text-app-muted-dark">
			{{ lookupPresentation.heading }}
		</p>
		<p class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
			{{ lookup.note }}
		</p>
		<div v-if="lookup.result === 'resolved'" class="mt-4 flex flex-wrap gap-2">
			<VerificationBadge
				:label="lookup.detectedFromIp ? 'IP-based location guess' : lookup.inputKind === 'address' ? 'Address lookup' : 'ZIP lookup'"
				:tone="lookup.detectedFromIp || lookup.inputKind === 'zip' ? 'warning' : 'accent'"
			/>
			<VerificationBadge :label="lookupPresentation.availabilityBadgeLabel" tone="accent" />
			<VerificationBadge
				:label="hasSelectionOptions ? 'Selection required' : lookup.representativeMatches.length ? `${lookup.representativeMatches.length} representative match${lookup.representativeMatches.length === 1 ? '' : 'es'}` : 'No representative match yet'"
				:tone="hasSelectionOptions ? 'warning' : lookup.representativeMatches.length ? 'accent' : 'neutral'"
			/>
		</div>
		<p v-if="lookupPresentation.supportingNote" class="text-xs text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
			{{ lookupPresentation.supportingNote }}
		</p>
		<div v-if="hasSelectionOptions" class="mt-4 gap-3 grid md:grid-cols-2">
			<article
				v-for="option in selectionOptions"
				:key="option.id"
				class="p-4 border border-app-line rounded-2xl bg-white dark:border-app-line-dark dark:bg-app-panel-dark"
			>
				<div class="flex flex-wrap gap-2 items-center">
					<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
						{{ option.label }}
					</p>
					<VerificationBadge
						:label="option.guideAvailability === 'published' ? 'Election overview available' : 'Results available'"
						:tone="option.guideAvailability === 'published' ? 'accent' : 'neutral'"
					/>
					<VerificationBadge
						:label="option.representativeMatches?.length ? `${option.representativeMatches.length} representative match${option.representativeMatches.length === 1 ? '' : 'es'}` : 'Representative data pending'"
						:tone="option.representativeMatches?.length ? 'accent' : 'neutral'"
					/>
				</div>
				<p class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
					{{ option.description }}
				</p>
				<ul v-if="option.districtMatches?.length" class="mt-3 space-y-2">
					<li
						v-for="match in option.districtMatches"
						:key="`${option.id}-${match.id}`"
						class="text-sm text-app-muted leading-6 dark:text-app-muted-dark"
					>
						<span class="text-app-ink font-semibold dark:text-app-text-dark">{{ match.label }}</span>
						<span class="text-xs tracking-[0.12em] ml-2 uppercase">{{ match.sourceSystem }}</span>
					</li>
				</ul>
				<div class="mt-4 flex flex-wrap gap-3">
					<button
						type="button"
						class="btn-primary"
						@click="selectLookupOption(option)"
					>
						<span class="i-carbon-arrow-right" />
						Use this area
					</button>
				</div>
			</article>
		</div>
		<div
			v-if="visibleAvailabilityItems.length"
			:class="compact ? 'mt-4 grid grid-cols-1 gap-3' : 'mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-stretch auto-rows-fr'"
		>
			<component
				:is="card.href ? NuxtLinkComponent : 'article'"
				v-for="card in visibleAvailabilityItems"
				:key="card.id"
				v-bind="card.href ? { to: card.href } : {}"
				class="group surface-row h-full transition"
				:class="card.href ? 'focus-ring hover:border-app-accent hover:shadow-[0_18px_38px_-28px_rgba(16,37,62,0.58)] hover:-translate-y-0.5 dark:hover:border-app-accent' : ''"
			>
				<div class="flex flex-wrap gap-2 items-start justify-between">
					<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
						{{ card.item.label }}
					</p>
					<VerificationBadge :label="card.item.status" :tone="availabilityTone(card.item.status)" />
				</div>
				<p class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
					{{ card.item.detail }}
				</p>
				<p
					v-if="card.href"
					class="dark:text-app-accent-dark text-xs text-app-accent tracking-[0.14em] font-semibold mt-4 inline-flex gap-2 uppercase items-center"
				>
					{{ card.actionLabel }}
					<span class="i-carbon-arrow-right transition group-hover:translate-x-0.5" />
				</p>
			</component>
		</div>
		<div v-if="visibleLookupActions.length" class="mt-4 gap-3 grid">
			<div
				v-for="action in visibleLookupActions"
				:key="action.id"
				class="surface-row"
			>
				<div class="flex flex-wrap gap-2 items-center">
					<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
						{{ action.title }}
					</p>
					<span
						v-if="action.badge"
						class="text-[11px] text-app-muted tracking-[0.16em] font-semibold px-2 py-1 border border-app-line rounded-full uppercase dark:text-app-muted-dark dark:border-app-line-dark"
					>
						{{ action.badge }}
					</span>
				</div>
				<p class="text-sm text-app-muted leading-6 mt-2 dark:text-app-muted-dark">
					{{ action.description }}
				</p>
				<div class="mt-4 flex flex-wrap gap-3">
					<button
						v-if="action.kind === 'ballot-guide'"
						type="button"
						class="btn-primary"
						@click="openGuideAction(action)"
					>
						<span class="i-carbon-arrow-right" />
						{{ lookupPresentation.guideActionLabel }}
					</button>
					<SafeExternalLink
						v-else-if="action.url"
						:href="action.url"
						class="btn-secondary"
					>
						<span class="i-carbon-launch" />
						Open official tool
					</SafeExternalLink>
				</div>
			</div>
		</div>
		<details v-if="hasLookupDetails" class="mt-4 surface-inset">
			<summary class="text-sm text-app-ink font-semibold cursor-pointer dark:text-app-text-dark focus-ring">
				Show districts, representatives, and provider details
			</summary>
			<p class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
				These details are useful for verification, but the action cards above are the fastest path to the next page.
			</p>

			<div v-if="hasElectionLogistics && electionLogistics" class="mt-4 gap-4 grid">
				<div class="surface-inset">
					<div class="flex flex-wrap gap-2 items-center">
						<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
							Official election logistics
						</p>
						<VerificationBadge label="Google Civic" tone="accent" />
					</div>
					<div class="mt-4 flex flex-wrap gap-3 items-center">
						<p v-if="electionLogistics.electionName" class="text-lg text-app-ink font-semibold dark:text-app-text-dark">
							{{ electionLogistics.electionName }}
						</p>
						<p v-if="electionLogistics.electionDay" class="text-sm text-app-muted dark:text-app-muted-dark">
							{{ formatDate(electionLogistics.electionDay) }}
						</p>
						<VerificationBadge v-if="electionLogistics.mailOnly" label="Mail-only precinct" tone="warning" />
					</div>
					<p v-if="electionLogistics.normalizedAddress" class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
						Structured logistics returned for {{ electionLogistics.normalizedAddress }}.
					</p>
					<p class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
						{{ electionLogistics.officialSourceNote }}
					</p>
					<div class="mt-4 gap-4 grid lg:grid-cols-3">
						<article
							v-for="section in [
								{ id: 'polling', items: electionLogistics.pollingLocations, title: 'Polling locations' },
								{ id: 'early', items: electionLogistics.earlyVoteSites, title: 'Early vote sites' },
								{ id: 'dropoff', items: electionLogistics.dropOffLocations, title: 'Ballot drop-off locations' },
							]"
							v-show="section.items.length"
							:key="section.id"
							class="p-4 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70"
						>
							<h3 class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								{{ section.title }}
							</h3>
							<ul class="mt-3 space-y-3">
								<li v-for="site in section.items.slice(0, 3)" :key="site.id" class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
									<p class="text-app-ink font-semibold dark:text-app-text-dark">
										{{ site.name }}
									</p>
									<p>{{ site.address }}</p>
									<p v-if="site.note">
										{{ site.note }}
									</p>
								</li>
							</ul>
						</article>
					</div>
					<div v-if="electionLogistics.additionalElectionNames.length" class="mt-4">
						<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
							Additional elections
						</p>
						<ul class="mt-2 space-y-2">
							<li v-for="name in electionLogistics.additionalElectionNames" :key="name" class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
								{{ name }}
							</li>
						</ul>
					</div>
					<div v-if="electionLogistics.candidatePreviews?.length && !hasBallotContentPreviews" class="mt-4">
						<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
							Candidate previews from Google Civic
						</p>
						<ul class="mt-3 gap-3 grid sm:grid-cols-2">
							<li
								v-for="candidate in electionLogistics.candidatePreviews.slice(0, 4)"
								:key="candidate.id"
								class="p-3 rounded-2xl bg-app-bg flex gap-3 items-start dark:bg-app-bg-dark/70"
							>
								<ProfileImageStack
									v-if="candidate.profileImages?.length"
									:images="candidate.profileImages"
									:name="candidate.name"
									size="sm"
								/>
								<div class="min-w-0">
									<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
										{{ candidate.name }}
									</p>
									<p class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
										{{ [candidate.party, candidate.office].filter(Boolean).join(' · ') }}
									</p>
									<SafeExternalLink
										v-if="candidate.candidateUrl"
										:href="candidate.candidateUrl"
										class="text-app-accent underline underline-offset-3 inline-flex gap-2 items-center"
									>
										Candidate link
										<span class="i-carbon-launch" />
									</SafeExternalLink>
								</div>
							</li>
						</ul>
					</div>
				</div>
			</div>
			<div v-if="hasBallotContentPreviews" class="mt-4 gap-4 grid">
				<article
					v-for="preview in ballotContentPreviews"
					:key="preview.id"
					class="surface-row"
				>
					<div class="flex flex-wrap gap-2 items-center">
						<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
							Provider ballot preview
						</p>
						<VerificationBadge :label="preview.providerLabel" tone="accent" />
						<VerificationBadge label="Needs official verification" tone="warning" />
					</div>
					<div class="mt-4 flex flex-wrap gap-3 items-center">
						<p class="text-lg text-app-ink font-semibold dark:text-app-text-dark">
							{{ preview.contestCount }} contest{{ preview.contestCount === 1 ? '' : 's' }} returned
						</p>
						<VerificationBadge :label="`${preview.candidateCount} candidate${preview.candidateCount === 1 ? '' : 's'}`" />
						<VerificationBadge v-if="preview.measureCount" :label="`${preview.measureCount} measure${preview.measureCount === 1 ? '' : 's'}`" />
					</div>
					<p class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
						{{ preview.disclaimer }}
					</p>
					<SafeExternalLink
						v-if="preview.verificationResource"
						:href="preview.verificationResource.url"
						class="text-sm text-app-accent mt-3 underline underline-offset-3 inline-flex gap-2 items-center"
					>
						{{ preview.verificationResourceLabel || `Verify with ${preview.verificationResource.label}` }}
						<span class="i-carbon-launch" />
					</SafeExternalLink>
					<div class="mt-4 gap-3 grid md:grid-cols-2">
						<article
							v-for="contest in preview.contests.slice(0, 6)"
							:key="contest.id"
							class="p-4 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70"
						>
							<div class="flex flex-wrap gap-2 items-center">
								<h3 class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
									{{ contest.title }}
								</h3>
								<VerificationBadge v-if="contest.type" :label="contest.type" />
							</div>
							<p v-if="contest.districtName" class="text-xs text-app-muted leading-5 mt-2 dark:text-app-muted-dark">
								{{ contest.districtName }}
							</p>
							<ul v-if="contest.candidates.length" class="mt-3 space-y-2">
								<li
									v-for="candidate in contest.candidates.slice(0, 4)"
									:key="candidate.id"
									class="text-sm text-app-muted leading-6 dark:text-app-muted-dark"
								>
									<span class="text-app-ink font-semibold dark:text-app-text-dark">{{ candidate.name }}</span>
									<span v-if="candidate.party"> · {{ candidate.party }}</span>
									<span v-if="candidate.orderOnBallot"> · ballot order {{ candidate.orderOnBallot }}</span>
								</li>
							</ul>
							<div v-if="contest.referendum" class="text-sm text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
								<p v-if="contest.referendum.title" class="text-app-ink font-semibold dark:text-app-text-dark">
									{{ contest.referendum.title }}
								</p>
								<p v-if="contest.referendum.brief">
									{{ contest.referendum.brief }}
								</p>
								<p v-if="contest.referendum.responses.length">
									Responses: {{ contest.referendum.responses.join(', ') }}
								</p>
								<SafeExternalLink
									v-if="contest.referendum.url"
									:href="contest.referendum.url"
									class="text-app-accent underline underline-offset-3 inline-flex gap-2 items-center"
								>
									Open measure record
									<span class="i-carbon-launch" />
								</SafeExternalLink>
							</div>
							<p v-if="contest.sourceLabels.length" class="text-xs text-app-muted leading-5 mt-3 dark:text-app-muted-dark">
								Source: {{ contest.sourceLabels.join(', ') }}
							</p>
						</article>
					</div>
				</article>
			</div>
			<div v-if="lookup.normalizedAddress || lookup.districtMatches.length || lookup.representativeMatches.length" class="mt-4 gap-4 grid lg:grid-cols-2">
				<div v-if="lookup.districtMatches.length" class="surface-row">
					<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
						Matched districts
					</p>
					<p v-if="lookup.normalizedAddress" class="text-sm text-app-muted leading-6 mt-2 dark:text-app-muted-dark">
						{{ lookup.normalizedAddress }}
					</p>
					<ul class="mt-3 space-y-2">
						<li v-for="match in lookup.districtMatches" :key="match.id" class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
							<NuxtLink
								:to="buildDistrictHref(match)"
								class="text-app-ink font-semibold underline decoration-transparent underline-offset-3 transition dark:text-app-text-dark focus-visible:text-app-accent hover:text-app-accent focus-visible:decoration-current hover:decoration-current"
							>
								{{ match.label }}
							</NuxtLink>
							<span class="text-xs tracking-[0.12em] ml-2 uppercase">{{ match.sourceSystem }}</span>
						</li>
					</ul>
					<p v-if="lookup.fromCache" class="text-xs text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
						Loaded from the local lookup cache.
					</p>
				</div>
				<div v-if="lookup.representativeMatches.length" class="surface-row">
					<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
						Current representatives
					</p>
					<ul class="mt-3 space-y-3">
						<li v-for="match in lookup.representativeMatches" :key="match.id" class="text-sm text-app-muted leading-6 dark:text-app-muted-dark">
							<div class="flex gap-3 items-start">
								<ProfileImageStack
									v-if="match.profileImages?.length"
									:images="match.profileImages"
									:name="match.name"
									size="sm"
								/>
								<div class="min-w-0">
									<div class="flex flex-wrap gap-2 items-center">
										<NuxtLink
											:to="buildRepresentativeHref(match)"
											class="text-app-ink font-semibold underline decoration-transparent underline-offset-3 transition dark:text-app-text-dark focus-visible:text-app-accent hover:text-app-accent focus-visible:decoration-current hover:decoration-current"
										>
											{{ match.name }}
										</NuxtLink>
										<VerificationBadge :label="getRepresentativePresentation(match).levelLabel" tone="accent" />
										<span v-if="match.party" class="text-xs tracking-[0.12em] uppercase">{{ match.party }}</span>
										<VerificationBadge :label="match.sourceSystem" />
									</div>
									<p>{{ getRepresentativePresentation(match).officeDisplayLabel }}</p>
								</div>
							</div>
							<SafeExternalLink
								v-if="match.openstatesUrl"
								:href="match.openstatesUrl"
								class="text-app-accent underline underline-offset-3 inline-flex gap-2 items-center"
							>
								Open record
								<span v-if="isExternalHref(match.openstatesUrl)" class="i-carbon-launch" />
							</SafeExternalLink>
						</li>
					</ul>
				</div>
			</div>
		</details>
		<div v-if="lookupPresentation.canOpenGuide && lookup.location && lookup.electionSlug && !availabilityItems.length" class="mt-4 flex flex-wrap gap-3">
			<button
				type="button"
				class="btn-primary"
				@click="openGuideAction({
					description: 'Open the local guide for this lookup.',
					electionSlug: lookup.electionSlug,
					id: `lookup-guide-${lookup.location.slug}`,
					kind: 'ballot-guide',
					location: lookup.location,
					title: lookup.location.displayName,
				})"
			>
				<span class="i-carbon-arrow-right" />
				Open full local guide
			</button>
		</div>
		<p class="text-xs text-app-muted leading-6 mt-4 dark:text-app-muted-dark">
			{{ lookupPresentation.footerNote }}
		</p>
	</div>
</template>
