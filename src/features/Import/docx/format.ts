import { FileFormat } from "../utils/fileFormat";

// The parser loads on first use, keeping it out of the startup bundle.
export const docxFormat: FileFormat = {
	label: "DOCX",
	extensions: ["docx"],
	mimeTypes: [
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	],
	extract: async bytes => (await import("./extract")).extractDocx(bytes),
};
