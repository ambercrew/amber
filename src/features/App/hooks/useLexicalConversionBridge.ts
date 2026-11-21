import ConvertLexicalToHtmlEventDto, {
	CONVERT_LEXICAL_TO_HTML_EVENT,
} from "../../../api/common/events/convertLexicalToHtmlEvent";
import ConvertMarkdownToLexicalEventDto, {
	CONVERT_MARKDOWN_TO_LEXICAL_EVENT,
} from "../../../api/common/events/convertMarkdownToLexicalEvent";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";

// Both converters run a headless editor, so they load on the first request rather than at startup.
const loadLexicalJsonConversion = () =>
	import("../../../components/Editor/lexicalJsonConversion");
const loadLexicalToHtml = () =>
	import("../utils/answerLexicalConversionRequests");

/** Answers the backend's Lexical conversion requests: Markdown to Lexical JSON, and Lexical JSON to HTML. */
export function useLexicalConversionBridge() {
	useFrontendRequestBridge<ConvertMarkdownToLexicalEventDto>(
		CONVERT_MARKDOWN_TO_LEXICAL_EVENT,
		async event =>
			(await loadLexicalJsonConversion()).markdownToLexicalJson(
				event.markdown,
			),
	);
	useFrontendRequestBridge<ConvertLexicalToHtmlEventDto>(
		CONVERT_LEXICAL_TO_HTML_EVENT,
		async event =>
			JSON.stringify(
				(await loadLexicalToHtml()).convertLexicalToHtml(event),
			),
	);
}
