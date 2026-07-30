import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	lstatSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const createLocalEnvScript = fileURLToPath(new URL("../scripts/create-local-env.mjs", import.meta.url));

function runCreateLocalEnv(cwd: string, force = false) {
	execFileSync(
		process.execPath,
		[createLocalEnvScript, ...(force ? ["--force"] : [])],
		{
			cwd,
			stdio: "pipe",
		},
	);
}

test("local environment creation is exclusive, owner-only, and atomically replaceable", () => {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-create-env-"));
	const envPath = join(root, ".env");

	try {
		runCreateLocalEnv(root);
		const initialContent = readFileSync(envPath, "utf8");
		assert.equal(statSync(envPath).mode & 0o777, 0o600);

		runCreateLocalEnv(root);
		assert.equal(readFileSync(envPath, "utf8"), initialContent);

		runCreateLocalEnv(root, true);
		assert.notEqual(readFileSync(envPath, "utf8"), initialContent);
		assert.equal(statSync(envPath).mode & 0o777, 0o600);
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("local environment creation does not follow an existing symlink", () => {
	const root = mkdtempSync(join(tmpdir(), "ballot-clarity-create-env-link-"));
	const envPath = join(root, ".env");
	const sentinelPath = join(root, "sentinel");
	const sentinel = "do-not-overwrite";

	try {
		writeFileSync(sentinelPath, sentinel, "utf8");
		symlinkSync(sentinelPath, envPath);

		runCreateLocalEnv(root);
		assert.equal(lstatSync(envPath).isSymbolicLink(), true);
		assert.equal(readFileSync(sentinelPath, "utf8"), sentinel);

		runCreateLocalEnv(root, true);
		assert.equal(lstatSync(envPath).isSymbolicLink(), false);
		assert.equal(readFileSync(sentinelPath, "utf8"), sentinel);
		assert.equal(statSync(envPath).mode & 0o777, 0o600);
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});
