import {
	knownCodeLanguage,
	PLAIN_TEXT,
} from "../../../components/Editor/plugins/CodePlugin/codeLanguages";

// Read by Lexical's `<pre>` conversion.
const LANGUAGE_ATTRIBUTE = "data-language";
const LANGUAGE_ATTRIBUTES = [LANGUAGE_ATTRIBUTE, "data-lang"];
// E.g. `language-python` (Prism, highlight.js, Defuddle), `highlight-source-python` (GitHub), `mw-highlight-lang-python` (Wikipedia).
const LANGUAGE_CLASS =
	/^(?:mw-highlight-lang|highlight-source|language|lang|source|brush|syntax)-(.+)$/i;
// Wrappers such as GitHub's or Rouge's `div`s name the language a few levels up.
const MAX_ANCESTORS = 3;

/** Sets each code block's language from the markup's hints (plain text when there are none) and unwraps its `<code>`. */
export function prepareCodeBlocks(doc: Document): void {
	for (const pre of doc.querySelectorAll("pre")) {
		pre.setAttribute(LANGUAGE_ATTRIBUTE, languageOf(pre) ?? PLAIN_TEXT);
		// Lexical makes a multi-line `<code>` a second code block, without a language, inside the first.
		for (const code of pre.querySelectorAll("code")) {
			code.replaceWith(...code.childNodes);
		}
	}
}

/** Sets the languages the markup names, leaving the rest, e.g. for Defuddle, which keeps `data-language` but drops the wrappers that name it. */
export function markCodeLanguages(doc: Document): void {
	for (const pre of doc.querySelectorAll("pre")) {
		const language = languageOf(pre);
		if (language) pre.setAttribute(LANGUAGE_ATTRIBUTE, language);
	}
}

function languageOf(pre: HTMLElement): string | null {
	// Bare classes, like Pandoc's `sourceCode python`, only on the block itself.
	for (const element of [pre, pre.querySelector("code")]) {
		const language = element && fromElement(element, true);
		if (language) return language;
	}
	let ancestor = pre.parentElement;
	for (let i = 0; ancestor && i < MAX_ANCESTORS; i++) {
		const language = fromElement(ancestor, false);
		if (language) return language;
		ancestor = ancestor.parentElement;
	}
	return null;
}

function fromElement(element: Element, bareClasses: boolean): string | null {
	for (const attribute of LANGUAGE_ATTRIBUTES) {
		const value = element.getAttribute(attribute);
		const language = value && knownCodeLanguage(value);
		if (language) return language;
	}
	for (const name of element.classList) {
		const hint =
			LANGUAGE_CLASS.exec(name)?.[1] ?? (bareClasses ? name : null);
		const language = hint && knownCodeLanguage(hint);
		if (language) return language;
	}
	return null;
}
