<script setup lang="ts">
import type { AdminContentItem, AdminPriority, AdminReviewStatus } from "~/types/civic";
import { FetchError } from "ofetch";

definePageMeta({
	layout: "admin",
	middleware: "admin"
});

const { data, refresh } = await useAdminContent();
const { data: session } = await useAdminSession("admin-content-session");

const canPublish = computed(() => session.value?.role === "admin" && Boolean(session.value.mfaEnabledAt));
const statusOptions = computed<AdminReviewStatus[]>(() => canPublish.value
	? ["draft", "in-review", "needs-sources", "ready-to-publish", "published"]
	: ["draft", "in-review", "needs-sources", "ready-to-publish"]);
const priorityOptions: AdminPriority[] = ["high", "medium", "low"];

const savingId = ref<string | null>(null);
const feedbackMessage = ref("");
const feedbackTone = ref<"error" | "success">("success");

function formatDate(value: string) {
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(new Date(value));
}

async function saveItem(id: string, payload: {
	assignedTo?: string;
	blocker?: string | null;
	priority?: AdminPriority;
	publishApprovalNote?: string | null;
	publicBallotSummary?: string | null;
	publicSummary?: string;
	published?: boolean;
	status?: AdminReviewStatus;
}) {
	savingId.value = id;
	feedbackMessage.value = "";

	try {
		await $fetch(`/api/admin/content/${id}`, {
			body: payload,
			method: "PATCH"
		});
		feedbackMessage.value = "Content record updated.";
		feedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to update content."
			: "Unable to update content.";
		feedbackTone.value = "error";
	}
	finally {
		savingId.value = null;
	}
}

async function saveContentItem(item: AdminContentItem) {
	await saveItem(item.id, {
		assignedTo: item.assignedTo,
		blocker: item.blocker,
		priority: item.priority,
		publicBallotSummary: item.publicBallotSummary,
		publicSummary: item.publicSummary,
		...(canPublish.value
			? {
					publishApprovalNote: item.publishApprovalNote,
					published: item.published,
					status: item.status,
				}
			: {
					status: item.status === "published" ? undefined : item.status,
				}),
	});
}

usePageSeo({
	description: "Internal Ballot Clarity content state and publish controls.",
	path: "/admin/content",
	robots: "noindex,nofollow",
	title: "Admin content"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				Content control
			</p>
			<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
				Manage publish state and public copy
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
				Use this page to keep public content operationally coherent: who owns the item, whether it is published, and what summary text the public site should show without requiring a code deploy.
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

		<AdminEmptyState
			v-if="!(data?.items?.length ?? 0)"
			action-label="Open guide packages"
			action-to="/admin/packages"
			eyebrow="No content records"
			message="No editable public-content records are currently queued. Generate or import guide-package content first, then use this page for publish-state and public-copy adjustments."
			secondary-label="Review source health"
			secondary-to="/admin/sources"
			title="Nothing needs content review right now"
		/>

		<div v-else class="space-y-5">
			<article v-for="item in data?.items ?? []" :key="item.id" class="surface-panel">
				<div class="gap-6 grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
					<div>
						<div class="flex flex-wrap gap-2">
							<TrustBadge :label="item.entityType" />
							<TrustBadge :label="item.status" :tone="item.status === 'published' ? 'accent' : item.status === 'needs-sources' ? 'warning' : 'neutral'" />
							<TrustBadge :label="item.published ? 'Published' : 'Internal only'" :tone="item.published ? 'accent' : 'warning'" />
							<TrustBadge
								v-if="item.published"
								:label="item.publishApprovedBy ? `Approved by ${item.publishApprovedBy}` : 'Approval required'"
								:tone="item.publishApprovedBy ? 'accent' : 'warning'"
							/>
						</div>
						<h2 class="text-3xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
							{{ item.title }}
						</h2>
						<p class="text-xs text-app-muted tracking-[0.18em] font-semibold mt-4 uppercase dark:text-app-muted-dark">
							Internal workflow summary
						</p>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ item.summary }}
						</p>
						<p class="text-xs text-app-muted tracking-[0.18em] font-semibold mt-5 uppercase dark:text-app-muted-dark">
							Public page summary
						</p>
						<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
							{{ item.publicSummary }}
						</p>
						<div v-if="item.publicBallotSummary" class="mt-4">
							<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
								Ballot card summary
							</p>
							<p class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
								{{ item.publicBallotSummary }}
							</p>
						</div>
						<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
							{{ item.sourceCoverage }}
						</p>
						<div class="mt-5 flex flex-wrap gap-3">
							<NuxtLink
								:to="`/admin/content/${item.id}`"
								class="btn-secondary"
							>
								Review history
							</NuxtLink>
							<NuxtLink
								v-if="item.entityType === 'candidate'"
								:to="`/candidate/${item.entitySlug}`"
								class="btn-secondary"
							>
								Open public page
							</NuxtLink>
							<NuxtLink
								v-else-if="item.entityType === 'measure'"
								:to="`/measure/${item.entitySlug}`"
								class="btn-secondary"
							>
								Open public page
							</NuxtLink>
							<NuxtLink
								v-else-if="item.entityType === 'election'"
								:to="`/elections/${item.entitySlug}`"
								class="btn-secondary"
							>
								Open public page
							</NuxtLink>
						</div>
					</div>

					<form class="space-y-4" @submit.prevent="saveContentItem(item)">
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Status</span>
							<select
								v-model="item.status"
								:disabled="item.status === 'published' && !canPublish"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
								<option v-if="item.status === 'published' && !canPublish" value="published">
									published
								</option>
								<option v-for="status in statusOptions" :key="status" :value="status">
									{{ status }}
								</option>
							</select>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Priority</span>
							<select
								v-model="item.priority"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
								<option v-for="priority in priorityOptions" :key="priority" :value="priority">
									{{ priority }}
								</option>
							</select>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Assigned to</span>
							<input
								v-model="item.assignedTo"
								type="text"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Blocker</span>
							<textarea
								v-model="item.blocker"
								rows="3"
								class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-28 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								placeholder="Leave blank if there is no blocker."
							/>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Public page summary</span>
							<textarea
								v-model="item.publicSummary"
								rows="4"
								class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-32 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								placeholder="Short, source-backed summary shown on the public page."
							/>
						</label>

						<label v-if="item.entityType === 'candidate' || item.entityType === 'measure'" class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Ballot card summary</span>
							<textarea
								v-model="item.publicBallotSummary"
								rows="3"
								class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-28 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								placeholder="Short summary used on ballot cards and search previews."
							/>
						</label>

						<label v-if="canPublish" class="text-sm text-app-muted px-4 py-3 border border-app-line rounded-2xl bg-white flex gap-3 items-center dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-panel-dark">
							<input v-model="item.published" type="checkbox" class="accent-app-accent h-4 w-4">
							Published on the public site
						</label>
						<p v-else class="text-xs text-app-muted leading-5 px-4 py-3 border border-app-line rounded-2xl bg-white dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-panel-dark">
							Publishing, unpublishing, and live-content changes require an admin account with multi-factor authentication.
						</p>

						<div v-if="canPublish" class="p-4 border border-app-line rounded-3xl bg-white/70 space-y-4 dark:border-app-line-dark dark:bg-app-panel-dark/70">
							<div>
								<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
									Publish approval
								</p>
								<p class="text-xs text-app-muted leading-5 mt-1 dark:text-app-muted-dark">
									The authenticated admin account is recorded as the reviewer. Unpublishing clears the approval so a future publish needs fresh signoff.
								</p>
							</div>
							<p class="text-sm text-app-muted px-4 py-3 border border-app-line rounded-2xl bg-white dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-panel-dark">
								Approved by {{ session?.displayName || session?.username }}
							</p>
							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Approval note</span>
								<textarea
									v-model="item.publishApprovalNote"
									rows="3"
									class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-24 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
									placeholder="Short signoff context, source check, or limitation note."
								/>
							</label>
							<p v-if="item.publishApprovedAt" class="text-xs text-app-muted leading-5 dark:text-app-muted-dark">
								Approval recorded {{ formatDate(item.publishApprovedAt) }}.
							</p>
						</div>

						<button type="submit" class="btn-primary w-full" :disabled="savingId === item.id || (!canPublish && item.published)">
							{{ savingId === item.id ? "Saving..." : "Save changes" }}
						</button>
					</form>
				</div>
			</article>
		</div>
	</section>
</template>
