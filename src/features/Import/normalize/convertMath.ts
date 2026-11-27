import { MathMLToLaTeX } from "mathml-to-latex";
import { createEquationElement } from "../../../components/Editor/plugins/EquationPlugin/equationElement";

// MathJax 2's output per renderer: HTML-CSS, CommonHTML, SVG, PreviewHTML, NativeMML.
const MATHJAX2_DISPLAY_SELECTOR =
	".MathJax_Display, .MJXc-display, .MathJax_SVG_Display, .MathJax_PHTML_Display, .MathJax_MathContainer";
const MATHJAX2_SELECTOR = `${MATHJAX2_DISPLAY_SELECTOR}, .MathJax, .MathJax_CHTML, .MathJax_SVG, .MathJax_PHTML, .MathJax_MathML`;

// Renderers wrap MathML in visual markup that would survive sanitizing as
// garbled text, so the whole wrapper is replaced, not just the <math>.
const MATH_WRAPPER_SELECTOR = `.katex-display, .katex, mjx-container, .mwe-math-element, ${MATHJAX2_SELECTOR}`;

const TEX_ANNOTATION_SELECTOR = [
	"application/x-tex",
	"application/x-latex",
	"TeX",
	"LaTeX",
]
	.map(encoding => `annotation[encoding="${encoding}"]`)
	.join(", ");

// MathJax 2 keeps the source in a script next to its rendered output.
const MATHJAX_SCRIPT_SELECTOR = 'script[type^="math/tex"]';
const MATHJAX_RENDERED_SELECTOR = `.MathJax_Preview, ${MATHJAX2_SELECTOR}`;

// KaTeX environments and `\tag` that fail to parse in inline mode.
const DISPLAY_ONLY_TEX =
	/(?:^|[^\\])(?:\\\\)*(?:\\begin\{(?:align|gather|alignat|equation|CD)\*?\}|\\tag(?![a-zA-Z]))/;

// MediaWiki `texvc` commands that aren't defined in KaTeX or standard LaTeX.
const TEXVC_MACROS: Record<string, string> = {
	C: "\\mathbb{C}",
	Q: "\\mathbb{Q}",
	H: "\\mathbb{H}",
	O: "\\emptyset",
	empty: "\\emptyset",
	part: "\\partial",
	and: "\\land",
	or: "\\lor",
	sgn: "\\operatorname{sgn}",
	arccot: "\\operatorname{arccot}",
	arcsec: "\\operatorname{arcsec}",
	arccsc: "\\operatorname{arccsc}",
	sen: "\\operatorname{sen}",
	arsinh: "\\operatorname{arsinh}",
	arcosh: "\\operatorname{arcosh}",
	artanh: "\\operatorname{artanh}",
	arcoth: "\\operatorname{arcoth}",
	arsech: "\\operatorname{arsech}",
	arcsch: "\\operatorname{arcsch}",
	mbox: "\\text",
	sfrac: "\\tfrac",
	euro: "\\text{€}",
	geneuro: "\\text{€}",
	koppa: "\\text{ϟ}",
	stigma: "\\text{ϛ}",
	sampi: "\\text{ϡ}",
	Digamma: "\\mathrm{Ϝ}",
};
const TEXVC_MACRO_REGEX = new RegExp(
	`(^|[^\\\\])((?:\\\\\\\\)*)\\\\(${Object.keys(TEXVC_MACROS).join("|")})(?![a-zA-Z])`,
	"g",
);
const MEDIAWIKI_UNNUMBERED_ENVS: Record<string, string> = {
	align: "aligned",
	"align*": "aligned",
	gather: "gathered",
	"gather*": "gathered",
	alignat: "alignedat",
	"alignat*": "alignedat",
};

interface MediaWikiMathData {
	name?: unknown;
	attrs?: { display?: unknown };
	body?: { extsrc?: unknown };
}

/** Stashes each `<math>` element's LaTeX and display mode before Defuddle drops `data-mw` and falls back to `textContent`. */
export function markMath(doc: Document): void {
	for (const math of Array.from(doc.querySelectorAll("math"))) {
		const wrapper = outermostWrapper(math);
		if (hasFollowingMathJaxScript(wrapper)) continue;

		const latex = latexFromMathML(math, wrapper);
		if (latex === null) continue;

		const display = isDisplayMath(math, wrapper, latex);
		math.setAttribute("data-latex", latex);
		wrapper.setAttribute("data-latex", latex);
		if (display) {
			math.setAttribute("display", "block");
			wrapper.setAttribute("display", "block");
		}
	}
}

/** Replaces MathML and rendered math (KaTeX, MathJax, Wikipedia) with equation elements the sanitizer keeps. */
export function convertMath(doc: Document): void {
	// Scripts first: they drop MathJax 2's rendered output, whose assistive
	// MathML would otherwise become a second copy of the equation.
	for (const script of Array.from(
		doc.querySelectorAll(MATHJAX_SCRIPT_SELECTOR),
	)) {
		const latex = script.textContent?.trim();
		if (!latex) continue;

		while (
			script.previousElementSibling?.matches(MATHJAX_RENDERED_SELECTOR)
		)
			script.previousElementSibling.remove();
		const display =
			script.getAttribute("type")?.includes("mode=display") === true ||
			DISPLAY_ONLY_TEX.test(latex);
		script.replaceWith(createEquationElement(doc, latex, display));
	}

	for (const math of Array.from(doc.querySelectorAll("math"))) {
		if (!math.isConnected) continue;
		const wrapper = outermostWrapper(math);
		const latex = latexFromMathML(math, wrapper);
		if (latex === null) continue;

		const display = isDisplayMath(math, wrapper, latex);
		wrapper.replaceWith(createEquationElement(doc, latex, display));
	}
}

function latexFromMathML(math: Element, wrapper: Element): string | null {
	const mediaWikiLatex = latexFromMediaWiki(math, wrapper);
	// `alttext` is last: it is often prose or a placeholder ("Alternative text
	// not available" in EPUBs), not TeX.
	const source =
		nonBlank(math.getAttribute("data-latex")) ??
		mediaWikiLatex ??
		nonBlank(math.querySelector(TEX_ANNOTATION_SELECTOR)?.textContent) ??
		nonBlank(convertMathML(math)) ??
		nonBlank(math.getAttribute("alttext"));
	if (source === null) return null;

	const unwrapped = unwrapStyle(source);
	return mediaWikiLatex !== null || isMediaWikiElement(math, wrapper)
		? normalizeMediaWikiTex(unwrapped)
		: unwrapped;
}

function parseMediaWikiMath(
	math: Element,
	wrapper: Element,
): MediaWikiMathData | null {
	const raw = math.getAttribute("data-mw") ?? wrapper.getAttribute("data-mw");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as MediaWikiMathData;
		return parsed.name === "math" ? parsed : null;
	} catch {
		return null;
	}
}

function latexFromMediaWiki(math: Element, wrapper: Element): string | null {
	const extsrc = parseMediaWikiMath(math, wrapper)?.body?.extsrc;
	return typeof extsrc === "string" ? nonBlank(extsrc) : null;
}

function isMediaWikiElement(math: Element, wrapper: Element): boolean {
	return (
		math.classList.contains("mwe-math-element") ||
		wrapper.classList.contains("mwe-math-element")
	);
}

// Rewrites MediaWiki's `texvc` dialect into portable LaTeX that KaTeX renders without numbering.
function normalizeMediaWikiTex(latex: string): string {
	let normalized = latex.replace(
		TEXVC_MACRO_REGEX,
		(_, prefix: string, slashes: string, name: string) =>
			`${prefix}${slashes}${TEXVC_MACROS[name]}`,
	);
	if (!/(?:^|[^\\])(?:\\\\)*\\tag(?![a-zA-Z])/.test(normalized)) {
		normalized = normalized.replace(
			/\\(begin|end)\{(align\*?|gather\*?|alignat\*?)\}/g,
			(_, bound: string, env: string) =>
				`\\${bound}{${MEDIAWIKI_UNNUMBERED_ENVS[env]}}`,
		);
	}
	return wrapBareSqrtDenominator(normalized);
}

// MediaWiki's `texvc` accepts `\frac{1}\sqrt{…}` without braces around the denominator.
function wrapBareSqrtDenominator(latex: string): string {
	let result = "";
	let cursor = 0;
	for (const match of latex.matchAll(/\\[cdt]?frac(?![a-zA-Z])/g)) {
		if (match.index < cursor) continue;
		const numEnd = endOfTexArg(latex, match.index + match[0].length);
		if (numEnd === -1) continue;
		const sqrt = /^\s*(\\sqrt(?:\[[^\]]*\])?)\{/.exec(latex.slice(numEnd));
		if (!sqrt) continue;
		const braceStart = numEnd + sqrt[0].length - 1;
		const denEnd = closingBraceIndex(latex, braceStart);
		if (denEnd === -1) continue;
		const denStart = braceStart - sqrt[1].length;
		result += `${latex.slice(cursor, denStart)}{${latex.slice(denStart, denEnd + 1)}}`;
		cursor = denEnd + 1;
	}
	return result + latex.slice(cursor);
}

function endOfTexArg(latex: string, from: number): number {
	let i = from;
	while (i < latex.length && /\s/.test(latex[i])) i++;
	if (i >= latex.length) return -1;
	if (latex[i] === "{") {
		const close = closingBraceIndex(latex, i);
		return close === -1 ? -1 : close + 1;
	}
	if (latex[i] === "\\") {
		const command = /^\\[a-zA-Z]+/.exec(latex.slice(i));
		return command ? i + command[0].length : Math.min(i + 2, latex.length);
	}
	return i + 1;
}

function nonBlank(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	return trimmed;
}

function convertMathML(math: Element): string | null {
	try {
		return MathMLToLaTeX.convert(
			new XMLSerializer().serializeToString(math),
		);
	} catch {
		return null;
	}
}

// Wikipedia wraps every formula in `{\displaystyle …}`.
function unwrapStyle(latex: string): string {
	const match = /^\{\\(?:displaystyle|textstyle)\b/.exec(latex);
	if (!match || closingBraceIndex(latex, 0) !== latex.length - 1)
		return latex;
	return latex.slice(match[0].length, -1).trim();
}

// Index of the `}` closing the `{` at `start`, skipping escaped braces.
function closingBraceIndex(latex: string, start: number): number {
	let depth = 0;
	for (let i = start; i < latex.length; i++) {
		const char = latex[i];
		if (char === "\\") i++;
		else if (char === "{") depth++;
		else if (char === "}" && --depth === 0) return i;
	}
	return -1;
}

// `.katex-display` wraps `.katex`, so the nearest wrapper isn't the whole one.
function outermostWrapper(math: Element): Element {
	let wrapper = math;
	for (
		let candidate = math.closest(MATH_WRAPPER_SELECTOR);
		candidate;
		candidate =
			candidate.parentElement?.closest(MATH_WRAPPER_SELECTOR) ?? null
	)
		wrapper = candidate;
	return wrapper;
}

function hasFollowingMathJaxScript(wrapper: Element): boolean {
	let next = wrapper.nextElementSibling;
	while (next?.matches(MATHJAX_RENDERED_SELECTOR))
		next = next.nextElementSibling;
	return next?.matches(MATHJAX_SCRIPT_SELECTOR) === true;
}

function isDisplayMath(
	math: Element,
	wrapper: Element,
	latex: string,
): boolean {
	return (
		math.getAttribute("display") === "block" ||
		math.getAttribute("mode") === "display" ||
		wrapper.getAttribute("display") === "true" ||
		wrapper.getAttribute("display") === "block" ||
		wrapper.matches(
			`.katex-display, .mwe-math-element-block, .mwe-math-mathml-display, ${MATHJAX2_DISPLAY_SELECTOR}`,
		) ||
		wrapper.querySelector(
			".mwe-math-mathml-display, .mwe-math-fallback-image-display",
		) !== null ||
		parseMediaWikiMath(math, wrapper)?.attrs?.display === "block" ||
		isStandaloneInDd(wrapper) ||
		DISPLAY_ONLY_TEX.test(latex)
	);
}

// Wikipedia indents standalone display formulas as `:<math>…</math>`, which renders as `<dl><dd><math>…</math></dd></dl>`.
function isStandaloneInDd(wrapper: Element): boolean {
	const parent = wrapper.parentElement;
	if (parent?.tagName !== "DD") return false;
	for (const node of Array.from(parent.childNodes)) {
		if (node === wrapper) continue;
		if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())
			continue;
		if (
			node instanceof Element &&
			(node.tagName === "STYLE" || node.tagName === "LINK")
		)
			continue;
		return false;
	}
	return true;
}
