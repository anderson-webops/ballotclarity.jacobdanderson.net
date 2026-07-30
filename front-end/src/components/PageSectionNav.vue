<script setup lang="ts">
interface PageSectionNavItem {
	badge?: string;
	href: string;
	label: string;
	note?: string;
}

defineProps<{
	breadcrumbs?: Array<{
		label: string;
		to?: string;
	}>;
	compact?: boolean;
	description?: string;
	items: PageSectionNavItem[];
	showBreadcrumbs?: boolean;
	title: string;
}>();
</script>

<template>
	<nav class="section-nav surface-panel" :class="{ 'section-nav--compact': compact }" aria-label="Page sections">
		<div v-if="showBreadcrumbs !== false && breadcrumbs?.length" class="section-nav__crumbs">
			<AppBreadcrumbs :items="breadcrumbs" compact />
		</div>
		<p class="text-xs text-app-muted tracking-[0.24em] font-semibold uppercase dark:text-app-muted-dark">
			{{ title }}
		</p>
		<p v-if="description" class="text-sm text-app-muted leading-7 mt-3 dark:text-app-muted-dark">
			{{ description }}
		</p>

		<ol class="section-nav-list">
			<li v-for="item in items" :key="item.href">
				<SafeExternalLink :href="item.href" :new-tab="false" class="section-nav-link focus-ring">
					<span class="min-w-0">
						<span class="section-nav-link__label">{{ item.label }}</span>
						<span v-if="item.note" class="section-nav-link__note">{{ item.note }}</span>
					</span>
					<span v-if="item.badge" class="section-nav-link__badge">
						{{ item.badge }}
					</span>
				</SafeExternalLink>
			</li>
		</ol>

		<div v-if="$slots.actions" class="mt-5 pt-5 border-t border-app-line/80 dark:border-app-line-dark">
			<slot name="actions" />
		</div>
	</nav>
</template>
