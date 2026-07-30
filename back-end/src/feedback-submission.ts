import type { AdminSubmissionType } from "./types/civic.js";
import process from "node:process";

export interface CorrectionSubmissionInput {
	email: string;
	message: string;
	name?: string;
	pageUrl?: string;
	sourceLinks?: string;
	subject: string;
	submissionType: AdminSubmissionType;
}

const limits = {
	email: 254,
	message: 5_000,
	name: 120,
	pageUrl: 1_024,
	sourceLink: 2_048,
	sourceLinks: 10,
	subject: 160,
} as const;
function readString(value: unknown) {
	return typeof value === "string" ? value : "";
}

function isValidEmail(value: string) {
	if (!value || /\s/u.test(value))
		return false;

	const atIndex = value.indexOf("@");

	if (atIndex <= 0 || atIndex !== value.lastIndexOf("@"))
		return false;

	const localPart = value.slice(0, atIndex);
	const domain = value.slice(atIndex + 1);
	return localPart.length <= 64
		&& domain.length > 3
		&& domain.includes(".")
		&& !domain.startsWith(".")
		&& !domain.endsWith(".")
		&& !domain.includes("..");
}

function normalizeSingleLine(value: unknown, label: string, maximumLength: number) {
	const normalized = readString(value).replace(/\s+/gu, " ").trim();

	if (normalized.length > maximumLength)
		throw new Error(`${label} must be ${maximumLength} characters or fewer.`);

	return normalized;
}

function normalizeMessage(value: unknown) {
	const normalized = readString(value)
		.replace(/\r\n?/gu, "\n")
		.replace(/\0/gu, "")
		.trim();

	if (normalized.length > limits.message)
		throw new Error(`Message must be ${limits.message} characters or fewer.`);

	return normalized;
}

function normalizePageUrl(value: unknown, siteUrl: string) {
	const raw = readString(value).trim();

	if (!raw)
		return undefined;

	if (raw.length > limits.pageUrl)
		throw new Error(`Page URL must be ${limits.pageUrl} characters or fewer.`);

	const configuredSiteUrl = new URL(siteUrl);
	let parsed: URL;

	try {
		parsed = new URL(raw, configuredSiteUrl);
	}
	catch {
		throw new Error("Page URL must be a valid Ballot Clarity page path.");
	}

	if (
		!["http:", "https:"].includes(parsed.protocol)
		|| parsed.origin !== configuredSiteUrl.origin
		|| parsed.username
		|| parsed.password
		|| raw.startsWith("//")
	) {
		throw new Error("Page URL must point to the configured Ballot Clarity site.");
	}

	return parsed.pathname || "/";
}

function normalizeSourceLinks(value: unknown) {
	const links = readString(value)
		.replace(/\r\n?/gu, "\n")
		.split("\n")
		.map(link => link.trim())
		.filter(Boolean);

	if (links.length > limits.sourceLinks)
		throw new Error(`Supporting links may include at most ${limits.sourceLinks} URLs.`);

	const uniqueLinks: string[] = [];

	for (const link of links) {
		if (link.length > limits.sourceLink)
			throw new Error(`Each supporting link must be ${limits.sourceLink} characters or fewer.`);

		let parsed: URL;

		try {
			parsed = new URL(link);
		}
		catch {
			throw new Error("Each supporting link must be a valid HTTP or HTTPS URL.");
		}

		if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
			throw new Error("Each supporting link must be a public HTTP or HTTPS URL without embedded credentials.");

		const normalized = parsed.href;

		if (!uniqueLinks.includes(normalized))
			uniqueLinks.push(normalized);
	}

	return uniqueLinks.length ? uniqueLinks.join("\n") : undefined;
}

export function normalizeCorrectionSubmission(
	input: Record<string, unknown> | CorrectionSubmissionInput,
	siteUrl = process.env.NUXT_PUBLIC_SITE_URL || "https://ballotclarity.org"
): CorrectionSubmissionInput {
	const email = normalizeSingleLine(input.email, "Email", limits.email).toLowerCase();
	const message = normalizeMessage(input.message);
	const name = normalizeSingleLine(input.name, "Name", limits.name);
	const subject = normalizeSingleLine(input.subject, "Subject", limits.subject);
	const submissionType = input.submissionType;

	if (!email || !message || !subject)
		throw new Error("Subject, message, and email are required.");

	if (!isValidEmail(email))
		throw new Error("Email must be a valid address.");

	if (submissionType !== "correction" && submissionType !== "feedback")
		throw new Error("Submission type must be correction or feedback.");

	return {
		email,
		message,
		name: name || undefined,
		pageUrl: normalizePageUrl(input.pageUrl, siteUrl),
		sourceLinks: normalizeSourceLinks(input.sourceLinks),
		subject,
		submissionType,
	};
}

export const feedbackSubmissionLimits = limits;
