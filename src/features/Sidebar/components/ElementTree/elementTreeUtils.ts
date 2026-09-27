import { CreateCardDto } from "../../../../types/elements/createCardDto";
import { ElementId } from "../../../../types/elements/elementId";

export function defaultElementName(label: string): string {
	const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
	return `${label} ${timestamp}`;
}

/** An empty card, as both the create menu and the new-card shortcut make it. */
export function newCardDto(
	parent: ElementId | null,
	id = crypto.randomUUID(),
): CreateCardDto {
	return {
		id,
		meta: {
			name: defaultElementName("Card"),
			parent,
			origin: { type: "custom" },
		},
		front: "",
		back: "",
	};
}
