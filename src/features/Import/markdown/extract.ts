import { marked } from "marked";
import { deriveTitle } from "../deriveTitle";

export interface MarkdownExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
}

export function extractMarkdown(text: string): MarkdownExtraction {
	const html = marked.parse(text, { async: false });
	if (html.trim().length === 0) {
		throw new Error("no-content");
	}

	return {
		title: deriveTitle(html, text),
		authors: null,
		publicationDate: null,
		html,
	};
}
