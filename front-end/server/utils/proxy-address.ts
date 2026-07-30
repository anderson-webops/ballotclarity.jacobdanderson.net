import { BlockList, isIP } from "node:net";
import process from "node:process";

const maximumForwardedAddresses = 16;
const namedProxyRanges = new Set(["linklocal", "loopback", "uniquelocal"]);
const disabledValues = new Set(["", "0", "false", "no", "off"]);
const unsafeBroadValues = new Set(["1", "true", "yes", "on"]);

interface ForwardedRequest {
	headers: Record<string, string | string[] | undefined>;
	socket: {
		remoteAddress?: string;
	};
}

type AddressFamily = "ipv4" | "ipv6";

function addressFamily(address: string): AddressFamily | null {
	const family = isIP(address);

	if (family === 4)
		return "ipv4";

	if (family === 6)
		return "ipv6";

	return null;
}

function normalizeAddress(rawAddress: string | undefined) {
	const address = rawAddress?.trim() ?? "";
	const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu)?.[1];
	const normalized = mappedIpv4 && isIP(mappedIpv4) === 4 ? mappedIpv4 : address;

	return addressFamily(normalized) ? normalized : null;
}

function normalizeHeaderValue(value: string | string[] | undefined) {
	return Array.isArray(value) ? value.join(",") : value ?? "";
}

function forwardedAddresses(request: ForwardedRequest) {
	return normalizeHeaderValue(request.headers["x-forwarded-for"])
		.split(",")
		.map(value => normalizeAddress(value))
		.filter((value): value is string => Boolean(value))
		.slice(-maximumForwardedAddresses);
}

function isValidProxyRange(value: string) {
	if (namedProxyRanges.has(value.toLowerCase()))
		return true;

	const [address, prefix, ...extra] = value.split("/");
	const family = addressFamily(address ?? "");

	if (!family || extra.length)
		return false;

	if (prefix === undefined)
		return true;

	const parsedPrefix = Number(prefix);
	const maximumPrefix = family === "ipv4" ? 32 : 128;
	return Number.isInteger(parsedPrefix) && parsedPrefix >= 0 && parsedPrefix <= maximumPrefix;
}

export function parseFrontendTrustProxySetting(value: string | null | undefined) {
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

function addSubnet(blockList: BlockList, network: string, prefix: number) {
	const family = addressFamily(network);

	if (!family)
		throw new Error("Trusted proxy subnet is invalid.");

	blockList.addSubnet(network, prefix, family);
}

function addNamedRange(blockList: BlockList, range: string) {
	if (range === "loopback") {
		addSubnet(blockList, "127.0.0.0", 8);
		addSubnet(blockList, "::1", 128);
	}
	else if (range === "linklocal") {
		addSubnet(blockList, "169.254.0.0", 16);
		addSubnet(blockList, "fe80::", 10);
	}
	else if (range === "uniquelocal") {
		addSubnet(blockList, "10.0.0.0", 8);
		addSubnet(blockList, "172.16.0.0", 12);
		addSubnet(blockList, "192.168.0.0", 16);
		addSubnet(blockList, "fc00::", 7);
	}
}

function buildTrustedProxyList(ranges: string[]) {
	const blockList = new BlockList();

	for (const range of ranges) {
		const lowered = range.toLowerCase();

		if (namedProxyRanges.has(lowered)) {
			addNamedRange(blockList, lowered);
			continue;
		}

		const [rawAddress, rawPrefix] = range.split("/");
		const address = normalizeAddress(rawAddress);
		const family = address ? addressFamily(address) : null;

		if (!address || !family)
			throw new Error("Trusted proxy address is invalid.");

		if (rawPrefix === undefined)
			blockList.addAddress(address, family);
		else
			blockList.addSubnet(address, Number(rawPrefix), family);
	}

	return blockList;
}

export function buildForwardedForHeader(request: ForwardedRequest) {
	const directPeer = normalizeAddress(request.socket.remoteAddress);
	const chain = forwardedAddresses(request);

	if (directPeer && chain.at(-1) !== directPeer)
		chain.push(directPeer);

	return chain.length ? chain.join(", ") : undefined;
}

export function getTrustedClientAddress(
	request: ForwardedRequest,
	trustProxySetting: string | null | undefined = process.env.TRUST_PROXY
) {
	const directPeer = normalizeAddress(request.socket.remoteAddress);

	if (!directPeer)
		return "unknown";

	const trustedRanges = parseFrontendTrustProxySetting(trustProxySetting);

	if (!trustedRanges)
		return directPeer;

	const trustedProxies = buildTrustedProxyList(trustedRanges);
	const addresses = [directPeer, ...forwardedAddresses(request).reverse()];
	let addressIndex = 0;

	while (addressIndex < addresses.length - 1) {
		const address = addresses[addressIndex];
		const family = address ? addressFamily(address) : null;

		if (!address || !family || !trustedProxies.check(address, family))
			break;

		addressIndex += 1;
	}

	return addresses[addressIndex] ?? directPeer;
}
