import type {
	BallotPlanSelection,
	BallotViewMode,
	ElectionSummary,
	LocationLookupResponse,
	LocationSelection,
	NationwideLookupResultContext,
	PlannedMeasureDecision
} from "~/types/civic";
import type { LookupContextState } from "~/utils/guide-entry";
import { defineStore } from "pinia";
import {
	sanitizeLocationSelectionForStorage,
	sanitizeNationwideLookupResultForStorage
} from "~/utils/civic-storage-privacy";
import { buildLookupContextState, deriveCivicLookupStateUpdate } from "~/utils/nationwide-results";

const civicStorageKey = "ballot-clarity:civic-store";

interface CivicStoreSnapshot {
	ballotPlan: Record<string, BallotPlanSelection>;
	ballotViewMode: BallotViewMode;
	compareList: string[];
	lookupContext: LookupContextState | null;
	nationwideLookupResult: NationwideLookupResultContext | null;
	selectedElection: ElectionSummary | null;
	selectedIssues: string[];
	selectedLocation: LocationSelection | null;
}

function defaultSnapshot(): CivicStoreSnapshot {
	return {
		ballotPlan: {},
		ballotViewMode: "quick",
		compareList: [],
		lookupContext: null,
		nationwideLookupResult: null,
		selectedElection: null,
		selectedIssues: [],
		selectedLocation: null
	};
}

export function normalizeCompareSlugs(slugs: readonly string[]) {
	return Array.from(new Set(
		slugs
			.map(slug => slug.trim())
			.filter(Boolean)
	)).slice(0, 3);
}

export function parseCompareQuerySlugs(value: string | readonly (string | null)[] | null | undefined) {
	const rawValues = Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: typeof value === "string"
			? [value]
			: [];

	return normalizeCompareSlugs(rawValues.flatMap(item => item.split(",")));
}

export function buildCompareRoute(slugs: readonly string[]) {
	const normalized = normalizeCompareSlugs(slugs);

	return normalized.length
		? {
				path: "/compare",
				query: {
					slugs: normalized.join(",")
				}
			}
		: {
				path: "/compare"
			};
}

export function toggleCompareSelection(currentSlugs: readonly string[], slug: string) {
	const normalized = normalizeCompareSlugs(currentSlugs);

	if (normalized.includes(slug))
		return normalized.filter(item => item !== slug);

	if (normalized.length >= 3)
		return normalized;

	return [...normalized, slug];
}

export function buildCompareLaunchSlugs(currentSlugs: readonly string[], slug?: string) {
	if (!slug)
		return normalizeCompareSlugs(currentSlugs);

	return normalizeCompareSlugs(
		normalizeCompareSlugs(currentSlugs).includes(slug)
			? [...currentSlugs]
			: [...currentSlugs, slug]
	);
}

function readSnapshot(): CivicStoreSnapshot {
	if (!import.meta.client)
		return defaultSnapshot();

	try {
		const raw = window.localStorage.getItem(civicStorageKey);

		if (!raw)
			return defaultSnapshot();

		const parsed = JSON.parse(raw) as Partial<CivicStoreSnapshot>;

		return {
			...defaultSnapshot(),
			...parsed,
			ballotPlan: parsed.ballotPlan ?? {},
			nationwideLookupResult: sanitizeNationwideLookupResultForStorage(parsed.nationwideLookupResult),
			selectedLocation: sanitizeLocationSelectionForStorage(parsed.selectedLocation)
		};
	}
	catch {
		return defaultSnapshot();
	}
}

export const useCivicStore = defineStore("civic", {
	state: () => ({
		ballotPlan: {} as Record<string, BallotPlanSelection>,
		ballotViewMode: "quick" as BallotViewMode,
		compareList: [] as string[],
		isHydrated: false,
		lookupContext: null as LookupContextState | null,
		nationwideLookupResult: null as NationwideLookupResultContext | null,
		selectedElection: null as ElectionSummary | null,
		selectedIssues: [] as string[],
		selectedLocation: null as LocationSelection | null,
	}),
	getters: {
		ballotPlanCount: state => Object.keys(state.ballotPlan).length,
		compareCount: state => state.compareList.length,
	},
	actions: {
		clearBallotPlan() {
			this.ballotPlan = {};
			this.persist();
		},
		clearCompare() {
			this.compareList = [];
			this.persist();
		},
		clearIssues() {
			this.selectedIssues = [];
			this.persist();
		},
		clearPlannedContest(contestSlug: string) {
			const nextPlan = { ...this.ballotPlan };
			delete nextPlan[contestSlug];
			this.ballotPlan = nextPlan;
			this.persist();
		},
		hydrateFromStorage() {
			this.isHydrated = false;
			const snapshot = readSnapshot();
			this.ballotPlan = snapshot.ballotPlan;
			this.ballotViewMode = snapshot.ballotViewMode;
			this.compareList = normalizeCompareSlugs(snapshot.compareList);
			this.lookupContext = snapshot.lookupContext ?? null;
			this.nationwideLookupResult = snapshot.nationwideLookupResult
				? {
						...snapshot.nationwideLookupResult,
						ballotContentPreviews: snapshot.nationwideLookupResult.ballotContentPreviews ?? [],
						selectionOptions: snapshot.nationwideLookupResult.selectionOptions ?? []
					}
				: null;
			this.selectedElection = snapshot.selectedElection;
			this.selectedIssues = snapshot.selectedIssues;
			this.selectedLocation = sanitizeLocationSelectionForStorage(snapshot.selectedLocation);
			this.persist();
		},
		markHydrated() {
			this.isHydrated = true;
		},
		persist() {
			if (!import.meta.client)
				return;

			window.localStorage.setItem(civicStorageKey, JSON.stringify({
				ballotPlan: this.ballotPlan,
				ballotViewMode: this.ballotViewMode,
				compareList: this.compareList,
				lookupContext: this.lookupContext,
				nationwideLookupResult: sanitizeNationwideLookupResultForStorage(this.nationwideLookupResult),
				selectedElection: this.selectedElection,
				selectedIssues: this.selectedIssues,
				selectedLocation: sanitizeLocationSelectionForStorage(this.selectedLocation)
			} satisfies CivicStoreSnapshot));
		},
		removeFromCompare(slug: string) {
			this.compareList = this.compareList.filter(item => item !== slug);
			this.persist();
		},
		replaceCompare(slugs: string[]) {
			this.compareList = normalizeCompareSlugs(slugs);
			this.persist();
		},
		setLookupContext(lookupContext: LookupContextState | null) {
			this.lookupContext = lookupContext;
			this.persist();
		},
		setLookupResponse(response: LocationLookupResponse, election?: ElectionSummary | null) {
			const update = deriveCivicLookupStateUpdate(response, election);

			this.lookupContext = update.lookupContext;
			this.nationwideLookupResult = update.nationwideLookupResult;
			this.selectedLocation = sanitizeLocationSelectionForStorage(update.selectedLocation);

			if (election)
				this.selectedElection = election;

			this.persist();
		},
		setNationwideLookupResult(nationwideLookupResult: NationwideLookupResultContext | null) {
			this.nationwideLookupResult = nationwideLookupResult;

			if (nationwideLookupResult) {
				this.lookupContext = buildLookupContextState(nationwideLookupResult);
				this.selectedLocation = null;

				if (nationwideLookupResult.election)
					this.selectedElection = nationwideLookupResult.election;
			}

			this.persist();
		},
		selectCandidateForPlan(contestSlug: string, candidateSlug: string) {
			this.ballotPlan = {
				...this.ballotPlan,
				[contestSlug]: {
					candidateSlug,
					contestSlug,
					savedAt: new Date().toISOString(),
					type: "candidate"
				}
			};
			this.persist();
		},
		selectMeasureForPlan(contestSlug: string, measureSlug: string, decision: PlannedMeasureDecision) {
			this.ballotPlan = {
				...this.ballotPlan,
				[contestSlug]: {
					contestSlug,
					decision,
					measureSlug,
					savedAt: new Date().toISOString(),
					type: "measure"
				}
			};
			this.persist();
		},
		setElection(election: ElectionSummary | null) {
			this.selectedElection = election;
			this.persist();
		},
		setLocation(location: LocationSelection | null) {
			const shouldPreserveLookupResult = Boolean(
				location
				&& this.nationwideLookupResult?.result === "resolved"
				&& this.nationwideLookupResult.location?.slug === location.slug
				&& this.nationwideLookupResult.guideAvailability === "published"
				&& !this.nationwideLookupResult.guideContent?.verifiedContestPackage
			);

			this.selectedLocation = location;

			if (location && !shouldPreserveLookupResult) {
				this.nationwideLookupResult = null;
			}

			this.persist();
		},
		setGuideSurfaceContext(
			election: ElectionSummary | null,
			location: LocationSelection | null,
			guideContent?: LocationLookupResponse["guideContent"] | null
		) {
			const shouldPreserveLookupResult = Boolean(
				location
				&& this.nationwideLookupResult?.result === "resolved"
				&& (this.nationwideLookupResult.location?.slug === location.slug || this.nationwideLookupResult.electionSlug === election?.slug)
				&& guideContent?.publishedGuideShell
				&& !guideContent.verifiedContestPackage
			);

			this.selectedElection = election;
			this.selectedLocation = sanitizeLocationSelectionForStorage(location);
			this.nationwideLookupResult = shouldPreserveLookupResult ? this.nationwideLookupResult : null;
			this.lookupContext = location && election
				? {
						guideAvailability: guideContent?.publishedGuideShell ? "published" : "not-published",
						hasPublishedGuideShell: Boolean(guideContent?.publishedGuideShell),
						hasVerifiedContestPackage: Boolean(guideContent?.verifiedContestPackage),
						result: "resolved"
					}
				: null;
			this.persist();
		},
		setBallotViewMode(mode: BallotViewMode) {
			this.ballotViewMode = mode;
			this.persist();
		},
		toggleCompare(slug: string) {
			this.compareList = toggleCompareSelection(this.compareList, slug);
			this.persist();
		},
		toggleIssue(issue: string) {
			if (this.selectedIssues.includes(issue)) {
				this.selectedIssues = this.selectedIssues.filter(item => item !== issue);
				this.persist();
				return;
			}

			this.selectedIssues = [...this.selectedIssues, issue];
			this.persist();
		},
	},
});
