import { FileFormat } from "../fileFormat";
import { extractDocx } from "./extract";

export const docxFormat: FileFormat = {
	label: "DOCX",
	extensions: ["docx"],
	mimeTypes: [
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	],
	extract: bytes => extractDocx(bytes),
};
