import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { ImageOcclusionResponseDto } from "../../../../api/imageOcclusion/dto/imageOcclusionResponseDto";
import {
	MaskShape,
	OcclusionMode,
} from "../../../../api/imageOcclusion/dto/occlusionShape";
import OcclusionMasks from "../../../../features/ImageOcclusion/review/OcclusionMasks";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

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

function occlusion(mode: OcclusionMode): ImageOcclusionResponseDto {
	return {
		id: "o",
		name: "Heart",
		imageAssetId: "0".repeat(64),
		imageWidth: 100,
		imageHeight: 50,
		shapes: [mask("a", "g"), mask("b", "g"), mask("c"), mask("d")],
		mode,
	};
}

function countMasks(state: string) {
	return screen.queryAllByTestId(`occlusion-mask-${state}`).length;
}

describe("OcclusionMasks", () => {
	it("Should cover every mask and highlight the target group when hide-all question is shown", () => {
		// Arrange

		const props = {
			occlusion: occlusion("hideAllGuessOne"),
			targetKey: "g",
			revealed: false,
		};

		// Act

		renderWithProviders(<OcclusionMasks {...props} />);

		// Assert

		expect(countMasks("target")).toBe(2);
		expect(countMasks("covered")).toBe(2);
	});

	it("Should reveal the target and keep the others covered when hide-all answer is shown", () => {
		// Arrange

		const props = {
			occlusion: occlusion("hideAllGuessOne"),
			targetKey: "c",
			revealed: true,
		};

		// Act

		renderWithProviders(<OcclusionMasks {...props} />);

		// Assert

		expect(countMasks("revealed")).toBe(1);
		expect(countMasks("covered")).toBe(3);
	});

	it("Should draw only the target when hide-one question is shown", () => {
		// Arrange

		const props = {
			occlusion: occlusion("hideOneGuessOne"),
			targetKey: "d",
			revealed: false,
		};

		// Act

		renderWithProviders(<OcclusionMasks {...props} />);

		// Assert

		expect(countMasks("target")).toBe(1);
		expect(countMasks("covered")).toBe(0);
	});
});
