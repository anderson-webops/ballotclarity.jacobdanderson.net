import type { AdminSessionResponse } from "~/types/civic";

export default defineNuxtRouteMiddleware(async (to) => {
	const session = await $fetch<AdminSessionResponse>("/api/admin/session", {
		headers: import.meta.server ? useRequestHeaders(["cookie"]) : undefined
	});

	if (!session.configured) {
		return abortNavigation(createError({
			statusCode: 503,
			statusMessage: "Admin portal is not configured."
		}));
	}

	if (!session.authenticated) {
		return navigateTo({
			path: "/admin/login",
			query: {
				redirect: to.fullPath
			}
		});
	}

	if (session.passwordChangeRequiredAt && to.path !== "/admin/account")
		return navigateTo("/admin/account");
});
