import { describe, expect, it } from "vitest";
import { estimateOffsetBeforeSplit } from "../../../../../../features/ElementViewer/LearningAssetView/core/heights/estimateCumulativeOffset";
import { LearningAssetSplitMetaDto } from "../../../../../../types/elements/learningAssetSplitMetaDto";

const splits: LearningAssetSplitMetaDto[] = [
	{ seq: 0, charCount: 100, blockCount: 1 },
	{ seq: 1, charCount: 200, blockCount: 1 },
	{ seq: 2, charCount: 300, blockCount: 1 },
];

const getHeight = (seq: number) => (seq + 1) * 10;

describe("estimateOffsetBeforeSplit", () => {
	it("Should return 0 when the target is the first split", () => {
		// Act

		const actual = estimateOffsetBeforeSplit(splits, 0, getHeight);

		// Assert

		expect(actual).toBe(0);
	});

	it("Should sum every preceding split's height when the target is later in the list", () => {
		// Act

		const actual = estimateOffsetBeforeSplit(splits, 2, getHeight);

		// Assert

		expect(actual).toBe(getHeight(0) + getHeight(1));
	});
});
