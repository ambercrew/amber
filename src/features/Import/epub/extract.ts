import { extractEpub as invokeExtractEpub } from "../../../api/import/api/importApi";
import { bytesToBase64 } from "../bytesToBase64";

export interface EpubExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
	chapterCount: number;
}

export async function extractEpub(bytes: ArrayBuffer): Promise<EpubExtraction> {
	const bytesBase64 = bytesToBase64(new Uint8Array(bytes));
	return invokeExtractEpub(bytesBase64);
}
