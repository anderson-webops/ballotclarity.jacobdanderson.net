import process from "node:process";
import { createCongressClient } from "./congress.js";
import { buildLaunchDirectorySnapshot, writeLaunchDirectorySnapshot } from "./launch-directory.js";
import { createLogger, sanitizeLogText } from "./logger.js";
import { createOpenStatesClient } from "./openstates.js";

const logger = createLogger("ballot-clarity-launch-directory-sync");

async function main() {
	try {
		const snapshot = await buildLaunchDirectorySnapshot({
			congressClient: createCongressClient(),
			openStatesClient: createOpenStatesClient()
		});
		const outputPath = writeLaunchDirectorySnapshot(snapshot);

		logger.info("launch_directory.sync_completed", {
			outputPath: sanitizeLogText(outputPath, 512),
		});
		process.exit(0);
	}
	catch (error) {
		logger.error("launch_directory.sync_failed", {
			error: sanitizeLogText(
				error instanceof Error ? error.message : "Unable to sync launch directory snapshot.",
				512,
			),
		});
		process.exit(1);
	}
}

void main();
