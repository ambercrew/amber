import reducer, {
	closeSearch,
	goToNextMatch,
	goToPreviousMatch,
	openSearch,
	openSearchAtMatch,
	SearchState,
	setSearchCaseSensitive,
	setSearchMatchCounts,
	setSearchQuery,
} from "../../../stores/search/searchReducer";

function makeState(overrides: Partial<SearchState> = {}): SearchState {
	return {
		opened: false,
		query: "",
		caseSensitive: false,
		currentIndex: -1,
		totalMatches: 0,
		pendingMatch: null,
		...overrides,
	};
}

describe("searchReducer", () => {
	it("Should open search when openSearch is dispatched", () => {
		// Arrange

		const state = makeState();

		// Act

		const actual = reducer(state, openSearch());

		// Assert

		expect(actual.opened).toBe(true);
	});

	it("Should reset query, currentIndex, and totalMatches when closeSearch is dispatched", () => {
		// Arrange

		const state = makeState({
			opened: true,
			query: "hello",
			currentIndex: 2,
			totalMatches: 5,
		});

		// Act

		const actual = reducer(state, closeSearch());

		// Assert

		expect(actual).toEqual(
			makeState({
				opened: false,
				query: "",
				currentIndex: -1,
				totalMatches: 0,
				pendingMatch: null,
			}),
		);
	});

	it("Should set the query when setSearchQuery is dispatched", () => {
		// Arrange

		const state = makeState();

		// Act

		const actual = reducer(state, setSearchQuery("needle"));

		// Assert

		expect(actual.query).toBe("needle");
	});

	it("Should set case sensitivity when setSearchCaseSensitive is dispatched", () => {
		// Arrange

		const state = makeState({ caseSensitive: false });

		// Act

		const actual = reducer(state, setSearchCaseSensitive(true));

		// Assert

		expect(actual.caseSensitive).toBe(true);
	});

	it("Should set currentIndex and totalMatches when setSearchMatchCounts is dispatched", () => {
		// Arrange

		const state = makeState();

		// Act

		const actual = reducer(
			state,
			setSearchMatchCounts({ currentIndex: 3, totalMatches: 7 }),
		);

		// Assert

		expect(actual.currentIndex).toBe(3);
		expect(actual.totalMatches).toBe(7);
	});

	describe("goToNextMatch", () => {
		it("Should advance to the next index when not at the last match", () => {
			// Arrange

			const state = makeState({ currentIndex: 1, totalMatches: 3 });

			// Act

			const actual = reducer(state, goToNextMatch());

			// Assert

			expect(actual.currentIndex).toBe(2);
		});

		it("Should wrap around to the first match when at the last match", () => {
			// Arrange

			const state = makeState({ currentIndex: 2, totalMatches: 3 });

			// Act

			const actual = reducer(state, goToNextMatch());

			// Assert

			expect(actual.currentIndex).toBe(0);
		});

		it("Should stay at -1 when there are no matches", () => {
			// Arrange

			const state = makeState({ currentIndex: -1, totalMatches: 0 });

			// Act

			const actual = reducer(state, goToNextMatch());

			// Assert

			expect(actual.currentIndex).toBe(-1);
		});
	});

	describe("goToPreviousMatch", () => {
		it("Should retreat to the previous index when not at the first match", () => {
			// Arrange

			const state = makeState({ currentIndex: 1, totalMatches: 3 });

			// Act

			const actual = reducer(state, goToPreviousMatch());

			// Assert

			expect(actual.currentIndex).toBe(0);
		});

		it("Should wrap around to the last match when at the first match", () => {
			// Arrange

			const state = makeState({ currentIndex: 0, totalMatches: 3 });

			// Act

			const actual = reducer(state, goToPreviousMatch());

			// Assert

			expect(actual.currentIndex).toBe(2);
		});

		it("Should stay at -1 when there are no matches", () => {
			// Arrange

			const state = makeState({ currentIndex: -1, totalMatches: 0 });

			// Act

			const actual = reducer(state, goToPreviousMatch());

			// Assert

			expect(actual.currentIndex).toBe(-1);
		});
	});

	it("Should open on the given query and match when openSearchAtMatch is dispatched", () => {
		// Arrange

		const state = makeState({
			query: "old",
			currentIndex: 3,
			totalMatches: 5,
		});
		const elementId = { type: "card", id: "card-1" } as const;

		// Act

		const actual = reducer(
			state,
			openSearchAtMatch({
				query: "new",
				caseSensitive: true,
				elementId,
				index: 4,
			}),
		);

		// Assert

		expect(actual).toEqual(
			makeState({
				opened: true,
				query: "new",
				caseSensitive: true,
				pendingMatch: { elementId, index: 4 },
			}),
		);
	});

	it("Should drop the pending match when closeSearch is dispatched", () => {
		// Arrange

		const state = makeState({
			opened: true,
			pendingMatch: {
				elementId: { type: "card", id: "card-1" },
				index: 1,
			},
		});

		// Act

		const actual = reducer(state, closeSearch());

		// Assert

		expect(actual.pendingMatch).toBeNull();
	});
});
