import { htmlToLexicalJson } from "../../../../components/Editor/lexicalJsonConversion";
import {
	CLOZE_HIDDEN_ATTRIBUTE,
	CLOZE_HIDDEN_TAG_NAME,
	CLOZE_PLACEHOLDER,
} from "../../../../components/Editor/plugins/ClozePlugin/ClozeHiddenNode";
import { CreateCardDto } from "../../../../types/elements/createCardDto";
import { CreateExtractDto } from "../../../../types/elements/createExtractDto";
import { ElementId } from "../../../../types/elements/elementId";
import { sanitizeHtml } from "../../../../utils/sanitizeHtml";
import { truncateToWords } from "../../../../utils/truncateToWords";

export function escapeHtml(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

// There's no rich/styled selection API in @embedpdf's selection plugin, only
// plain text per page — so an extract/cloze created from the PDF can't
// preserve the source's formatting the way a Lexical-editor-derived one can.
// Each page's text becomes its own paragraph.
export function selectedTextToHtml(pages: string[]): string {
	return pages
		.map(page => page.trim())
		.filter(Boolean)
		.map(page => `<p>${escapeHtml(page)}</p>`)
		.join("");
}

// Builds the cloze "front" HTML: each spanned page's full text, with the
// portion matching that page's selected text swapped for a hidden cloze
// placeholder (imported by htmlToLexicalJson as a real ClozeHiddenNode, same
// as the Lexical editor's own cloze front). If a page's selected text can't
// be located verbatim in its extracted full text (extraction can normalize
// whitespace differently than selection), that page falls back to plain,
// un-hidden text rather than dropping it.
export function clozeFrontToHtml(
	pageTexts: string[],
	selectedTexts: string[],
): string {
	return pageTexts
		.map((fullText, index) => {
			const selectedText = selectedTexts[index]?.trim();
			const matchIndex = selectedText
				? fullText.indexOf(selectedText)
				: -1;
			if (!selectedText || matchIndex === -1) {
				return `<p>${escapeHtml(fullText)}</p>`;
			}
			const before = fullText.slice(0, matchIndex);
			const after = fullText.slice(matchIndex + selectedText.length);
			return (
				`<p>${escapeHtml(before)}` +
				`<${CLOZE_HIDDEN_TAG_NAME} ${CLOZE_HIDDEN_ATTRIBUTE}="${escapeHtml(selectedText)}">${CLOZE_PLACEHOLDER}</${CLOZE_HIDDEN_TAG_NAME}>` +
				`${escapeHtml(after)}</p>`
			);
		})
		.join("");
}

/** Builds the DTO for an extract created from a PDF text selection, or
 * `null` when the selection was empty/whitespace-only. */
export function buildExtractDto(
	pages: string[],
	parent: ElementId,
): CreateExtractDto | null {
	const text = pages.join(" ").trim();
	if (!text) return null;

	return {
		id: crypto.randomUUID(),
		meta: {
			name: truncateToWords(text),
			parent,
			origin: { type: "inherited" },
		},
		content: htmlToLexicalJson(sanitizeHtml(selectedTextToHtml(pages))),
	};
}

/** Builds the DTO for a cloze card created from a PDF text selection, or
 * `null` when the selection was empty/whitespace-only. */
export function buildClozeCardDto(
	pageTexts: string[],
	selectedTexts: string[],
	parent: ElementId,
): CreateCardDto | null {
	const backText = selectedTexts.join(" ").trim();
	if (!backText) return null;

	return {
		id: crypto.randomUUID(),
		meta: {
			name: truncateToWords(backText),
			parent,
			origin: { type: "inherited" },
		},
		front: htmlToLexicalJson(
			sanitizeHtml(clozeFrontToHtml(pageTexts, selectedTexts)),
		),
		back: htmlToLexicalJson(
			sanitizeHtml(selectedTextToHtml(selectedTexts)),
		),
	};
}
