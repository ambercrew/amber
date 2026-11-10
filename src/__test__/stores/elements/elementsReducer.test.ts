import { describe, expect, it } from "vitest";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import elementsReducer, {
	addTreeNodes,
	moveTreeNode,
	removeTreeNode,
	setCurrentElement,
	setElementName,
	setTree,
} from "../../../stores/elements/elementsReducer";
import { ElementId } from "../../../types/elements/elementId";

const FOLDER: ElementId = { type: "folder", id: "folder-1" };
const OTHER_FOLDER: ElementId = { type: "folder", id: "folder-2" };
const CARD: ElementId = { type: "card", id: "card-1" };
const OTHER_CARD: ElementId = { type: "card", id: "card-2" };
const NEW_CARD: ElementId = { type: "card", id: "card-new" };

function meta(elementId: ElementId, name: string, position: string) {
	return { elementId, name, position };
}

function positioned(treeNode: NodeDto, position: string): NodeDto {
	return { ...treeNode, meta: { ...treeNode.meta, position } };
}

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

	it("Should insert a new child by position when a tree node is added", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([
				node(FOLDER, "Folder", [
					positioned(node(CARD, "First"), "a"),
					positioned(node(OTHER_CARD, "Last"), "c"),
				]),
			]),
		);

		// Act

		const actual = elementsReducer(
			state,
			addTreeNodes([
				{ parentId: FOLDER.id, element: meta(NEW_CARD, "Middle", "b") },
			]),
		);

		// Assert

		expect(
			actual.tree[0].children.cards.map(card => card.meta.name),
		).toEqual(["First", "Middle", "Last"]);
	});

	it("Should skip a node when a reload already brought it into the tree", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([node(FOLDER, "Folder", [node(NEW_CARD, "Card")])]),
		);

		// Act

		const actual = elementsReducer(
			state,
			addTreeNodes([
				{ parentId: FOLDER.id, element: meta(NEW_CARD, "Card", "a") },
			]),
		);

		// Assert

		expect(actual.tree[0].children.cards).toHaveLength(1);
	});

	it("Should nest a node under one added before it when both are in the same batch", () => {
		// Arrange

		const state = elementsReducer(undefined, setTree([]));

		// Act

		const actual = elementsReducer(
			state,
			addTreeNodes([
				{ parentId: null, element: meta(FOLDER, "Folder", "a") },
				{ parentId: FOLDER.id, element: meta(NEW_CARD, "Card", "a") },
			]),
		);

		// Assert

		expect(actual.tree).toHaveLength(1);
		expect(actual.tree[0].children.cards[0].meta.name).toBe("Card");
	});

	it("Should find later parents when an earlier insert shifts their index", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([positioned(node(FOLDER, "Folder"), "m")]),
		);

		// Act

		const actual = elementsReducer(
			state,
			addTreeNodes([
				{ parentId: null, element: meta(OTHER_FOLDER, "Earlier", "a") },
				{ parentId: FOLDER.id, element: meta(NEW_CARD, "Card", "a") },
			]),
		);

		// Assert

		expect(actual.tree.map(root => root.meta.name)).toEqual([
			"Earlier",
			"Folder",
		]);
		expect(actual.tree[1].children.cards[0].meta.name).toBe("Card");
	});

	it("Should leave untouched subtrees the same objects when a node is added", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([
				positioned(node(FOLDER, "Folder"), "a"),
				positioned(node(OTHER_FOLDER, "Other"), "b"),
			]),
		);

		// Act

		const actual = elementsReducer(
			state,
			addTreeNodes([
				{ parentId: FOLDER.id, element: meta(NEW_CARD, "Card", "a") },
			]),
		);

		// Assert

		expect(actual.tree[0]).not.toBe(state.tree[0]);
		expect(actual.tree[1]).toBe(state.tree[1]);
	});

	it("Should move a node to its new parent and position when a tree node is moved", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([
				positioned(node(FOLDER, "Folder", [node(CARD, "Card")]), "a"),
				positioned(node(OTHER_FOLDER, "Other"), "b"),
			]),
		);

		// Act

		const actual = elementsReducer(
			state,
			moveTreeNode({
				elementId: CARD,
				parentId: OTHER_FOLDER.id,
				position: "z",
			}),
		);

		// Assert

		expect(actual.tree[0].children.cards).toEqual([]);
		expect(actual.tree[1].children.cards[0].meta).toMatchObject({
			name: "Card",
			position: "z",
		});
	});

	it("Should reorder a node when it moves within its own list", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([
				node(FOLDER, "Folder", [
					positioned(node(CARD, "First"), "a"),
					positioned(node(OTHER_CARD, "Second"), "b"),
				]),
			]),
		);

		// Act

		const actual = elementsReducer(
			state,
			moveTreeNode({
				elementId: CARD,
				parentId: FOLDER.id,
				position: "c",
			}),
		);

		// Assert

		expect(
			actual.tree[0].children.cards.map(card => card.meta.name),
		).toEqual(["Second", "First"]);
	});

	it("Should move a node to the root when it has no new parent", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([
				positioned(node(FOLDER, "Folder", [node(CARD, "Card")]), "b"),
			]),
		);

		// Act

		const actual = elementsReducer(
			state,
			moveTreeNode({ elementId: CARD, parentId: null, position: "a" }),
		);

		// Assert

		expect(actual.tree.map(root => root.meta.name)).toEqual([
			"Card",
			"Folder",
		]);
	});

	it("Should drop a node with its subtree when a tree node is removed", () => {
		// Arrange

		const state = elementsReducer(
			undefined,
			setTree([node(FOLDER, "Folder", [node(CARD, "Card")])]),
		);

		// Act

		const actual = elementsReducer(state, removeTreeNode(FOLDER.id));

		// Assert

		expect(actual.tree).toEqual([]);
	});
});
