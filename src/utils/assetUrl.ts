import { convertFileSrc } from "@tauri-apps/api/core";

/** Prefix of the canonical image `src` persisted in content for a stored asset. */
export const ASSET_SRC_PREFIX = "amber-asset:";

const ASSET_PROTOCOL = "amber-asset";
const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/;
// The runtime URL forms the protocol is served under (`amber-asset://localhost/<id>` or `http(s)://amber-asset.localhost/<id>`).
const ASSET_URL_PATTERN =
	/^(?:amber-asset:\/\/localhost|https?:\/\/amber-asset\.localhost)\/([0-9a-f]{64})$/;

/** The webview URL serving an asset. The only place that URL is built. */
export function assetUrl(assetId: string): string {
	return convertFileSrc(assetId, ASSET_PROTOCOL);
}

export function assetSrc(assetId: string): string {
	return `${ASSET_SRC_PREFIX}${assetId}`;
}

/** The asset id referenced by an image `src`, in canonical or runtime URL form. */
export function assetIdFromSrc(src: string): string | null {
	if (src.startsWith(ASSET_SRC_PREFIX) && !src.startsWith("amber-asset://")) {
		const id = src.slice(ASSET_SRC_PREFIX.length);
		return ASSET_ID_PATTERN.test(id) ? id : null;
	}
	return ASSET_URL_PATTERN.exec(src)?.[1] ?? null;
}

/** The URL to render for a stored image `src`; non-asset srcs pass through. */
export function resolveImageSrc(src: string): string {
	const id = assetIdFromSrc(src);
	return id === null ? src : assetUrl(id);
}

/** Maps a rendered asset URL back to its canonical `src`, so runtime URLs never get persisted. */
export function toCanonicalImageSrc(src: string): string {
	const id = assetIdFromSrc(src);
	return id === null ? src : assetSrc(id);
}
