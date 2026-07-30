<script setup lang="ts">
import type { Source } from "~/types/civic";
import { buildSourceRecordHref } from "~/utils/source-record-links";

withDefaults(defineProps<{
	compact?: boolean;
	note?: string;
	sources: Source[];
	title?: string;
}>(), {
	compact: false,
});

const { formatDate } = useFormatters();
const { data: sourceDirectory } = await useSourceDirectory();
const publishedSourceIds = computed(() => new Set((sourceDirectory.value?.sources ?? []).map(source => source.id)));

function getSourceRecordHref(source: Source) {
	return buildSourceRecordHref(source.id, publishedSourceIds.value);
}
</script>

<template>
	<div>
		<div v-if="title || note" class="mb-3">
			<h3 v-if="title" class="text-sm text-app-ink font-semibold dark:text-app-text-dark">
				{{ title }}
			</h3>
			<p v-if="note" class="text-xs text-app-muted mt-1 dark:text-app-muted-dark">
				{{ note }}
			</p>
		</div>

		<ul class="space-y-3">
			<li
				v-for="source in sources"
				:key="source.id"
				class="p-4 border border-app-line/70 rounded-2xl bg-white/70 dark:border-app-line-dark dark:bg-app-panel-dark/70"
				:class="compact ? 'p-3' : 'p-4'"
			>
				<div class="flex flex-wrap gap-2 items-center">
					<SourceAuthorityBadge :authority="source.authority" />
					<span class="text-[11px] text-app-muted tracking-[0.14em] font-semibold px-2.5 py-1 rounded-full bg-app-bg uppercase dark:text-app-muted-dark dark:bg-app-bg-dark/70">
						{{ source.type }}
					</span>
					<span class="text-xs text-app-muted dark:text-app-muted-dark">{{ formatDate(source.date) }}</span>
				</div>
				<NuxtLink
					v-if="getSourceRecordHref(source)"
					:to="getSourceRecordHref(source)!"
					class="text-sm text-app-ink font-semibold mt-3 rounded-lg inline-flex gap-2 transition items-start dark:text-app-text-dark hover:text-app-accent focus-ring dark:hover:text-white"
				>
					<span class="i-carbon-document text-base mt-0.5" />
					<span>{{ source.title }}</span>
				</NuxtLink>
				<p v-else class="text-sm text-app-ink font-semibold mt-3 inline-flex gap-2 items-start dark:text-app-text-dark">
					<span class="i-carbon-document text-base mt-0.5" />
					<span>{{ source.title }}</span>
				</p>
				<p class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
					{{ source.publisher }}
				</p>
				<p class="text-xs text-app-muted mt-1 dark:text-app-muted-dark">
					Source system: {{ source.sourceSystem }}
				</p>
				<p v-if="!getSourceRecordHref(source)" class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
					This citation stays inline on this page and is not published as a standalone source record.
				</p>
				<p v-if="source.note" class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
					{{ source.note }}
				</p>
				<SafeExternalLink v-if="source.url" :href="source.url" class="text-xs text-app-accent font-semibold mt-3 rounded-lg inline-flex gap-2 items-center focus-ring">
					<span class="i-carbon-launch" />
					Open source file
				</SafeExternalLink>
			</li>
		</ul>
	</div>
</template>
