import { beforeEach, describe, expect, it } from "vitest";
import {
	clearSplitHeights,
	loadSplitHeights,
	saveSplitHeights,
} from "../../../../../../features/ElementViewer/LearningAssetView/core/heights/splitHeightsStorage";

describe("splitHeightsStorage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("Should return the saved heights", () => {
		// Arrange

		saveSplitHeights("r1", { 0: 100, 1: 200 });

		// Act

		const actual = loadSplitHeights("r1");

		// Assert

		expect(actual).toEqual({ 0: 100, 1: 200 });
	});

	it("Should return an empty map when nothing is stored", () => {
		// Act

		const actual = loadSplitHeights("missing");

		// Assert

		expect(actual).toEqual({});
	});

	it("Should remove the entry when cleared", () => {
		// Arrange

		saveSplitHeights("r1", { 0: 100 });

		// Act

		clearSplitHeights("r1");

		// Assert

		expect(loadSplitHeights("r1")).toEqual({});
	});
});
