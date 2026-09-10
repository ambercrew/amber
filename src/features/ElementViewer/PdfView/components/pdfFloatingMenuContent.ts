import { htmlToLexicalJson } from "../../../../components/Editor/lexicalJsonConversion";
import {
	CLOZE_HIDDEN_ATTRIBUTE,
	CLOZE_HIDDEN_TAG_NAME,
	CLOZE_PLACEHOLDER,
} from "../../../../components/Editor/plugins/ClozePlugin/ClozeHiddenNode";
import { CreateCardDto } from "../../../../types/elements/createCardDto";
import { CreateExtractDto } from "../../../../types/elements/createExtractDto";
import { ElementId } from "../../../../types/elements/elementId";
import { escapeHtml } from "../../../../utils/escapeHtml";
import { sanitizeHtml } from "../../../../utils/sanitizeHtml";
import { truncateToWords } from "../../../../utils/truncateToWords";

// @embedpdf's selection plugin only exposes plain text per page, so each
// page becomes its own unstyled paragraph.
export function selectedTextToHtml(pages: string[]): string {
	return pages
		.map(page => page.trim())
		.filter(Boolean)
		.map(page => `<p>${escapeHtml(page)}</p>`)
		.join("");
}

export interface ClozeSelectionSlice {
	start: number;
	count: number;
}

// Builds the cloze "front" HTML, hiding the selected portion of each page.
// Prefers the selection plugin's own character offsets (`slices`) over
// `indexOf`, which would grab the wrong occurrence of a repeated phrase.
export function clozeFrontToHtml(
	pageTexts: string[],
	selectedTexts: string[],
	selectionSlices: (ClozeSelectionSlice | undefined)[] = [],
): string {
	return pageTexts
		.map((fullText, index) => {
			const selectedText = selectedTexts[index]?.trim();
			const slice = selectionSlices[index];
			const matchIndex = slice
				? slice.start
				: (selectedText?.length ?? 0) > 0
					? fullText.indexOf(selectedText as string)
					: -1;
			const matchLength = slice
				? slice.count
				: (selectedText?.length ?? 0);
			if (!selectedText || matchIndex === -1) {
				return `<p>${escapeHtml(fullText)}</p>`;
			}
			const before = fullText.slice(0, matchIndex);
			const hidden = fullText.slice(matchIndex, matchIndex + matchLength);
			const after = fullText.slice(matchIndex + matchLength);
			return (
				`<p>${escapeHtml(before)}` +
				`<${CLOZE_HIDDEN_TAG_NAME} ${CLOZE_HIDDEN_ATTRIBUTE}="${escapeHtml(hidden)}">${CLOZE_PLACEHOLDER}</${CLOZE_HIDDEN_TAG_NAME}>` +
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
	selectionSlices: (ClozeSelectionSlice | undefined)[] = [],
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
			sanitizeHtml(
				clozeFrontToHtml(pageTexts, selectedTexts, selectionSlices),
			),
		),
		back: htmlToLexicalJson(
			sanitizeHtml(selectedTextToHtml(selectedTexts)),
		),
	};
}
