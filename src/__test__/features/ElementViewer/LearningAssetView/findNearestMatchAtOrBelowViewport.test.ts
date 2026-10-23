import { describe, expect, it } from "vitest";
import { findNearestMatchAtOrBelowViewport } from "../../../../features/ElementViewer/LearningAssetView/findNearestMatchAtOrBelowViewport";
import { LearningAssetSplitMetaDto } from "../../../../types/elements/learningAssetSplitMetaDto";

const splits: LearningAssetSplitMetaDto[] = [
	{ seq: 0, charCount: 100, blockCount: 1 },
	{ seq: 1, charCount: 100, blockCount: 1 },
	{ seq: 2, charCount: 100, blockCount: 1 },
];

describe("findNearestMatchAtOrBelowViewport", () => {
	it("Should return the first match in the primary split when it has matches at or below the viewport", () => {
		// Arrange

		const counts = new Map([
			[0, 2],
			[1, 1],
		]);
		const resolveLocalMatchAtOrBelow = (seq: number) =>
			seq === 0 ? 1 : null;

		// Act

		const actual = findNearestMatchAtOrBelowViewport(
			splits,
			counts,
			0,
			resolveLocalMatchAtOrBelow,
		);

		// Assert

		expect(actual).toEqual({ seq: 0, localIndex: 1 });
	});

	it("Should return the first match in a later split when the primary split has none at or below the viewport", () => {
		// Arrange

		const counts = new Map([
			[0, 2],
			[2, 3],
		]);
		const resolveLocalMatchAtOrBelow = () => null;

		// Act

		const actual = findNearestMatchAtOrBelowViewport(
			splits,
			counts,
			0,
			resolveLocalMatchAtOrBelow,
		);

		// Assert

		expect(actual).toEqual({ seq: 2, localIndex: 0 });
	});

	it("Should wrap to the first match overall when nothing qualifies at or below the primary split", () => {
		// Arrange

		const counts = new Map([[0, 4]]);
		const resolveLocalMatchAtOrBelow = () => null;

		// Act

		const actual = findNearestMatchAtOrBelowViewport(
			splits,
			counts,
			2,
			resolveLocalMatchAtOrBelow,
		);

		// Assert

		expect(actual).toEqual({ seq: 0, localIndex: 0 });
	});

	it("Should return null when there are no matches anywhere", () => {
		// Arrange

		const counts = new Map<number, number>();
		const resolveLocalMatchAtOrBelow = () => null;

		// Act

		const actual = findNearestMatchAtOrBelowViewport(
			splits,
			counts,
			0,
			resolveLocalMatchAtOrBelow,
		);

		// Assert

		expect(actual).toBeNull();
	});
});
