import { isIP } from "node:net";

const namedProxyRanges = new Set(["linklocal", "loopback", "uniquelocal"]);
const disabledValues = new Set(["", "0", "false", "no", "off"]);
const unsafeBroadValues = new Set(["1", "true", "yes", "on"]);

function isValidProxyRange(value: string) {
	if (namedProxyRanges.has(value.toLowerCase()))
		return true;

	const [address, prefix, ...extra] = value.split("/");
	const addressFamily = isIP(address ?? "");

	if (!addressFamily || extra.length)
		return false;

	if (prefix === undefined)
		return true;

	const parsedPrefix = Number(prefix);
	const maximumPrefix = addressFamily === 4 ? 32 : 128;
	return Number.isInteger(parsedPrefix) && parsedPrefix >= 0 && parsedPrefix <= maximumPrefix;
}

export function parseTrustProxySetting(value: string | null | undefined) {
	const normalized = String(value ?? "").trim();
	const lowered = normalized.toLowerCase();

	if (disabledValues.has(lowered))
		return false as const;

	if (unsafeBroadValues.has(lowered)) {
		throw new Error(
			"TRUST_PROXY must list trusted proxy IPs, CIDR ranges, or named ranges; broad boolean and hop-count trust is not allowed."
		);
	}

	const ranges = normalized
		.split(",")
		.map(range => range.trim())
		.filter(Boolean);

	if (!ranges.length || ranges.some(range => !isValidProxyRange(range))) {
		throw new Error(
			"TRUST_PROXY contains an invalid proxy range. Use explicit IPs, CIDR ranges, loopback, linklocal, or uniquelocal."
		);
	}

	return ranges;
}
