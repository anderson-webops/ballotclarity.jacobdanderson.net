<script setup lang="ts">
import { FetchError } from "ofetch";

const api = useApiClient();
const route = useRoute();
function readQueryValue(key: string) {
	const value = route.query[key];
	return typeof value === "string" ? value : "";
}

const form = reactive({
	email: "",
	message: "",
	name: "",
	pageUrl: readQueryValue("pageUrl"),
	sourceLinks: "",
	subject: readQueryValue("subject"),
	submissionType: (readQueryValue("type") === "feedback" ? "feedback" : "correction") as "correction" | "feedback"
});
const isSubmitting = ref(false);
const formMessage = ref("");
const formTone = ref<"error" | "success">("success");

const correctionChecklist = [
	"The page URL or site path where you found the issue.",
	"The specific sentence, claim, quote, or label that needs review.",
	"A short explanation of what seems incorrect, incomplete, or unevenly framed.",
	"Supporting documentation or links, preferably primary sources such as filings, official records, transcripts, or public notices.",
	"Any timing note that matters, such as a recent filing, late correction, or new election-office notice."
];

async function submitForm() {
	isSubmitting.value = true;
	formMessage.value = "";

	try {
		await api("/feedback", {
			body: form,
			method: "POST"
		});
		formMessage.value = form.submissionType === "correction"
			? "Correction request submitted. We will review the page and follow up if needed."
			: "Feedback submitted. Thank you.";
		formTone.value = "success";
		form.email = "";
		form.message = "";
		form.name = "";
		form.pageUrl = "";
		form.sourceLinks = "";
		form.subject = "";
		form.submissionType = "correction";
	}
	catch (error) {
		formMessage.value = error instanceof FetchError
			? error.data?.message || error.statusMessage || "Unable to submit the form right now."
			: "Unable to submit the form right now.";
		formTone.value = "error";
	}
	finally {
		isSubmitting.value = false;
	}
}

usePageSeo({
	description: "Contact Ballot Clarity, request a correction, or send feedback about the site.",
	path: "/contact",
	title: "Contact"
});
</script>

<template>
	<section class="app-shell section-gap space-y-8">
		<header class="max-w-4xl">
			<div class="flex flex-wrap gap-2">
				<TrustBadge label="Contact" tone="accent" />
				<TrustBadge label="Corrections path" />
			</div>
			<h1 class="text-5xl text-app-ink font-serif mt-5 dark:text-app-text-dark">
				Contact and corrections
			</h1>
			<p class="text-base text-app-muted leading-8 mt-5 max-w-3xl dark:text-app-muted-dark">
				Use this page to report an error, request a correction, ask a question, or volunteer.
			</p>
		</header>

		<section id="contact-form" class="surface-panel scroll-mt-28">
			<div class="gap-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
				<div>
					<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
						Submit online
					</p>
					<h2 class="text-3xl text-app-ink font-serif mt-3 dark:text-app-text-dark">
						Send a correction request or feedback
					</h2>
					<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
						Use this form when a page appears inaccurate, incomplete, unevenly framed, or hard to use.
					</p>
				</div>

				<form class="space-y-4" @submit.prevent="submitForm">
					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Request type</span>
						<select
							v-model="form.submissionType"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
							<option value="correction">
								correction
							</option>
							<option value="feedback">
								feedback
							</option>
						</select>
					</label>

					<div class="gap-4 grid sm:grid-cols-2">
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Name</span>
							<input
								v-model="form.name"
								autocomplete="name"
								maxlength="120"
								type="text"
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>
						<label class="block">
							<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Email</span>
							<input
								v-model="form.email"
								autocomplete="email"
								maxlength="254"
								type="email"
								required
								class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
							>
						</label>
					</div>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Subject</span>
						<input
							v-model="form.subject"
							maxlength="160"
							type="text"
							required
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Page URL or site path</span>
						<input
							v-model="form.pageUrl"
							maxlength="1024"
							type="text"
							placeholder="/representatives/jon-ossoff"
							class="text-sm text-app-ink mt-2 px-4 border border-app-line rounded-2xl bg-white h-13 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						>
					</label>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Message</span>
						<textarea
							v-model="form.message"
							maxlength="5000"
							required
							rows="5"
							class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-32 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						/>
					</label>

					<label class="block">
						<span class="text-sm text-app-ink font-semibold dark:text-app-text-dark">Supporting links</span>
						<textarea
							v-model="form.sourceLinks"
							maxlength="20489"
							rows="3"
							placeholder="One link per line"
							class="text-sm text-app-ink mt-2 px-4 py-3 border border-app-line rounded-2xl bg-white min-h-24 w-full shadow-sm dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark focus-ring"
						/>
					</label>

					<p
						v-if="formMessage"
						class="text-sm px-4 py-3 rounded-2xl"
						:class="formTone === 'success'
							? 'text-[#0f5b45] bg-[#e6f4ef] dark:text-[#9ae6c2] dark:bg-[#11352c]'
							: 'text-[#8B3A2E] bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]'"
					>
						{{ formMessage }}
					</p>

					<button type="submit" class="btn-primary w-full" :disabled="isSubmitting">
						{{ isSubmitting ? "Submitting..." : "Send request" }}
					</button>
				</form>
			</div>
		</section>

		<section class="gap-6 grid lg:grid-cols-3">
			<div class="surface-panel">
				<h2 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
					Report an error or dispute
				</h2>
				<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
					Use this when a page appears inaccurate, incomplete, unevenly framed, misquoted, or missing an important public record.
				</p>
				<a href="#contact-form" class="btn-primary mt-6">
					Use correction form
				</a>
			</div>

			<div class="surface-panel">
				<h2 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
					Volunteer or research
				</h2>
				<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
					Use this if you want to volunteer, collaborate, or help review public records.
				</p>
				<ProtectedEmailLink
					loading-label="Email link loads in your browser."
					loading-class="text-sm text-app-muted leading-7 mt-6 block dark:text-app-muted-dark"
					link-class="btn-secondary mt-6"
					subject="Ballot Clarity volunteer or research inquiry"
				/>
			</div>

			<div class="surface-panel">
				<h2 class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
					General contact
				</h2>
				<p class="text-sm text-app-muted leading-7 mt-4 dark:text-app-muted-dark">
					For general questions about Ballot Clarity, use the form above or the protected project email link.
				</p>
				<ProtectedEmailLink
					loading-label="Email link loads in your browser."
					loading-class="text-sm text-app-muted leading-7 mt-6 block dark:text-app-muted-dark"
					link-class="btn-secondary mt-6"
					subject="Ballot Clarity general inquiry"
				/>
			</div>
		</section>

		<section class="gap-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
			<div class="surface-panel">
				<h2 class="text-3xl text-app-ink font-serif dark:text-app-text-dark">
					What to include in a correction request
				</h2>
				<ul class="text-sm text-app-muted leading-7 mt-6 space-y-3 dark:text-app-muted-dark">
					<li v-for="item in correctionChecklist" :key="item" class="px-4 py-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
						{{ item }}
					</li>
				</ul>
			</div>

			<div class="space-y-4">
				<InfoCallout title="Response target">
					We aim to acknowledge correction requests within 2 business days and resolve straightforward factual issues within 7 business days.
				</InfoCallout>
				<InfoCallout title="Good-faith standard" tone="warning">
					Ballot Clarity will not remove accurate, well-sourced information solely because it is unfavorable. The purpose of the correction path is accuracy and fairness, not reputation management.
				</InfoCallout>
				<InfoCallout title="Related pages">
					Read the <NuxtLink to="/neutrality" class="underline underline-offset-3">
						neutrality policy
					</NuxtLink>, <NuxtLink to="/methodology" class="underline underline-offset-3">
						methodology notes
					</NuxtLink>, and <NuxtLink to="/privacy" class="underline underline-offset-3">
						privacy notice
					</NuxtLink> to see how source review, dispute handling, and contact data are handled together.
				</InfoCallout>
			</div>
		</section>
	</section>
</template>
