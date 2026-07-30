import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const accountPage = readFileSync(resolve("src/pages/admin/account.vue"), "utf8");
const adminAuth = readFileSync(resolve("server/utils/admin-auth.ts"), "utf8");
const adminLayout = readFileSync(resolve("src/layouts/admin.vue"), "utf8");
const adminMiddleware = readFileSync(resolve("src/middleware/admin.ts"), "utf8");
const loginPage = readFileSync(resolve("src/pages/admin/login.vue"), "utf8");
const usersPage = readFileSync(resolve("src/pages/admin/users.vue"), "utf8");

test("temporary-password state is preserved in the signed admin session", () => {
	assert.match(adminAuth, /passwordChangeRequiredAt/);
	assert.match(adminAuth, /sessionResponse\.passwordChangeRequiredAt/);
	assert.match(adminAuth, /payload\.passwordChangeRequiredAt/);
});

test("temporary-password sessions are routed to the account password workflow", () => {
	assert.match(adminMiddleware, /session\.passwordChangeRequiredAt/);
	assert.match(adminMiddleware, /to\.path !== "\/admin\/account"/);
	assert.match(loginPage, /loginResponse\.passwordChangeRequiredAt/);
	assert.match(adminLayout, /Change the administrator-issued temporary password/);
	assert.match(accountPage, /Password change required/);
	assert.match(accountPage, /administrator-issued temporary password/);
});

test("account managers can see and explain pending temporary-password rotation", () => {
	assert.match(usersPage, /user\.passwordChangeRequiredAt/);
	assert.match(usersPage, /password change required/);
	assert.match(usersPage, /must replace this temporary password/i);
});
