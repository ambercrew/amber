import { describe, expect, it } from "vitest";
import {
	clippingAncestorOf,
	gutterLayout,
} from "../../../../features/ElementViewer/marks/gutterLayout";

describe("gutterLayout", () => {
	it("Should lay markers out in a row when they all fit side by side", () => {
		// Arrange

		const count = 3;
		const gutterWidth = 6 + 3 * 20 + 2 * 4;

		// Act

		const actual = gutterLayout(count, gutterWidth);

		// Assert

		expect(actual).toBe("row");
	});

	it("Should stack markers in a column when only one fits across", () => {
		// Arrange

		const count = 3;
		const gutterWidth = 26;

		// Act

		const actual = gutterLayout(count, gutterWidth);

		// Assert

		expect(actual).toBe("column");
	});

	it("Should shrink markers to compact tabs when not even one fits", () => {
		// Arrange

		const count = 1;
		const gutterWidth = 16;

		// Act

		const actual = gutterLayout(count, gutterWidth);

		// Assert

		expect(actual).toBe("compact");
	});
});

describe("clippingAncestorOf", () => {
	it("Should return the nearest ancestor that clips horizontally when one exists", () => {
		// Arrange

		const scroller = document.createElement("div");
		scroller.style.overflowY = "auto";
		scroller.style.overflowX = "hidden";
		const wrapper = document.createElement("div");
		const element = document.createElement("div");
		wrapper.append(element);
		scroller.append(wrapper);
		document.body.append(scroller);

		// Act

		const actual = clippingAncestorOf(element);

		// Assert

		expect(actual).toBe(scroller);
		scroller.remove();
	});

	it("Should return the document element when no ancestor clips", () => {
		// Arrange

		const element = document.createElement("div");
		document.body.append(element);

		// Act

		const actual = clippingAncestorOf(element);

		// Assert

		expect(actual).toBe(document.documentElement);
		element.remove();
	});
});
