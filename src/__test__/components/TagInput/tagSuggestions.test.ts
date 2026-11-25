import { matchExistingTags } from "../../../components/TagInput/tagSuggestions";

describe("matchExistingTags", () => {
	it("Should use the existing tag's case when a new tag differs only by case", () => {
		// Act

		const actual = matchExistingTags(
			["kept", "PHILOSOPHY"],
			["kept"],
			["philosophy"],
		);

		// Assert

		expect(actual).toEqual(["kept", "philosophy"]);
	});

	it("Should keep a new tag as typed when no existing tag matches", () => {
		// Act

		const actual = matchExistingTags(["Brand new"], [], ["philosophy"]);

		// Assert

		expect(actual).toEqual(["Brand new"]);
	});
});
