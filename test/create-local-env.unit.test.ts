import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const createLocalEnvScript = fileURLToPath(new URL("../scripts/create-local-env.mjs", import.meta.url));

function readRegularFileSnapshot(path: string) {
	const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);

	try {
		const stats = fstatSync(descriptor);
		assert.equal(stats.isFile(), true);
		return {
			content: readFileSync(descriptor, "utf8"),
			mode: stats.mode & 0o777,
		};
	}
	finally {
		closeSync(descriptor);
	}
}

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
		const initialSnapshot = readRegularFileSnapshot(envPath);
		assert.equal(initialSnapshot.mode, 0o600);

		runCreateLocalEnv(root);
		assert.equal(readRegularFileSnapshot(envPath).content, initialSnapshot.content);

		runCreateLocalEnv(root, true);
		const replacementSnapshot = readRegularFileSnapshot(envPath);
		assert.notEqual(replacementSnapshot.content, initialSnapshot.content);
		assert.equal(replacementSnapshot.mode, 0o600);
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
		assert.equal(readRegularFileSnapshot(envPath).mode, 0o600);
	}
	finally {
		rmSync(root, { force: true, recursive: true });
	}
});
