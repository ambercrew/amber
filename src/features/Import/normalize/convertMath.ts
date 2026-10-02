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
		const display = script.getAttribute("type")?.includes("mode=display");
		script.replaceWith(createEquationElement(doc, latex, display === true));
	}

	for (const math of Array.from(doc.querySelectorAll("math"))) {
		if (!math.isConnected) continue;
		const latex = latexFromMathML(math);
		if (latex === null) continue;

		const wrapper = outermostWrapper(math);
		const display = isDisplayMath(math, wrapper);
		wrapper.replaceWith(createEquationElement(doc, latex, display));
	}
}

function latexFromMathML(math: Element): string | null {
	// `alttext` is last: it is often prose or a placeholder ("Alternative text
	// not available" in EPUBs), not TeX.
	const source =
		nonBlank(math.getAttribute("data-latex")) ??
		nonBlank(math.querySelector(TEX_ANNOTATION_SELECTOR)?.textContent) ??
		nonBlank(convertMathML(math)) ??
		nonBlank(math.getAttribute("alttext"));
	return source === null ? null : unwrapStyle(source);
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
	if (!match || closingBraceIndex(latex) !== latex.length - 1) return latex;
	return latex.slice(match[0].length, -1).trim();
}

// Index of the `}` closing the `{` at index 0, skipping escaped braces.
function closingBraceIndex(latex: string): number {
	let depth = 0;
	for (let i = 0; i < latex.length; i++) {
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

function isDisplayMath(math: Element, wrapper: Element): boolean {
	return (
		math.getAttribute("display") === "block" ||
		math.getAttribute("mode") === "display" ||
		wrapper.matches(`.katex-display, ${MATHJAX2_DISPLAY_SELECTOR}`) ||
		wrapper.getAttribute("display") === "true"
	);
}
