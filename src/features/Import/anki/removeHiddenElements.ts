// Card templates' scripts and controls (hint buttons, sliders) do nothing outside Anki.
const CONTROL_SELECTOR =
	"script, style, template, noscript, button, input, select, textarea";
const HIDDEN_STYLE =
	/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i;
// A template's copy of a field for its script to render, never shown as written.
const RAW_CLOZE = /\{\{c\d+::/;

/**
 * Drops what a card never shows: controls, script data (also when folded into a collapsed `<details>`),
 * and hidden images, cloze source or repeats of visible text. Other hidden content stays, as a scripted
 * template may hide parts of the card, or all of it, for its script to reveal.
 */
export function removeHiddenElements(doc: Document): void {
	for (const control of Array.from(
		doc.body.querySelectorAll(CONTROL_SELECTOR),
	))
		control.remove();
	for (const details of Array.from(
		doc.body.querySelectorAll("details:not([open])"),
	)) {
		const body = Array.from(details.childNodes)
			.filter(node => node.nodeName !== "SUMMARY")
			.map(node => node.textContent)
			.join("");
		if (isData(body)) details.remove();
	}

	const visible = doc.body.cloneNode(true) as HTMLElement;
	hiddenElements(visible).forEach(element => element.remove());
	const visibleText = squash(visible.textContent);
	for (const element of hiddenElements(doc.body)) {
		const text = squash(element.textContent);
		if (
			isNeverShown(element) ||
			!hasContent(element) ||
			(text !== "" && visibleText.includes(text))
		)
			element.remove();
	}
}

function squash(text: string | null): string {
	return (text ?? "").replace(/\s+/g, " ").trim();
}

function hiddenElements(root: HTMLElement): Element[] {
	return Array.from(root.querySelectorAll("[hidden], [style]")).filter(
		isHidden,
	);
}

function isHidden(element: Element): boolean {
	return (
		element.hasAttribute("hidden") ||
		HIDDEN_STYLE.test(element.getAttribute("style") ?? "")
	);
}

function isNeverShown(element: Element): boolean {
	const text = element.textContent ?? "";
	return element.tagName === "IMG" || RAW_CLOZE.test(text) || isData(text);
}

/** A JSON object or array, as templates embed for their scripts. */
function isData(text: string): boolean {
	const trimmed = text.trim();
	if (!/^[[{]/.test(trimmed)) return false;
	try {
		JSON.parse(trimmed);
		return true;
	} catch {
		return false;
	}
}

function hasContent(element: Element): boolean {
	return (
		(element.textContent ?? "").trim() !== "" ||
		element.querySelector("img") !== null
	);
}
