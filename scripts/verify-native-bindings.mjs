import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockfile = JSON.parse(readFileSync(resolve(repoRoot, "package-lock.json"), "utf8"));
const bindingFamilies = [
	"node_modules/@oxc-parser/binding-linux-arm64",
	"node_modules/@rolldown/binding-linux-arm64",
	"node_modules/@unocss/transformer-attributify-jsx/node_modules/@oxc-parser/binding-linux-arm64",
	"node_modules/@unrs/resolver-binding-linux-arm64",
	"node_modules/lightningcss-linux-arm64",
	"node_modules/vite/node_modules/@rolldown/binding-linux-arm64",
];
const expectedLockfilePaths = [
	"node_modules/@esbuild/linux-arm64",
	...bindingFamilies.flatMap(family => [`${family}-gnu`, `${family}-musl`]),
];
const missingLockfilePaths = expectedLockfilePaths.filter((packagePath) => {
	const packageRecord = lockfile.packages?.[packagePath];

	return !packageRecord
		|| packageRecord.optional !== true
		|| !packageRecord.cpu?.includes("arm64")
		|| !packageRecord.os?.includes("linux")
		|| !packageRecord.integrity;
});

if (missingLockfilePaths.length) {
	console.error("Linux ARM64 native optional packages are missing or incomplete in package-lock.json:");
	for (const packagePath of missingLockfilePaths)
		console.error(`- ${packagePath}`);
	process.exitCode = 1;
}

if (process.platform === "linux" && process.arch === "arm64") {
	const runtimeVariant = process.report.getReport().header.glibcVersionRuntime ? "gnu" : "musl";
	const expectedInstalledPaths = [
		"node_modules/@esbuild/linux-arm64",
		...bindingFamilies.map(family => `${family}-${runtimeVariant}`),
	];
	const missingInstalledPaths = expectedInstalledPaths.filter(
		packagePath => !existsSync(resolve(repoRoot, packagePath, "package.json"))
	);

	if (missingInstalledPaths.length) {
		console.error(`Linux ARM64 ${runtimeVariant} native packages were not installed:`);
		for (const packagePath of missingInstalledPaths)
			console.error(`- ${packagePath}`);
		process.exitCode = 1;
	}
}

if (!process.exitCode)
	console.log("Linux ARM64 native binding lockfile and installation checks passed.");
