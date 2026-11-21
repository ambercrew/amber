import { describe, expect, it } from "vitest";
import { canPlaceReadPoint } from "../../../../features/ElementViewer/readPoint/readPointPrecedence";
import { ReadPointSource } from "../../../../types/elements/readPointSource";

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
		[false, "automatic", "lookup"],
		[false, "extract", "lookup"],
		[true, "manual", "lookup"],
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
