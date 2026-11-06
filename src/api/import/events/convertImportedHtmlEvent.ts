import { FrontendRequestEvent } from "../../../hooks/useFrontendRequestBridge";

export const CONVERT_IMPORTED_HTML_EVENT = "convert-imported-html";

/** HTML fragments to sanitize, localize the images of, and convert to Lexical JSON. */
interface ConvertImportedHtmlEventDto extends FrontendRequestEvent {
	htmls: string[];
}

/** One Lexical JSON document per fragment, in order, or why it failed. */
export type ConvertImportedHtmlResponseDto =
	{ contents: string[] } | { error: string };

export default ConvertImportedHtmlEventDto;
