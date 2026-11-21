import { FileFormat } from "../utils/fileFormat";

// The parser loads on first use, keeping it out of the startup bundle.
export const htmlFormat: FileFormat = {
	label: "HTML",
	extensions: ["html", "htm", "xhtml"],
	mimeTypes: ["text/html", "application/xhtml+xml"],
	extract: async bytes =>
		(await import("./extract")).extractHtml(
			new TextDecoder().decode(bytes),
		),
};
