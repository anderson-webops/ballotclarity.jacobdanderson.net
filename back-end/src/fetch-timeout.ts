const defaultFetchTimeoutMs = 15_000;

export function resolveFetchTimeoutMs(
	value: number | string | null | undefined,
	fallback = defaultFetchTimeoutMs
) {
	const parsed = typeof value === "number" ? value : Number(value);
	const normalized = Math.floor(parsed);

	return Number.isSafeInteger(normalized) && normalized > 0
		? normalized
		: fallback;
}

export function createFetchTimeoutSignal(timeoutMs: number) {
	return AbortSignal.timeout(resolveFetchTimeoutMs(timeoutMs));
}
