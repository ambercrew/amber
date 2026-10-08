import mammoth from "mammoth";
import { FileExtraction } from "../fileFormat";

export async function extractDocx(bytes: ArrayBuffer): Promise<FileExtraction> {
	const { value: html } = await mammoth.convertToHtml({ arrayBuffer: bytes });
	if (html.trim().length === 0) {
		throw new Error("no-content");
	}

	return { title: null, authors: null, publicationDate: null, html };
}
