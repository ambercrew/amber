import { fetchImage } from "../../../api/import/api/importApi";
import {
	compressDataUri,
	estimateDataUriBytes,
} from "./compressImage";

export type LocalizedImage =
	{ ok: true; src: string } | { ok: false; originalUrl: string };

const MAX_DATA_URI_BYTES = 2 * 1024 * 1024;

/** The only module that knows how imported images are stored — swap this to
 * write into a content-addressed file store instead of inlining data URIs. */
export async function localizeImage(
	absoluteUrl: string,
	referer: string | null,
): Promise<LocalizedImage> {
	if (absoluteUrl.startsWith("data:")) {
		if (absoluteUrl.startsWith("data:image/svg+xml")) {
			return { ok: false, originalUrl: absoluteUrl };
		}
		return finalizeLocalizedImage(absoluteUrl, absoluteUrl);
	}

	try {
		const { mime, bytesBase64 } = await fetchImage(absoluteUrl, referer);

		if (mime === "image/svg+xml") {
			return { ok: false, originalUrl: absoluteUrl };
		}

		const dataUri = `data:${mime};base64,${bytesBase64}`;
		return finalizeLocalizedImage(dataUri, absoluteUrl);
	} catch {
		return { ok: false, originalUrl: absoluteUrl };
	}
}

async function finalizeLocalizedImage(
	dataUri: string,
	originalUrl: string,
): Promise<LocalizedImage> {
	const compressed = await compressDataUri(dataUri, MAX_DATA_URI_BYTES);
	if (compressed.ok) {
		return { ok: true, src: compressed.src };
	}

	if (compressed.reason === "too-large") {
		return { ok: false, originalUrl };
	}

	if (estimateDataUriBytes(dataUri) > MAX_DATA_URI_BYTES) {
		return { ok: false, originalUrl };
	}

	return { ok: true, src: dataUri };
}
