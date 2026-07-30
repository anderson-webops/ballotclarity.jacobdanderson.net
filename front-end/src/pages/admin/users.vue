<script setup lang="ts">
import type { AdminUserRole } from "~/types/civic";
import { FetchError } from "ofetch";

definePageMeta({
	layout: "admin",
	middleware: "admin"
});

const { data: session } = await useAdminSession("admin-users-session");
const { data, refresh, error } = await useAdminUsers();
const canManageAccounts = computed(() => session.value?.role === "admin" && Boolean(session.value.mfaEnabledAt));

const form = reactive({
	displayName: "",
	password: "",
	role: "editor" as AdminUserRole,
	username: ""
});
const resetPasswords = reactive<Record<string, string>>({});

const isSubmitting = ref(false);
const updatingId = ref("");
const feedbackMessage = ref("");
const feedbackTone = ref<"error" | "success">("success");

async function createUser() {
	isSubmitting.value = true;
	feedbackMessage.value = "";

	try {
		await $fetch("/api/admin/users", {
			body: form,
			method: "POST"
		});
		feedbackMessage.value = "Admin user created. They must replace the temporary password at next sign-in.";
		feedbackTone.value = "success";
		form.displayName = "";
		form.password = "";
		form.role = "editor";
		form.username = "";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to create admin user."
			: "Unable to create admin user.";
		feedbackTone.value = "error";
	}
	finally {
		isSubmitting.value = false;
	}
}

async function setUserDisabled(userId: string, disabled: boolean) {
	updatingId.value = userId;
	feedbackMessage.value = "";

	try {
		await $fetch(`/api/admin/users/${userId}`, {
			body: { disabled },
			method: "PATCH"
		});
		feedbackMessage.value = disabled ? "Admin user disabled." : "Admin user restored.";
		feedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to update admin user."
			: "Unable to update admin user.";
		feedbackTone.value = "error";
	}
	finally {
		updatingId.value = "";
	}
}

async function resetUserPassword(userId: string) {
	const password = resetPasswords[userId] || "";
	updatingId.value = userId;
	feedbackMessage.value = "";

	try {
		await $fetch(`/api/admin/users/${userId}`, {
			body: { password },
			method: "PATCH"
		});
		feedbackMessage.value = "Temporary password set. Existing sessions were invalidated, and the account must change it at next sign-in.";
		feedbackTone.value = "success";
		resetPasswords[userId] = "";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to reset admin password."
			: "Unable to reset admin password.";
		feedbackTone.value = "error";
	}
	finally {
		updatingId.value = "";
	}
}

async function resetUserMfa(userId: string) {
	updatingId.value = userId;
	feedbackMessage.value = "";

	try {
		await $fetch(`/api/admin/users/${userId}`, {
			body: { mfaReset: true },
			method: "PATCH"
		});
		feedbackMessage.value = "MFA reset. Existing sessions for that account were invalidated.";
		feedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to reset admin MFA."
			: "Unable to reset admin MFA.";
		feedbackTone.value = "error";
	}
	finally {
		updatingId.value = "";
	}
}

function canAdminEditUser(user: { username: string }) {
	return canManageAccounts.value && session.value?.username !== user.username;
}

usePageSeo({
	description: "Internal Ballot Clarity admin account management.",
	path: "/admin/users",
	robots: "noindex,nofollow",
	title: "Admin users"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
				User management
			</p>
			<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
				Admin and editor accounts
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
				Use persisted internal accounts instead of shared deployment credentials. Editors can work the queues; admins can also manage accounts.
			</p>
		</header>

		<InfoCallout v-if="session?.role !== 'admin'" title="Admin-only area" tone="warning">
			Only admin users can create or review accounts. Your current session is read-only for this page.
		</InfoCallout>
		<InfoCallout v-else-if="!session.mfaEnabledAt" title="MFA required" tone="warning">
			Enable multi-factor authentication on your Account page before creating, disabling, restoring, or resetting an account.
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

		<section class="gap-6 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Current users
				</p>
				<div v-if="error" class="mt-6">
					<InfoCallout title="User list unavailable" tone="warning">
						The user directory could not be loaded for this session.
					</InfoCallout>
				</div>
				<ul v-else class="mt-6 space-y-4">
					<li v-for="user in data?.users ?? []" :key="user.id" class="px-5 py-5 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
						<div class="flex flex-wrap gap-3 items-center justify-between">
							<div>
								<p class="text-lg text-app-ink font-semibold dark:text-app-text-dark">
									{{ user.displayName }}
								</p>
								<p class="text-sm text-app-muted mt-2 dark:text-app-muted-dark">
									{{ user.username }}
								</p>
							</div>
							<div class="flex flex-wrap gap-2 justify-end">
								<TrustBadge :label="user.role" :tone="user.role === 'admin' ? 'accent' : 'neutral'" />
								<TrustBadge
									:label="user.disabledAt ? 'disabled' : 'active'"
									:tone="user.disabledAt ? 'warning' : 'neutral'"
								/>
								<TrustBadge
									:label="user.mfaEnabledAt ? 'MFA enabled' : 'MFA not enabled'"
									:tone="user.mfaEnabledAt ? 'accent' : 'warning'"
								/>
								<TrustBadge
									v-if="user.passwordChangeRequiredAt"
									label="password change required"
									tone="warning"
								/>
							</div>
						</div>
						<div class="mt-4 gap-4 grid sm:grid-cols-2">
							<UpdatedAt :value="user.createdAt" label="Created" />
							<p class="text-sm text-app-muted dark:text-app-muted-dark">
								<span class="text-app-ink font-semibold dark:text-app-text-dark">Last login:</span>
								{{ user.lastLoginAt || "No recorded login yet" }}
							</p>
							<UpdatedAt v-if="user.credentialsUpdatedAt" :value="user.credentialsUpdatedAt" label="Credentials" />
							<UpdatedAt v-if="user.passwordChangeRequiredAt" :value="user.passwordChangeRequiredAt" label="Temporary password issued" />
							<UpdatedAt v-if="user.mfaEnabledAt" :value="user.mfaEnabledAt" label="MFA enabled" />
							<UpdatedAt v-if="user.disabledAt" :value="user.disabledAt" label="Disabled" />
						</div>
						<div class="mt-5 flex flex-wrap gap-3">
							<button
								v-if="!user.disabledAt"
								type="button"
								class="btn-secondary"
								:disabled="!canManageAccounts || session?.username === user.username || updatingId === user.id"
								@click="setUserDisabled(user.id, true)"
							>
								{{ updatingId === user.id ? "Updating..." : "Disable sign-in" }}
							</button>
							<button
								v-else
								type="button"
								class="btn-secondary"
								:disabled="!canManageAccounts || updatingId === user.id"
								@click="setUserDisabled(user.id, false)"
							>
								{{ updatingId === user.id ? "Updating..." : "Restore sign-in" }}
							</button>
							<p v-if="session?.username === user.username" class="text-xs text-app-muted self-center dark:text-app-muted-dark">
								Current session
							</p>
							<button
								v-if="user.mfaEnabledAt"
								type="button"
								class="btn-secondary"
								:disabled="!canAdminEditUser(user) || updatingId === user.id"
								@click="resetUserMfa(user.id)"
							>
								{{ updatingId === user.id ? "Updating..." : "Reset MFA" }}
							</button>
						</div>
						<form class="mt-4 gap-3 grid lg:grid-cols-[minmax(0,1fr)_auto]" @submit.prevent="resetUserPassword(user.id)">
							<label class="block">
								<span class="sr-only">Temporary password for {{ user.username }}</span>
								<input
									v-model="resetPasswords[user.id]"
									:disabled="!canManageAccounts || session?.username === user.username || updatingId === user.id"
									type="password"
									autocomplete="new-password"
									placeholder="New temporary password"
									class="text-sm text-app-ink px-4 border border-app-line rounded-2xl bg-white h-12 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								>
							</label>
							<button
								type="submit"
								class="btn-secondary"
								:disabled="!canManageAccounts || session?.username === user.username || updatingId === user.id || !(resetPasswords[user.id] || '').trim()"
							>
								{{ updatingId === user.id ? "Updating..." : "Reset password" }}
							</button>
						</form>
						<p class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
							Temporary passwords must be at least 12 characters. Creating or resetting one invalidates existing sessions and requires the account to replace it at next sign-in.
						</p>
					</li>
				</ul>
			</div>

			<div class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Create user
				</p>
				<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Add an editor or admin
				</h2>
				<form class="mt-6 space-y-4" @submit.prevent="createUser">
					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Display name</span>
						<input
							v-model="form.displayName"
							:disabled="!canManageAccounts"
							type="text"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Username</span>
						<input
							v-model="form.username"
							:disabled="!canManageAccounts"
							type="text"
							autocomplete="off"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Role</span>
						<select
							v-model="form.role"
							:disabled="!canManageAccounts"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
							<option value="editor">
								editor
							</option>
							<option value="admin">
								admin
							</option>
						</select>
					</label>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Temporary password</span>
						<input
							v-model="form.password"
							:disabled="!canManageAccounts"
							type="password"
							autocomplete="new-password"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>

					<button type="submit" class="btn-primary w-full" :disabled="isSubmitting || !canManageAccounts">
						{{ isSubmitting ? "Creating..." : "Create user" }}
					</button>
					<p class="text-xs text-app-muted leading-6 dark:text-app-muted-dark">
						The new account must replace this temporary password before using any other admin workflow.
					</p>
				</form>
			</div>
		</section>
	</section>
</template>
