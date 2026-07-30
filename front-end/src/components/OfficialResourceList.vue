<script setup lang="ts">
import type { OfficialResource } from "~/types/civic";

withDefaults(defineProps<{
	compact?: boolean;
	note?: string;
	resources: OfficialResource[];
	title?: string;
}>(), {
	compact: false
});
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
				v-for="resource in resources"
				:key="resource.label"
				class="border border-app-line/70 rounded-2xl bg-white/80 dark:border-app-line-dark dark:bg-app-panel-dark/70"
				:class="compact ? 'p-3' : 'p-4'"
			>
				<SafeExternalLink v-if="resource.url" :href="resource.url" class="text-sm text-app-ink font-semibold rounded-lg inline-flex gap-2 transition items-start dark:text-app-text-dark hover:text-app-accent focus-ring dark:hover:text-white">
					<span class="i-carbon-launch text-base mt-0.5" />
					<span>{{ resource.label }}</span>
				</SafeExternalLink>
				<p v-else class="text-sm text-app-ink font-semibold inline-flex gap-2 items-start dark:text-app-text-dark">
					<span class="i-carbon-document text-base mt-0.5" />
					<span>{{ resource.label }}</span>
				</p>
				<div class="mt-3 flex flex-wrap gap-2 items-center">
					<SourceAuthorityBadge :authority="resource.authority" />
				</div>
				<p class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
					{{ resource.sourceLabel }}
				</p>
				<p class="text-xs text-app-muted mt-1 dark:text-app-muted-dark">
					Source system: {{ resource.sourceSystem }}
				</p>
				<p v-if="resource.note" class="text-xs text-app-muted mt-2 dark:text-app-muted-dark">
					{{ resource.note }}
				</p>
			</li>
		</ul>
	</div>
</template>
