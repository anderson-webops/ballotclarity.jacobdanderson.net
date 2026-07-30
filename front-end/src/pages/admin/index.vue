<script setup lang="ts">
import type { GuidePackageRecord } from "~/types/civic";

definePageMeta({
	layout: "admin",
	middleware: "admin"
});

const [{ data: overview }, { data: review }, { data: corrections }, { data: sources }, { data: guidePackages }] = await Promise.all([
	useAdminOverview(),
	useAdminReview(),
	useAdminCorrections(),
	useAdminSourceMonitor(),
	useAdminGuidePackages()
]);

const reviewPreview = computed(() => review.value?.items.slice(0, 3) ?? []);
const correctionPreview = computed(() => corrections.value?.corrections.slice(0, 3) ?? []);
const sourcePreview = computed(() => sources.value?.sources.slice(0, 3) ?? []);
const packagePreview = computed(() => guidePackages.value?.packages.slice(0, 2) ?? []);
const security = computed(() => overview.value?.security);
const securityTone = computed(() => security.value?.status === "healthy" ? "accent" as const : "warning" as const);

function packageContentLabel(item: GuidePackageRecord) {
	if (item.contentStatus.verifiedContestPackage)
		return "verified contests";

	if (item.contentStatus.publishedGuideShell)
		return "guide shell only";

	if (item.contentStatus.officialLogistics)
		return "logistics only";

	return "not public";
}

function packageContentTone(item: GuidePackageRecord) {
	return item.contentStatus.verifiedContestPackage ? "accent" as const : "warning" as const;
}

function packageOperationalSummary(item: GuidePackageRecord) {
	const checklist = `${item.diagnostics.completenessScore}% checklist`;
	const blockers = item.diagnostics.blockingIssueCount
		? `${item.diagnostics.blockingIssueCount} blocking check${item.diagnostics.blockingIssueCount === 1 ? "" : "s"} still need resolution.`
		: "No blocking checklist items are currently open.";

	if (!item.contentStatus.verifiedContestPackage)
		return `${item.contentStatus.summary} ${checklist}; ${blockers}`;

	return `${blockers} ${checklist}.`;
}

usePageSeo({
	description: "Internal Ballot Clarity admin dashboard for review, corrections, and source-health operations.",
	path: "/admin",
	robots: "noindex,nofollow",
	title: "Admin dashboard"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				Operational dashboard
			</p>
			<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
				Internal editorial control room
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
				Use this view to keep the public site honest: queue source-backed updates, triage corrections, and identify upstream problems before they affect voter-facing pages.
			</p>
		</header>

		<section class="gap-4 grid md:grid-cols-2 xl:grid-cols-4">
			<article v-for="metric in overview?.metrics ?? []" :key="metric.id" class="surface-panel">
				<p class="text-xs tracking-[0.2em] font-semibold uppercase" :class="metric.tone === 'attention' ? 'text-[#8B3A2E]' : metric.tone === 'healthy' ? 'text-app-accent' : 'text-app-muted dark:text-app-muted-dark'">
					{{ metric.label }}
				</p>
				<p class="text-4xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
					{{ metric.value }}
				</p>
				<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
					{{ metric.helpText }}
				</p>
			</article>
		</section>

		<section v-if="security" class="surface-panel">
			<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
				<div class="max-w-3xl">
					<div class="flex flex-wrap gap-3 items-center">
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Account security
						</p>
						<TrustBadge :label="security.status === 'healthy' ? 'controls complete' : 'security action needed'" :tone="securityTone" />
					</div>
					<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						Admin account controls
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
						{{ security.summary }}
					</p>
				</div>
				<NuxtLink to="/admin/users" class="btn-secondary">
					Manage users
				</NuxtLink>
			</div>

			<div class="mt-6 gap-4 grid md:grid-cols-2 xl:grid-cols-4">
				<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
					<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
						Active users
					</p>
					<p class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						{{ security.activeUserCount }}
					</p>
				</div>
				<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
					<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
						MFA enabled
					</p>
					<p class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						{{ security.mfaEnabledUserCount }}/{{ security.activeUserCount }}
					</p>
				</div>
				<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
					<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
						Password change required
					</p>
					<p class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						{{ security.passwordChangeRequiredUserCount }}
					</p>
				</div>
				<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
					<p class="text-xs text-app-muted tracking-[0.16em] font-semibold uppercase dark:text-app-muted-dark">
						Active admins
					</p>
					<p class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						{{ security.activeAdminCount }}
					</p>
				</div>
			</div>

			<div v-if="security.usersWithoutMfa.length" class="mt-6">
				<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
					Accounts missing MFA
				</p>
				<ul class="mt-3 gap-3 grid md:grid-cols-2">
					<li v-for="user in security.usersWithoutMfa" :key="user.id" class="text-sm text-app-muted px-4 py-3 border border-app-warm/40 rounded-[1.2rem] bg-app-warm/10 dark:text-app-muted-dark">
						<span class="text-app-ink font-semibold dark:text-app-text-dark">{{ user.displayName }}</span>
						<span class="mt-1 block">{{ user.username }} · {{ user.role }}</span>
					</li>
				</ul>
			</div>

			<div v-if="security.usersRequiringPasswordChange.length" class="mt-6">
				<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
					Accounts using temporary passwords
				</p>
				<ul class="mt-3 gap-3 grid md:grid-cols-2">
					<li v-for="user in security.usersRequiringPasswordChange" :key="user.id" class="text-sm text-app-muted px-4 py-3 border border-app-warm/40 rounded-[1.2rem] bg-app-warm/10 dark:text-app-muted-dark">
						<span class="text-app-ink font-semibold dark:text-app-text-dark">{{ user.displayName }}</span>
						<span class="mt-1 block">{{ user.username }} · {{ user.role }}</span>
					</li>
				</ul>
			</div>
		</section>

		<section class="gap-6 grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Needs attention
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Current operational priorities
				</h2>
				<ul class="readable-list text-sm text-app-muted mt-6 dark:text-app-muted-dark">
					<li v-for="item in overview?.needsAttention ?? []" :key="item" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>

			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Recent activity
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Latest queue and publish events
				</h2>
				<div class="mt-6 space-y-4">
					<article v-for="item in overview?.recentActivity ?? []" :key="item.id" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
						<div class="flex flex-wrap gap-3 items-center justify-between">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								{{ item.label }}
							</p>
							<UpdatedAt :value="item.timestamp" label="Logged" />
						</div>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ item.summary }}
						</p>
					</article>
				</div>
			</div>
		</section>

		<section class="gap-6 grid 2xl:grid-cols-4 xl:grid-cols-2">
			<div class="surface-panel">
				<div class="flex gap-4 items-center justify-between">
					<div>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Guide packages
						</p>
						<h2 class="text-2xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
							Local guide publication
						</h2>
					</div>
					<NuxtLink to="/admin/packages" class="btn-secondary">
						Open packages
					</NuxtLink>
				</div>
				<div class="mt-6 space-y-4">
					<article v-for="item in packagePreview" :key="item.workflow.id" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
						<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
							{{ item.coverageScope.label }}
						</p>
						<p class="text-xs text-app-muted tracking-[0.16em] font-semibold mt-2 uppercase dark:text-app-muted-dark">
							{{ item.workflow.status.replaceAll('_', ' ') }} · {{ item.diagnostics.completenessScore }}% checklist
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<TrustBadge :label="packageContentLabel(item)" :tone="packageContentTone(item)" />
						</div>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ packageOperationalSummary(item) }}
						</p>
					</article>
				</div>
			</div>

			<div class="surface-panel">
				<div class="flex gap-4 items-center justify-between">
					<div>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Review queue
						</p>
						<h2 class="text-2xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
							Pending editorial work
						</h2>
					</div>
					<NuxtLink to="/admin/review" class="btn-secondary">
						Open queue
					</NuxtLink>
				</div>
				<div class="mt-6 space-y-4">
					<article v-for="item in reviewPreview" :key="item.id" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
						<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
							{{ item.title }}
						</p>
						<p class="text-xs text-app-muted tracking-[0.16em] font-semibold mt-2 uppercase dark:text-app-muted-dark">
							{{ item.status }}
						</p>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ item.summary }}
						</p>
					</article>
				</div>
			</div>

			<div class="surface-panel">
				<div class="flex gap-4 items-center justify-between">
					<div>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Corrections
						</p>
						<h2 class="text-2xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
							Reader and internal reports
						</h2>
					</div>
					<NuxtLink to="/admin/corrections" class="btn-secondary">
						Open queue
					</NuxtLink>
				</div>
				<div class="mt-6 space-y-4">
					<article v-for="item in correctionPreview" :key="item.id" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
						<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
							{{ item.subject }}
						</p>
						<p class="text-xs text-app-muted tracking-[0.16em] font-semibold mt-2 uppercase dark:text-app-muted-dark">
							{{ item.status }} · {{ item.priority }} priority
						</p>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ item.summary }}
						</p>
					</article>
				</div>
			</div>

			<div class="surface-panel">
				<div class="flex gap-4 items-center justify-between">
					<div>
						<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
							Source health
						</p>
						<h2 class="text-2xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
							Upstream checks
						</h2>
					</div>
					<NuxtLink to="/admin/sources" class="btn-secondary">
						View sources
					</NuxtLink>
				</div>
				<div class="mt-6 space-y-4">
					<article v-for="item in sourcePreview" :key="item.id" class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
						<div class="flex flex-wrap gap-3 items-center justify-between">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								{{ item.label }}
							</p>
							<p class="text-xs tracking-[0.16em] font-semibold uppercase" :class="item.health === 'healthy' ? 'text-app-accent' : item.health === 'incident' ? 'text-[#8B3A2E]' : 'text-app-muted dark:text-app-muted-dark'">
								{{ item.health }}
							</p>
						</div>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ item.note }}
						</p>
					</article>
				</div>
			</div>
		</section>
	</section>
</template>
