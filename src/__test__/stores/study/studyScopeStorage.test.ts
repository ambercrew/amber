import {
	loadStudyScope,
	saveStudyScope,
} from "../../../stores/study/studyScopeStorage";
import { StudyScopeDto } from "../../../api/study/dto/studyScopeDto";

describe("studyScopeStorage", () => {
	beforeEach(() => window.localStorage.clear());

	it("Should load the saved scope when one was saved", () => {
		// Arrange

		const scope: StudyScopeDto = {
			type: "savedSearch",
			savedSearchId: "saved-search-1",
		};
		saveStudyScope(scope);

		// Act

		const actual = loadStudyScope();

		// Assert

		expect(actual).toEqual(scope);
	});

	it("Should load no scope when the saved one was cleared", () => {
		// Arrange

		saveStudyScope({ type: "custom", filters: [] });
		saveStudyScope(null);

		// Act

		const actual = loadStudyScope();

		// Assert

		expect(actual).toBeNull();
		expect(window.localStorage.getItem("study.scope")).toBeNull();
	});

	it.each([
		["not json"],
		['{"type":"custom"}'],
		['{"type":"other"}'],
		["42"],
	])("Should load no scope when the stored value is %s", stored => {
		// Arrange

		window.localStorage.setItem("study.scope", stored);

		// Act

		const actual = loadStudyScope();

		// Assert

		expect(actual).toBeNull();
	});
});
