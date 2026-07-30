import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const contentPage = readFileSync(resolve("src/pages/admin/content.vue"), "utf8");
const contentHistoryPage = readFileSync(resolve("src/pages/admin/content/[id].vue"), "utf8");

test("admin content publishing binds reviewer identity to the MFA-protected session", () => {
	assert.match(contentPage, /Publish approval/);
	assert.doesNotMatch(contentPage, /v-model="item\.publishApprovedBy"/);
	assert.match(contentPage, /Approved by \{\{ session\?\.displayName \|\| session\?\.username \}\}/);
	assert.match(contentPage, /canPublish/);
	assert.match(contentPage, /mfaEnabledAt/);
	assert.match(contentPage, /v-model="item\.publishApprovalNote"/);
	assert.match(contentPage, /Unpublishing clears the\s+approval/);
	assert.match(contentHistoryPage, /Publish approved by/);
	assert.match(contentHistoryPage, /Publish approval note/);
});
