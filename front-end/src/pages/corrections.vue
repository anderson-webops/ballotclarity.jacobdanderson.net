<script setup lang="ts">
const { formatDateTime } = useFormatters();
const { data, error, pending } = await useCorrectionsLog();

usePageSeo({
	description: "Public corrections log for Ballot Clarity. Review substantive fixes, open review items, and current outcomes without exposing reporter identity.",
	path: "/corrections",
	title: "Corrections Log"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<div v-if="pending" class="space-y-6">
			<div class="surface-panel bg-white/70 h-64 animate-pulse dark:bg-app-panel-dark/70" />
			<div v-for="index in 3" :key="index" class="surface-panel bg-white/70 h-44 animate-pulse dark:bg-app-panel-dark/70" />
		</div>

		<div v-else-if="error || !data" class="max-w-3xl">
			<InfoCallout title="Corrections log unavailable" tone="warning">
				The public corrections log could not be loaded. Refresh the page or use the contact page to report an issue directly.
			</InfoCallout>
		</div>

		<div v-else class="space-y-8">
			<header class="gap-6 grid xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
				<div class="surface-panel">
					<div class="flex flex-wrap gap-2">
						<TrustBadge label="Public corrections log" tone="accent" />
						<TrustBadge label="Reporter identity withheld" />
						<TrustBadge label="Substantive updates only" tone="warning" />
					</div>
					<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
						Corrections log
					</h1>
					<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
						This log is public on purpose. New submissions remain private until an authenticated editor and MFA-enabled admin review them for publication. Published entries show substantive corrections that affect public interpretation, launch status, or trust signals while keeping reporter identity and private review notes out of view.
					</p>
					<div class="mt-6 flex flex-wrap gap-4 items-center">
						<UpdatedAt :value="data.updatedAt" label="Corrections log updated" />
						<NuxtLink to="/contact" class="btn-secondary">
							Report an issue
						</NuxtLink>
					</div>
				</div>

				<InfoCallout title="What appears here" tone="warning">
					When there are public correction records, this page includes corrections and open review items that could affect how a public page should be understood. Private contact details, unverified attachments, and operational notes are not published here.
				</InfoCallout>
			</header>

			<div v-if="!data.corrections.length" class="surface-panel max-w-3xl">
				<TrustBadge label="No public corrections posted" tone="accent" />
				<h2 class="text-3xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
					No public corrections have been posted.
				</h2>
				<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
					Ballot Clarity will use this page for substantive public corrections when a source-backed issue affects how a page should be read. To report a possible error, use the contact page.
				</p>
				<NuxtLink to="/contact" class="btn-secondary mt-5">
					Report an issue
				</NuxtLink>
			</div>

			<div v-else class="space-y-4">
				<article v-for="item in data.corrections" :key="item.id" class="surface-panel">
					<div class="flex flex-wrap gap-3 items-center">
						<TrustBadge :label="item.status" :tone="item.status === 'resolved' ? 'accent' : item.status === 'new' ? 'warning' : 'neutral'" />
						<TrustBadge :label="item.priority" />
						<TrustBadge :label="item.entityType" tone="neutral" />
					</div>
					<div class="mt-5 gap-6 grid xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
						<div>
							<h2 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
								{{ item.subject }}
							</h2>
							<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
								{{ item.summary }}
							</p>
							<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
								<strong class="text-app-ink dark:text-app-text-dark">Outcome or next step:</strong> {{ item.outcome }}
							</p>
						</div>

						<div class="px-5 py-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
							<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
								Affected page
							</p>
							<p class="text-base text-app-ink font-semibold mt-3 dark:text-app-text-dark">
								{{ item.pageLabel || item.entityLabel }}
							</p>
							<p class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
								{{ formatDateTime(item.submittedAt) }}
							</p>
							<NuxtLink v-if="item.pageUrl" :to="item.pageUrl" class="btn-secondary mt-5">
								Open page
							</NuxtLink>
						</div>
					</div>
				</article>
			</div>
		</div>
	</section>
</template>
