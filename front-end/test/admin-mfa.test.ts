import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const loginPage = readFileSync(resolve("src/pages/admin/login.vue"), "utf8");
const accountPage = readFileSync(resolve("src/pages/admin/account.vue"), "utf8");
const usersPage = readFileSync(resolve("src/pages/admin/users.vue"), "utf8");
const dashboardPage = readFileSync(resolve("src/pages/admin/index.vue"), "utf8");
const adminAuth = readFileSync(resolve("server/utils/admin-auth.ts"), "utf8");
const adminOriginMiddleware = readFileSync(resolve("server/middleware/admin-origin.ts"), "utf8");
const sessionPostRoute = readFileSync(resolve("server/api/admin/session.post.ts"), "utf8");
const mfaSetupRoute = readFileSync(resolve("server/api/admin/session/mfa/setup.post.ts"), "utf8");
const mfaEnableRoute = readFileSync(resolve("server/api/admin/session/mfa/enable.post.ts"), "utf8");
const mfaDisableRoute = readFileSync(resolve("server/api/admin/session/mfa/disable.post.ts"), "utf8");

test("admin login supports an MFA challenge without creating a generic failure", () => {
	assert.match(loginPage, /mfaRequired/);
	assert.match(loginPage, /autocomplete="one-time-code"/);
	assert.match(loginPage, /Verify code/);
	assert.match(sessionPostRoute, /mfaCode/);
	assert.match(adminAuth, /loginResponse\.mfaRequired/);
	assert.match(adminAuth, /setAdminSessionCookie/);
});

test("admin account page exposes MFA setup and disable controls", () => {
	assert.match(accountPage, /Start MFA setup/);
	assert.match(accountPage, /Enable MFA/);
	assert.match(accountPage, /Disable MFA/);
	assert.match(accountPage, /setup key/i);
	assert.match(accountPage, /enableCurrentPassword/);
	assert.match(accountPage, /mfaEnabledAt/);
	assert.match(mfaSetupRoute, /createAdminMfaSetup/);
	assert.match(mfaEnableRoute, /enableAdminMfa/);
	assert.match(mfaDisableRoute, /disableAdminMfa/);
});

test("admin users page exposes MFA state and admin reset", () => {
	assert.match(usersPage, /MFA enabled/);
	assert.match(usersPage, /MFA not enabled/);
	assert.match(usersPage, /Reset MFA/);
	assert.match(usersPage, /mfaReset: true/);
	assert.match(adminAuth, /\/admin\/auth\/mfa\/setup/);
	assert.match(adminAuth, /\/admin\/auth\/mfa\/enable/);
	assert.match(adminAuth, /\/admin\/auth\/mfa\/disable/);
	assert.match(adminAuth, /currentPassword/);
});

test("admin dashboard exposes MFA coverage from the protected overview", () => {
	assert.match(dashboardPage, /overview\.value\?\.security/);
	assert.match(dashboardPage, /Account security/);
	assert.match(dashboardPage, /Admin MFA coverage/);
	assert.match(dashboardPage, /security\.mfaEnabledUserCount/);
	assert.match(dashboardPage, /security\.usersWithoutMfa/);
	assert.match(dashboardPage, /Manage users/);
});

test("admin sessions use secure cookies, signed backend delegation, and same-origin mutation checks", () => {
	assert.match(adminAuth, /__Host-ballot_clarity_admin_session/);
	assert.match(adminAuth, /httpOnly: true/);
	assert.match(adminAuth, /sameSite: "strict"/);
	assert.match(adminAuth, /secure: process\.env\.NODE_ENV === "production"/);
	assert.match(adminAuth, /x-admin-session-token/);
	assert.doesNotMatch(adminAuth, /x-admin-actor-(?:display-name|role|username)/);
	assert.match(adminOriginMiddleware, /pathname\.startsWith\("\/api\/admin"\)/);
	assert.match(adminOriginMiddleware, /isAllowedAdminMutationOrigin/);
	assert.match(adminOriginMiddleware, /no-store, private/);
});
