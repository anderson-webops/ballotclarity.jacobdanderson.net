import process from "node:process";

interface AttemptState {
	count: number;
	firstAttemptAt: number;
	lockedUntil: number;
}

interface AdminLoginThrottleOptions {
	accountMaxAttempts?: number;
	ipMaxAttempts?: number;
	lockoutMs?: number;
	maxBuckets?: number;
	windowMs?: number;
}

function getNumberEnv(name: string, fallback: number) {
	const raw = Number(process.env[name]);
	return Number.isSafeInteger(raw) && raw > 0 ? raw : fallback;
}

function requirePositiveInteger(value: number, name: string) {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new TypeError(`${name} must be a positive integer.`);

	return value;
}

function normalizeUsername(username: string) {
	return username.trim().toLowerCase().slice(0, 128) || "unknown";
}

function normalizeIp(ip: string) {
	return ip.trim().toLowerCase().slice(0, 128) || "unknown";
}

export function createAdminLoginThrottle(options: AdminLoginThrottleOptions = {}) {
	const attempts = new Map<string, AttemptState>();
	const windowMs = requirePositiveInteger(
		options.windowMs ?? getNumberEnv("ADMIN_LOGIN_WINDOW_MS", 15 * 60 * 1000),
		"windowMs",
	);
	const accountMaxAttempts = requirePositiveInteger(
		options.accountMaxAttempts ?? getNumberEnv("ADMIN_LOGIN_MAX_ATTEMPTS", 5),
		"accountMaxAttempts",
	);
	const ipMaxAttempts = requirePositiveInteger(
		options.ipMaxAttempts ?? getNumberEnv("ADMIN_LOGIN_IP_MAX_ATTEMPTS", 25),
		"ipMaxAttempts",
	);
	const lockoutMs = requirePositiveInteger(
		options.lockoutMs ?? getNumberEnv("ADMIN_LOGIN_LOCKOUT_MS", 30 * 60 * 1000),
		"lockoutMs",
	);
	const maxBuckets = requirePositiveInteger(
		options.maxBuckets ?? getNumberEnv("ADMIN_LOGIN_MAX_BUCKETS", 10_000),
		"maxBuckets",
	);

	function prune(now: number) {
		for (const [key, state] of attempts.entries()) {
			if (state.lockedUntil > 0 && state.lockedUntil > now)
				continue;

			if (now - state.firstAttemptAt > windowMs)
				attempts.delete(key);
		}
	}

	function getAttemptKeys(username: string, ip: string) {
		return {
			accountKey: `account:${normalizeUsername(username)}`,
			ipKey: `ip:${normalizeIp(ip)}`,
		};
	}

	function getMaximumAttempts(key: string) {
		return key.startsWith("ip:") ? ipMaxAttempts : accountMaxAttempts;
	}

	function getCapacityRetryAfterSeconds(now: number) {
		let earliestResetAt = Number.POSITIVE_INFINITY;

		for (const state of attempts.values()) {
			const resetAt = state.lockedUntil > now
				? state.lockedUntil
				: state.firstAttemptAt + windowMs;
			earliestResetAt = Math.min(earliestResetAt, resetAt);
		}

		return Number.isFinite(earliestResetAt)
			? Math.max(1, Math.ceil((earliestResetAt - now) / 1000))
			: Math.max(1, Math.ceil(windowMs / 1000));
	}

	return {
		check(username: string, ip: string) {
			const now = Date.now();
			prune(now);
			const { accountKey, ipKey } = getAttemptKeys(username, ip);
			const keys = [accountKey, ipKey];
			let retryAfterSeconds = keys.reduce((maximum, key) => {
				const state = attempts.get(key);

				if (!state || state.lockedUntil <= now)
					return maximum;

				return Math.max(
					maximum,
					Math.max(1, Math.ceil((state.lockedUntil - now) / 1000))
				);
			}, 0);
			const newBucketCount = keys.filter(key => !attempts.has(key)).length;
			const capacityLimited = retryAfterSeconds === 0 && attempts.size + newBucketCount > maxBuckets;

			if (capacityLimited)
				retryAfterSeconds = getCapacityRetryAfterSeconds(now);

			return {
				accountKey,
				allowed: retryAfterSeconds === 0 && !capacityLimited,
				capacityLimited,
				keys,
				retryAfterSeconds,
			};
		},
		clear(key: string) {
			attempts.delete(key);
		},
		recordFailure(keys: string[]) {
			const now = Date.now();

			for (const key of keys) {
				const current = attempts.get(key);

				if (!current || now - current.firstAttemptAt > windowMs) {
					if (!current && attempts.size >= maxBuckets)
						continue;

					attempts.set(key, {
						count: 1,
						firstAttemptAt: now,
						lockedUntil: 0
					});
					continue;
				}

				const nextCount = current.count + 1;
				attempts.set(key, {
					count: nextCount,
					firstAttemptAt: current.firstAttemptAt,
					lockedUntil: nextCount >= getMaximumAttempts(key) ? now + lockoutMs : 0
				});
			}
		}
	};
}
