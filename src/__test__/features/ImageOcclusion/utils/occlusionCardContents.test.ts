import { describe, expect, it } from "vitest";
import { SerializedImageNode } from "../../../../components/Editor/plugins/ImagePlugin/ImageNode";
import { buildOcclusionCardContents } from "../../../../features/ImageOcclusion/utils/occlusionCardContents";

interface CardSideJson {
	root: { children: { children: SerializedImageNode[] }[] };
}

function imageNodeOf(content: string): SerializedImageNode {
	return (JSON.parse(content) as CardSideJson).root.children[0].children[0];
}

describe("buildOcclusionCardContents", () => {
	it("Should mask the target on the front and reveal it on the back when building a card", () => {
		// Arrange

		const request = {
			requestId: "r",
			occlusionId: "o",
			src: `amber-asset:${"0".repeat(64)}`,
			altText: "Heart",
			targetKeys: ["a", "g"],
		};

		// Act

		const actual = buildOcclusionCardContents(request);

		// Assert

		expect(Object.keys(actual)).toEqual(["a", "g"]);
		expect(imageNodeOf(actual.g.front)).toMatchObject({
			type: "image",
			src: request.src,
			altText: "Heart",
			occlusionId: "o",
			occlusionTarget: { targetKey: "g", revealed: false },
		});
		expect(imageNodeOf(actual.g.back).occlusionTarget).toEqual({
			targetKey: "g",
			revealed: true,
		});
	});
});
