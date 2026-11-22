export const PDF_IMPORT_PROGRESS_EVENT = "pdf-import-progress";

/** How far a PDF extraction got, for the request `requestId` started. */
export interface PdfImportProgressEventDto {
	requestId: string;
	done: number;
	total: number;
}
