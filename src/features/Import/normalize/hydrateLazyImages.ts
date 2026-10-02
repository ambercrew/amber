// Attributes commonly used by lazy-loading scripts to stash the real image
// URL until JS runs. Ordered by preference.
const LAZY_SRC_ATTRS = [
	"data-src",
	"data-delayed-url",
	"data-lazy-src",
	"data-original",
	"data-url",
	"data-hi-res-src",
];
const LAZY_SRCSET_ATTRS = ["data-srcset", "data-lazy-srcset"];

/** Promotes lazy-loaded image URLs (held in data-* attributes of the
 * server-rendered HTML) into a real src, so Defuddle keeps the images
 * instead of dropping those without a usable src. Must run before
 * Defuddle parses the document. */
export function hydrateLazyImages(doc: Document): void {
	doc.querySelectorAll("img").forEach(img => {
		if (!img.getAttribute("src")) {
			const lazySrc = LAZY_SRC_ATTRS.map(a => img.getAttribute(a)).find(
				Boolean,
			);
			if (lazySrc) img.setAttribute("src", lazySrc);
		}

		if (!img.getAttribute("src")) {
			const srcset =
				img.getAttribute("srcset") ??
				LAZY_SRCSET_ATTRS.map(a => img.getAttribute(a)).find(Boolean);
			const best = srcset ? largestSrcsetCandidate(srcset) : null;
			if (best) img.setAttribute("src", best);
		}

		// Defuddle swaps a lazy image's src for any attribute ending in an image extension,
		// e.g. Wikipedia's `resource` link to the File: page, so a usable src stops being lazy.
		if (/^(https?:)?\/\//.test(img.getAttribute("src") ?? ""))
			img.removeAttribute("loading");
	});
}

/** srcset isn't in the sanitizer's allowlist, so the largest candidate is
 * resolved into src up front rather than carrying the whole attribute. */
function largestSrcsetCandidate(srcset: string): string | null {
	const candidates = srcset
		.split(",")
		.map(part => part.trim())
		.filter(Boolean)
		.map(part => {
			const [url, descriptor] = part.split(/\s+/, 2);
			return { url, size: descriptor ? parseFloat(descriptor) : 0 };
		})
		.filter(candidate => candidate.url);

	if (candidates.length === 0) return null;

	return candidates.reduce((best, candidate) =>
		candidate.size > best.size ? candidate : best,
	).url;
}
