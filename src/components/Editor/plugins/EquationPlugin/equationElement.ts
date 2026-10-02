import { bytesToBase64 } from "../../../../utils/bytesToBase64";

// The canonical HTML form of an equation: what EquationNode exports and
// imports, and what Import converts every other math markup into.
export const EQUATION_TAG_NAME = "span";
export const EQUATION_ATTRIBUTE_NAME = "data-lexical-equation";
export const EQUATION_DISPLAY_ATTRIBUTE_NAME = "data-lexical-equation-display";

/** UTF-8 safe base64, since `btoa` throws on characters like `α`. */
export function encodeEquation(equation: string): string {
	return bytesToBase64(new TextEncoder().encode(equation));
}

export function decodeEquation(encoded: string): string {
	let binary: string;
	try {
		binary = atob(encoded);
	} catch {
		return "";
	}
	const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		// Equations exported before UTF-8 encoding were plain `btoa` output.
		return binary;
	}
}

export function createEquationElement(
	doc: Document,
	equation: string,
	display: boolean,
): HTMLElement {
	const element = doc.createElement(EQUATION_TAG_NAME);
	element.setAttribute(EQUATION_ATTRIBUTE_NAME, encodeEquation(equation));
	if (display) element.setAttribute(EQUATION_DISPLAY_ATTRIBUTE_NAME, "true");
	return element;
}
