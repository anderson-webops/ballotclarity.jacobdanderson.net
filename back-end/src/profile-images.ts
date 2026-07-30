import type { CongressMemberDetail } from "./congress.js";
import type { ProfileImage } from "./types/civic.js";
import { normalizePublicHref } from "./public-href.js";

const htmlTagPattern = /<[^>]*>/g;

function normalizeImageUrl(value: string | null | undefined) {
	const normalized = normalizePublicHref(value);

	if (!normalized || normalized.startsWith("#"))
		return undefined;

	return normalized;
}

export function normalizeProfileImageAttribution(value: string | null | undefined) {
	const normalized = value
		?.replace(htmlTagPattern, " ")
		.replace(/\s+/g, " ")
		.trim();

	return normalized || undefined;
}

export function buildProfileImage(image: ProfileImage | null | undefined): ProfileImage | null {
	const url = normalizeImageUrl(image?.url);

	if (!image || !url)
		return null;

	return {
		...image,
		alt: image.alt.trim() || "Profile image",
		attribution: normalizeProfileImageAttribution(image.attribution),
		capturedAt: image.capturedAt?.trim() || undefined,
		priority: Number.isFinite(image.priority) ? image.priority : 100,
		sourceLabel: image.sourceLabel.trim() || image.sourceSystem.trim() || "Profile image source",
		sourceSystem: image.sourceSystem.trim() || image.sourceLabel.trim() || "Profile image source",
		sourceUrl: normalizeImageUrl(image.sourceUrl),
		url,
	};
}

export function uniqueProfileImages(images: Array<ProfileImage | null | undefined>) {
	const byUrl = new Map<string, ProfileImage>();

	for (const candidate of images) {
		const image = buildProfileImage(candidate);

		if (!image)
			continue;

		const existing = byUrl.get(image.url);

		if (!existing || image.priority < existing.priority)
			byUrl.set(image.url, image);
	}

	return [...byUrl.values()].sort((left, right) =>
		left.priority - right.priority
		|| left.sourceLabel.localeCompare(right.sourceLabel)
		|| left.url.localeCompare(right.url)
	);
}

export function buildCongressProfileImages(member: Pick<CongressMemberDetail, "depiction" | "directOrderName" | "updatedAt" | "url">) {
	return uniqueProfileImages([
		member.depiction?.imageUrl
			? {
					alt: `Portrait of ${member.directOrderName}`,
					attribution: member.depiction.attribution,
					capturedAt: member.updatedAt,
					priority: 10,
					sourceKind: "official",
					sourceLabel: "Congress.gov portrait",
					sourceSystem: "Congress.gov",
					sourceUrl: member.url,
					url: member.depiction.imageUrl,
				}
			: null,
	]);
}
