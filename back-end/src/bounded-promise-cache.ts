interface BoundedPromiseCacheOptions {
	maxEntries: number;
	now?: () => number;
	ttlMs: number;
}

interface CacheEntry<Value> {
	expiresAt: number;
	value: Promise<Value>;
}

function requirePositiveInteger(value: number, name: string) {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new TypeError(`${name} must be a positive integer.`);

	return value;
}

export function resolveBoundedCacheInteger(
	value: number | string | null | undefined,
	fallback: number,
) {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createBoundedPromiseCache<Key, Value>({
	maxEntries,
	now = Date.now,
	ttlMs,
}: BoundedPromiseCacheOptions) {
	const resolvedMaxEntries = requirePositiveInteger(maxEntries, "maxEntries");
	const resolvedTtlMs = requirePositiveInteger(ttlMs, "ttlMs");
	const entries = new Map<Key, CacheEntry<Value>>();

	function pruneExpired(currentTime: number) {
		for (const [key, entry] of entries.entries()) {
			if (entry.expiresAt <= currentTime)
				entries.delete(key);
		}
	}

	function makeRoom() {
		while (entries.size >= resolvedMaxEntries) {
			const oldestKey = entries.keys().next().value as Key | undefined;

			if (oldestKey === undefined)
				return;

			entries.delete(oldestKey);
		}
	}

	return {
		getOrCreate(key: Key, create: () => Promise<Value>) {
			const currentTime = now();
			pruneExpired(currentTime);
			const cached = entries.get(key);

			if (cached) {
				entries.delete(key);
				entries.set(key, cached);
				return cached.value;
			}

			makeRoom();
			const pending = create();
			const entry: CacheEntry<Value> = {
				expiresAt: currentTime + resolvedTtlMs,
				value: pending,
			};

			entries.set(key, entry);
			void pending.catch(() => {
				if (entries.get(key) === entry)
					entries.delete(key);
			});

			return pending;
		},
	};
}
