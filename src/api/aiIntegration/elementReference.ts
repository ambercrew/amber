import { ElementId } from "../../types/elements/elementId";
import { ElementNodeType } from "../../types/elements/elementNodeType";

/** Tag the backend writes into AI markdown to link an element; keep in sync with `element_reference.rs`. */
export const ELEMENT_REFERENCE_TAG = "element-ref";

const ELEMENT_NODE_TYPES: readonly string[] = [
	"folder",
	"learningAsset",
	"extract",
	"card",
] satisfies ElementNodeType[];

/** Reads the element an `<element-ref data-type data-id>` tag points at, or `null` if malformed. */
export function parseElementReference(node: Element): ElementId | null {
	const type = node.getAttribute("data-type");
	const id = node.getAttribute("data-id");
	if (!type || !id || !ELEMENT_NODE_TYPES.includes(type)) return null;
	return { type: type as ElementNodeType, id };
}
