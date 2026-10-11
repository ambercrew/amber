import { describe, expect, it } from "vitest";
import {
	MaskShape,
	OcclusionShape,
} from "../../../../api/imageOcclusion/dto/occlusionShape";
import { targetKeys } from "../../../../features/ImageOcclusion/utils/occlusionTargets";

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

describe("targetKeys", () => {
	it("Should return one key per group or ungrouped mask in shape order when shapes are mixed", () => {
		// Arrange

		const shapes: OcclusionShape[] = [
			mask("a"),
			mask("b", "g"),
			{
				kind: "text",
				id: "t",
				x: 0,
				y: 0,
				rotation: 0,
				text: "label",
				fontSize: 0.04,
				color: "#000",
			},
			mask("c", "g"),
			mask("d"),
		];

		// Act

		const actual = targetKeys(shapes);

		// Assert

		expect(actual).toEqual(["a", "g", "d"]);
	});
});
