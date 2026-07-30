import type {
	ClientRateLimitInfo,
	Options,
	Store,
} from "express-rate-limit";

interface BoundedRateLimitStoreOptions {
	maxEntries: number;
	now?: () => number;
}

interface RateLimitEntry {
	resetTime: Date;
	totalHits: number;
}

function requirePositiveInteger(value: number, name: string) {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new TypeError(`${name} must be a positive integer.`);

	return value;
}

export class BoundedRateLimitStore implements Store {
	readonly localKeys = true;
	private readonly entries = new Map<string, RateLimitEntry>();
	private readonly maxEntries: number;
	private readonly now: () => number;
	private windowMs = 60_000;

	constructor(options: BoundedRateLimitStoreOptions) {
		this.maxEntries = requirePositiveInteger(options.maxEntries, "maxEntries");
		this.now = options.now ?? Date.now;
	}

	init(options: Options) {
		this.windowMs = requirePositiveInteger(options.windowMs, "windowMs");
	}

	get(key: string): ClientRateLimitInfo | undefined {
		const currentTime = this.now();
		this.prune(currentTime);
		const entry = this.entries.get(key);

		return entry
			? {
					resetTime: new Date(entry.resetTime),
					totalHits: entry.totalHits,
				}
			: undefined;
	}

	increment(key: string): ClientRateLimitInfo {
		const currentTime = this.now();
		this.prune(currentTime);
		const current = this.entries.get(key);

		if (current) {
			current.totalHits += 1;
			return {
				resetTime: new Date(current.resetTime),
				totalHits: current.totalHits,
			};
		}

		if (this.entries.size >= this.maxEntries) {
			return {
				resetTime: this.getEarliestResetTime(currentTime),
				totalHits: Number.MAX_SAFE_INTEGER,
			};
		}

		const entry = {
			resetTime: new Date(currentTime + this.windowMs),
			totalHits: 1,
		};
		this.entries.set(key, entry);

		return {
			resetTime: new Date(entry.resetTime),
			totalHits: entry.totalHits,
		};
	}

	decrement(key: string) {
		const currentTime = this.now();
		this.prune(currentTime);
		const current = this.entries.get(key);

		if (!current)
			return;

		if (current.totalHits <= 1) {
			this.entries.delete(key);
			return;
		}

		current.totalHits -= 1;
	}

	resetKey(key: string) {
		this.entries.delete(key);
	}

	resetAll() {
		this.entries.clear();
	}

	private getEarliestResetTime(currentTime: number) {
		let earliestResetTime = currentTime + this.windowMs;

		for (const entry of this.entries.values())
			earliestResetTime = Math.min(earliestResetTime, entry.resetTime.getTime());

		return new Date(earliestResetTime);
	}

	private prune(currentTime: number) {
		for (const [key, entry] of this.entries) {
			if (entry.resetTime.getTime() <= currentTime)
				this.entries.delete(key);
		}
	}
}
