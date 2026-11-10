import { FrontendRequestEvent } from "../../../hooks/useFrontendRequestBridge";

export const CONVERT_LEXICAL_TO_HTML_EVENT = "convert-lexical-to-html";

/** Lexical JSON documents to render as HTML. */
interface ConvertLexicalToHtmlEventDto extends FrontendRequestEvent {
	contents: string[];
}

/** One HTML fragment per document, in order, or why it failed. */
export type ConvertLexicalToHtmlResponseDto =
	{ htmls: string[] } | { error: string };

export default ConvertLexicalToHtmlEventDto;
