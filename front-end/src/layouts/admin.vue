<script setup lang="ts">
const route = useRoute();
const { data: session } = await useAdminSession(`admin-layout-session-${route.fullPath}`);

const baseLinks = [
	{ label: "Dashboard", to: "/admin" },
	{ label: "Guide packages", to: "/admin/packages" },
	{ label: "Content", to: "/admin/content" },
	{ label: "Review queue", to: "/admin/review" },
	{ label: "Corrections", to: "/admin/corrections" },
	{ label: "Source health", to: "/admin/sources" },
	{ label: "Account", to: "/admin/account" }
];

const navLinks = computed(() => {
	if (session.value?.passwordChangeRequiredAt)
		return [{ label: "Account", to: "/admin/account" }];

	if (session.value?.role === "admin") {
		return [
			...baseLinks,
			{ label: "Audit trail", to: "/admin/audit" },
			{ label: "Users", to: "/admin/users" }
		];
	}

	return baseLinks;
});

function isActive(path: string) {
	return path === "/admin"
		? route.path === path
		: route.path.startsWith(path);
}

async function signOut() {
	await $fetch("/api/admin/session", {
		method: "DELETE"
	});

	await navigateTo("/admin/login");
}
</script>

<template>
	<div class="bg-app-bg min-h-screen dark:bg-app-bg-dark">
		<a href="#admin-main-content" class="skip-link focus-ring">Skip to content</a>

		<header class="border-b border-app-line/80 bg-app-bg/95 top-0 sticky z-40 backdrop-blur dark:border-app-line-dark dark:bg-app-bg-dark/95">
			<div class="app-shell py-3 space-y-3 lg:py-4">
				<div class="flex gap-3 items-center justify-between">
					<div class="min-w-0">
						<NuxtLink :to="session?.passwordChangeRequiredAt ? '/admin/account' : '/admin'" class="rounded-full inline-flex gap-3 items-center focus-ring">
							<span class="text-app-ink border border-app-line rounded-2xl bg-white inline-flex shrink-0 h-10 w-10 shadow-sm items-center justify-center dark:text-app-text-dark dark:border-app-line-dark dark:bg-app-panel-dark sm:h-11 sm:w-11">
								<span class="i-carbon-settings-adjust text-xl" />
							</span>
							<span class="min-w-0">
								<span class="text-base text-app-ink font-serif block truncate sm:text-lg dark:text-app-text-dark">Ballot Clarity Admin</span>
								<span class="text-xs text-app-muted mt-1 hidden dark:text-app-muted-dark sm:block">Internal editorial and source operations</span>
							</span>
						</NuxtLink>
					</div>

					<div class="flex gap-2 items-center sm:gap-3">
						<NuxtLink to="/admin/account" class="text-xs text-app-muted px-3 py-2 border border-app-line rounded-full bg-white hidden dark:text-app-muted-dark hover:text-app-ink dark:border-app-line-dark dark:bg-app-panel-dark xl:block focus-ring dark:hover:text-app-text-dark">
							{{ session?.displayName || session?.username || "Admin" }} · {{ session?.role || "admin" }}
						</NuxtLink>
						<NuxtLink to="/" class="btn-secondary text-xs sm:text-sm !px-3 !py-2 sm:!px-4">
							Public site
						</NuxtLink>
						<button type="button" class="btn-primary text-xs sm:text-sm !px-3 !py-2 sm:!px-4" @click="signOut">
							Sign out
						</button>
					</div>
				</div>

				<nav class="px-4 pb-1 flex gap-2 overflow-x-auto -mx-4 sm:mx-0 sm:px-0 xl:justify-start lg:justify-center" aria-label="Admin">
					<NuxtLink
						v-for="link in navLinks"
						:key="link.to"
						:to="link.to"
						class="text-sm font-medium px-4 py-2 rounded-full whitespace-nowrap transition focus-ring"
						:class="isActive(link.to)
							? 'bg-app-action text-app-action-text'
							: 'border border-app-line bg-white text-app-muted hover:text-app-ink dark:border-app-line-dark dark:bg-app-panel-dark dark:text-app-muted-dark dark:hover:text-app-text-dark'"
					>
						{{ link.label }}
					</NuxtLink>
				</nav>
				<p v-if="session?.passwordChangeRequiredAt" class="text-sm text-[#8B3A2E] px-4 py-3 rounded-2xl bg-[#F8E6E1] dark:text-[#FFD4CB] dark:bg-[#472722]">
					Change the administrator-issued temporary password before using the rest of the admin workspace.
				</p>
			</div>
		</header>

		<main id="admin-main-content" class="pb-16 pt-6 flex-1 sm:pt-8">
			<slot />
		</main>
	</div>
</template>
