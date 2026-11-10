import { NodeDto } from "../../../../api/elements/dto/nodeDto";
import { dtosToTreeData } from "../../../../features/Sidebar/utils/elementTreeUtils";

function node(id: string, position: string, cards: NodeDto[] = []): NodeDto {
	return {
		meta: { elementId: { type: "folder", id }, name: id, position },
		children: { folders: [], learningAssets: [], extracts: [], cards },
	};
}

describe("dtosToTreeData", () => {
	it("Should reuse the converted node when a subtree did not change", () => {
		// Arrange

		const unchanged = node("unchanged", "a");
		const [before] = dtosToTreeData([unchanged]);

		// Act

		const [actual] = dtosToTreeData([unchanged]);

		// Assert

		expect(actual).toBe(before);
	});

	it("Should convert a node again when it is a new object", () => {
		// Arrange

		const original = node("element", "a");
		const [before] = dtosToTreeData([original]);

		// Act

		const [actual] = dtosToTreeData([
			{ ...original, meta: { ...original.meta, name: "Renamed" } },
		]);

		// Assert

		expect(actual).not.toBe(before);
		expect(actual.label).toBe("Renamed");
	});

	it("Should sort children by position when given them out of order", () => {
		// Arrange

		const parent = node("parent", "a", [
			node("second", "80ff"),
			node("first", "7f"),
		]);

		// Act

		const [actual] = dtosToTreeData([parent]);

		// Assert

		expect(actual.children?.map(child => child.value)).toEqual([
			"first",
			"second",
		]);
	});
});
