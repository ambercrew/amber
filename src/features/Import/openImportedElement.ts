import { paths } from "../../paths";
import { requestTreeReveal } from "../../hooks/useTreeRevealRequest";
import { ElementId } from "../../types/elements/elementId";
import { ImportContext } from "./importContext";

/** Opens the element an import ends on and expands the tree down to it; an import opens only its last element. */
export async function openImportedElement(
	ctx: ImportContext,
	elementId: ElementId,
) {
	requestTreeReveal(elementId.id);
	await ctx.navigate(paths.element(elementId.type, elementId.id));
}
