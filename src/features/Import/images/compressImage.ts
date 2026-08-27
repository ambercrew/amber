import imageCompression from "browser-image-compression";

const MAX_DIMENSION = 1280;
const INITIAL_QUALITY = 0.6;
const TARGET_MAX_BYTES = 384 * 1024;
const DATA_URI_MIME_PATTERN = /^data:(image\/[^;]+);/;

export type CompressImageResult =
	| { ok: true; src: string }
	| { ok: false; reason: "unsupported" | "decode-failed" | "too-large" };

export function estimateDataUriBytes(dataUri: string): number {
	const comma = dataUri.indexOf(",");
	if (comma === -1) return dataUri.length;
	return (dataUri.slice(comma + 1).length * 3) / 4;
}

export async function compressDataUri(
	dataUri: string,
	maxBytes: number,
): Promise<CompressImageResult> {
	const mimeMatch = DATA_URI_MIME_PATTERN.exec(dataUri);
	if (!mimeMatch) {
		return { ok: false, reason: "unsupported" };
	}

	const mime = mimeMatch[1];
	if (mime === "image/svg+xml" || mime === "image/gif") {
		return { ok: true, src: dataUri };
	}

	try {
		const blob = await fetch(dataUri).then(response => response.blob());
		const file = new File([blob], "import-image", { type: mime });
		const compressedFile = await imageCompression(file, {
			maxSizeMB: TARGET_MAX_BYTES / (1024 * 1024),
			maxWidthOrHeight: MAX_DIMENSION,
			initialQuality: INITIAL_QUALITY,
			fileType: "image/webp",
			useWebWorker: false,
		});

		if (compressedFile.size < blob.size) {
			if (compressedFile.size > maxBytes) {
				return { ok: false, reason: "too-large" };
			}
			return { ok: true, src: await fileToDataUri(compressedFile) };
		}

		if (blob.size > maxBytes) {
			return { ok: false, reason: "too-large" };
		}

		return { ok: true, src: dataUri };
	} catch {
		return { ok: false, reason: "decode-failed" };
	}
}

function fileToDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () =>
			reject(new Error("Failed to read compressed image"));
		reader.readAsDataURL(file);
	});
}
