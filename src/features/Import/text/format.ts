import { FileFormat } from "../utils/fileFormat";

// The parser loads on first use, keeping it out of the startup bundle.
export const textFormat: FileFormat = {
	label: "text",
	extensions: ["txt"],
	mimeTypes: ["text/plain"],
	extract: async bytes =>
		(await import("./extract")).extractText(
			new TextDecoder().decode(bytes),
		),
};
