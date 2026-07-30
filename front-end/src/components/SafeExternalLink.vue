<script setup lang="ts">
import { normalizePublicHref } from "~/utils/link";

defineOptions({
	inheritAttrs: false
});

const props = withDefaults(defineProps<{
	href?: string | null;
	newTab?: boolean;
}>(), {
	newTab: true
});

const safeHref = computed(() => normalizePublicHref(props.href));
</script>

<template>
	<a
		v-if="safeHref"
		v-bind="$attrs"
		:href="safeHref"
		:target="props.newTab ? '_blank' : undefined"
		:rel="props.newTab ? 'noopener noreferrer' : undefined"
	>
		<slot />
	</a>
</template>
