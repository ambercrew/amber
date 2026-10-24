import { describe, expect, it } from "vitest";
import {
	canPlaceReadPoint,
	ReadPointSource,
} from "../../../../features/ElementViewer/readPoint/readPointPrecedence";

describe("canPlaceReadPoint", () => {
	it.each<[boolean, ReadPointSource, ReadPointSource]>([
		[true, "automatic", "automatic"],
		[false, "automatic", "extract"],
		[false, "automatic", "manual"],
		[true, "extract", "automatic"],
		[true, "extract", "extract"],
		[false, "extract", "manual"],
		[true, "manual", "automatic"],
		[true, "manual", "extract"],
		[true, "manual", "manual"],
	])(
		"Should return %s when a %s placement comes after a %s one",
		(expected, incoming, current) => {
			// Act

			const actual = canPlaceReadPoint(incoming, current);

			// Assert

			expect(actual).toBe(expected);
		},
	);
});
