import { FileFormat } from "../utils/fileFormat";

// The parser loads on first use, keeping it out of the startup bundle.
export const markdownFormat: FileFormat = {
	label: "Markdown",
	extensions: ["md", "markdown"],
	mimeTypes: ["text/markdown"],
	extract: async bytes =>
		(await import("./extract")).extractMarkdown(
			new TextDecoder().decode(bytes),
		),
};
