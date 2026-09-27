import { describe, expect, it } from "vitest";
import { TreeNodeData } from "@mantine/core";
import {
	getAdjacentNodeValue,
	getVisibleNodeValues,
} from "../../../../features/Sidebar/utils/elementTreeUtils";

const tree: TreeNodeData[] = [
	{
		value: "a",
		label: "a",
		children: [
			{ value: "a1", label: "a1" },
			{ value: "a2", label: "a2" },
		],
	},
	{
		value: "b",
		label: "b",
		children: [{ value: "b1", label: "b1" }],
	},
];

describe("getVisibleNodeValues", () => {
	it("Should skip children of collapsed nodes when listing nodes", () => {
		// Arrange

		const expandedState = { a: true, b: false };

		// Act

		const actual = getVisibleNodeValues(tree, expandedState);

		// Assert

		expect(actual).toEqual(["a", "a1", "a2", "b"]);
	});
});

describe("getAdjacentNodeValue", () => {
	it("Should return the next visible node when moving down", () => {
		// Arrange

		const expandedState = { a: true, b: false };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, "a2", 1);

		// Assert

		expect(actual).toBe("b");
	});

	it("Should return the previous visible node when moving up", () => {
		// Arrange

		const expandedState = { a: true, b: false };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, "a1", -1);

		// Assert

		expect(actual).toBe("a");
	});

	it("Should return null when moving past the last node", () => {
		// Arrange

		const expandedState = { a: false, b: false };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, "b", 1);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return the first node when nothing is selected", () => {
		// Arrange

		const expandedState = { a: false, b: false };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, null, 1);

		// Assert

		expect(actual).toBe("a");
	});

	it("Should return the node after the collapsed parent when the current node is hidden and moving down", () => {
		// Arrange

		const expandedState = { a: false, b: false };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, "a2", 1);

		// Assert

		expect(actual).toBe("b");
	});

	it("Should return the collapsed parent when the current node is hidden and moving up", () => {
		// Arrange

		const expandedState = { a: false, b: false };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, "a2", -1);

		// Assert

		expect(actual).toBe("a");
	});

	it("Should return null when the current node is not in the tree", () => {
		// Arrange

		const expandedState = { a: true, b: true };

		// Act

		const actual = getAdjacentNodeValue(tree, expandedState, "missing", 1);

		// Assert

		expect(actual).toBeNull();
	});
});
