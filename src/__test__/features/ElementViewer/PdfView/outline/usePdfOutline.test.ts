import { describe, expect, it } from "vitest";
import { OutlineItem } from "@embedpdf/react/outline";
import {
	landingOf,
	toTableOfContents,
} from "../../../../../features/ElementViewer/PdfView/outline/usePdfOutline";

/** An outline item at `objectNumber`, under `parent`'s, going to `pageIndex` (none when undefined). */
function item(
	objectNumber: number,
	title: string,
	pageIndex: number | undefined,
	parent: number | null = null,
): OutlineItem {
	return {
		ref: { kind: "objectNumber", objectNumber },
		parent:
			parent === null
				? null
				: { kind: "objectNumber", objectNumber: parent },
		title,
		// The page index rides in the destination's page ref, for `pageIndexOf` below to read back.
		target:
			pageIndex === undefined
				? null
				: {
						kind: "goto",
						destination: {
							kind: "fit",
							page: {
								kind: "objectNumber",
								objectNumber: 1000 + pageIndex,
							},
						},
					},
		action: null,
		open: false,
		color: null,
		bold: false,
		italic: false,
	};
}

function pageIndexOf(outlineItem: OutlineItem): number | undefined {
	const target = outlineItem.target;
	return target?.kind === "goto"
		? target.destination.page.objectNumber - 1000
		: undefined;
}

describe("toTableOfContents", () => {
	it("Should id entries by their index path and keep the nesting when items are nested", () => {
		// Arrange

		const items = [
			item(10, "Chapter 1", 0),
			item(11, "Section 1.1", 2, 10),
			item(12, "Section 1.2", 3, 10),
			item(20, "Chapter 2", 5),
		];

		// Act

		const { entries } = toTableOfContents(items, pageIndexOf);

		// Assert

		expect(entries.map(({ id }) => id)).toEqual(["0", "1"]);
		expect(entries[0].children).toEqual([
			{ id: "0.0", title: "Section 1.1", selectable: true },
			{ id: "0.1", title: "Section 1.2", selectable: true },
		]);
		expect(entries[1].children).toBeUndefined();
	});

	it("Should list each entry's page in document order", () => {
		// Arrange

		const items = [
			item(10, "Chapter 1", 0),
			item(11, "Section 1.1", 2, 10),
			item(20, "Chapter 2", 5),
		];

		// Act

		const { targets } = toTableOfContents(items, pageIndexOf);

		// Assert

		expect(targets).toEqual([
			{ id: "0", pageIndex: 0, landing: null },
			{ id: "0.0", pageIndex: 2, landing: null },
			{ id: "1", pageIndex: 5, landing: null },
		]);
	});

	it("Should map each item's object number to its entry id", () => {
		// Arrange

		const items = [
			item(10, "Chapter 1", 0),
			item(11, "Section 1.1", 2, 10),
		];

		// Act

		const { idsByObjectNumber } = toTableOfContents(items, pageIndexOf);

		// Assert

		expect(idsByObjectNumber.get(11)).toBe("0.0");
	});

	it("Should make the entry unselectable when the item goes nowhere", () => {
		// Arrange

		const items = [item(10, "Part I", undefined)];

		// Act

		const { entries } = toTableOfContents(items, pageIndexOf);

		// Assert

		expect(entries[0].selectable).toBe(false);
	});

	it("Should put an item at the top level when its parent isn't in the outline", () => {
		// Arrange

		const items = [item(10, "Chapter 1", 0), item(11, "Orphan", 2, 99)];

		// Act

		const { entries } = toTableOfContents(items, pageIndexOf);

		// Assert

		expect(entries.map(({ title }) => title)).toEqual([
			"Chapter 1",
			"Orphan",
		]);
	});
});

describe("landingOf", () => {
	const page = { kind: "objectNumber" as const, objectNumber: 1005 };

	it("Should keep only the spot's y when the destination gives a position and a zoom", () => {
		// Arrange

		const destination = {
			kind: "xyz" as const,
			page,
			x: 40,
			y: 120,
			zoom: 2,
		};

		// Act

		const actual = landingOf(destination);

		// Assert

		expect(actual).toEqual({
			kind: "xyz",
			page,
			x: null,
			y: 120,
			zoom: null,
		});
	});

	it("Should return null when the destination only names the page", () => {
		// Arrange

		const destination = { kind: "fit" as const, page };

		// Act

		const actual = landingOf(destination);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when the destination's y is left open", () => {
		// Arrange

		const destination = { kind: "fitH" as const, page, y: null };

		// Act

		const actual = landingOf(destination);

		// Assert

		expect(actual).toBeNull();
	});
});
