import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readJson(path: string) {
	return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as Record<string, unknown>;
}

function readText(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

test("repository package metadata uses the project license consistently", () => {
	const rootPackage = readJson("package.json");
	const frontEndPackage = readJson("front-end/package.json");
	const backEndPackage = readJson("back-end/package.json");
	const packageLock = readJson("package-lock.json");
	const lockedPackages = packageLock.packages as Record<string, Record<string, unknown>>;

	assert.equal(rootPackage.license, "MIT");
	assert.equal(frontEndPackage.license, "MIT");
	assert.equal(backEndPackage.license, "MIT");
	assert.equal(lockedPackages[""].license, "MIT");
	assert.equal(lockedPackages["front-end"].license, "MIT");
	assert.equal(lockedPackages["back-end"].license, "MIT");
});

test("repository public identity no longer reads as the starter template", () => {
	const readme = readText("README.md");
	const license = readText("LICENSE");
	const notice = readText("NOTICE.md");

	assert.match(license, /Copyright \(c\) 2026 Jacob Anderson/);
	assert.doesNotMatch(license, /Anthony Fu/);
	assert.doesNotMatch(readme, /antfu\/vitesse-nuxt/);
	assert.match(readme, /License and attribution/);
	assert.match(notice, /Vitesse Nuxt/);
	assert.match(notice, /Anthony Fu/);
});

test("repository package descriptions no longer use pre-launch MVP framing", () => {
	const packages = [readJson("package.json"), readJson("front-end/package.json"), readJson("back-end/package.json")];

	for (const pkg of packages) {
		assert.equal(typeof pkg.description, "string");
		assert.doesNotMatch(pkg.description, /\bMVP\b/i);
		assert.match(pkg.description, /Ballot Clarity civic-information service/);
	}
});

test("repository install-script approvals are explicit and version-scoped", () => {
	const rootPackage = readJson("package.json");
	const rootAllowScripts = rootPackage.allowScripts as Record<string, boolean> | undefined;

	assert.deepEqual(rootAllowScripts, {
		"@parcel/watcher@2.5.6": true,
		"esbuild@0.28.1": true,
		"fsevents@2.3.3": true,
		puppeteer: false,
		"unrs-resolver@1.12.2": true
	});
	assert.match(readText(".npmrc"), /^strict-allow-scripts=true$/mu);
	assert.match(readText("back-end/.npmrc"), /^allow-scripts=esbuild@0\.28\.1,fsevents@2\.3\.3$/mu);
	assert.match(readText("back-end/.npmrc"), /^strict-allow-scripts=true$/mu);
	assert.match(
		rootPackage.scripts["verify:backend-lockfile"],
		/npm ci --prefix back-end --workspaces=false --include=optional --strict-allow-scripts/u
	);
});
