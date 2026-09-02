import {
	extractPdf as invokeExtractPdf,
	getPdfPageCount as invokeGetPdfPageCount,
} from "../../../api/import/api/importApi";
import { bytesToBase64 } from "../bytesToBase64";

export interface PdfExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
	pageCount: number;
}

export interface PdfProgress {
	done: number;
	total: number;
}

export async function extractPdf(
	bytes: ArrayBuffer,
	onProgress?: (progress: PdfProgress) => void,
): Promise<PdfExtraction> {
	const bytesBase64 = bytesToBase64(new Uint8Array(bytes));
	return invokeExtractPdf(bytesBase64, onProgress);
}

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
	const bytesBase64 = bytesToBase64(new Uint8Array(bytes));
	return invokeGetPdfPageCount(bytesBase64);
}
