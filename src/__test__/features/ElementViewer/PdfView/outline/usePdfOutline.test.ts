import { describe, expect, it } from "vitest";
import { PdfActionType, PdfBookmarkObject } from "@embedpdf/models";
import {
	findCurrentEntryId,
	toTableOfContents,
} from "../../../../../features/ElementViewer/PdfView/outline/usePdfOutline";

function destination(title: string, pageIndex: number, children?: unknown[]) {
	return {
		title,
		target: { type: "destination", destination: { pageIndex } },
		children,
	};
}

function bookmarksOf(bookmarks: unknown[]) {
	return bookmarks as PdfBookmarkObject[];
}

describe("toTableOfContents", () => {
	it("Should id entries by their index path and keep the nesting when bookmarks are nested", () => {
		// Arrange

		const bookmarks = bookmarksOf([
			destination("Chapter 1", 0, [destination("Section 1.1", 2)]),
		]);

		// Act

		const { entries } = toTableOfContents(bookmarks);

		// Assert

		expect(entries[0].id).toBe("0");
		expect(entries[0].children?.[0]).toEqual({
			id: "0.0",
			title: "Section 1.1",
			selectable: true,
			children: undefined,
		});
	});

	it("Should follow the action's destination when the bookmark is a go-to action", () => {
		// Arrange

		const bookmarks = bookmarksOf([
			{
				title: "Intro",
				target: {
					type: "action",
					action: {
						type: PdfActionType.Goto,
						destination: { pageIndex: 2 },
					},
				},
			},
		]);

		// Act

		const { items } = toTableOfContents(bookmarks);

		// Assert

		expect(items).toEqual([{ id: "0", pageIndex: 2 }]);
	});

	it("Should make the entry unselectable when the bookmark has no target", () => {
		// Arrange

		const bookmarks = bookmarksOf([{ title: "Part I" }]);

		// Act

		const { entries } = toTableOfContents(bookmarks);

		// Assert

		expect(entries[0].selectable).toBe(false);
	});
});

describe("findCurrentEntryId", () => {
	it("Should pick the latest chapter starting at or before the page when the page is between chapters", () => {
		// Arrange

		const { items } = toTableOfContents(
			bookmarksOf([
				destination("Chapter 1", 0),
				destination("Chapter 2", 10),
				destination("Chapter 3", 20),
			]),
		);

		// Act

		const current = findCurrentEntryId(items, 15);

		// Assert

		expect(current).toBe("1");
	});

	it("Should pick the section rather than its chapter when the page is inside a section", () => {
		// Arrange

		const { items } = toTableOfContents(
			bookmarksOf([
				destination("Chapter 1", 0, [
					destination("Section 1.1", 0),
					destination("Section 1.2", 5),
				]),
				destination("Chapter 2", 10),
			]),
		);

		// Act

		const current = findCurrentEntryId(items, 7);

		// Assert

		expect(current).toBe("0.1");
	});

	it("Should pick the deepest entry when a later, shallower entry starts on the same page", () => {
		// Arrange

		const { items } = toTableOfContents(
			bookmarksOf([
				destination("Chapter 1", 5, [destination("Section 1.1", 5)]),
				destination("Chapter 2", 5),
			]),
		);

		// Act

		const current = findCurrentEntryId(items, 5);

		// Assert

		expect(current).toBe("0.0");
	});

	it("Should return null when the page comes before the first chapter", () => {
		// Arrange

		const { items } = toTableOfContents(
			bookmarksOf([destination("Chapter 1", 3)]),
		);

		// Act

		const current = findCurrentEntryId(items, 1);

		// Assert

		expect(current).toBeNull();
	});
});
