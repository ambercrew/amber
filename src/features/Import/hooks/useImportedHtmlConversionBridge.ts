import ConvertImportedHtmlEventDto, {
	CONVERT_IMPORTED_HTML_EVENT,
} from "../../../api/import/events/convertImportedHtmlEvent";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";

/** Answers the backend's requests to turn imported HTML into Lexical content. */
export function useImportedHtmlConversionBridge() {
	useFrontendRequestBridge<ConvertImportedHtmlEventDto>(
		CONVERT_IMPORTED_HTML_EVENT,
		// Loaded on the first request, as the converter brings the import parsers with it.
		async event => {
			const { convertImportedHtml } =
				await import("../utils/convertImportedHtml");
			return JSON.stringify(await convertImportedHtml(event));
		},
	);
}
