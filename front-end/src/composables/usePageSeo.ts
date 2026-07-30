import { appDescription, appName, appSocialImageAlt, appSocialImagePath } from "~/constants";
import { serializeJsonLd } from "~/utils/json-ld";

interface PageSeoInput {
	description?: string;
	canonicalPath?: string;
	jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
	ogType?: "article" | "profile" | "website";
	path?: string;
	robots?: string;
	title: string;
}

export function usePageSeo(input: PageSeoInput) {
	const siteUrl = useSiteUrl();
	const description = input.description ?? appDescription;
	const resolvedPath = input.path ?? input.canonicalPath;
	const url = resolvedPath ? buildSiteUrl(resolvedPath) : siteUrl;
	const canonicalUrl = input.canonicalPath ? buildSiteUrl(input.canonicalPath) : url;
	const socialImageUrl = buildSiteUrl(appSocialImagePath);
	const jsonLdEntries = (Array.isArray(input.jsonLd) ? input.jsonLd : [input.jsonLd]).filter(
		(entry): entry is Record<string, unknown> => Boolean(entry)
	);

	useSeoMeta({
		description,
		ogDescription: description,
		ogImage: socialImageUrl,
		ogImageAlt: appSocialImageAlt,
		ogSiteName: appName,
		ogTitle: input.title,
		ogType: input.ogType ?? "website",
		ogUrl: canonicalUrl,
		robots: input.robots,
		title: input.title,
		twitterCard: "summary_large_image",
		twitterDescription: description,
		twitterImage: socialImageUrl,
		twitterImageAlt: appSocialImageAlt,
		twitterTitle: input.title,
	});

	useHead({
		link: [
			{
				href: canonicalUrl,
				rel: "canonical"
			}
		],
		script: jsonLdEntries.map((entry, index) => ({
			innerHTML: serializeJsonLd(entry),
			key: `jsonld-${index}`,
			type: "application/ld+json"
		}))
	});
}
