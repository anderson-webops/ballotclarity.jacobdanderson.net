<script setup lang="ts">
import type {
	GuidePackageChecklistCategoryGroup,
	GuidePackageChecklistItemStatus,
	GuidePackageIssue,
	GuidePackageRecord,
	GuidePackageReviewRecommendation,
	GuidePackageStatus,
} from "~/types/civic";
import { FetchError } from "ofetch";

definePageMeta({
	layout: "admin",
	middleware: "admin"
});

const { data, refresh } = await useAdminGuidePackages();
const { data: session } = await useAdminSession("admin-packages-session");

const draftElectionSlug = ref("2026-fulton-county-general");
const draftJurisdictionSlug = ref("fulton-county-georgia");
const savingId = ref<string | null>(null);
const feedbackMessage = ref("");
const feedbackTone = ref<"error" | "success">("success");
const unpublishReasons = reactive<Record<string, string>>({});
const canPublish = computed(() => session.value?.role === "admin" && Boolean(session.value.mfaEnabledAt));

const statusOptions: GuidePackageStatus[] = ["draft", "in_review", "ready_to_publish"];
const recommendationOptions: GuidePackageReviewRecommendation[] = [
	"publish",
	"publish_with_warnings",
	"needs_revision",
	"do_not_publish",
];

function statusLabel(status: GuidePackageStatus) {
	return status.replaceAll("_", " ");
}

function statusTone(status: GuidePackageStatus) {
	if (status === "published")
		return "accent" as const;

	if (status === "ready_to_publish")
		return "warning" as const;

	return "neutral" as const;
}

function checklistStatusLabel(status: GuidePackageChecklistItemStatus) {
	return status === "not_applicable" ? "not applicable" : status.replaceAll("_", " ");
}

function checklistStatusTone(status: GuidePackageChecklistItemStatus) {
	if (status === "pass")
		return "accent" as const;

	if (status === "warning" || status === "fail")
		return "warning" as const;

	return "neutral" as const;
}

function recommendationLabel(value: GuidePackageReviewRecommendation | undefined) {
	return value ? value.replaceAll("_", " ") : "not set";
}

function recommendationTone(value: GuidePackageReviewRecommendation | undefined) {
	if (value === "publish")
		return "accent" as const;

	if (value === "publish_with_warnings" || value === "needs_revision" || value === "do_not_publish")
		return "warning" as const;

	return "neutral" as const;
}

function guideContentLabel(packageRecord: GuidePackageRecord) {
	if (packageRecord.contentStatus.verifiedContestPackage)
		return "verified local content";

	if (packageRecord.contentStatus.publishedGuideShell)
		return "guide shell published";

	if (packageRecord.contentStatus.officialLogistics)
		return "official logistics only";

	return "not public";
}

function guideContentTone(packageRecord: GuidePackageRecord) {
	return packageRecord.contentStatus.verifiedContestPackage ? "accent" as const : "warning" as const;
}

function guideContentDetail(packageRecord: GuidePackageRecord) {
	const contestStatus = packageRecord.contentStatus.contests.status.replaceAll("_", " ");
	const measureStatus = packageRecord.contentStatus.measures.status.replaceAll("_", " ");

	return `${packageRecord.contentStatus.summary} Contests: ${contestStatus}; measures: ${measureStatus}.`;
}

function evaluationModeLabel(value: string) {
	return value.replaceAll("_", " ");
}

function summarizeBlockingIssues(packageRecord: GuidePackageRecord) {
	if (!packageRecord.diagnostics.blockingIssueCount)
		return "No blocking checklist items are open.";

	return `${packageRecord.diagnostics.blockingIssueCount} blocking checklist item${packageRecord.diagnostics.blockingIssueCount === 1 ? "" : "s"} still need resolution.`;
}

function groupSummary(group: GuidePackageChecklistCategoryGroup) {
	if (!group.items.length)
		return "No rubric items are defined for this category yet.";

	if (!group.failCount && !group.warningCount)
		return "All rubric items currently pass.";

	const parts: string[] = [];

	if (group.failCount)
		parts.push(`${group.failCount} fail${group.failCount === 1 ? "" : "s"}`);

	if (group.warningCount)
		parts.push(`${group.warningCount} warning${group.warningCount === 1 ? "" : "s"}`);

	return parts.join(" · ");
}

function issueTone(issue: GuidePackageIssue) {
	return issue.blocking || issue.severity === "warning"
		? "border-[#E7B9AA] bg-[#FBEEE8] dark:border-[#6D433C] dark:bg-[#3A2421]"
		: "border-app-line/80 bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70";
}

function issueTextTone(issue: GuidePackageIssue) {
	return issue.blocking || issue.severity === "warning"
		? "text-[#8B3A2E] dark:text-[#FFD4CB]"
		: "text-app-ink dark:text-app-text-dark";
}

async function withPackageAction(id: string | null, action: () => Promise<void>) {
	savingId.value = id;
	feedbackMessage.value = "";

	try {
		await action();
		feedbackMessage.value = "Guide package updated.";
		feedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to update guide package."
			: "Unable to update guide package.";
		feedbackTone.value = "error";
	}
	finally {
		savingId.value = null;
	}
}

async function createDraft() {
	await withPackageAction("new-package", async () => {
		await $fetch("/api/admin/packages", {
			body: {
				electionSlug: draftElectionSlug.value,
				jurisdictionSlug: draftJurisdictionSlug.value || undefined,
			},
			method: "POST",
		});
	});
}

async function savePackage(item: GuidePackageRecord) {
	await withPackageAction(item.workflow.id, async () => {
		await $fetch(`/api/admin/packages/${item.workflow.id}`, {
			body: {
				coverageLimits: item.workflow.coverageLimits,
				coverageNotes: item.workflow.coverageNotes,
				reviewNotes: item.workflow.reviewNotes,
				reviewRecommendation: item.workflow.reviewRecommendation,
				status: item.workflow.status === "published" ? undefined : item.workflow.status,
			},
			method: "PATCH",
		});
	});
}

async function publishPackage(item: GuidePackageRecord) {
	await withPackageAction(item.workflow.id, async () => {
		await $fetch(`/api/admin/packages/${item.workflow.id}/publish`, {
			body: {},
			method: "POST",
		});
	});
}

async function unpublishPackage(item: GuidePackageRecord) {
	await withPackageAction(item.workflow.id, async () => {
		await $fetch(`/api/admin/packages/${item.workflow.id}/unpublish`, {
			body: {
				reason: unpublishReasons[item.workflow.id],
			},
			method: "POST",
		});
		unpublishReasons[item.workflow.id] = "";
	});
}

usePageSeo({
	description: "Internal Ballot Clarity guide-package drafting, review, and publication controls.",
	path: "/admin/packages",
	robots: "noindex,nofollow",
	title: "Admin guide packages"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				Guide packages
			</p>
			<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
				Draft, review, and publish local guide packages
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
				Publishing is an editorial decision, not just a successful data assembly step. Use the grouped rubric below to review blockers, warnings, reviewer signoff, and the final publish recommendation before promoting a package.
			</p>
		</header>

		<p
			v-if="feedbackMessage"
			class="text-sm px-4 py-3 rounded-2xl"
			:class="feedbackTone === 'success'
				? 'text-[#0f5b45] bg-[#e6f4ef] dark:text-[#9ae6c2] dark:bg-[#11352c]'
				: 'text-[#8B3A2E] bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]'"
		>
			{{ feedbackMessage }}
		</p>

		<section class="surface-panel">
			<div class="gap-4 grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
				<div class="gap-4 grid md:grid-cols-2">
					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Election slug</span>
						<input
							v-model="draftElectionSlug"
							type="text"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>
					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Jurisdiction slug</span>
						<input
							v-model="draftJurisdictionSlug"
							type="text"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>
				</div>
				<button type="button" class="btn-primary" :disabled="savingId === 'new-package'" @click="createDraft">
					{{ savingId === 'new-package' ? "Generating..." : "Generate draft package" }}
				</button>
			</div>
		</section>

		<section v-if="!(data?.packages?.length ?? 0)" class="surface-panel">
			<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
				No guide packages are in the review queue yet. Generate a draft package to start the rubric and publish workflow.
			</p>
		</section>

		<div class="space-y-5">
			<article v-for="item in data?.packages ?? []" :key="item.workflow.id" class="surface-panel">
				<div class="gap-6 grid xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
					<div class="space-y-6">
						<div>
							<div class="flex flex-wrap gap-2">
								<TrustBadge :label="statusLabel(item.workflow.status)" :tone="statusTone(item.workflow.status)" />
								<TrustBadge :label="`${item.diagnostics.completenessScore}% checklist`" :tone="item.diagnostics.readyToPublish ? 'accent' : 'warning'" />
								<TrustBadge :label="guideContentLabel(item)" :tone="guideContentTone(item)" />
								<TrustBadge :label="recommendationLabel(item.diagnostics.recommendation.final)" :tone="recommendationTone(item.diagnostics.recommendation.final)" />
								<TrustBadge :label="item.diagnostics.readyToPublish ? 'Checklist gate passes' : 'Checklist gate blocked'" :tone="item.diagnostics.readyToPublish ? 'accent' : 'warning'" />
							</div>
							<h2 class="text-3xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
								{{ item.coverageScope.label }}
							</h2>
							<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
								{{ guideContentDetail(item) }} {{ summarizeBlockingIssues(item) }}
							</p>
						</div>

						<div class="mt-5 gap-4 grid md:grid-cols-2 xl:grid-cols-4">
							<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
								<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
									Counts
								</p>
								<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
									{{ item.counts.contests }} contests · {{ item.counts.candidates }} candidates · {{ item.counts.measures }} measures
								</p>
							</div>
							<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
								<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
									Sources
								</p>
								<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
									{{ item.counts.officialResources }} official resources · {{ item.counts.attachedSources }} attached source records
								</p>
							</div>
							<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
								<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
									Guide content
								</p>
								<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
									{{ item.contentStatus.verifiedContestPackage ? "Verified contest package" : "Verified contest package pending" }}
								</p>
							</div>
							<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
								<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
									Rubric
								</p>
								<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
									{{ item.diagnostics.blockers.length }} blockers · {{ item.diagnostics.warnings.length }} warnings · {{ item.diagnostics.rubricVersion }}
								</p>
							</div>
						</div>

						<div class="space-y-4">
							<div
								v-for="group in item.diagnostics.checklistCategories"
								:key="group.id"
								class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70"
							>
								<div class="flex flex-wrap gap-3 items-start justify-between">
									<div>
										<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
											{{ group.label }}
										</p>
										<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
											{{ group.description }}
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<TrustBadge
											v-if="group.failCount"
											:label="`${group.failCount} fail${group.failCount === 1 ? '' : 's'}`"
											tone="warning"
										/>
										<TrustBadge
											v-if="group.warningCount"
											:label="`${group.warningCount} warning${group.warningCount === 1 ? '' : 's'}`"
											tone="warning"
										/>
										<TrustBadge
											v-if="!group.failCount && !group.warningCount"
											label="All pass"
											tone="accent"
										/>
									</div>
								</div>
								<p class="text-xs text-app-muted tracking-[0.16em] font-semibold mt-3 uppercase dark:text-app-muted-dark">
									{{ groupSummary(group) }}
								</p>

								<ul class="readable-list mt-4 space-y-3">
									<li
										v-for="check in group.items"
										:key="check.id"
										class="px-4 py-4 border border-app-line/80 rounded-[1.2rem] bg-white/80 dark:border-app-line-dark dark:bg-app-panel-dark/70"
									>
										<div class="flex flex-wrap gap-3 items-start justify-between">
											<div>
												<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
													{{ check.label }}
												</p>
												<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
													{{ check.detail }}
												</p>
											</div>
											<div class="flex flex-wrap gap-2">
												<TrustBadge :label="checklistStatusLabel(check.status)" :tone="checklistStatusTone(check.status)" />
												<TrustBadge :label="evaluationModeLabel(check.evaluationMode)" tone="neutral" />
												<TrustBadge :label="check.pipelineClass.replaceAll('_', ' ')" tone="neutral" />
											</div>
										</div>

										<div class="mt-4 gap-3 grid md:grid-cols-2">
											<div class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
												<p><span class="text-app-ink font-semibold dark:text-app-text-dark">What to check:</span> {{ check.whatToCheck }}</p>
												<p class="mt-2">
													<span class="text-app-ink font-semibold dark:text-app-text-dark">Why it matters:</span> {{ check.whyItMatters }}
												</p>
											</div>
											<div class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
												<p><span class="text-app-ink font-semibold dark:text-app-text-dark">Pass:</span> {{ check.passStandard }}</p>
												<p class="mt-2">
													<span class="text-app-ink font-semibold dark:text-app-text-dark">Warning:</span> {{ check.warningStandard }}
												</p>
												<p class="mt-2">
													<span class="text-app-ink font-semibold dark:text-app-text-dark">Fail:</span> {{ check.failStandard }}
												</p>
											</div>
										</div>

										<div class="mt-4 gap-3 grid md:grid-cols-2">
											<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
												<span class="text-app-ink font-semibold dark:text-app-text-dark">Auto signal:</span>
												{{ check.autoSignal || "No automated signal is attached." }}
											</p>
											<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
												<span class="text-app-ink font-semibold dark:text-app-text-dark">Reviewer signal:</span>
												{{ check.reviewerSignal || "No reviewer-specific signal is attached." }}
											</p>
										</div>
									</li>
								</ul>
							</div>
						</div>

						<div class="mt-6 flex flex-wrap gap-3">
							<NuxtLink v-if="item.election?.slug && item.workflow.status === 'published'" :to="`/ballot/${item.election.slug}`" class="btn-primary">
								Open public ballot guide
							</NuxtLink>
							<NuxtLink v-if="item.jurisdiction?.slug && item.workflow.status === 'published'" :to="`/locations/${item.jurisdiction.slug}`" class="btn-secondary">
								Open public jurisdiction page
							</NuxtLink>
						</div>
					</div>

					<div class="space-y-4">
						<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
								Recommendation summary
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<TrustBadge :label="`System: ${recommendationLabel(item.diagnostics.recommendation.system)}`" :tone="recommendationTone(item.diagnostics.recommendation.system)" />
								<TrustBadge :label="`Reviewer: ${recommendationLabel(item.diagnostics.recommendation.reviewer)}`" :tone="recommendationTone(item.diagnostics.recommendation.reviewer)" />
								<TrustBadge :label="`Final: ${recommendationLabel(item.diagnostics.recommendation.final)}`" :tone="recommendationTone(item.diagnostics.recommendation.final)" />
							</div>
							<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
								{{ item.diagnostics.recommendation.reason }}
							</p>
						</div>

						<div v-if="item.diagnostics.blockers.length" class="px-4 py-4 border border-[#E7B9AA] rounded-[1.4rem] bg-[#FBEEE8] dark:border-[#6D433C] dark:bg-[#3A2421]">
							<p class="text-xs text-[#8B3A2E] tracking-[0.16em] font-semibold uppercase dark:text-[#FFD4CB]">
								Blockers
							</p>
							<ul class="readable-list mt-4 space-y-3">
								<li v-for="issue in item.diagnostics.blockers" :key="issue.id" class="text-sm text-[#8B3A2E] leading-7 dark:text-[#FFD4CB]">
									<p class="font-semibold">
										{{ issue.title }}
									</p>
									<p class="mt-1">
										{{ issue.summary }}
									</p>
								</li>
							</ul>
						</div>

						<div v-if="item.diagnostics.warnings.length" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
								Warnings
							</p>
							<ul class="readable-list mt-4 space-y-3">
								<li v-for="issue in item.diagnostics.warnings" :key="issue.id" class="px-4 py-4 border rounded-[1.2rem]" :class="issueTone(issue)">
									<p class="text-sm font-semibold" :class="issueTextTone(issue)">
										{{ issue.title }}
									</p>
									<p class="text-xs tracking-[0.16em] font-semibold mt-2 uppercase" :class="issueTextTone(issue)">
										{{ issue.kind.replaceAll('_', ' ') }} · {{ issue.pipelineClass.replaceAll('_', ' ') }}
									</p>
									<p class="text-sm leading-7 mt-3" :class="issueTextTone(issue)">
										{{ issue.summary }}
									</p>
								</li>
							</ul>
						</div>

						<form class="space-y-4" @submit.prevent="savePackage(item)">
							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Status</span>
								<select
									v-model="item.workflow.status"
									:disabled="item.workflow.status === 'published'"
									class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								>
									<option v-if="item.workflow.status === 'published'" value="published">
										Published
									</option>
									<option v-for="status in statusOptions" :key="status" :value="status">
										{{ statusLabel(status) }}
									</option>
								</select>
							</label>

							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Reviewer</span>
								<p class="text-sm text-app-muted mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-13 shadow-sm dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-panel-dark">
									{{ item.workflow.reviewer || "Recorded from the authenticated account when review is saved." }}
								</p>
							</label>

							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Publish recommendation</span>
								<select
									v-model="item.workflow.reviewRecommendation"
									class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								>
									<option :value="undefined">
										Not set
									</option>
									<option v-for="recommendation in recommendationOptions" :key="recommendation" :value="recommendation">
										{{ recommendationLabel(recommendation) }}
									</option>
								</select>
							</label>

							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Review notes</span>
								<textarea
									v-model="item.workflow.reviewNotes"
									rows="4"
									class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-32 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								/>
							</label>

							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Coverage notes</span>
								<textarea
									:value="item.workflow.coverageNotes.join('\n')"
									rows="4"
									class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-32 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
									@input="item.workflow.coverageNotes = String(($event.target as HTMLTextAreaElement).value).split('\n').map(line => line.trim()).filter(Boolean)"
								/>
							</label>

							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Coverage limits</span>
								<textarea
									:value="item.workflow.coverageLimits.join('\n')"
									rows="4"
									class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-32 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
									@input="item.workflow.coverageLimits = String(($event.target as HTMLTextAreaElement).value).split('\n').map(line => line.trim()).filter(Boolean)"
								/>
							</label>

							<div class="flex flex-col gap-3">
								<button type="submit" class="btn-secondary w-full" :disabled="savingId === item.workflow.id">
									{{ savingId === item.workflow.id ? "Saving..." : "Save workflow state" }}
								</button>
								<p v-if="session?.role === 'admin' && !session.mfaEnabledAt" class="text-xs text-app-muted leading-5 dark:text-app-muted-dark">
									Enable multi-factor authentication on the Account page before publishing or unpublishing.
								</p>
								<button v-if="item.workflow.status !== 'published' && canPublish" type="button" class="btn-primary w-full" :disabled="savingId === item.workflow.id" @click="publishPackage(item)">
									Publish package
								</button>
								<label v-if="item.workflow.status === 'published' && canPublish" class="block">
									<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Unpublish reason</span>
									<textarea
										v-model="unpublishReasons[item.workflow.id]"
										rows="3"
										class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-24 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
										placeholder="Explain why this package must return to review."
									/>
								</label>
								<button
									v-if="item.workflow.status === 'published' && canPublish"
									type="button"
									class="btn-secondary w-full"
									:disabled="savingId === item.workflow.id || !unpublishReasons[item.workflow.id]?.trim()"
									@click="unpublishPackage(item)"
								>
									Unpublish package
								</button>
							</div>
						</form>
					</div>
				</div>
			</article>
		</div>
	</section>
</template>
