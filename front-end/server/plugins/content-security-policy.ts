import { analyticsTrackers } from "../../src/constants/index";
import {
	buildContentSecurityPolicy,
	collectTrustedInlineScriptHashes,
} from "../utils/content-security-policy";

const analyticsOrigins = analyticsTrackers.map(tracker => `https://${tracker.domain}`);
const htmlDocumentPattern = /<(?:!doctype\s+html|html)\b/iu;

export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("render:response", (response, context) => {
		if (typeof response.body !== "string" || !htmlDocumentPattern.test(response.body))
			return;

		const runtimeConfig = useRuntimeConfig(context.event);
		const headers = response.headers ?? {};
		headers["content-security-policy"] = buildContentSecurityPolicy({
			analyticsOrigins,
			inlineScriptHashes: collectTrustedInlineScriptHashes(response.body),
			publicApiBase: String(runtimeConfig.public.apiBase || ""),
		});
		response.headers = headers;
	});
});
