export const defaultRequestTimeoutMs = 15_000;

export function resolveRequestTimeoutMs(
	value: number | string | null | undefined,
	fallback = defaultRequestTimeoutMs
) {
	const parsed = typeof value === "number" ? value : Number(value);
	const normalized = Math.floor(parsed);

	return Number.isSafeInteger(normalized) && normalized > 0
		? normalized
		: fallback;
}
