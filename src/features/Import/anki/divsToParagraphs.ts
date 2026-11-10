// Layout containers the sanitizer drops, which would run their lines together.
const CONTAINER_SELECTOR =
	"div, section, article, header, footer, main, aside, nav, figure, figcaption, center";
const BLOCK_SELECTOR = `${CONTAINER_SELECTOR}, p, ul, ol, li, table, pre, blockquote, h1, h2, h3, h4, h5, h6, hr, details`;
// Paragraphs can't nest here, so a container inside one of these ends with a line break instead.
const INLINE_ONLY_SELECTOR = "p, li, td, th, h1, h2, h3, h4, h5, h6, pre";

/** Keeps a card's lines apart: Anki's editor and most templates lay a card out in `<div>`s. */
export function divsToParagraphs(doc: Document): void {
	// Innermost first, so a container knows whether its children are still blocks.
	const containers = Array.from(
		doc.body.querySelectorAll(CONTAINER_SELECTOR),
	).reverse();
	for (const container of containers) {
		if (isEmpty(container)) {
			container.remove();
		} else if (container.parentElement?.closest(INLINE_ONLY_SELECTOR)) {
			if (container.nextSibling) container.after(doc.createElement("br"));
			container.replaceWith(...Array.from(container.childNodes));
		} else if (container.querySelector(BLOCK_SELECTOR)) {
			container.replaceWith(...Array.from(container.childNodes));
		} else {
			const paragraph = doc.createElement("p");
			paragraph.append(...Array.from(container.childNodes));
			container.replaceWith(paragraph);
		}
	}
	removeBlankRuns(doc.body);
}

/** Drops line breaks and emptied wrappers left between blocks, which would become blank paragraphs. */
function removeBlankRuns(body: HTMLElement) {
	let run: ChildNode[] = [];
	const flush = () => {
		if (
			run.every(node =>
				isEmpty(node, "img, hr, span[data-lexical-equation]"),
			)
		)
			run.forEach(node => node.remove());
		run = [];
	};
	for (const node of Array.from(body.childNodes)) {
		if (node instanceof Element && node.matches(BLOCK_SELECTOR)) flush();
		else run.push(node);
	}
	flush();
}

// A template's scaffolding shows nothing; `<div><br></div>`, Anki's blank line, does.
function isEmpty(
	node: Node,
	content = "img, br, hr, span[data-lexical-equation]",
): boolean {
	if ((node.textContent ?? "").trim() !== "") return false;
	if (!(node instanceof Element)) return true;
	return !node.matches(content) && node.querySelector(content) === null;
}
