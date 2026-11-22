import {
	applyTagEdits,
	tagEditsBetween,
} from "../../../../features/Import/utils/tagEdits";

describe("tagEdits", () => {
	it("Should keep added tags and drop removed ones when applied to another parent's tags", () => {
		// Arrange

		const edits = tagEditsBetween(["rome", "greece"], ["rome", "jq"]);

		// Act

		const actual = applyTagEdits(["greece", "physics"], edits);

		// Assert

		expect(actual).toEqual(["physics", "jq"]);
	});

	it("Should not repeat a tag when the parent already has an added tag", () => {
		// Arrange

		const edits = tagEditsBetween([], ["jq"]);

		// Act

		const actual = applyTagEdits(["jq", "rome"], edits);

		// Assert

		expect(actual).toEqual(["jq", "rome"]);
	});
});
