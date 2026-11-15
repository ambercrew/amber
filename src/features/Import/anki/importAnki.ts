import { importAnki as importAnkiPackage } from "../../../api/import/api/importApi";
import { ElementId } from "../../../types/elements/elementId";
import { bytesToBase64 } from "../../../utils/bytesToBase64";
import { ImportContext } from "../importContext";

/** Recreates the package's decks as folders of cards; resolves to the first top-level deck's folder, given the import's tags. */
export function importAnki(
	bytes: ArrayBuffer,
	ctx: ImportContext,
	bibliographicalSourceId: string,
): Promise<ElementId | null> {
	return importAnkiPackage({
		bytesBase64: bytesToBase64(new Uint8Array(bytes)),
		parent: ctx.parent,
		bibliographicalSourceId,
		tags: ctx.tags,
	});
}
