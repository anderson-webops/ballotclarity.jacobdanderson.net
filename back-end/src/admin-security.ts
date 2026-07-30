import type { AdminSecurityStatus, AdminSecurityUser, AdminUser } from "./types/civic.js";

function toSecurityUser(user: AdminUser): AdminSecurityUser {
	return {
		displayName: user.displayName,
		id: user.id,
		role: user.role,
		username: user.username
	};
}

export function buildAdminSecurityStatus(users: AdminUser[]): AdminSecurityStatus {
	const activeUsers = users.filter(user => !user.disabledAt);
	const usersWithoutMfa = activeUsers
		.filter(user => !user.mfaEnabledAt)
		.map(toSecurityUser);
	const usersRequiringPasswordChange = activeUsers
		.filter(user => user.passwordChangeRequiredAt)
		.map(toSecurityUser);
	const activeUserCount = activeUsers.length;
	const mfaEnabledUserCount = activeUsers.filter(user => user.mfaEnabledAt).length;

	if (!activeUserCount) {
		return {
			activeAdminCount: 0,
			activeUserCount: 0,
			mfaEnabledUserCount: 0,
			passwordChangeRequiredUserCount: 0,
			status: "needs_attention",
			summary: "No active admin-portal users are configured.",
			usersRequiringPasswordChange: [],
			usersWithoutMfa: [],
		};
	}

	const summaryParts: string[] = [];

	if (usersWithoutMfa.length) {
		summaryParts.push(usersWithoutMfa.length === 1
			? "1 active admin-portal account still needs MFA."
			: `${usersWithoutMfa.length} active admin-portal accounts still need MFA.`);
	}

	if (usersRequiringPasswordChange.length) {
		summaryParts.push(usersRequiringPasswordChange.length === 1
			? "1 active account must replace an administrator-issued temporary password."
			: `${usersRequiringPasswordChange.length} active accounts must replace administrator-issued temporary passwords.`);
	}

	return {
		activeAdminCount: activeUsers.filter(user => user.role === "admin").length,
		activeUserCount,
		mfaEnabledUserCount,
		passwordChangeRequiredUserCount: usersRequiringPasswordChange.length,
		status: summaryParts.length ? "needs_attention" : "healthy",
		summary: summaryParts.join(" ") || "All active admin-portal accounts have MFA enabled and no temporary passwords remain.",
		usersRequiringPasswordChange,
		usersWithoutMfa,
	};
}
