import ConvertLexicalToHtmlEventDto, {
	CONVERT_LEXICAL_TO_HTML_EVENT,
} from "../../../api/common/events/convertLexicalToHtmlEvent";
import ConvertMarkdownToLexicalEventDto, {
	CONVERT_MARKDOWN_TO_LEXICAL_EVENT,
} from "../../../api/common/events/convertMarkdownToLexicalEvent";
import { markdownToLexicalJson } from "../../../components/Editor/lexicalJsonConversion";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";
import { convertLexicalToHtml } from "../answerLexicalConversionRequests";

/** Answers the backend's Lexical conversion requests: Markdown to Lexical JSON, and Lexical JSON to HTML. */
export function useLexicalConversionBridge() {
	useFrontendRequestBridge<ConvertMarkdownToLexicalEventDto>(
		CONVERT_MARKDOWN_TO_LEXICAL_EVENT,
		event => markdownToLexicalJson(event.markdown),
	);
	useFrontendRequestBridge<ConvertLexicalToHtmlEventDto>(
		CONVERT_LEXICAL_TO_HTML_EVENT,
		event => JSON.stringify(convertLexicalToHtml(event)),
	);
}
