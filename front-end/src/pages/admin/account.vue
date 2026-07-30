<script setup lang="ts">
import type { AdminMfaSetupResponse, AdminSessionResponse } from "~/types/civic";
import { FetchError } from "ofetch";

const { data: session, refresh } = await useAdminSession("admin-account-session");

definePageMeta({
	layout: "admin",
	middleware: "admin"
});

const form = reactive({
	confirmPassword: "",
	currentPassword: "",
	newPassword: ""
});

const feedbackMessage = ref("");
const feedbackTone = ref<"error" | "success">("success");
const isSubmitting = ref(false);
const mfaFeedbackMessage = ref("");
const mfaFeedbackTone = ref<"error" | "success">("success");
const isMfaSubmitting = ref(false);
const mfaSetup = ref<AdminMfaSetupResponse | null>(null);

const mfaForm = reactive({
	currentPassword: "",
	disableCode: "",
	enableCode: "",
	enableCurrentPassword: ""
});

const canSubmit = computed(() => Boolean(
	form.currentPassword
	&& form.newPassword.trim().length >= 12
	&& form.confirmPassword
));
const mfaEnabled = computed(() => Boolean(session.value?.mfaEnabledAt));
const passwordChangeRequired = computed(() => Boolean(session.value?.passwordChangeRequiredAt));

function extractErrorMessage(error: unknown, fallback: string) {
	return error instanceof FetchError
		? error.data?.message || error.statusMessage || fallback
		: fallback;
}

async function changePassword() {
	feedbackMessage.value = "";

	if (form.newPassword !== form.confirmPassword) {
		feedbackMessage.value = "The new password confirmation does not match.";
		feedbackTone.value = "error";
		return;
	}

	isSubmitting.value = true;

	try {
		const wasRequired = passwordChangeRequired.value;
		const updatedSession = await $fetch<AdminSessionResponse>("/api/admin/session/password", {
			body: {
				currentPassword: form.currentPassword,
				newPassword: form.newPassword
			},
			method: "POST"
		});

		session.value = updatedSession;
		form.confirmPassword = "";
		form.currentPassword = "";
		form.newPassword = "";
		feedbackMessage.value = wasRequired
			? "Temporary password replaced. The full admin workspace is now available."
			: "Password changed. Other sessions for this account were invalidated.";
		feedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		feedbackMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to change password."
			: "Unable to change password.";
		feedbackTone.value = "error";
	}
	finally {
		isSubmitting.value = false;
	}
}

async function startMfaSetup() {
	isMfaSubmitting.value = true;
	mfaFeedbackMessage.value = "";

	try {
		mfaSetup.value = await $fetch<AdminMfaSetupResponse>("/api/admin/session/mfa/setup", {
			method: "POST"
		});
		mfaForm.enableCode = "";
		mfaForm.enableCurrentPassword = "";
		mfaFeedbackMessage.value = "Add the setup key to your authenticator app, then enter your password and the current code.";
		mfaFeedbackTone.value = "success";
	}
	catch (error) {
		mfaFeedbackMessage.value = extractErrorMessage(error, "Unable to start MFA setup.");
		mfaFeedbackTone.value = "error";
	}
	finally {
		isMfaSubmitting.value = false;
	}
}

async function enableMfa() {
	if (!mfaSetup.value)
		return;

	isMfaSubmitting.value = true;
	mfaFeedbackMessage.value = "";

	try {
		const updatedSession = await $fetch<AdminSessionResponse>("/api/admin/session/mfa/enable", {
			body: {
				currentPassword: mfaForm.enableCurrentPassword,
				mfaCode: mfaForm.enableCode,
				secret: mfaSetup.value.secret
			},
			method: "POST"
		});

		session.value = updatedSession;
		mfaSetup.value = null;
		mfaForm.enableCode = "";
		mfaForm.enableCurrentPassword = "";
		mfaFeedbackMessage.value = "Multi-factor authentication is enabled for this account.";
		mfaFeedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		mfaFeedbackMessage.value = extractErrorMessage(error, "Unable to enable MFA.");
		mfaFeedbackTone.value = "error";
	}
	finally {
		isMfaSubmitting.value = false;
	}
}

async function disableMfa() {
	isMfaSubmitting.value = true;
	mfaFeedbackMessage.value = "";

	try {
		const updatedSession = await $fetch<AdminSessionResponse>("/api/admin/session/mfa/disable", {
			body: {
				currentPassword: mfaForm.currentPassword,
				mfaCode: mfaForm.disableCode
			},
			method: "POST"
		});

		session.value = updatedSession;
		mfaForm.currentPassword = "";
		mfaForm.disableCode = "";
		mfaFeedbackMessage.value = "Multi-factor authentication is disabled for this account.";
		mfaFeedbackTone.value = "success";
		await refresh();
	}
	catch (error) {
		mfaFeedbackMessage.value = extractErrorMessage(error, "Unable to disable MFA.");
		mfaFeedbackTone.value = "error";
	}
	finally {
		isMfaSubmitting.value = false;
	}
}

usePageSeo({
	description: "Internal Ballot Clarity admin account settings.",
	path: "/admin/account",
	robots: "noindex,nofollow",
	title: "Admin account"
});
</script>

<template>
	<div class="app-shell">
		<section class="surface-panel">
			<div class="flex flex-wrap gap-2">
				<TrustBadge label="Account security" tone="accent" />
				<TrustBadge :label="session?.role || 'admin'" />
			</div>
			<p class="text-xs text-app-muted tracking-[0.24em] font-semibold mt-6 uppercase dark:text-app-muted-dark">
				Current account
			</p>
			<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
				{{ session?.displayName || session?.username || "Admin account" }}
			</h1>
			<p class="bc-measure text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
				Change your own admin password without using shared deployment credentials or another administrator's reset flow.
			</p>
		</section>

		<InfoCallout v-if="passwordChangeRequired" title="Password change required" tone="warning" class="mt-6">
			This account is using an administrator-issued temporary password. Replace it below before using any other admin workflow.
		</InfoCallout>

		<div class="mt-6 gap-6 grid lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.65fr)] lg:items-start">
			<div class="space-y-6">
				<section class="surface-panel">
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
						Password
					</p>
					<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						Change password
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						Enter your current password and choose a new password. The new password must be at least 12 characters.
					</p>

					<form class="mt-6 space-y-4" @submit.prevent="changePassword">
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Current password</span>
							<input
								v-model="form.currentPassword"
								type="password"
								autocomplete="current-password"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">New password</span>
							<input
								v-model="form.newPassword"
								type="password"
								autocomplete="new-password"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Confirm new password</span>
							<input
								v-model="form.confirmPassword"
								type="password"
								autocomplete="new-password"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<p
							v-if="feedbackMessage"
							class="text-sm px-4 py-3 rounded-2xl"
							:class="feedbackTone === 'success'
								? 'text-[#265C3A] bg-[#DFF2E6] dark:text-[#BFECCB] dark:bg-[#203D2A]'
								: 'text-[#8B3A2E] bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]'"
						>
							{{ feedbackMessage }}
						</p>

						<button type="submit" class="btn-primary" :disabled="!canSubmit || isSubmitting">
							{{ isSubmitting ? "Changing password..." : "Change password" }}
						</button>
					</form>
				</section>

				<section v-if="!passwordChangeRequired" class="surface-panel">
					<div class="flex flex-wrap gap-2 items-center">
						<TrustBadge label="Multi-factor authentication" tone="accent" />
						<TrustBadge :label="mfaEnabled ? 'enabled' : 'not enabled'" :tone="mfaEnabled ? 'neutral' : 'warning'" />
					</div>
					<h2 class="text-3xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
						Protect sign-in with an authenticator app
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						MFA requires a time-based six-digit code after the account password is accepted. Enabling, disabling, or resetting MFA invalidates existing sessions for this account.
					</p>

					<div v-if="mfaSetup" class="mt-6 space-y-4">
						<div class="p-4 border border-app-line rounded-3xl bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								Setup key
							</p>
							<p class="text-sm text-app-muted font-mono mt-2 break-all dark:text-app-muted-dark">
								{{ mfaSetup.secret }}
							</p>
							<p class="text-xs text-app-muted leading-6 mt-3 dark:text-app-muted-dark">
								If your authenticator supports otpauth links, use: <span class="font-mono break-all">{{ mfaSetup.otpauthUrl }}</span>
							</p>
						</div>

						<form class="space-y-4" @submit.prevent="enableMfa">
							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Current password</span>
								<input
									v-model="mfaForm.enableCurrentPassword"
									type="password"
									autocomplete="current-password"
									class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								>
							</label>
							<label class="block">
								<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Six-digit code</span>
								<input
									v-model="mfaForm.enableCode"
									type="text"
									autocomplete="one-time-code"
									inputmode="numeric"
									pattern="[0-9]*"
									class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
								>
							</label>
							<button type="submit" class="btn-primary" :disabled="isMfaSubmitting || !mfaForm.enableCurrentPassword || !mfaForm.enableCode.trim()">
								{{ isMfaSubmitting ? "Enabling MFA..." : "Enable MFA" }}
							</button>
						</form>
					</div>

					<form v-else-if="mfaEnabled" class="mt-6 space-y-4" @submit.prevent="disableMfa">
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Current password</span>
							<input
								v-model="mfaForm.currentPassword"
								type="password"
								autocomplete="current-password"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Authenticator code</span>
							<input
								v-model="mfaForm.disableCode"
								type="text"
								autocomplete="one-time-code"
								inputmode="numeric"
								pattern="[0-9]*"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>
						<button type="submit" class="btn-secondary" :disabled="isMfaSubmitting || !mfaForm.currentPassword || !mfaForm.disableCode.trim()">
							{{ isMfaSubmitting ? "Disabling MFA..." : "Disable MFA" }}
						</button>
					</form>

					<button v-else type="button" class="btn-primary mt-6" :disabled="isMfaSubmitting" @click="startMfaSetup">
						{{ isMfaSubmitting ? "Starting setup..." : "Start MFA setup" }}
					</button>

					<p
						v-if="mfaFeedbackMessage"
						class="text-sm mt-5 px-4 py-3 rounded-2xl"
						:class="mfaFeedbackTone === 'success'
							? 'text-[#265C3A] bg-[#DFF2E6] dark:text-[#BFECCB] dark:bg-[#203D2A]'
							: 'text-[#8B3A2E] bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]'"
					>
						{{ mfaFeedbackMessage }}
					</p>
				</section>
			</div>

			<aside class="surface-panel">
				<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
					Session
				</p>
				<h2 class="text-2xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
					Account details
				</h2>
				<div class="text-sm text-app-muted leading-7 mt-5 space-y-3 dark:text-app-muted-dark">
					<p>
						<span class="text-app-ink font-semibold dark:text-app-text-dark">Username:</span>
						{{ session?.username }}
					</p>
					<p>
						<span class="text-app-ink font-semibold dark:text-app-text-dark">Role:</span>
						{{ session?.role }}
					</p>
					<p>
						<span class="text-app-ink font-semibold dark:text-app-text-dark">MFA:</span>
						{{ session?.mfaEnabledAt ? "Enabled" : "Not enabled" }}
					</p>
					<UpdatedAt v-if="session?.credentialsUpdatedAt" :value="session.credentialsUpdatedAt" label="Credentials" />
					<UpdatedAt v-if="session?.passwordChangeRequiredAt" :value="session.passwordChangeRequiredAt" label="Temporary password issued" />
					<UpdatedAt v-if="session?.mfaEnabledAt" :value="session.mfaEnabledAt" label="MFA enabled" />
				</div>
				<InfoCallout title="Session invalidation" class="mt-6">
					Changing your password rotates the account credential timestamp. Other signed-in sessions for this account must sign in again.
				</InfoCallout>
			</aside>
		</div>
	</div>
</template>
