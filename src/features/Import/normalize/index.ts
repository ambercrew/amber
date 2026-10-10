import { sanitizeHtml } from "../../../utils/sanitizeHtml";
import { assetIdFromSrc, toCanonicalImageSrc } from "../../../utils/assetUrl";
import { localizeImage } from "../images/localize";
import { convertMath } from "./convertMath";

export interface NormalizeOptions {
	/** Used to resolve relative image URLs and as the Referer header when
	 * fetching them. Absolute image URLs work regardless. */
	baseUrl: string | null;
}

/** Converts math to equations, sanitizes HTML, and localizes its images. The result is stored directly as
 * a LearningAsset's content — the editor already knows how to load HTML. */
export async function normalize(
	html: string,
	opts: NormalizeOptions,
): Promise<string> {
	const parser = new DOMParser();
	const raw = parser.parseFromString(html, "text/html");
	convertMath(raw);
	const sanitized = sanitizeHtml(raw.body.innerHTML);
	const doc = parser.parseFromString(sanitized, "text/html");
	const images = Array.from(doc.querySelectorAll("img[src]"));

	const absoluteByAttr = new Map<string, string>();
	const uniqueUrls = new Set<string>();

	for (const img of images) {
		const src = img.getAttribute("src");
		if (!src) continue;
		// Already stored (e.g. by EPUB extraction); only canonicalize a runtime asset URL.
		if (assetIdFromSrc(src) !== null) {
			img.setAttribute("src", toCanonicalImageSrc(src));
			continue;
		}

		const absolute = resolveUrl(src, opts.baseUrl);
		if (absolute === null) {
			img.removeAttribute("src");
			continue;
		}

		absoluteByAttr.set(src, absolute);
		uniqueUrls.add(absolute);
	}

	const localizedByUrl = new Map(
		await Promise.all(
			[...uniqueUrls].map(
				async url =>
					[url, await localizeImage(url, opts.baseUrl)] as const,
			),
		),
	);

	for (const img of images) {
		const src = img.getAttribute("src");
		if (!src) continue;

		const absolute = absoluteByAttr.get(src);
		if (!absolute) continue;

		const result = localizedByUrl.get(absolute);
		if (!result) continue;

		if (result.ok) {
			img.setAttribute("src", result.src);
		} else {
			img.setAttribute("src", result.originalUrl);
			img.setAttribute("data-broken-asset", "true");
		}
	}

	for (const link of doc.querySelectorAll("a[href]")) {
		const href = link.getAttribute("href");
		if (!href) continue;

		const absolute = resolveUrl(href, opts.baseUrl);
		if (absolute === null) {
			link.removeAttribute("href");
		} else {
			link.setAttribute("href", absolute);
		}
	}

	return doc.body.innerHTML;
}

function resolveUrl(src: string, baseUrl: string | null): string | null {
	if (src.startsWith("data:")) return src;
	try {
		return new URL(src, baseUrl ?? undefined).href;
	} catch {
		return null;
	}
}
