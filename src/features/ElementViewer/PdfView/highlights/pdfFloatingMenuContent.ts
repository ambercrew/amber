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

// Each page becomes its own unstyled paragraph: the selection plugin reads plain text only.
export function selectedTextToHtml(pages: string[]): string {
	return pages
		.map(page => page.trim())
		.filter(Boolean)
		.map(page => `<p>${escapeHtml(page)}</p>`)
		.join("");
}

/** One page of a cloze selection: the page's text split around the selected part. */
export interface ClozePageText {
	before: string;
	hidden: string;
	after: string;
}

/** The cloze front: each page's text in its own paragraph, with its selected part hidden. */
export function clozeFrontToHtml(pages: ClozePageText[]): string {
	return pages
		.map(({ before, hidden, after }) =>
			hidden.trim()
				? `<p>${escapeHtml(before)}` +
					`<${CLOZE_HIDDEN_TAG_NAME} ${CLOZE_HIDDEN_ATTRIBUTE}="${escapeHtml(hidden)}">${CLOZE_PLACEHOLDER}</${CLOZE_HIDDEN_TAG_NAME}>` +
					`${escapeHtml(after)}</p>`
				: `<p>${escapeHtml(before + hidden + after)}</p>`,
		)
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
			name: null,
			parent,
			origin: { type: "inherited" },
		},
		content: htmlToLexicalJson(sanitizeHtml(selectedTextToHtml(pages))),
	};
}

/** Builds the DTO for a cloze card created from a PDF text selection, or
 * `null` when the selection was empty/whitespace-only. */
export function buildClozeCardDto(
	pages: ClozePageText[],
	parent: ElementId,
): CreateCardDto | null {
	const hiddenTexts = pages.map(({ hidden }) => hidden);
	if (!hiddenTexts.join(" ").trim()) return null;

	return {
		id: crypto.randomUUID(),
		meta: {
			name: null,
			parent,
			origin: { type: "inherited" },
		},
		front: htmlToLexicalJson(sanitizeHtml(clozeFrontToHtml(pages))),
		back: htmlToLexicalJson(sanitizeHtml(selectedTextToHtml(hiddenTexts))),
	};
}
