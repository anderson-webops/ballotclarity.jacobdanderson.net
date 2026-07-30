import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function evaluateAuditReport(report) {
	const vulnerabilityNames = Object.keys(report?.vulnerabilities ?? {}).sort();

	return {
		allowed: [],
		ok: vulnerabilityNames.length === 0,
		total: vulnerabilityNames.length,
		unexpected: vulnerabilityNames.map(name => ({
			name,
			reason: "Every npm audit finding must be remediated before release."
		}))
	};
}

export function formatAuditEvaluation(evaluation) {
	if (evaluation.ok)
		return "npm audit passed with no vulnerabilities.";

	return [
		"npm audit found vulnerabilities:",
		...evaluation.unexpected.map(item => `- ${item.name}: ${item.reason}`)
	].join("\n");
}

export function readNpmAuditReport() {
	try {
		return JSON.parse(execFileSync("npm", ["audit", "--workspaces", "--json"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"]
		}));
	}
	catch (error) {
		if (error.stdout)
			return JSON.parse(error.stdout.toString());

		throw error;
	}
}

export function main() {
	const evaluation = evaluateAuditReport(readNpmAuditReport());
	console.log(formatAuditEvaluation(evaluation));

	if (!evaluation.ok)
		process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	main();
