<script setup lang="ts">
import type { ProfileImage } from "~/types/civic";
import { normalizeImageHref } from "~/utils/link";

const props = withDefaults(defineProps<{
	images?: ProfileImage[];
	name: string;
	showCaption?: boolean;
	size?: "lg" | "md" | "sm";
}>(), {
	images: () => [],
	showCaption: false,
	size: "md",
});

const activeIndex = ref(0);
const orderedImages = computed(() => [...props.images]
	.map(image => ({
		...image,
		url: normalizeImageHref(image.url),
	}))
	.filter(image => Boolean(image.url))
	.sort((left, right) =>
		left.priority - right.priority
		|| left.sourceLabel.localeCompare(right.sourceLabel)
		|| left.url.localeCompare(right.url)
	));
const activeImage = computed(() => orderedImages.value[activeIndex.value] ?? null);
const imageSignature = computed(() => orderedImages.value.map(image => image.url).join("|"));
const initials = computed(() => props.name
	.split(/\s+/)
	.filter(Boolean)
	.slice(0, 2)
	.map(part => part.charAt(0).toUpperCase())
	.join("") || "BC");
const frameClass = computed(() => {
	if (props.size === "lg")
		return "h-36 w-36 text-4xl md:h-44 md:w-44";

	if (props.size === "sm")
		return "h-12 w-12 text-sm";

	return "h-16 w-16 text-xl";
});
const caption = computed(() => {
	if (!props.showCaption || !activeImage.value)
		return "";

	return [
		activeImage.value.sourceLabel,
		activeImage.value.attribution,
	].filter(Boolean).join(" · ");
});

watch(imageSignature, () => {
	activeIndex.value = 0;
});

function handleImageError() {
	activeIndex.value += 1;
}
</script>

<template>
	<figure class="inline-flex flex-col gap-3 items-center">
		<div
			class="profile-image-frame text-app-muted leading-none font-serif border border-app-line rounded-[2rem] bg-app-bg shrink-0 grid shadow-sm place-items-center relative overflow-hidden isolate dark:text-app-muted-dark dark:border-app-line-dark dark:bg-app-bg-dark"
			:class="frameClass"
		>
			<img
				v-if="activeImage"
				:key="activeImage.url"
				:src="activeImage.url"
				:alt="activeImage.alt || `Portrait of ${name}`"
				class="h-[calc(100%+2px)] w-[calc(100%+2px)] block inset-[-1px] absolute object-cover object-center"
				loading="lazy"
				decoding="async"
				@error="handleImageError"
			>
			<span v-else class="relative z-10" aria-hidden="true">{{ initials }}</span>
		</div>
		<figcaption v-if="caption" class="text-xs text-app-muted leading-5 text-center max-w-44 dark:text-app-muted-dark">
			{{ caption }}
		</figcaption>
	</figure>
</template>
