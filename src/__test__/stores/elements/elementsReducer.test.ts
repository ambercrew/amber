import { describe, expect, it } from "vitest";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import elementsReducer, {
	setCurrentElement,
	setElementName,
	setTree,
} from "../../../stores/elements/elementsReducer";
import { ElementId } from "../../../types/elements/elementId";

const FOLDER: ElementId = { type: "folder", id: "folder-1" };
const CARD: ElementId = { type: "card", id: "card-1" };

function node(elementId: ElementId, name: string, cards: NodeDto[] = []) {
	return {
		meta: { elementId, name, position: "a" },
		children: { folders: [], learningAssets: [], extracts: [], cards },
	};
}

describe("setElementName", () => {
	it("Should rename the nested tree node and the open element when they match the id", () => {
		// Arrange

		let state = elementsReducer(
			undefined,
			setTree([node(FOLDER, "Folder", [node(CARD, "Old")])]),
		);
		state = elementsReducer(
			state,
			setCurrentElement({
				type: "card",
				data: { meta: { elementId: CARD, name: "Old" } },
			} as unknown as AnyElementDto),
		);

		// Act

		const actual = elementsReducer(
			state,
			setElementName({ elementId: CARD, name: "New" }),
		);

		// Assert

		expect(actual.tree[0].children.cards[0].meta.name).toBe("New");
		expect(actual.tree[0].meta.name).toBe("Folder");
		expect(actual.currentElement?.data.meta.name).toBe("New");
	});
});
