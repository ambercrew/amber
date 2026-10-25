import { describe, expect, it } from "vitest";
import { blockIndexOf } from "../../../../../features/ElementViewer/LearningAssetView/core/blockIndexOf";

function makeRoot(): HTMLElement {
	const root = document.createElement("div");
	for (let i = 0; i < 3; i++) {
		const block = document.createElement("p");
		block.appendChild(document.createElement("span"));
		root.appendChild(block);
	}
	return root;
}

describe("blockIndexOf", () => {
	it("Should return the containing block's index when the node is nested inside it", () => {
		// Arrange

		const root = makeRoot();
		const node = root.children[2].firstChild;

		// Act

		const actual = blockIndexOf(root, node);

		// Assert

		expect(actual).toBe(2);
	});

	it("Should return the block's own index when the node is a block", () => {
		// Arrange

		const root = makeRoot();
		const node = root.children[1];

		// Act

		const actual = blockIndexOf(root, node);

		// Assert

		expect(actual).toBe(1);
	});

	it("Should return null when the node is outside the root", () => {
		// Arrange

		const root = makeRoot();
		const node = document.createElement("span");

		// Act

		const actual = blockIndexOf(root, node);

		// Assert

		expect(actual).toBeNull();
	});
});
