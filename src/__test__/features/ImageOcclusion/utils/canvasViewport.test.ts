import { describe, expect, it } from "vitest";
import {
	clampView,
	FIT_VIEW,
	MAX_ZOOM,
	zoomViewAt,
} from "../../../../features/ImageOcclusion/utils/canvasViewport";

// A 200×100 image fits a 400×400 viewport at scale 2, filling its width.
const size = { width: 400, height: 400, iw: 200, ih: 100 };

describe("clampView", () => {
	it("Should center the image when it fits the viewport", () => {
		// Arrange

		const view = { zoom: 1, x: 50, y: -30 };

		// Act

		const actual = clampView(view, size);

		// Assert

		expect(actual).toEqual({ zoom: 1, x: 0, y: 100 });
	});

	it("Should keep the image's edges past the viewport's when zoomed in", () => {
		// Arrange

		const view = { zoom: 2, x: 100, y: -1000 };

		// Act

		const actual = clampView(view, size);

		// Assert

		expect(actual).toEqual({ zoom: 2, x: 0, y: 0 });
	});

	it("Should limit the zoom when it's out of range", () => {
		// Arrange

		const view = { zoom: 100, x: 0, y: 0 };

		// Act

		const actual = clampView(view, size);

		// Assert

		expect(actual.zoom).toBe(MAX_ZOOM);
	});
});

describe("zoomViewAt", () => {
	it("Should keep the image point under the anchor in place when zooming in", () => {
		// Arrange

		const view = clampView(FIT_VIEW, size);
		const anchor = { x: 300, y: 200 };

		// Act

		const actual = zoomViewAt(view, 2, anchor, size);

		// Assert

		// Image point (150, 50) sat under the anchor at scale 2, and still does at scale 4.
		expect(actual).toEqual({ zoom: 2, x: 300 - 150 * 4, y: 200 - 50 * 4 });
	});

	it("Should return to the fitted view when zooming out to 1", () => {
		// Arrange

		const view = { zoom: 3, x: -500, y: -200 };

		// Act

		const actual = zoomViewAt(view, 0.5, { x: 10, y: 10 }, size);

		// Assert

		expect(actual).toEqual({ zoom: 1, x: 0, y: 100 });
	});
});
