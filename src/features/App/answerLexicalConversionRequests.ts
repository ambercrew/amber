import ConvertLexicalToHtmlEventDto, {
	ConvertLexicalToHtmlResponseDto,
} from "../../api/common/events/convertLexicalToHtmlEvent";
import { lexicalJsonsToHtml } from "../../components/Editor/lexicalJsonConversion";

/** Answers the backend's request to render Lexical JSON documents as HTML. */
export function convertLexicalToHtml({
	contents,
}: ConvertLexicalToHtmlEventDto): ConvertLexicalToHtmlResponseDto {
	try {
		return { htmls: lexicalJsonsToHtml(contents) };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
