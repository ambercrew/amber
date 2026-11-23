import {
	getCodeLanguageOptions,
	normalizeCodeLanguage,
} from "@lexical/code-shiki";

export const PLAIN_TEXT = "plaintext";

// Shiki's hard-coded names for unhighlighted text.
const PLAIN_TEXT_ALIASES = new Set(["", PLAIN_TEXT, "text", "txt", "plain"]);

export const codeLanguageOptions = [
	{ value: PLAIN_TEXT, label: "Plain text" },
	...getCodeLanguageOptions().map(([value, label]) => ({ value, label })),
];

const knownLanguages = new Set(codeLanguageOptions.map(({ value }) => value));

/** Shiki's id for a language name or alias (`plaintext` for plain text), or `null` for an unknown one. */
export function knownCodeLanguage(name: string): string | null {
	const lower = name.trim().toLowerCase();
	if (PLAIN_TEXT_ALIASES.has(lower)) return PLAIN_TEXT;
	const id = normalizeCodeLanguage(lower);
	return knownLanguages.has(id) ? id : null;
}
