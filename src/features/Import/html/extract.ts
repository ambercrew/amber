import Defuddle from "defuddle";
import { hydrateLazyImages } from "../normalize/hydrateLazyImages";

export interface HtmlExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
}

/** Pulls the article out of a saved page, falling back to the whole body when Defuddle finds none. */
export function extractHtml(text: string): HtmlExtraction {
	const doc = new DOMParser().parseFromString(text, "text/html");
	hydrateLazyImages(doc);
	const rawHtml = doc.body.innerHTML;
	const documentTitle = doc.title.trim() || null;

	const article = new Defuddle(doc, { removeContentPatterns: false }).parse();
	const content = article.content?.trim() ?? "";
	const html = hasContent(content) ? content : rawHtml;
	if (!hasContent(html)) {
		throw new Error("no-content");
	}

	return {
		title: article.title || documentTitle,
		authors: article.author || null,
		publicationDate: article.published || null,
		html,
	};
}

const MEDIA_SELECTOR = "img, picture, video, audio, iframe, svg, table";

/** Defuddle always returns something, so markup with neither text nor media counts as no article. */
export function hasContent(html: string): boolean {
	if (html.length === 0) return false;
	const doc = new DOMParser().parseFromString(html, "text/html");
	return (
		(doc.body.textContent ?? "").trim().length > 0 ||
		doc.body.querySelector(MEDIA_SELECTOR) !== null
	);
}
