import { FileFormat } from "../fileFormat";
import { extractMarkdown } from "./extract";

export const markdownFormat: FileFormat = {
	label: "Markdown",
	extensions: ["md", "markdown"],
	mimeTypes: ["text/markdown"],
	extract: bytes => extractMarkdown(new TextDecoder().decode(bytes)),
};
