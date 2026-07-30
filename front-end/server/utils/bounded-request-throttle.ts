interface RequestThrottleState {
	count: number;
	resetAt: number;
}

export interface RequestThrottleResult {
	allowed: boolean;
	capacityLimited: boolean;
	retryAfterSeconds: number;
}

interface BoundedRequestThrottleOptions {
	maxBuckets: number;
	maxRequests: number;
	now?: () => number;
	windowMs: number;
}

function requirePositiveInteger(value: number, name: string) {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new TypeError(`${name} must be a positive integer.`);

	return value;
}

function normalizeThrottleKey(key: string) {
	return key.trim().toLowerCase().slice(0, 128) || "unknown";
}

export function createBoundedRequestThrottle(options: BoundedRequestThrottleOptions) {
	const attempts = new Map<string, RequestThrottleState>();
	const maxBuckets = requirePositiveInteger(options.maxBuckets, "maxBuckets");
	const maxRequests = requirePositiveInteger(options.maxRequests, "maxRequests");
	const windowMs = requirePositiveInteger(options.windowMs, "windowMs");
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
		attempt(key: string): RequestThrottleResult {
			const currentTime = now();
			prune(currentTime);

			const normalizedKey = normalizeThrottleKey(key);
			const current = attempts.get(normalizedKey);

			if (!current) {
				if (attempts.size >= maxBuckets) {
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

			return {
				allowed: true,
				capacityLimited: false,
				retryAfterSeconds: 0
			};
		}
	};
}
