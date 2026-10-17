import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";
import { sanitizeHtml } from "../../../utils/sanitizeHtml";
import { ELEMENT_REFERENCE_TAG } from "../../../api/aiIntegration/elementReference";

marked.use(markedKatex({ throwOnError: false, output: "html" }));

/** Renders AI-authored Markdown (with KaTeX math) to sanitized HTML, keeping `<element-ref>` tags. */
export function renderMarkdown(value: string) {
	return sanitizeHtml(marked.parse(value, { async: false }) as string, [
		ELEMENT_REFERENCE_TAG,
	]);
}
