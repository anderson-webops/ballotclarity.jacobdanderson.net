import process from "node:process";

interface PublicRequestThrottleState {
	count: number;
	resetAt: number;
}

export interface PublicRequestThrottleResult {
	allowed: boolean;
	capacityLimited: boolean;
	retryAfterSeconds: number;
}

export interface PublicRequestThrottle {
	attempt: (key: string) => PublicRequestThrottleResult;
}

interface PublicRequestThrottleOptions {
	fallbackMaxRequests?: number;
	fallbackMaxBuckets?: number;
	fallbackWindowMs?: number;
	maxBuckets?: number;
	maxBucketsEnvName?: string;
	maxRequests?: number;
	maxRequestsEnvName?: string;
	now?: () => number;
	windowMs?: number;
	windowMsEnvName?: string;
}

function getNumberEnv(name: string | undefined, fallback: number) {
	if (!name)
		return fallback;

	const raw = Number(process.env[name]);
	return Number.isSafeInteger(raw) && raw > 0 ? raw : fallback;
}

function requirePositiveInteger(value: number, name: string) {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new TypeError(`${name} must be a positive integer.`);

	return value;
}

function normalizeThrottleKey(key: string) {
	return key.trim().toLowerCase().slice(0, 128) || "unknown";
}

export function createPublicRequestThrottle(options: PublicRequestThrottleOptions = {}): PublicRequestThrottle {
	const attempts = new Map<string, PublicRequestThrottleState>();
	const fallbackWindowMs = options.fallbackWindowMs ?? 10 * 60 * 1000;
	const fallbackMaxRequests = options.fallbackMaxRequests ?? 5;
	const fallbackMaxBuckets = options.fallbackMaxBuckets ?? 10_000;
	const windowMs = requirePositiveInteger(
		options.windowMs ?? getNumberEnv(options.windowMsEnvName, fallbackWindowMs),
		"windowMs",
	);
	const maxRequests = requirePositiveInteger(
		options.maxRequests ?? getNumberEnv(options.maxRequestsEnvName, fallbackMaxRequests),
		"maxRequests",
	);
	const maxBuckets = requirePositiveInteger(
		options.maxBuckets ?? getNumberEnv(options.maxBucketsEnvName, fallbackMaxBuckets),
		"maxBuckets",
	);
	const now = options.now ?? Date.now;

	function prune(currentTime: number) {
		for (const [key, state] of attempts.entries()) {
			if (state.resetAt <= currentTime)
				attempts.delete(key);
		}
	}

	function getCapacityRetryAfterSeconds(currentTime: number) {
		let earliestResetAt = Number.POSITIVE_INFINITY;

		for (const state of attempts.values())
			earliestResetAt = Math.min(earliestResetAt, state.resetAt);

		return Number.isFinite(earliestResetAt)
			? Math.max(1, Math.ceil((earliestResetAt - currentTime) / 1000))
			: Math.max(1, Math.ceil(windowMs / 1000));
	}

	return {
		attempt(key: string) {
			const currentTime = now();
			prune(currentTime);

			const normalizedKey = normalizeThrottleKey(key);
			const current = attempts.get(normalizedKey);

			if (!current || current.resetAt <= currentTime) {
				if (!current && attempts.size >= maxBuckets) {
					return {
						allowed: false,
						capacityLimited: true,
						retryAfterSeconds: getCapacityRetryAfterSeconds(currentTime)
					};
				}

				attempts.set(normalizedKey, {
					count: 1,
					resetAt: currentTime + windowMs
				});

				return {
					allowed: true,
					capacityLimited: false,
					retryAfterSeconds: 0
				};
			}

			if (current.count >= maxRequests) {
				return {
					allowed: false,
					capacityLimited: false,
					retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - currentTime) / 1000))
				};
			}

			current.count += 1;
			attempts.set(normalizedKey, current);

			return {
				allowed: true,
				capacityLimited: false,
				retryAfterSeconds: 0
			};
		}
	};
}
