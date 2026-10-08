import { escapeHtml } from "../../../utils/escapeHtml";

export interface TextExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
}

export function extractText(text: string): TextExtraction {
	const html = textToParagraphs(text);
	if (html.length === 0) {
		throw new Error("no-content");
	}

	return { title: null, authors: null, publicationDate: null, html };
}

/** Blank lines separate paragraphs. */
export function textToParagraphs(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.split(/\n\s*\n/)
		.map(paragraph => paragraph.trim())
		.filter(paragraph => paragraph.length > 0)
		.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
		.join("");
}
