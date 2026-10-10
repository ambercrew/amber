import { fetchImage } from "../../../api/import/api/importApi";
import { createAsset } from "../../../api/assets/api/assetsApi";
import { compressDataUri, estimateDataUriBytes } from "./compressImage";

export type LocalizedImage =
	{ ok: true; src: string } | { ok: false; originalUrl: string };

const MAX_DATA_URI_BYTES = 2 * 1024 * 1024;

/** The only module that knows how imported images are stored: as assets, referenced by `amber-asset:<id>`. */
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

	let fetched: Awaited<ReturnType<typeof fetchImage>>;
	try {
		fetched = await fetchImage(absoluteUrl, referer);
	} catch {
		return { ok: false, originalUrl: absoluteUrl };
	}

	if (fetched.mime === "image/svg+xml") {
		return { ok: false, originalUrl: absoluteUrl };
	}

	const dataUri = `data:${fetched.mime};base64,${fetched.bytesBase64}`;
	return finalizeLocalizedImage(dataUri, absoluteUrl);
}

async function finalizeLocalizedImage(
	dataUri: string,
	originalUrl: string,
): Promise<LocalizedImage> {
	const compressed = await compressDataUri(dataUri, MAX_DATA_URI_BYTES);
	if (compressed.ok) return storeImage(compressed.src, originalUrl);

	if (compressed.reason === "too-large") {
		return { ok: false, originalUrl };
	}

	if (estimateDataUriBytes(dataUri) > MAX_DATA_URI_BYTES) {
		return { ok: false, originalUrl };
	}

	// The browser couldn't decode it, so the backend likely can't either.
	return storeImage(dataUri, originalUrl);
}

// A failed store marks just this image broken, like a failed fetch, instead of aborting the whole import.
async function storeImage(
	dataUri: string,
	originalUrl: string,
): Promise<LocalizedImage> {
	try {
		return { ok: true, src: (await createAsset({ dataUri })).src };
	} catch {
		return { ok: false, originalUrl };
	}
}
