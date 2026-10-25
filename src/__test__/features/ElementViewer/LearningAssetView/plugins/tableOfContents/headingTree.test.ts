import { describe, expect, it } from "vitest";
import {
	findCurrentHeadingId,
	toTableOfContents,
} from "../../../../../../features/ElementViewer/LearningAssetView/plugins/tableOfContents/headingTree";
import { LearningAssetHeadingDto } from "../../../../../../types/elements/learningAssetHeadingDto";

function heading(
	seq: number,
	block: number,
	level: number,
	text: string,
): LearningAssetHeadingDto {
	return { seq, block, level, text };
}

describe("toTableOfContents", () => {
	it("Should nest each heading under the nearest higher-level heading above it when levels vary", () => {
		// Arrange

		const headings = [
			heading(0, 0, 1, "Chapter 1"),
			heading(0, 3, 2, "Section 1.1"),
			heading(1, 0, 3, "Detail"),
			heading(1, 4, 2, "Section 1.2"),
			heading(2, 0, 1, "Chapter 2"),
		];

		// Act

		const entries = toTableOfContents(headings);

		// Assert

		expect(entries.map(entry => entry.title)).toEqual([
			"Chapter 1",
			"Chapter 2",
		]);
		expect(entries[0].children!.map(entry => entry.id)).toEqual([
			"0:3",
			"1:4",
		]);
		expect(entries[0].children![0].children![0].id).toBe("1:0");
	});

	it("Should keep a heading at the top level when it starts deeper than any heading above it", () => {
		// Arrange

		const headings = [
			heading(0, 0, 3, "Intro"),
			heading(0, 1, 1, "Part I"),
		];

		// Act

		const entries = toTableOfContents(headings);

		// Assert

		expect(entries.map(entry => entry.title)).toEqual(["Intro", "Part I"]);
	});

	it("Should leave out a heading when its text is empty", () => {
		// Arrange

		const headings = [heading(0, 0, 1, "  "), heading(0, 1, 1, "Kept")];

		// Act

		const entries = toTableOfContents(headings);

		// Assert

		expect(entries.map(entry => entry.id)).toEqual(["0:1"]);
	});
});

describe("findCurrentHeadingId", () => {
	const headings = [
		heading(0, 2, 1, "Chapter 1"),
		heading(1, 5, 2, "Section 1.1"),
		heading(3, 0, 1, "Chapter 2"),
	];

	it("Should pick the last heading at or before the position when it falls between headings", () => {
		// Arrange

		const position = { split: 2, block: 7 };

		// Act

		const current = findCurrentHeadingId(headings, position);

		// Assert

		expect(current).toBe("1:5");
	});

	it("Should pick the heading itself when the position is on its block", () => {
		// Arrange

		const position = { split: 3, block: 0 };

		// Act

		const current = findCurrentHeadingId(headings, position);

		// Assert

		expect(current).toBe("3:0");
	});

	it("Should return null when the position comes before the first heading", () => {
		// Arrange

		const position = { split: 0, block: 1 };

		// Act

		const current = findCurrentHeadingId(headings, position);

		// Assert

		expect(current).toBeNull();
	});
});
