import assert from "node:assert/strict";
import test from "node:test";
import { buildProfileImage } from "../src/profile-images.js";

function buildImage(url: string) {
	return buildProfileImage({
		alt: "Candidate portrait",
		priority: 10,
		sourceKind: "provider",
		sourceLabel: "Provider portrait",
		sourceSystem: "Test provider",
		url,
	});
}

test("profile images allow public and root-relative sources", () => {
	assert.equal(buildImage("/images/candidate.jpg")?.url, "/images/candidate.jpg");
	assert.equal(
		buildImage("https://cdn.example.com/candidate.jpg")?.url,
		"https://cdn.example.com/candidate.jpg"
	);
});

test("profile images reject executable and local-network sources", () => {
	assert.equal(buildImage("data:image/svg+xml,test"), null);
	assert.equal(buildImage("javascript:alert(1)"), null);
	assert.equal(buildImage("http://127.0.0.1/camera.jpg"), null);
	assert.equal(buildImage("http://[::ffff:7f00:1]/camera.jpg"), null);
});
