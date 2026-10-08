import { FileFormat, matchesFile } from "../fileFormat";
import { extractPdf } from "./extract";

// No signature: valid PDFs may have junk before their `%PDF-` header.
export const pdfFormat: FileFormat = {
	label: "PDF",
	extensions: ["pdf"],
	mimeTypes: ["application/pdf"],
	extract: extractPdf,
};

export function isPdfFile(file: File): boolean {
	return matchesFile(pdfFormat, file);
}
