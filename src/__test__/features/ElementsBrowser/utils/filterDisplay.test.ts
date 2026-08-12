import { describeFilter } from "../../../../features/ElementsBrowser/utils/filterDisplay";
import {
	BibliographicalSourceFilter,
	DateFilter,
	ElementTypeFilter,
	NameFilter,
	PriorityFilter,
	StudyProfileFilter,
	TagsFilter,
} from "../../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";

const sources: BibliographicalSourceResponseDto[] = [
	{
		id: "source-1",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		title: "Clean Code",
		authors: null,
		publicationDate: null,
		sourceType: "File",
		location: null,
		elementCount: 3,
	},
	{
		id: "source-2",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		title: "Refactoring",
		authors: null,
		publicationDate: null,
		sourceType: "File",
		location: null,
		elementCount: 1,
	},
];

const profiles: StudyProfileDto[] = [
	{
		id: "profile-1",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		name: "Default",
		isDefault: true,
		desiredRetention: 0.9,
		fsrsParams: [],
		initialIntervalMultiplier: 1,
		initialIntervalDays: 1,
		minIntervalDays: 1,
	},
];

describe("describeFilter", () => {
	it("Should describe contains operator with value when name filter has a value", () => {
		// Arrange

		const filter: NameFilter = {
			id: "1",
			field: "name",
			operator: "contains",
			value: "physics",
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "contains",
			valueLabel: "physics",
		});
	});

	it("Should describe name filter with placeholder when value is empty", () => {
		// Arrange

		const filter: NameFilter = {
			id: "1",
			field: "name",
			operator: "equals",
			value: "",
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({ operatorLabel: "equals", valueLabel: "…" });
	});

	it("Should describe startsWith and endsWith operators when name filter uses them", () => {
		// Arrange

		const startsWithFilter: NameFilter = {
			id: "1",
			field: "name",
			operator: "startsWith",
			value: "chap",
		};
		const endsWithFilter: NameFilter = {
			id: "2",
			field: "name",
			operator: "endsWith",
			value: "ter",
		};

		// Act

		const startsWithActual = describeFilter(
			startsWithFilter,
			sources,
			profiles,
		);
		const endsWithActual = describeFilter(
			endsWithFilter,
			sources,
			profiles,
		);

		// Assert

		expect(startsWithActual.operatorLabel).toBe("starts with");
		expect(endsWithActual.operatorLabel).toBe("ends with");
	});

	it("Should describe isAnyOf tags filter when tags are set", () => {
		// Arrange

		const filter: TagsFilter = {
			id: "1",
			field: "tags",
			operator: "isAnyOf",
			tags: ["math", "physics"],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "is any of",
			valueLabel: "math, physics",
		});
	});

	it("Should describe isAllOf tags filter when tags are set", () => {
		// Arrange

		const filter: TagsFilter = {
			id: "1",
			field: "tags",
			operator: "isAllOf",
			tags: ["math"],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual.operatorLabel).toBe("is all of");
	});

	it("Should describe isNoneOf tags filter with placeholder when tags are empty", () => {
		// Arrange

		const filter: TagsFilter = {
			id: "1",
			field: "tags",
			operator: "isNoneOf",
			tags: [],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "is none of",
			valueLabel: "…",
		});
	});

	it("Should describe today operator when dueDate filter uses today", () => {
		// Arrange

		const filter: DateFilter = {
			id: "1",
			field: "dueDate",
			operator: "today",
			days: null,
			from: null,
			to: null,
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({ operatorLabel: "today", valueLabel: "" });
	});

	it("Should describe withinDays operator when createdDate filter uses withinDays", () => {
		// Arrange

		const filter: DateFilter = {
			id: "1",
			field: "createdDate",
			operator: "withinDays",
			days: 7,
			from: null,
			to: null,
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({ operatorLabel: "within", valueLabel: "7d" });
	});

	it("Should default days to 0 when withinDays filter has no days set", () => {
		// Arrange

		const filter: DateFilter = {
			id: "1",
			field: "createdDate",
			operator: "withinDays",
			days: null,
			from: null,
			to: null,
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual.valueLabel).toBe("0d");
	});

	it("Should describe before operator with formatted date when from is set", () => {
		// Arrange

		const filter: DateFilter = {
			id: "1",
			field: "dueDate",
			operator: "before",
			days: null,
			from: "2024-03-15T00:00:00Z",
			to: null,
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "before",
			valueLabel: new Date("2024-03-15T00:00:00Z").toLocaleDateString(),
		});
	});

	it("Should describe after operator with placeholder when from is null", () => {
		// Arrange

		const filter: DateFilter = {
			id: "1",
			field: "createdDate",
			operator: "after",
			days: null,
			from: null,
			to: null,
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({ operatorLabel: "after", valueLabel: "…" });
	});

	it("Should describe between operator with formatted date range when from and to are set", () => {
		// Arrange

		const filter: DateFilter = {
			id: "1",
			field: "dueDate",
			operator: "between",
			days: null,
			from: "2024-03-01T00:00:00Z",
			to: "2024-03-10T00:00:00Z",
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		const fromLabel = new Date("2024-03-01T00:00:00Z").toLocaleDateString();
		const toLabel = new Date("2024-03-10T00:00:00Z").toLocaleDateString();
		expect(actual).toEqual({
			operatorLabel: "between",
			valueLabel: `${fromLabel} – ${toLabel}`,
		});
	});

	it("Should describe bibliographicalSource filter with matched source titles", () => {
		// Arrange

		const filter: BibliographicalSourceFilter = {
			id: "1",
			field: "bibliographicalSource",
			operator: "isAnyOf",
			sourceIds: ["source-2"],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "is any of",
			valueLabel: "Refactoring",
		});
	});

	it("Should describe bibliographicalSource filter with placeholder when no sources match", () => {
		// Arrange

		const filter: BibliographicalSourceFilter = {
			id: "1",
			field: "bibliographicalSource",
			operator: "isNoneOf",
			sourceIds: ["unknown-source"],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "is none of",
			valueLabel: "…",
		});
	});

	it("Should describe studyProfile filter with matched profile names", () => {
		// Arrange

		const filter: StudyProfileFilter = {
			id: "1",
			field: "studyProfile",
			operator: "isAnyOf",
			profileIds: ["profile-1"],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "is any of",
			valueLabel: "Default",
		});
	});

	it("Should describe elementType filter with matched type labels", () => {
		// Arrange

		const filter: ElementTypeFilter = {
			id: "1",
			field: "elementType",
			operator: "isAnyOf",
			types: ["card", "folder"],
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({
			operatorLabel: "is any of",
			valueLabel: "Folder, Card",
		});
	});

	it("Should describe priority filter with min and max percentages", () => {
		// Arrange

		const filter: PriorityFilter = {
			id: "1",
			field: "priority",
			operator: "between",
			min: 70,
			max: 100,
		};

		// Act

		const actual = describeFilter(filter, sources, profiles);

		// Assert

		expect(actual).toEqual({ operatorLabel: "", valueLabel: "70–100%" });
	});
});
