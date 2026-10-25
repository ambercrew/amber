import { fetchImage } from "../../../api/import/api/importApi";
import { createAssets } from "../../../api/assets/api/assetsApi";
import { compressDataUri, estimateDataUriBytes } from "./compressImage";
import { SVG_MIME, toBase64SvgDataUri } from "./svg";

export type LocalizedImage =
	{ ok: true; src: string } | { ok: false; originalUrl: string };

type PreparedImage =
	{ ok: true; dataUri: string } | { ok: false; originalUrl: string };

const MAX_DATA_URI_BYTES = 2 * 1024 * 1024;

/** The only module that knows how imported images are stored: as assets, referenced by `amber-asset:<id>`. */
export async function localizeImage(
	absoluteUrl: string,
	referer: string | null,
): Promise<LocalizedImage> {
	const localized = await localizeImages([absoluteUrl], referer);
	return localized.get(absoluteUrl)!;
}

/** Downloads and compresses the images in parallel, then stores them all in one transaction. */
export async function localizeImages(
	absoluteUrls: string[],
	referer: string | null,
): Promise<Map<string, LocalizedImage>> {
	const prepared = await Promise.all(
		absoluteUrls.map(url => prepareImage(url, referer)),
	);
	const toStore = absoluteUrls.flatMap((url, index) => {
		const image = prepared[index];
		return image.ok ? [{ url, dataUri: image.dataUri }] : [];
	});
	const srcs = await storeImages(toStore.map(image => image.dataUri));
	const srcByUrl = new Map(
		toStore.map((image, index) => [image.url, srcs[index]]),
	);

	return new Map(
		absoluteUrls.map((url, index): [string, LocalizedImage] => {
			const image = prepared[index];
			if (!image.ok) return [url, image];
			const src = srcByUrl.get(url);
			return [
				url,
				src ? { ok: true, src } : { ok: false, originalUrl: url },
			];
		}),
	);
}

async function prepareImage(
	absoluteUrl: string,
	referer: string | null,
): Promise<PreparedImage> {
	if (absoluteUrl.startsWith("data:")) {
		if (absoluteUrl.startsWith(`data:${SVG_MIME}`)) {
			return prepareSvg(absoluteUrl, absoluteUrl);
		}
		return compressImage(absoluteUrl, absoluteUrl);
	}

	let fetched: Awaited<ReturnType<typeof fetchImage>>;
	try {
		fetched = await fetchImage(absoluteUrl, referer);
	} catch {
		return { ok: false, originalUrl: absoluteUrl };
	}

	const dataUri = `data:${fetched.mime};base64,${fetched.bytesBase64}`;
	if (fetched.mime === SVG_MIME) return prepareSvg(dataUri, absoluteUrl);
	return compressImage(dataUri, absoluteUrl);
}

// Vector images stay as they are: there's nothing to gain from re-encoding them as rasters.
function prepareSvg(dataUri: string, originalUrl: string): PreparedImage {
	const base64 = toBase64SvgDataUri(dataUri);
	if (base64 === null || estimateDataUriBytes(base64) > MAX_DATA_URI_BYTES) {
		return { ok: false, originalUrl };
	}
	return { ok: true, dataUri: base64 };
}

async function compressImage(
	dataUri: string,
	originalUrl: string,
): Promise<PreparedImage> {
	const compressed = await compressDataUri(dataUri, MAX_DATA_URI_BYTES);
	if (compressed.ok) return { ok: true, dataUri: compressed.src };

	if (compressed.reason === "too-large") {
		return { ok: false, originalUrl };
	}

	if (estimateDataUriBytes(dataUri) > MAX_DATA_URI_BYTES) {
		return { ok: false, originalUrl };
	}

	// The browser couldn't decode it, so the backend likely can't either.
	return { ok: true, dataUri };
}

// A failed store marks the images broken, like a failed fetch, instead of aborting the whole import.
async function storeImages(dataUris: string[]): Promise<(string | null)[]> {
	if (dataUris.length === 0) return [];
	try {
		const assets = await createAssets({ dataUris });
		return assets.map(asset => asset?.src ?? null);
	} catch {
		return dataUris.map(() => null);
	}
}
