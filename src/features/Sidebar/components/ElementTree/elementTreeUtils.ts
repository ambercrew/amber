import { CreateCardDto } from "../../../../types/elements/createCardDto";
import { ElementId } from "../../../../types/elements/elementId";

/** An empty card, as both the create menu and the new-card shortcut make it. */
export function newCardDto(
	parent: ElementId | null,
	id = crypto.randomUUID(),
): CreateCardDto {
	return {
		id,
		meta: {
			name: null,
			parent,
			origin: { type: "custom" },
		},
		front: "",
		back: "",
	};
}
