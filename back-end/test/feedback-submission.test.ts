import assert from "node:assert/strict";
import test from "node:test";
import {
	feedbackSubmissionLimits,
	normalizeCorrectionSubmission,
} from "../src/feedback-submission.js";

test("public feedback normalization bounds fields and keeps only same-site page paths", () => {
	const normalized = normalizeCorrectionSubmission({
		email: " Reader@Example.com ",
		message: " Please review this claim. ",
		name: " Reader Name ",
		pageUrl: "https://ballotclarity.org/candidate/example?lookup=secret#details",
		sourceLinks: "https://example.gov/source\nhttps://example.gov/source",
		subject: " Candidate   correction ",
		submissionType: "correction",
	});

	assert.deepEqual(normalized, {
		email: "reader@example.com",
		message: "Please review this claim.",
		name: "Reader Name",
		pageUrl: "/candidate/example",
		sourceLinks: "https://example.gov/source",
		subject: "Candidate correction",
		submissionType: "correction",
	});
});

test("public feedback rejects unsafe links, invalid email, and oversized content", () => {
	const baseline = {
		email: "reader@example.com",
		message: "Please review this page.",
		subject: "Correction",
		submissionType: "correction",
	};

	assert.throws(
		() => normalizeCorrectionSubmission({ ...baseline, email: "not-an-email" }),
		/valid address/u
	);
	assert.throws(
		() => normalizeCorrectionSubmission({ ...baseline, pageUrl: "https://attacker.example/path" }),
		/configured Ballot Clarity site/u
	);
	assert.throws(
		() => normalizeCorrectionSubmission({ ...baseline, sourceLinks: "javascript:alert(1)" }),
		/public HTTP or HTTPS URL/u
	);
	assert.throws(
		() => normalizeCorrectionSubmission({
			...baseline,
			message: "x".repeat(feedbackSubmissionLimits.message + 1),
		}),
		/5000 characters or fewer/u
	);
	assert.throws(
		() => normalizeCorrectionSubmission({ ...baseline, submissionType: "other" }),
		/correction or feedback/u
	);
});
