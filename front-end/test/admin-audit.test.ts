import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const auditPage = readFileSync(resolve("src/pages/admin/audit.vue"), "utf8");
const adminLayout = readFileSync(resolve("src/layouts/admin.vue"), "utf8");
const adminAuth = readFileSync(resolve("server/utils/admin-auth.ts"), "utf8");
const auditRoute = readFileSync(resolve("server/api/admin/audit.get.ts"), "utf8");

test("admin audit trail is exposed as an admin-only operations page", () => {
	assert.match(auditPage, /Immutable audit trail/);
	assert.match(auditPage, /Hash chain verified/);
	assert.match(auditPage, /Latest hash/);
	assert.match(auditPage, /Most recent audit events/);
	assert.match(adminLayout, /Audit trail/);
	assert.match(adminAuth, /Only admin users can view the immutable audit trail/);
	assert.match(adminAuth, /x-admin-session-token/);
	assert.doesNotMatch(adminAuth, /x-admin-actor-(?:display-name|role|username)/);
	assert.match(auditRoute, /getAdminAudit/);
});
