import { Marked } from "marked";
import { markedEquationExtension } from "../components/Editor/plugins/EquationPlugin/markedEquationExtension";

// A private instance: the shared `marked` singleton gets KaTeX rendering
// registered on it by the AI chat, which would bake math into opaque HTML.
const markdown = new Marked(markedEquationExtension);

/** Renders Markdown to HTML, turning TeX math into equation nodes' HTML. */
export function markdownToHtml(text: string): string {
	return markdown.parse(text, { async: false });
}
