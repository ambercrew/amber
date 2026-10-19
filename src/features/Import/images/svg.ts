import { bytesToBase64 } from "../../../utils/bytesToBase64";

export const SVG_MIME = "image/svg+xml";

const BASE64_SUFFIX = ";base64";

/** The backend only stores base64 data URIs, so a URL-encoded or plain-text SVG one is re-encoded. */
export function toBase64SvgDataUri(dataUri: string): string | null {
	const comma = dataUri.indexOf(",");
	if (comma === -1) return null;
	if (dataUri.slice(0, comma).endsWith(BASE64_SUFFIX)) return dataUri;

	let markup: string;
	try {
		markup = decodeURIComponent(dataUri.slice(comma + 1));
	} catch {
		return null;
	}
	return svgMarkupToDataUri(markup);
}

/**
 * Replaces inline `<svg>` drawings with images of themselves, since the
 * sanitizer keeps only `<svg>`/`<path>` and would strip their other shapes.
 * Decorative icons (`aria-hidden`) and sprite references (`<use>`, blank on
 * their own) are left as they were.
 */
export function convertInlineSvgs(doc: Document) {
	const serializer = new XMLSerializer();
	for (const svg of Array.from(doc.body.querySelectorAll("svg"))) {
		// A nested `<svg>` went with its outer one.
		if (!svg.isConnected) continue;
		if (
			svg.getAttribute("aria-hidden") === "true" ||
			svg.querySelector("use")
		) {
			continue;
		}

		const img = doc.createElement("img");
		img.setAttribute(
			"src",
			svgMarkupToDataUri(serializer.serializeToString(svg)),
		);
		const label =
			svg.getAttribute("aria-label") ??
			svg.querySelector("title")?.textContent;
		if (label?.trim()) img.setAttribute("alt", label.trim());
		svg.replaceWith(img);
	}
}

function svgMarkupToDataUri(markup: string): string {
	return `data:${SVG_MIME}${BASE64_SUFFIX},${bytesToBase64(new TextEncoder().encode(markup))}`;
}
