import { NavigateFunction } from "react-router";
import { paths } from "../../paths";
import { requestTreeReveal } from "../../hooks/useTreeRevealRequest";
import { ElementId } from "../../types/elements/elementId";

/** Opens the element an import ends on and expands the tree down to it. */
export async function openImportedElement(
	navigate: NavigateFunction,
	elementId: ElementId,
) {
	requestTreeReveal(elementId.id);
	await navigate(paths.element(elementId.type, elementId.id));
}
