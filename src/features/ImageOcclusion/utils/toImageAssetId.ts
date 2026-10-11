import { assetIdFromSrc } from "../../../utils/assetUrl";
import { localizeImage } from "../../Import/images/localize";

/** The asset id for an image `src`, storing (and first downloading, if remote) the image when needed. */
export async function toImageAssetId(src: string): Promise<string> {
	const existingId = assetIdFromSrc(src);
	if (existingId !== null) return existingId;

	// Stores embedded and remote images alike, already returning an asset src.
	const localized = await localizeImage(src, null);
	const id = localized.ok ? assetIdFromSrc(localized.src) : null;
	if (id === null) throw new Error("Couldn't store the image to occlude");
	return id;
}
