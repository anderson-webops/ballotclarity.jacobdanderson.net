<script setup lang="ts">
import type { AdminSourceHealth } from "~/types/civic";
import { FetchError } from "ofetch";

definePageMeta({
	layout: "admin",
	middleware: "admin"
});

const { data: session } = await useAdminSession("admin-sources-session");
const { data, refresh } = await useAdminSourceMonitor();
const canManageSources = computed(() => session.value?.role === "admin" && Boolean(session.value.mfaEnabledAt));
const healthOptions: AdminSourceHealth[] = ["healthy", "review-soon", "stale", "incident"];
const savingId = ref<string | null>(null);
const feedbackMessage = ref("");
const feedbackTone = ref<"error" | "success">("success");

async function saveSource(id: string, payload: {
	health?: AdminSourceHealth;
	nextCheckAt?: string;
	note?: string;
	owner?: string;
}) {
	savingId.value = id;
	feedbackMessage.value = "";

	try {
		await $fetch(`/api/admin/sources/${id}`, {
			body: payload,
			method: "PATCH"
		});
		feedbackMessage.value = "Source monitor updated.";
		feedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to update source monitor."
			: "Unable to update source monitor.";
		feedbackTone.value = "error";
	}
	finally {
		savingId.value = null;
	}
}

usePageSeo({
	description: "Internal Ballot Clarity source-health monitor.",
	path: "/admin/sources",
	robots: "noindex,nofollow",
	title: "Admin source health"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				Source health
			</p>
			<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
				Upstream monitoring and refresh readiness
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
				These checks are the operational layer behind freshness badges and methodology notes. If a source drifts, the public site should surface caution instead of pretending nothing changed.
			</p>
		</header>

		<InfoCallout v-if="session?.role !== 'admin'" title="Admin-only changes" tone="warning">
			You can review source health, but only admin users can change operational source status.
		</InfoCallout>
		<InfoCallout v-else-if="!session.mfaEnabledAt" title="MFA required" tone="warning">
			Enable multi-factor authentication on your Account page before changing source-health records.
		</InfoCallout>

		<p
			v-if="feedbackMessage"
			class="text-sm px-4 py-3 rounded-2xl"
			:class="feedbackTone === 'success'
				? 'text-[#0f5b45] bg-[#e6f4ef] dark:text-[#9ae6c2] dark:bg-[#11352c]'
				: 'text-[#8B3A2E] bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]'"
		>
			{{ feedbackMessage }}
		</p>

		<AdminEmptyState
			v-if="!(data?.sources?.length ?? 0)"
			action-label="Open public sources"
			action-to="/sources"
			eyebrow="No monitored sources"
			message="No source-health records are configured for the admin monitor. Public source records may still exist, but operational monitoring should be added before relying on freshness warnings."
			secondary-label="Open methodology"
			secondary-to="/methodology"
			title="Source monitor has no entries"
		/>

		<div v-else class="space-y-5">
			<article v-for="item in data?.sources ?? []" :key="item.id" class="surface-panel">
				<div class="gap-6 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
					<div class="min-w-0">
						<div class="flex flex-wrap gap-2">
							<TrustBadge :label="item.authority" />
							<TrustBadge :label="item.health" :tone="item.health === 'healthy' ? 'accent' : item.health === 'incident' ? 'warning' : 'neutral'" />
						</div>
						<h2 class="text-3xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
							{{ item.label }}
						</h2>
						<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
							{{ item.note }}
						</p>
					</div>

					<form class="space-y-4" @submit.prevent="saveSource(item.id, item)">
						<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<UpdatedAt :value="item.lastCheckedAt" label="Last checked" />
						</div>
						<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<UpdatedAt :value="item.nextCheckAt" label="Next check" />
						</div>
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Health</span>
							<select
								v-model="item.health"
								:disabled="!canManageSources"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
								<option v-for="health in healthOptions" :key="health" :value="health">
									{{ health }}
								</option>
							</select>
						</label>
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Owner</span>
							<input
								v-model="item.owner"
								:disabled="!canManageSources"
								type="text"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Next check (ISO timestamp)</span>
							<input
								v-model="item.nextCheckAt"
								:disabled="!canManageSources"
								type="text"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Operational note</span>
							<textarea
								v-model="item.note"
								:disabled="!canManageSources"
								rows="4"
								class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-28 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							/>
						</label>
						<button type="submit" class="btn-primary w-full" :disabled="!canManageSources || savingId === item.id">
							{{ savingId === item.id ? "Saving..." : "Save source status" }}
						</button>
					</form>
				</div>
			</article>
		</div>
	</section>
</template>
