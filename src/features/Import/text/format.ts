import { FileFormat } from "../fileFormat";
import { extractText } from "./extract";

export const textFormat: FileFormat = {
	label: "text",
	extensions: ["txt"],
	mimeTypes: ["text/plain"],
	extract: bytes => extractText(new TextDecoder().decode(bytes)),
};
