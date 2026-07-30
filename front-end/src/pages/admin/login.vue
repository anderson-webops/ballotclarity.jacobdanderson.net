<script setup lang="ts">
import type { AdminSessionResponse } from "~/types/civic";
import { FetchError } from "ofetch";

definePageMeta({
	layout: false
});

const route = useRoute();
const username = ref("");
const password = ref("");
const mfaCode = ref("");
const mfaRequired = ref(false);
const errorMessage = ref("");
const isSubmitting = ref(false);

const redirectTarget = computed(() => {
	const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/admin";

	return redirect.startsWith("/admin") ? redirect : "/admin";
});

const { data: session } = await useAdminSession("admin-login-session");

if (session.value?.authenticated) {
	await navigateTo(session.value.passwordChangeRequiredAt
		? "/admin/account"
		: redirectTarget.value);
}

async function handleSubmit() {
	errorMessage.value = "";
	isSubmitting.value = true;

	try {
		const loginResponse = await $fetch<AdminSessionResponse>("/api/admin/session", {
			body: {
				...(mfaRequired.value ? { mfaCode: mfaCode.value } : {}),
				password: password.value,
				username: username.value
			},
			method: "POST"
		});

		if (loginResponse.mfaRequired) {
			mfaRequired.value = true;
			mfaCode.value = "";
			errorMessage.value = "Enter the six-digit code from your authenticator app.";
			return;
		}

		await navigateTo(loginResponse.passwordChangeRequiredAt
			? "/admin/account"
			: redirectTarget.value);
	}
	catch (error) {
		if (error instanceof FetchError) {
			errorMessage.value = error.statusCode === 503
				? "No admin users are configured for this deployment yet."
				: mfaRequired.value
					? "The admin verification code was not accepted."
					: "The admin credentials were not accepted.";
		}
		else {
			errorMessage.value = "Unable to sign in right now.";
		}
	}
	finally {
		isSubmitting.value = false;
	}
}

usePageSeo({
	description: "Internal Ballot Clarity editorial and operations login.",
	path: "/admin/login",
	robots: "noindex,nofollow",
	title: "Admin login"
});
</script>

<template>
	<div class="px-4 py-10 bg-app-bg min-h-screen sm:px-6 dark:bg-app-bg-dark">
		<div class="mx-auto max-w-5xl w-full">
			<NuxtLink to="/" class="text-sm text-app-muted inline-flex gap-2 items-center dark:text-app-muted-dark hover:text-app-ink focus-ring dark:hover:text-app-text-dark">
				<span class="i-carbon-arrow-left" />
				Return to public site
			</NuxtLink>

			<div class="mt-6 gap-6 grid lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:items-start">
				<section class="surface-panel">
					<div class="flex flex-wrap gap-2">
						<TrustBadge label="Internal use" tone="accent" />
						<TrustBadge label="Corrections and review" />
						<TrustBadge label="Noindex" tone="warning" />
					</div>
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold mt-6 uppercase dark:text-app-muted-dark">
						Production operations
					</p>
					<h1 class="text-5xl text-app-ink font-serif mt-4 dark:text-app-text-dark">
						Editorial and source operations
					</h1>
					<p class="bc-measure text-base text-app-muted leading-8 mt-5 dark:text-app-muted-dark">
						This internal portal exists to make Ballot Clarity's public trust claims operational: review queue management, correction intake tracking, source-health monitoring, and publish readiness checks.
					</p>

					<div class="mt-8 gap-4 grid sm:grid-cols-3">
						<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								Review gating
							</p>
							<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
								Track what is in draft, what needs sources, and what is ready to publish.
							</p>
						</div>
						<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								Corrections path
							</p>
							<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
								Keep reader-reported issues visible until they are triaged and resolved.
							</p>
						</div>
						<div class="px-4 py-4 border border-app-line/80 rounded-[1.4rem] bg-app-bg dark:border-app-line-dark dark:bg-app-bg-dark/70">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								Source health
							</p>
							<p class="text-sm text-app-muted leading-7 mt-2 dark:text-app-muted-dark">
								See which upstream records are healthy, stale, or structurally drifting.
							</p>
						</div>
					</div>
				</section>

				<section class="surface-panel">
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
						Sign in
					</p>
					<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						Admin access
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						Use a persisted Ballot Clarity admin or editor account. Browser access is session-based and the upstream admin API remains server-to-server only.
					</p>

					<form class="mt-6 space-y-4" @submit.prevent="handleSubmit">
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Username</span>
							<input
								v-model="username"
								type="text"
								name="username"
								autocomplete="username"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Password</span>
							<input
								v-model="password"
								type="password"
								name="password"
								autocomplete="current-password"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<label v-if="mfaRequired" class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Authenticator code</span>
							<input
								v-model="mfaCode"
								type="text"
								name="one-time-code"
								autocomplete="one-time-code"
								inputmode="numeric"
								pattern="[0-9]*"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>

						<p v-if="errorMessage" class="text-sm text-[#8B3A2E] px-4 py-3 rounded-2xl bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]">
							{{ errorMessage }}
						</p>

						<button type="submit" class="btn-primary w-full" :disabled="isSubmitting">
							{{ isSubmitting ? "Signing in..." : mfaRequired ? "Verify code" : "Sign in to admin" }}
						</button>
					</form>

					<InfoCallout title="Operational note" class="mt-6">
						In production, bootstrap the first admin user, rotate the private admin API key, and keep the session secret unique per deployment.
					</InfoCallout>
				</section>
			</div>
		</div>
	</div>
</template>
