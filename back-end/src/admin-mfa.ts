import { Buffer } from "node:buffer";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const defaultStepSeconds = 30;
const defaultDigits = 6;

function base32Encode(bytes: Buffer) {
	let bits = "";
	let output = "";

	for (const byte of bytes)
		bits += byte.toString(2).padStart(8, "0");

	for (let index = 0; index < bits.length; index += 5) {
		const chunk = bits.slice(index, index + 5).padEnd(5, "0");
		output += base32Alphabet[Number.parseInt(chunk, 2)];
	}

	return output;
}

function base32Decode(value: string) {
	const normalized = value.trim().toUpperCase();

	if (!/^[A-Z2-7]{32}$/u.test(normalized))
		throw new Error("Invalid MFA secret.");

	let bits = "";

	for (const character of normalized) {
		const index = base32Alphabet.indexOf(character);

		if (index === -1)
			throw new Error("Invalid MFA secret.");

		bits += index.toString(2).padStart(5, "0");
	}

	const bytes: number[] = [];

	for (let index = 0; index + 8 <= bits.length; index += 8)
		bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));

	return Buffer.from(bytes);
}

function hotp(secret: string, counter: number, digits = defaultDigits) {
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64BE(BigInt(counter));

	const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
	const offset = digest[digest.length - 1] & 0x0F;
	const binary = ((digest[offset] & 0x7F) << 24)
		| ((digest[offset + 1] & 0xFF) << 16)
		| ((digest[offset + 2] & 0xFF) << 8)
		| (digest[offset + 3] & 0xFF);

	return String(binary % 10 ** digits).padStart(digits, "0");
}

function normalizeTotpCode(code: string) {
	return code.replace(/\s+/g, "");
}

export function createAdminMfaSecret() {
	return base32Encode(randomBytes(20));
}

export function createAdminMfaCode(secret: string, now = Date.now()) {
	return hotp(secret, Math.floor(now / 1000 / defaultStepSeconds));
}

export function buildAdminMfaOtpAuthUrl(input: {
	issuer?: string;
	secret: string;
	username: string;
}) {
	const issuer = input.issuer || "Ballot Clarity";
	const label = `${issuer}:${input.username}`;
	const params = new URLSearchParams({
		algorithm: "SHA1",
		digits: String(defaultDigits),
		issuer,
		period: String(defaultStepSeconds),
		secret: input.secret
	});

	return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function verifyAdminMfaCode(input: {
	code: string;
	now?: number;
	secret: string;
	window?: number;
}) {
	const code = normalizeTotpCode(input.code);

	if (!/^\d{6}$/u.test(code))
		return false;

	const now = input.now ?? Date.now();
	const counter = Math.floor(now / 1000 / defaultStepSeconds);
	const window = input.window ?? 1;
	const provided = Buffer.from(code);

	for (let offset = -window; offset <= window; offset += 1) {
		const expected = Buffer.from(hotp(input.secret, counter + offset));

		if (expected.length === provided.length && timingSafeEqual(expected, provided))
			return true;
	}

	return false;
}
