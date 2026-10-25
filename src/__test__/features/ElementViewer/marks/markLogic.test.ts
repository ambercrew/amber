import { describe, expect, it } from "vitest";
import {
	blockFraction,
	findMark,
	formatProgress,
	goToMarkLabel,
	goToReadPointLabel,
	markFillColor,
	setMarkLabel,
	pdfAnchorProgress,
	textAnchorProgress,
	withMark,
} from "../../../../features/ElementViewer/marks/markLogic";
import { LearningAssetMark } from "../../../../types/elements/learningAssetMark";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";

const splits: LearningAssetSplitMetaDto[] = [
	{ seq: 0, charCount: 100, blockCount: 4 },
	{ seq: 1, charCount: 100, blockCount: 2 },
];
const heightOf = () => 100;

describe("withMark", () => {
	it("Should add the mark in slot order when the slot is unset", () => {
		// Arrange

		const marks: LearningAssetMark[] = [
			{ slot: 3, anchor: { split: 1, block: 0 } },
		];

		// Act

		const actual = withMark(marks, 1, { split: 0, block: 2 });

		// Assert

		expect(actual).toEqual([
			{ slot: 1, anchor: { split: 0, block: 2 } },
			{ slot: 3, anchor: { split: 1, block: 0 } },
		]);
	});

	it("Should move the mark when the slot is already set", () => {
		// Arrange

		const marks: LearningAssetMark[] = [
			{ slot: 2, anchor: { split: 0, block: 1 } },
		];

		// Act

		const actual = withMark(marks, 2, { split: 1, block: 1 });

		// Assert

		expect(actual).toEqual([{ slot: 2, anchor: { split: 1, block: 1 } }]);
	});

	it("Should remove the mark when the anchor is null", () => {
		// Arrange

		const marks: LearningAssetMark[] = [
			{ slot: 1, anchor: { split: 0, block: 1 } },
			{ slot: 2, anchor: { split: 1, block: 1 } },
		];

		// Act

		const actual = withMark(marks, 1, null);

		// Assert

		expect(actual).toEqual([{ slot: 2, anchor: { split: 1, block: 1 } }]);
	});

	it("Should leave the input untouched when a mark is placed", () => {
		// Arrange

		const marks: LearningAssetMark[] = [
			{ slot: 1, anchor: { split: 0, block: 1 } },
		];

		// Act

		withMark(marks, 1, { split: 1, block: 0 });

		// Assert

		expect(marks).toEqual([{ slot: 1, anchor: { split: 0, block: 1 } }]);
	});
});

describe("findMark", () => {
	it("Should return undefined when the slot is unset", () => {
		// Arrange

		const marks: LearningAssetMark[] = [
			{ slot: 1, anchor: { split: 0, block: 1 } },
		];

		// Act

		const actual = findMark(marks, 2);

		// Assert

		expect(actual).toBeUndefined();
	});
});

describe("textAnchorProgress", () => {
	it("Should return 0 when the anchor is the first block", () => {
		// Arrange

		const anchor = { split: 0, block: 0 };

		// Act

		const actual = textAnchorProgress(anchor, splits, heightOf);

		// Assert

		expect(actual).toBe(0);
	});

	it("Should add the block's share of its split when the anchor is mid-split", () => {
		// Arrange

		const anchor = { split: 1, block: 1 };

		// Act

		const actual = textAnchorProgress(anchor, splits, heightOf);

		// Assert

		expect(actual).toBe(0.75);
	});

	it("Should clamp to the split's last block when the block no longer exists", () => {
		// Arrange

		const anchor = { split: 0, block: 99 };

		// Act

		const actual = textAnchorProgress(anchor, splits, heightOf);

		// Assert

		expect(actual).toBe(0.375);
	});

	it("Should return null when the split no longer exists", () => {
		// Arrange

		const anchor = { split: 7, block: 0 };

		// Act

		const actual = textAnchorProgress(anchor, splits, heightOf);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should use each split's own height when heights differ", () => {
		// Arrange

		const anchor = { split: 1, block: 0 };
		const getHeight = (seq: number) => (seq === 0 ? 300 : 100);

		// Act

		const actual = textAnchorProgress(anchor, splits, getHeight);

		// Assert

		expect(actual).toBe(0.75);
	});
});

describe("pdfAnchorProgress", () => {
	it("Should place a page at its top edge when the page is in range", () => {
		// Arrange

		const anchor = { split: 3, block: 0 };

		// Act

		const actual = pdfAnchorProgress(anchor, 4);

		// Assert

		expect(actual).toBe(0.5);
	});

	it("Should clamp to the last page when the page is past the end", () => {
		// Arrange

		const anchor = { split: 10, block: 0 };

		// Act

		const actual = pdfAnchorProgress(anchor, 4);

		// Assert

		expect(actual).toBe(0.75);
	});

	it("Should return null when the page count is unknown", () => {
		// Arrange

		const anchor = { split: 1, block: 0 };

		// Act

		const actual = pdfAnchorProgress(anchor, 0);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("formatProgress", () => {
	it("Should round to a whole percent when given a fraction", () => {
		// Arrange

		const progress = 0.426;

		// Act

		const actual = formatProgress(progress);

		// Assert

		expect(actual).toBe("43% through");
	});
});

describe("setMarkLabel", () => {
	it("Should offer to set the mark when it's unset", () => {
		// Arrange

		const progress = null;

		// Act

		const actual = setMarkLabel(1, progress);

		// Assert

		expect(actual).toBe("Set mark 1 here");
	});

	it("Should offer to move the mark and say where it is when it's set", () => {
		// Arrange

		const progress = 0.5;

		// Act

		const actual = setMarkLabel(2, progress);

		// Assert

		expect(actual).toBe("Move mark 2 here (now 50% through)");
	});
});

describe("goToMarkLabel", () => {
	it("Should include the position when the mark is set", () => {
		// Arrange

		const progress = 0.25;

		// Act

		const actual = goToMarkLabel(3, true, progress);

		// Assert

		expect(actual).toBe("Go to mark 3 (25% through)");
	});

	it("Should say the mark isn't set when it's unset", () => {
		// Arrange

		const progress = null;

		// Act

		const actual = goToMarkLabel(3, false, progress);

		// Assert

		expect(actual).toBe("Mark 3 isn't set");
	});
});

describe("goToReadPointLabel", () => {
	it("Should include the position when it's known", () => {
		// Arrange

		const progress = 0.1;

		// Act

		const actual = goToReadPointLabel(progress);

		// Assert

		expect(actual).toBe("Go to read point (10% through)");
	});
});

describe("markFillColor", () => {
	it("Should use the slot color's shade 7 when the slot is 2", () => {
		// Arrange

		const slot = 2;

		// Act

		const actual = markFillColor(slot);

		// Assert

		expect(actual).toBe("pink.7");
	});
});

describe("blockFraction", () => {
	it("Should return the block's share of the split when it's in range", () => {
		// Arrange

		const block = 2;

		// Act

		const actual = blockFraction(block, 8);

		// Assert

		expect(actual).toBe(0.25);
	});

	it("Should use the last block when the block is past the end", () => {
		// Arrange

		const block = 20;

		// Act

		const actual = blockFraction(block, 4);

		// Assert

		expect(actual).toBe(0.75);
	});

	it("Should return 0 when the split has no blocks", () => {
		// Arrange

		const block = 3;

		// Act

		const actual = blockFraction(block, 0);

		// Assert

		expect(actual).toBe(0);
	});
});
