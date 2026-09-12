import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FetchedPageDto } from "../dto/fetchedPageDto";
import { FetchedImageDto } from "../dto/fetchedImageDto";
import { PdfExtractionDto } from "../dto/pdfExtractionDto";
import { EpubExtractionDto } from "../dto/epubExtractionDto";

export function fetchPage(url: string): Promise<FetchedPageDto> {
	return invoke("fetch_page", { url });
}

export function fetchImage(
	url: string,
	referer: string | null,
): Promise<FetchedImageDto> {
	return invoke("fetch_image", { url, referer });
}

interface PdfImportProgressEvent {
	requestId: string;
	done: number;
	total: number;
}

let nextPdfExtractionRequestId = 0;

export async function extractPdf(
	bytesBase64: string,
	onProgress?: (progress: { done: number; total: number }) => void,
): Promise<PdfExtractionDto> {
	const requestId = String(nextPdfExtractionRequestId++);

	const unlisten = onProgress
		? await listen<PdfImportProgressEvent>("pdf-import-progress", event => {
				if (event.payload.requestId !== requestId) return;
				onProgress({
					done: event.payload.done,
					total: event.payload.total,
				});
			})
		: null;

	try {
		return await invoke<PdfExtractionDto>("extract_pdf", {
			requestId,
			bytesBase64,
		});
	} finally {
		unlisten?.();
	}
}

export function extractEpub(bytesBase64: string): Promise<EpubExtractionDto> {
	return invoke("extract_epub", { bytesBase64 });
}

export function getPdfPageCount(bytesBase64: string): Promise<number> {
	return invoke("get_pdf_page_count", { bytesBase64 });
}

export function getPdfPageHtml(
	bytesBase64: string,
	pageIndex: number,
): Promise<string> {
	return invoke("get_pdf_page_html", { bytesBase64, pageIndex });
}
