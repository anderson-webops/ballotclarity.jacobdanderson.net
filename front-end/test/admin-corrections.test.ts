import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const correctionsPage = readFileSync(resolve("src/pages/admin/corrections.vue"), "utf8");

test("admin corrections queue exposes linked content workflow controls", () => {
	assert.match(correctionsPage, /useAdminSession\("admin-corrections-session"\)/);
	assert.match(correctionsPage, /useAdminContent\(\)/);
	assert.match(correctionsPage, /Linked content record/);
	assert.match(correctionsPage, /v-model="item\.contentId"/);
	assert.match(correctionsPage, /`\/admin\/content\/\$\{item\.contentId\}`/);
	assert.match(correctionsPage, /canManagePublicCorrections/);
	assert.match(correctionsPage, /Boolean\(session\.value\.mfaEnabledAt\)/);
	assert.match(correctionsPage, /New submissions remain private/);
});
