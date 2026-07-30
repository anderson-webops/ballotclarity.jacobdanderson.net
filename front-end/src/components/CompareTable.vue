<script setup lang="ts">
import type { Candidate, ComparableStatement, QuestionnaireResponse } from "~/types/civic";

const props = withDefaults(defineProps<{
	candidates: Candidate[];
	questionCategory?: string | null;
	showOnlyDifferences?: boolean;
	showOnlyMutualResponses?: boolean;
}>(), {
	questionCategory: null,
	showOnlyDifferences: false,
	showOnlyMutualResponses: false
});

const { formatDate, formatDateTime } = useFormatters();

const sortedCandidates = computed(() => {
	return [...props.candidates].sort((left, right) => {
		return left.comparison.ballotOrder - right.comparison.ballotOrder
			|| left.comparison.displayName.localeCompare(right.comparison.displayName);
	});
});

function normalizeValue(value: string | null | undefined) {
	return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function valuesDiffer(values: Array<string | null | undefined>) {
	return new Set(values.map(normalizeValue)).size > 1;
}

const questionRows = computed(() => {
	const questions = new Map<string, { category: string; questionId: string; questionPrompt: string }>();

	sortedCandidates.value.forEach((candidate) => {
		candidate.comparison.questionnaireResponses.forEach((response) => {
			if (!questions.has(response.questionId)) {
				questions.set(response.questionId, {
					category: response.category,
					questionId: response.questionId,
					questionPrompt: response.questionPrompt
				});
			}
		});
	});

	return Array.from(questions.values())
		.filter(question => !props.questionCategory || question.category === props.questionCategory)
		.filter((question) => {
			if (!props.showOnlyMutualResponses)
				return true;

			return sortedCandidates.value.every(candidate => getResponse(candidate, question.questionId)?.responseStatus === "answered");
		})
		.filter(question => !props.showOnlyDifferences || questionHasDifferences(question.questionId));
});

function getResponse(candidate: Candidate, questionId: string) {
	return candidate.comparison.questionnaireResponses.find(response => response.questionId === questionId) ?? null;
}

function responseText(response: QuestionnaireResponse | null) {
	if (!response)
		return "Not clearly stated in available sources.";

	if (response.responseStatus === "no-response")
		return "No response submitted.";

	if (!response.answerText)
		return "Not clearly stated in available sources.";

	return response.answerText;
}

function responseDate(response: QuestionnaireResponse | null) {
	if (!response)
		return "";

	return response.answerReceivedAt ?? response.provenance.capturedAt ?? "";
}

function statementDate(statement: ComparableStatement) {
	return statement.provenance.capturedAt ?? "";
}

function primaryPriority(candidate: Candidate) {
	return candidate.comparison.topPriorities[0] ?? null;
}

function prioritySources(candidate: Candidate) {
	return candidate.comparison.topPriorities.flatMap(priority => priority.sources);
}

const rowDifferences = computed(() => ({
	"ballot-status": valuesDiffer(sortedCandidates.value.map(candidate => candidate.comparison.ballotStatus.label)),
	"incumbent-status": valuesDiffer(sortedCandidates.value.map(candidate => candidate.incumbent ? "incumbent" : "not incumbent")),
	"party-on-ballot": valuesDiffer(sortedCandidates.value.map(candidate => candidate.comparison.partyOnBallot)),
	"priorities": valuesDiffer(sortedCandidates.value.map(candidate => candidate.comparison.topPriorities.map(priority => priority.text).join(" | "))),
	"why-running": valuesDiffer(sortedCandidates.value.map(candidate => candidate.comparison.whyRunning.text))
}));

function questionHasDifferences(questionId: string) {
	return valuesDiffer(sortedCandidates.value.map(candidate => responseText(getResponse(candidate, questionId))));
}

function rowAccent(rowKey: keyof typeof rowDifferences.value | string) {
	const differs = rowKey in rowDifferences.value
		? rowDifferences.value[rowKey as keyof typeof rowDifferences.value]
		: questionHasDifferences(rowKey);

	return differs
		? "bg-[#eef6f7] dark:bg-[#16333c]/45"
		: "";
}

const mobileSections = computed(() => {
	return [
		{ key: "ballot-status", label: "Ballot status", type: "ballot-status" as const },
		{ key: "why-running", label: "Why I’m running", type: "why-running" as const },
		{ key: "priorities", label: "Top priorities", type: "priorities" as const },
		...questionRows.value.map(question => ({
			key: question.questionId,
			label: question.questionPrompt,
			type: "question" as const
		}))
	].filter((section) => {
		if (!props.showOnlyDifferences)
			return true;

		if (section.type === "question")
			return questionHasDifferences(section.key);

		return rowDifferences.value[section.key as keyof typeof rowDifferences.value];
	});
});
</script>

<template>
	<div>
		<div class="border border-app-line rounded-[2rem] hidden overflow-x-auto dark:border-app-line-dark lg:block">
			<table class="bg-white min-w-full border-collapse dark:bg-app-panel-dark">
				<thead>
					<tr class="border-b border-app-line dark:border-app-line-dark">
						<th class="text-xs text-app-muted tracking-[0.24em] font-semibold px-6 py-5 text-left bg-app-bg w-72 uppercase left-0 top-0 sticky z-30 dark:text-app-muted-dark dark:bg-app-bg-dark/90">
							Attribute
						</th>
						<th
							v-for="candidate in sortedCandidates"
							:key="candidate.slug"
							class="px-6 py-5 text-left align-top border-l border-app-line bg-white top-0 sticky z-20 dark:border-app-line-dark dark:bg-app-panel-dark"
							scope="col"
						>
							<div class="space-y-3">
								<div class="flex flex-wrap gap-2 items-center">
									<p class="text-2xl text-app-ink font-serif dark:text-app-text-dark">
										{{ candidate.comparison.displayName }}
									</p>
									<IncumbentBadge v-if="candidate.incumbent" />
								</div>
								<p class="text-sm text-app-muted dark:text-app-muted-dark">
									{{ candidate.officeSought }}
								</p>
								<div class="flex flex-wrap gap-2 items-center">
									<ProvenanceBadge :provenance="candidate.comparison.ballotStatus.provenance" />
									<SafeExternalLink :href="candidate.comparison.campaignWebsiteUrl" class="text-xs text-app-accent rounded-md hover:text-app-ink focus-ring dark:hover:text-white">
										Campaign website
									</SafeExternalLink>
								</div>
							</div>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-if="!props.showOnlyDifferences || rowDifferences['party-on-ballot']" class="align-top border-b border-app-line/70 dark:border-app-line-dark">
						<th class="text-sm text-app-ink font-semibold px-6 py-5 text-left bg-app-bg left-0 sticky z-10 dark:text-app-text-dark dark:bg-app-bg-dark/85" :class="rowAccent('party-on-ballot')" scope="row">
							Party on ballot
						</th>
						<td
							v-for="candidate in sortedCandidates"
							:key="`party-${candidate.slug}`"
							class="text-sm text-app-muted leading-7 px-6 py-5 border-l border-app-line dark:text-app-muted-dark dark:border-app-line-dark"
							:class="rowAccent('party-on-ballot')"
						>
							{{ candidate.comparison.partyOnBallot }}
						</td>
					</tr>

					<tr v-if="!props.showOnlyDifferences || rowDifferences['incumbent-status']" class="align-top border-b border-app-line/70 dark:border-app-line-dark">
						<th class="text-sm text-app-ink font-semibold px-6 py-5 text-left bg-app-bg left-0 sticky z-10 dark:text-app-text-dark dark:bg-app-bg-dark/85" :class="rowAccent('incumbent-status')" scope="row">
							Incumbent status
						</th>
						<td
							v-for="candidate in sortedCandidates"
							:key="`status-${candidate.slug}`"
							class="text-sm text-app-muted leading-7 px-6 py-5 border-l border-app-line dark:text-app-muted-dark dark:border-app-line-dark"
							:class="rowAccent('incumbent-status')"
						>
							{{ candidate.incumbent ? "Incumbent" : "Not incumbent" }}
						</td>
					</tr>

					<tr v-if="!props.showOnlyDifferences || rowDifferences['ballot-status']" class="align-top border-b border-app-line/70 dark:border-app-line-dark">
						<th class="text-sm text-app-ink font-semibold px-6 py-5 text-left bg-app-bg left-0 sticky z-10 dark:text-app-text-dark dark:bg-app-bg-dark/85" :class="rowAccent('ballot-status')" scope="row">
							Ballot status
						</th>
						<td
							v-for="candidate in sortedCandidates"
							:key="`ballot-${candidate.slug}`"
							class="text-sm text-app-muted leading-7 px-6 py-5 border-l border-app-line dark:text-app-muted-dark dark:border-app-line-dark"
							:class="rowAccent('ballot-status')"
						>
							<p class="text-app-ink font-semibold dark:text-app-text-dark">
								{{ candidate.comparison.ballotStatus.label }}
							</p>
							<div class="mt-3 flex flex-wrap gap-2 items-center">
								<ProvenanceBadge :provenance="candidate.comparison.ballotStatus.provenance" />
								<span class="text-xs text-app-muted dark:text-app-muted-dark">
									As of {{ formatDateTime(candidate.comparison.ballotStatus.asOf) }}
								</span>
								<SourceDrawer :sources="candidate.comparison.ballotStatus.sources" :title="`${candidate.comparison.displayName} ballot status sources`" button-label="Sources" />
							</div>
						</td>
					</tr>

					<tr v-if="!props.showOnlyDifferences || rowDifferences['why-running']" class="align-top border-b border-app-line/70 dark:border-app-line-dark">
						<th class="text-sm text-app-ink font-semibold px-6 py-5 text-left bg-app-bg left-0 sticky z-10 dark:text-app-text-dark dark:bg-app-bg-dark/85" :class="rowAccent('why-running')" scope="row">
							Why I’m running
						</th>
						<td
							v-for="candidate in sortedCandidates"
							:key="`why-${candidate.slug}`"
							class="text-sm text-app-muted leading-7 px-6 py-5 border-l border-app-line dark:text-app-muted-dark dark:border-app-line-dark"
							:class="rowAccent('why-running')"
						>
							<p>{{ candidate.comparison.whyRunning.text }}</p>
							<div class="mt-3 flex flex-wrap gap-2 items-center">
								<ProvenanceBadge :provenance="candidate.comparison.whyRunning.provenance" />
								<span v-if="statementDate(candidate.comparison.whyRunning)" class="text-xs text-app-muted dark:text-app-muted-dark">
									Captured {{ formatDate(statementDate(candidate.comparison.whyRunning)) }}
								</span>
								<SourceDrawer :sources="candidate.comparison.whyRunning.sources" :title="`${candidate.comparison.displayName} why-running sources`" button-label="Sources" />
							</div>
						</td>
					</tr>

					<tr v-if="!props.showOnlyDifferences || rowDifferences.priorities" class="align-top border-b border-app-line/70 dark:border-app-line-dark">
						<th class="text-sm text-app-ink font-semibold px-6 py-5 text-left bg-app-bg left-0 sticky z-10 dark:text-app-text-dark dark:bg-app-bg-dark/85" :class="rowAccent('priorities')" scope="row">
							Top priorities
						</th>
						<td
							v-for="candidate in sortedCandidates"
							:key="`priorities-${candidate.slug}`"
							class="text-sm text-app-muted leading-7 px-6 py-5 border-l border-app-line dark:text-app-muted-dark dark:border-app-line-dark"
							:class="rowAccent('priorities')"
						>
							<ul class="space-y-3">
								<li v-for="priority in candidate.comparison.topPriorities" :key="priority.id" class="p-3 rounded-2xl bg-app-bg dark:bg-app-bg-dark/70">
									<p>{{ priority.text }}</p>
								</li>
							</ul>
							<template v-if="primaryPriority(candidate)">
								<div class="mt-3 flex flex-wrap gap-2 items-center">
									<ProvenanceBadge :provenance="primaryPriority(candidate)!.provenance" />
									<SourceDrawer :sources="prioritySources(candidate)" :title="`${candidate.comparison.displayName} top-priority sources`" button-label="Sources" />
								</div>
							</template>
						</td>
					</tr>

					<tr
						v-for="question in questionRows"
						:key="question.questionId"
						class="align-top border-b border-app-line/70 last:border-b-0 dark:border-app-line-dark"
					>
						<th class="px-6 py-5 text-left bg-app-bg left-0 sticky z-10 dark:bg-app-bg-dark/85" :class="rowAccent(question.questionId)" scope="row">
							<p class="text-xs text-app-muted tracking-[0.18em] font-semibold uppercase dark:text-app-muted-dark">
								{{ question.category }}
							</p>
							<p class="text-sm text-app-ink font-semibold mt-2 dark:text-app-text-dark">
								{{ question.questionPrompt }}
							</p>
						</th>
						<td
							v-for="candidate in sortedCandidates"
							:key="`${question.questionId}-${candidate.slug}`"
							class="text-sm text-app-muted leading-7 px-6 py-5 border-l border-app-line dark:text-app-muted-dark dark:border-app-line-dark"
							:class="rowAccent(question.questionId)"
						>
							<template v-if="getResponse(candidate, question.questionId)">
								<p>{{ responseText(getResponse(candidate, question.questionId)) }}</p>
								<div class="mt-3 flex flex-wrap gap-2 items-center">
									<ProvenanceBadge :provenance="getResponse(candidate, question.questionId)!.provenance" />
									<span v-if="responseDate(getResponse(candidate, question.questionId))" class="text-xs text-app-muted dark:text-app-muted-dark">
										{{ getResponse(candidate, question.questionId)!.responseStatus === "answered" ? "Submitted" : "Checked" }} {{ formatDate(responseDate(getResponse(candidate, question.questionId))) }}
									</span>
									<SourceDrawer :sources="getResponse(candidate, question.questionId)!.sources" :title="`${candidate.comparison.displayName} response sources`" button-label="Sources" />
								</div>
							</template>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div class="space-y-4 lg:hidden">
			<InfoCallout v-if="props.showOnlyDifferences && !mobileSections.length" title="No differing rows in the current filter set">
				All visible rows match across the selected candidates. Turn off the differences-only filter to review the full shared questionnaire and ballot information.
			</InfoCallout>

			<details v-for="section in mobileSections" :key="section.key" class="group surface-panel">
				<summary class="text-xl text-app-ink font-serif list-none flex gap-4 cursor-pointer items-center justify-between dark:text-app-text-dark focus-ring">
					<span>{{ section.label }}</span>
					<span class="i-carbon-add group-open:i-carbon-subtract text-lg text-app-muted dark:text-app-muted-dark" />
				</summary>

				<div class="mt-5 space-y-4">
					<article v-for="candidate in sortedCandidates" :key="`${section.key}-${candidate.slug}`" class="p-4 rounded-3xl bg-app-bg dark:bg-app-bg-dark/70">
						<div class="flex flex-wrap gap-3 items-center">
							<h3 class="text-xl text-app-ink font-serif dark:text-app-text-dark">
								{{ candidate.comparison.displayName }}
							</h3>
							<IncumbentBadge v-if="candidate.incumbent" />
						</div>
						<p class="text-sm text-app-muted mt-2 dark:text-app-muted-dark">
							{{ candidate.comparison.partyOnBallot }}
						</p>

						<div v-if="section.type === 'ballot-status'" class="mt-4">
							<p class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
								{{ candidate.comparison.ballotStatus.label }}
							</p>
							<div class="mt-3 flex flex-wrap gap-2 items-center">
								<ProvenanceBadge :provenance="candidate.comparison.ballotStatus.provenance" />
								<span class="text-xs text-app-muted dark:text-app-muted-dark">
									As of {{ formatDateTime(candidate.comparison.ballotStatus.asOf) }}
								</span>
								<SourceDrawer :sources="candidate.comparison.ballotStatus.sources" :title="`${candidate.comparison.displayName} ballot status sources`" button-label="Sources" />
							</div>
						</div>

						<div v-else-if="section.type === 'why-running'" class="mt-4">
							<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
								{{ candidate.comparison.whyRunning.text }}
							</p>
							<div class="mt-3 flex flex-wrap gap-2 items-center">
								<ProvenanceBadge :provenance="candidate.comparison.whyRunning.provenance" />
								<SourceDrawer :sources="candidate.comparison.whyRunning.sources" :title="`${candidate.comparison.displayName} why-running sources`" button-label="Sources" />
							</div>
						</div>

						<div v-else-if="section.type === 'priorities'" class="mt-4">
							<ul class="space-y-3">
								<li v-for="priority in candidate.comparison.topPriorities" :key="priority.id" class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
									{{ priority.text }}
								</li>
							</ul>
							<template v-if="primaryPriority(candidate)">
								<div class="mt-3 flex flex-wrap gap-2 items-center">
									<ProvenanceBadge :provenance="primaryPriority(candidate)!.provenance" />
									<SourceDrawer :sources="prioritySources(candidate)" :title="`${candidate.comparison.displayName} top-priority sources`" button-label="Sources" />
								</div>
							</template>
						</div>

						<div v-else class="mt-4">
							<template v-if="getResponse(candidate, section.key)">
								<p class="text-sm text-app-muted leading-7 dark:text-app-muted-dark">
									{{ responseText(getResponse(candidate, section.key)) }}
								</p>
								<div class="mt-3 flex flex-wrap gap-2 items-center">
									<ProvenanceBadge :provenance="getResponse(candidate, section.key)!.provenance" />
									<span v-if="responseDate(getResponse(candidate, section.key))" class="text-xs text-app-muted dark:text-app-muted-dark">
										{{ getResponse(candidate, section.key)!.responseStatus === "answered" ? "Submitted" : "Checked" }} {{ formatDate(responseDate(getResponse(candidate, section.key))) }}
									</span>
									<SourceDrawer :sources="getResponse(candidate, section.key)!.sources" :title="`${candidate.comparison.displayName} response sources`" button-label="Sources" />
								</div>
							</template>
						</div>
					</article>
				</div>
			</details>
		</div>
	</div>
</template>
