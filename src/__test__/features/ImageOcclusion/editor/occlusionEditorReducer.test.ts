import { describe, expect, it } from "vitest";
import { MaskShape } from "../../../../api/imageOcclusion/dto/occlusionShape";
import {
	initialEditorState,
	occlusionEditorReducer,
	OcclusionEditorState,
} from "../../../../features/ImageOcclusion/editor/occlusionEditorReducer";

function mask(id: string, groupId: string | null = null): MaskShape {
	return {
		kind: "rect",
		id,
		x: 0,
		y: 0,
		width: 0.1,
		height: 0.1,
		rotation: 0,
		fill: "#000",
		groupId,
	};
}

function stateWith(
	shapes: MaskShape[],
	selectedIds: string[] = [],
): OcclusionEditorState {
	return { ...initialEditorState(shapes), selectedIds };
}

describe("occlusionEditorReducer", () => {
	it("Should give every selected mask the same group when grouping two masks", () => {
		// Arrange

		const state = stateWith([mask("a"), mask("b"), mask("c")], ["a", "b"]);

		// Act

		const actual = occlusionEditorReducer(state, {
			type: "group",
			groupId: "g",
		});

		// Assert

		expect(
			actual.shapes.map(shape => (shape as MaskShape).groupId),
		).toEqual(["g", "g", null]);
	});

	it("Should leave the state unchanged when grouping a single mask", () => {
		// Arrange

		const state = stateWith([mask("a"), mask("b")], ["a"]);

		// Act

		const actual = occlusionEditorReducer(state, {
			type: "group",
			groupId: "g",
		});

		// Assert

		expect(actual).toBe(state);
	});

	it("Should select the whole group when one grouped mask is selected", () => {
		// Arrange

		const state = stateWith([mask("a", "g"), mask("b", "g"), mask("c")]);

		// Act

		const actual = occlusionEditorReducer(state, {
			type: "select",
			ids: ["a"],
		});

		// Assert

		expect(actual.selectedIds).toEqual(["a", "b"]);
	});

	it("Should deselect the whole group when a selected grouped mask is toggled", () => {
		// Arrange

		const state = stateWith(
			[mask("a", "g"), mask("b", "g"), mask("c")],
			["a", "b", "c"],
		);

		// Act

		const actual = occlusionEditorReducer(state, {
			type: "toggleSelect",
			id: "a",
		});

		// Assert

		expect(actual.selectedIds).toEqual(["c"]);
	});

	it("Should add the whole group when an unselected grouped mask is toggled", () => {
		// Arrange

		const state = stateWith(
			[mask("a", "g"), mask("b", "g"), mask("c")],
			["c"],
		);

		// Act

		const actual = occlusionEditorReducer(state, {
			type: "toggleSelect",
			id: "b",
		});

		// Assert

		expect(actual.selectedIds).toEqual(["a", "b", "c"]);
	});

	it("Should restore the previous shapes when undoing a delete", () => {
		// Arrange

		const shapes = [mask("a"), mask("b")];
		const deleted = occlusionEditorReducer(stateWith(shapes, ["a"]), {
			type: "deleteSelected",
		});

		// Act

		const actual = occlusionEditorReducer(deleted, { type: "undo" });

		// Assert

		expect(deleted.shapes).toHaveLength(1);
		expect(actual.shapes).toEqual(shapes);
		expect(actual.future).toHaveLength(1);
	});

	it("Should reapply the undone change when redoing", () => {
		// Arrange

		const changed = occlusionEditorReducer(stateWith([mask("a")], ["a"]), {
			type: "deleteSelected",
		});
		const undone = occlusionEditorReducer(changed, { type: "undo" });

		// Act

		const actual = occlusionEditorReducer(undone, { type: "redo" });

		// Assert

		expect(undone.shapes).toHaveLength(1);
		expect(actual.shapes).toHaveLength(0);
	});

	it("Should recolor only the selected shapes when setting a color", () => {
		// Arrange

		const state = stateWith([mask("a"), mask("b")], ["b"]);

		// Act

		const actual = occlusionEditorReducer(state, {
			type: "setColor",
			color: "#fff",
		});

		// Assert

		expect(actual.shapes.map(shape => (shape as MaskShape).fill)).toEqual([
			"#000",
			"#fff",
		]);
	});
});
