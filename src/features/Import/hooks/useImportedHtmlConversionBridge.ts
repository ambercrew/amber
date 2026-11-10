import ConvertImportedHtmlEventDto, {
	CONVERT_IMPORTED_HTML_EVENT,
} from "../../../api/import/events/convertImportedHtmlEvent";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";
import { convertImportedHtml } from "../convertImportedHtml";

/** Answers the backend's requests to turn imported HTML into Lexical content. */
export function useImportedHtmlConversionBridge() {
	useFrontendRequestBridge<ConvertImportedHtmlEventDto>(
		CONVERT_IMPORTED_HTML_EVENT,
		async event => JSON.stringify(await convertImportedHtml(event)),
	);
}
