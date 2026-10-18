import AiPromptDto from "../../../api/aiIntegration/dto/aiPromptDto";
import { findPlaceholders, TextRange } from "./promptPlaceholders";

export interface SlashQuery {
	/** Index of the `/` in the text. */
	start: number;
	/** What's typed after the `/`, up to the caret. */
	query: string;
}

/** The `/query` that ends at the caret, if a word there starts with `/`. */
export function slashQueryAt(text: string, caret: number): SlashQuery | null {
	const match = /(?:^|\s)\/(\S*)$/.exec(text.slice(0, caret));
	if (!match) return null;
	return { start: caret - match[1].length - 1, query: match[1] };
}

/** Lowercased letters and digits only, so `/quizme` finds "Quiz me". */
function normalize(text: string): string {
	return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Prompts whose name contains the query, those starting with it first. */
export function matchPrompts(
	prompts: AiPromptDto[],
	query: string,
): AiPromptDto[] {
	const normalizedQuery = normalize(query);
	const matches = prompts.filter(prompt =>
		normalize(prompt.name).includes(normalizedQuery),
	);
	const startsWithQuery = (prompt: AiPromptDto) =>
		normalize(prompt.name).startsWith(normalizedQuery);
	return [
		...matches.filter(startsWithQuery),
		...matches.filter(prompt => !startsWithQuery(prompt)),
	];
}

/**
 * Replaces the `/query` with the prompt's text, returning the new text and what to select: the
 * prompt's first placeholder, or else a caret after it.
 */
export function insertPrompt(
	text: string,
	caret: number,
	slash: SlashQuery,
	content: string,
): { text: string; selection: TextRange } {
	const before = text.slice(0, slash.start);
	const placeholder = findPlaceholders(content)[0];
	const end = before.length + content.length;
	return {
		text: before + content + text.slice(caret),
		selection: placeholder
			? {
					start: before.length + placeholder.start,
					end: before.length + placeholder.end,
				}
			: { start: end, end },
	};
}
