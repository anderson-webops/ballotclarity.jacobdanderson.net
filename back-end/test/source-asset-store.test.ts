import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSourceAssetStore } from "../src/source-asset-store.js";

function withTemporarySourceDirectory(callback: (directory: string) => void) {
	const directory = mkdtempSync(join(tmpdir(), "ballot-clarity-source-assets-"));

	try {
		callback(directory);
	}
	finally {
		rmSync(directory, { force: true, recursive: true });
	}
}

function withSourceAssetBaseUrl(value: string | undefined, callback: () => void) {
	const previous = process.env.SOURCE_ASSET_BASE_URL;

	try {
		if (value === undefined)
			delete process.env.SOURCE_ASSET_BASE_URL;
		else
			process.env.SOURCE_ASSET_BASE_URL = value;

		callback();
	}
	finally {
		if (previous === undefined)
			delete process.env.SOURCE_ASSET_BASE_URL;
		else
			process.env.SOURCE_ASSET_BASE_URL = previous;
	}
}

test("public-mirror source assets keep existing local source-file links", () => {
	withSourceAssetBaseUrl(undefined, () => {
		withTemporarySourceDirectory((directory) => {
			writeFileSync(join(directory, "existing.txt"), "verified source\n", "utf8");

			const store = createSourceAssetStore({ publicSourceFileDirectory: directory });

			assert.equal(store.resolve("/source-files/existing.txt"), "/source-files/existing.txt");
		});
	});
});

test("public-mirror source assets suppress missing local source-file links", () => {
	withSourceAssetBaseUrl(undefined, () => {
		withTemporarySourceDirectory((directory) => {
			const store = createSourceAssetStore({ publicSourceFileDirectory: directory });

			assert.equal(store.resolve("/source-files/missing.txt"), "");
			assert.equal(store.resolve("/coverage"), "/coverage");
			assert.equal(store.resolve("https://example.test/source.txt"), "https://example.test/source.txt");
		});
	});
});

test("external source asset base still rewrites source-file paths without local file checks", () => {
	withSourceAssetBaseUrl("https://assets.example.test/source-assets/", () => {
		withTemporarySourceDirectory((directory) => {
			const store = createSourceAssetStore({ publicSourceFileDirectory: directory });

			assert.equal(
				store.resolve("/source-files/missing.txt"),
				"https://assets.example.test/source-assets/missing.txt"
			);
			assert.equal(store.resolve("/coverage"), "/coverage");
		});
	});
});

test("source-file links with relative traversal are suppressed", () => {
	withSourceAssetBaseUrl("https://assets.example.test/source-assets/", () => {
		withTemporarySourceDirectory((directory) => {
			const store = createSourceAssetStore({ publicSourceFileDirectory: directory });

			assert.equal(store.resolve("/source-files/../private.txt"), "");
			assert.equal(store.resolve("/source-files/%2e%2e/private.txt"), "");
			assert.equal(store.resolve("/source-files/%252e%252e/private.txt"), "");
		});
	});
});

test("public source links reject executable schemes, embedded credentials, and local-network destinations", () => {
	withSourceAssetBaseUrl(undefined, () => {
		const store = createSourceAssetStore({ publicSourceFileDirectory: null });

		assert.equal(store.resolve("javascript:alert(1)"), "");
		assert.equal(store.resolve("data:text/html,test"), "");
		assert.equal(store.resolve("//attacker.example/source.txt"), "");
		assert.equal(store.resolve("https://user:secret@example.test/source.txt"), "");
		assert.equal(store.resolve("http://127.0.0.1/private"), "");
		assert.equal(store.resolve("http://[::1]/private"), "");
		assert.equal(store.resolve("http://[::ffff:7f00:1]/private"), "");
		assert.equal(store.resolve("https://service.internal/private"), "");
		assert.equal(store.resolve("https:\\\\example.test\\source.txt"), "");
	});
});

test("source asset base configuration rejects unsafe or ambiguous URL forms", () => {
	for (const value of [
		"javascript:alert(1)",
		"https://user:secret@assets.example.test/source-files",
		"https://assets.example.test/source-files?tenant=other",
		"https:\\\\assets.example.test\\source-files",
	]) {
		withSourceAssetBaseUrl(value, () => {
			assert.throws(() => createSourceAssetStore(), /SOURCE_ASSET_BASE_URL/u);
		});
	}
});
