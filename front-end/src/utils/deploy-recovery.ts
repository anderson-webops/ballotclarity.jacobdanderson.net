const staleChunkPattern = new RegExp([
	"failed to fetch dynamically imported module",
	"error loading dynamically imported module",
	"importing a module script failed",
	"loading chunk",
	"chunkloaderror",
	"failed to load module script",
	"unable to preload css",
	"css chunk",
	"vite:preloaderror",
].join("|"), "i");
const nuxtAssetPattern = /\/_nuxt\/[^"' )]+\.(?:js|mjs|css)(?:\?[^"' )]*)?$/i;
export const staleClientBuildStorageKey = "ballot-clarity:client-build-id";
export const staleClientNoticeId = "ballot-clarity-stale-client-notice";
export const staleClientReloadKeyPrefix = "ballot-clarity:stale-client-reload:";
const staleClientReloadMessage = "Ballot Clarity updated. Reloading…";

interface ErrorLike {
	currentTarget?: unknown;
	detail?: unknown;
	filename?: string | null;
	href?: string | null;
	message?: string | null;
	path?: string | null;
	payload?: unknown;
	reason?: unknown;
	sourceURL?: string | null;
	src?: string | null;
	stack?: string | null;
	tagName?: string | null;
	target?: unknown;
	type?: string | null;
	url?: string | null;
}

interface StorageLike {
	getItem: (key: string) => null | string;
	key?: (index: number) => null | string;
	length?: number;
	removeItem?: (key: string) => void;
	setItem: (key: string, value: string) => void;
}

interface ServiceWorkerRegistrationLike {
	unregister: () => Promise<boolean>;
}

interface NavigatorLike {
	serviceWorker?: {
		getRegistrations: () => Promise<readonly ServiceWorkerRegistrationLike[]>;
	};
}

function toStringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function readAssetUrl(value: unknown): string {
	if (!value || typeof value !== "object")
		return "";

	const error = value as ErrorLike;
	const directUrl = [
		error.src,
		error.href,
		error.filename,
		error.sourceURL,
		error.url,
		error.path,
	].map(toStringValue).find(Boolean);

	if (directUrl)
		return directUrl;

	for (const nestedValue of [error.target, error.currentTarget, error.detail, error.payload, error.reason]) {
		const nestedUrl = readAssetUrl(nestedValue);

		if (nestedUrl)
			return nestedUrl;
	}

	return "";
}

function toMessage(value: unknown): string {
	if (value instanceof Error)
		return `${value.name}: ${value.message} ${value.stack ?? ""}`.trim();

	if (typeof value === "string")
		return value;

	if (value && typeof value === "object") {
		const maybeError = value as ErrorLike;
		const parts = [
			typeof maybeError.type === "string" ? maybeError.type : "",
			typeof maybeError.message === "string" ? maybeError.message : "",
			typeof maybeError.stack === "string" ? maybeError.stack : "",
			typeof maybeError.filename === "string" ? maybeError.filename : "",
			typeof maybeError.sourceURL === "string" ? maybeError.sourceURL : "",
			typeof maybeError.url === "string" ? maybeError.url : "",
			typeof maybeError.path === "string" ? maybeError.path : "",
			readAssetUrl(maybeError),
			maybeError.detail ? toMessage(maybeError.detail) : "",
			maybeError.payload ? toMessage(maybeError.payload) : "",
			maybeError.reason ? toMessage(maybeError.reason) : "",
		];

		return parts.filter(Boolean).join(" ").trim();
	}

	return "";
}

export function isLikelyStaleNuxtChunkError(error: unknown): boolean {
	const combined = toMessage(error);
	const assetUrl = readAssetUrl(error);

	if (assetUrl && nuxtAssetPattern.test(assetUrl))
		return staleChunkPattern.test(combined) || combined.includes("/_nuxt/") || !combined;

	if (!combined)
		return false;

	if (nuxtAssetPattern.test(combined))
		return staleChunkPattern.test(combined) || combined.includes("/_nuxt/");

	return staleChunkPattern.test(combined);
}

export function normalizeBuildId(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function readServerBuildId(doc: Pick<Document, "documentElement" | "querySelector"> = document): string {
	const htmlBuildId = doc.documentElement.getAttribute("data-app-build");

	if (htmlBuildId)
		return normalizeBuildId(htmlBuildId);

	const metaTag = doc.querySelector<HTMLMetaElement>("meta[name='ballot-clarity-build-id']");

	return normalizeBuildId(metaTag?.content);
}

export function readStoredClientBuildId(storage: StorageLike = window.sessionStorage): string {
	try {
		return normalizeBuildId(storage.getItem(staleClientBuildStorageKey));
	}
	catch {
		return "";
	}
}

export function hasBuildMismatch(clientBuildId: string, serverBuildId: string): boolean {
	return Boolean(clientBuildId && serverBuildId && clientBuildId !== serverBuildId);
}

export function recoveryReloadKey(targetBuildId: string) {
	return `${staleClientReloadKeyPrefix}${targetBuildId || "unknown"}`;
}

export function shouldRecoverFromBuildMismatch(
	clientBuildId: string,
	serverBuildId: string,
	storage: Pick<StorageLike, "getItem"> = window.sessionStorage
): boolean {
	if (!hasBuildMismatch(clientBuildId, serverBuildId))
		return false;

	try {
		return storage.getItem(recoveryReloadKey(serverBuildId)) !== "1";
	}
	catch {
		return true;
	}
}

export function persistClientBuildId(clientBuildId: string, storage: StorageLike = window.sessionStorage) {
	const normalizedClientBuildId = normalizeBuildId(clientBuildId);

	if (!normalizedClientBuildId)
		return;

	try {
		storage.setItem(staleClientBuildStorageKey, normalizedClientBuildId);

		if (typeof storage.length !== "number" || typeof storage.key !== "function" || typeof storage.removeItem !== "function")
			return;

		const staleRecoveryKeys: string[] = [];

		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);

			if (key?.startsWith(staleClientReloadKeyPrefix))
				staleRecoveryKeys.push(key);
		}

		for (const key of staleRecoveryKeys)
			storage.removeItem(key);
	}
	catch {
		// Ignore storage failures and keep the runtime usable.
	}
}

function ensureReloadNotice(message: string) {
	const existing = document.getElementById(staleClientNoticeId);

	if (existing) {
		existing.textContent = message;
		return;
	}

	if (!document.body)
		return;

	const notice = document.createElement("div");
	notice.id = staleClientNoticeId;
	notice.setAttribute("role", "status");
	notice.setAttribute("aria-live", "polite");
	notice.textContent = message;
	notice.style.position = "fixed";
	notice.style.right = "1rem";
	notice.style.bottom = "1rem";
	notice.style.zIndex = "9999";
	notice.style.maxWidth = "20rem";
	notice.style.padding = "0.85rem 1rem";
	notice.style.borderRadius = "1rem";
	notice.style.background = "rgba(16, 37, 62, 0.96)";
	notice.style.boxShadow = "0 24px 48px -28px rgba(0, 0, 0, 0.45)";
	notice.style.color = "#fff";
	notice.style.font = "600 0.92rem/1.45 \"Public Sans\", system-ui, sans-serif";
	notice.style.pointerEvents = "none";
	document.body.append(notice);
}

export function triggerStaleClientRecovery(targetBuildId: string, message = staleClientReloadMessage): boolean {
	const reloadKey = recoveryReloadKey(targetBuildId);

	try {
		if (window.sessionStorage.getItem(reloadKey)) {
			ensureReloadNotice("Ballot Clarity updated. Please refresh this page.");
			return false;
		}

		window.sessionStorage.setItem(reloadKey, "1");
	}
	catch {
		// Ignore sessionStorage failures and still attempt a single runtime reload.
	}

	ensureReloadNotice(message);

	window.setTimeout(() => {
		window.location.reload();
	}, 150);

	return true;
}

export function buildPreHydrationDeployRecoveryScript() {
	return "(function(){try{const normalizeBuildId=(value)=>typeof value===\"string\"?value.trim():\"\";const readServerBuildId=()=>{const htmlBuildId=document.documentElement.getAttribute(\"data-app-build\");if(htmlBuildId)return normalizeBuildId(htmlBuildId);const metaTag=document.querySelector('meta[name=\"ballot-clarity-build-id\"]');return normalizeBuildId(metaTag&&metaTag.content);};const serverBuildId=readServerBuildId();const clientBuildId=normalizeBuildId(window.sessionStorage.getItem(\"ballot-clarity:client-build-id\"));if(!serverBuildId||!clientBuildId||serverBuildId===clientBuildId)return;const reloadKey=\"ballot-clarity:stale-client-reload:\"+(serverBuildId||\"unknown\");if(window.sessionStorage.getItem(reloadKey)){document.documentElement.setAttribute(\"data-stale-client-recovery\",\"already-requested\");return;}window.sessionStorage.setItem(reloadKey,\"1\");document.documentElement.setAttribute(\"data-stale-client-recovery\",\"pending\");window.location.reload();}catch{}})();";
}

export async function unregisterStaleServiceWorkers(navigatorLike: NavigatorLike = window.navigator): Promise<number> {
	if (!navigatorLike.serviceWorker?.getRegistrations)
		return 0;

	try {
		const registrations = await navigatorLike.serviceWorker.getRegistrations();

		await Promise.all(registrations.map(async registration => await registration.unregister().catch(() => false)));
		return registrations.length;
	}
	catch {
		return 0;
	}
}
