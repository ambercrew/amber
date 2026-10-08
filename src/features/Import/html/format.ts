import { FileFormat } from "../fileFormat";
import { extractHtml } from "./extract";

export const htmlFormat: FileFormat = {
	label: "HTML",
	extensions: ["html", "htm", "xhtml"],
	mimeTypes: ["text/html", "application/xhtml+xml"],
	extract: bytes => extractHtml(new TextDecoder().decode(bytes)),
};
