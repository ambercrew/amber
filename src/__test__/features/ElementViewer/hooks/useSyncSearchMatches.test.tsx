import { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { AppStore, RootState, setupStore } from "../../../../stores/store";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { setCurrentElement } from "../../../../stores/elements/elementsReducer";
import {
	openSearchAtMatch,
	setSearchMatchCounts,
} from "../../../../stores/search/searchReducer";
import {
	PENDING_MATCH_TIMEOUT_IN_MILLISECONDS,
	useSyncSearchMatches,
} from "../../../../features/ElementViewer/hooks/useSyncSearchMatches";

interface Target {
	key: string;
}

function preloadedSearchState(
	overrides: Partial<RootState["search"]> = {},
): Partial<RootState> {
	return {
		search: {
			opened: true,
			query: "",
			caseSensitive: false,
			currentIndex: -1,
			totalMatches: 0,
			pendingMatch: null,
			...overrides,
		},
	};
}

function renderSync(
	store: AppStore,
	props: {
		totalMatches: number;
		resolveMatchTarget?: (globalIndex: number) => Target | null;
		onNavigate?: (target: Target) => void;
		resolveInitialIndex?: () => number;
		countsComplete?: boolean;
	},
) {
	const resolveMatchTarget =
		props.resolveMatchTarget ??
		((globalIndex: number) => ({ key: String(globalIndex) }));
	const onNavigate = props.onNavigate ?? vi.fn();
	const resolveInitialIndex = props.resolveInitialIndex ?? (() => 0);

	function Wrapper({ children }: PropsWithChildren) {
		return <Provider store={store}>{children}</Provider>;
	}

	return renderHook(
		({ totalMatches, countsComplete }: SyncRenderProps) =>
			useSyncSearchMatches({
				totalMatches,
				resolveMatchTarget,
				onNavigate,
				resolveInitialIndex,
				countsComplete,
			}),
		{
			wrapper: Wrapper,
			initialProps: {
				totalMatches: props.totalMatches,
				countsComplete: props.countsComplete,
			} as SyncRenderProps,
		},
	);
}

interface SyncRenderProps {
	totalMatches: number;
	countsComplete?: boolean;
}

describe("useSyncSearchMatches", () => {
	it("Should not seed or navigate when search is not opened", () => {
		// Arrange

		const store = setupStore(preloadedSearchState({ opened: false }));
		const onNavigate = vi.fn();
		const resolveInitialIndex = vi.fn(() => 0);

		// Act

		renderSync(store, { totalMatches: 3, onNavigate, resolveInitialIndex });

		// Assert

		expect(resolveInitialIndex).not.toHaveBeenCalled();
		expect(onNavigate).not.toHaveBeenCalled();
		expect(store.getState().search.currentIndex).toBe(-1);
	});

	it("Should seed currentIndex from resolveInitialIndex when opened with matches and no current match", () => {
		// Arrange

		const store = setupStore(preloadedSearchState());
		const resolveInitialIndex = vi.fn(() => 2);

		// Act

		renderSync(store, { totalMatches: 5, resolveInitialIndex });

		// Assert

		expect(resolveInitialIndex).toHaveBeenCalledTimes(1);
		expect(store.getState().search.currentIndex).toBe(2);
		expect(store.getState().search.totalMatches).toBe(5);
	});

	it("Should not re-seed on a re-render once a current match already exists", () => {
		// Arrange

		const store = setupStore(preloadedSearchState({ currentIndex: 1 }));
		const resolveInitialIndex = vi.fn(() => 0);

		// Act

		const { rerender } = renderSync(store, {
			totalMatches: 5,
			resolveInitialIndex,
		});
		rerender({ totalMatches: 5 });

		// Assert

		expect(resolveInitialIndex).not.toHaveBeenCalled();
		expect(store.getState().search.currentIndex).toBe(1);
	});

	it("Should clamp a stale currentIndex when totalMatches shrinks", () => {
		// Arrange: a previous, larger result set left currentIndex at 5; the
		// new (smaller) result set must clamp it into range rather than reseed.

		const store = setupStore(
			preloadedSearchState({ currentIndex: 5, totalMatches: 8 }),
		);
		const resolveInitialIndex = vi.fn(() => 0);

		// Act

		renderSync(store, { totalMatches: 3, resolveInitialIndex });

		// Assert

		expect(resolveInitialIndex).not.toHaveBeenCalled();
		expect(store.getState().search.currentIndex).toBe(2);
	});

	it("Should set currentIndex to -1 when totalMatches becomes 0", () => {
		// Arrange

		const store = setupStore(
			preloadedSearchState({ currentIndex: 2, totalMatches: 5 }),
		);

		// Act

		renderSync(store, { totalMatches: 0 });

		// Assert

		expect(store.getState().search.currentIndex).toBe(-1);
	});

	it("Should re-seed once matches reappear after being empty", () => {
		// Arrange

		const store = setupStore(preloadedSearchState());
		const resolveInitialIndex = vi.fn(() => 1);

		// Act: opens with no matches yet, then matches arrive.

		const { rerender } = renderSync(store, {
			totalMatches: 0,
			resolveInitialIndex,
		});
		rerender({ totalMatches: 4 });

		// Assert

		expect(resolveInitialIndex).toHaveBeenCalledTimes(1);
		expect(store.getState().search.currentIndex).toBe(1);
	});

	it("Should navigate to the resolved target when currentIndex changes", () => {
		// Arrange

		const store = setupStore(
			preloadedSearchState({ currentIndex: 0, totalMatches: 3 }),
		);
		const target: Target = { key: "target" };
		const resolveMatchTarget = vi.fn(() => target);
		const onNavigate = vi.fn();

		// Act

		renderSync(store, { totalMatches: 3, resolveMatchTarget, onNavigate });

		// Assert

		expect(resolveMatchTarget).toHaveBeenCalledWith(0);
		expect(onNavigate).toHaveBeenCalledWith(target);
	});

	it("Should not navigate when currentIndex is -1", () => {
		// Arrange

		const store = setupStore(
			preloadedSearchState({ currentIndex: -1, totalMatches: 0 }),
		);
		const onNavigate = vi.fn();

		// Act

		renderSync(store, { totalMatches: 0, onNavigate });

		// Assert

		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("Should not call onNavigate when resolveMatchTarget returns null", () => {
		// Arrange

		const store = setupStore(
			preloadedSearchState({ currentIndex: 0, totalMatches: 3 }),
		);
		const onNavigate = vi.fn();

		// Act

		renderSync(store, {
			totalMatches: 3,
			resolveMatchTarget: () => null,
			onNavigate,
		});

		// Assert

		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("Should navigate again when goToNextMatch changes currentIndex externally", () => {
		// Arrange

		const store = setupStore(
			preloadedSearchState({ currentIndex: 0, totalMatches: 3 }),
		);
		const onNavigate = vi.fn();

		renderSync(store, { totalMatches: 3, onNavigate });
		onNavigate.mockClear();

		// Act

		act(() => {
			store.dispatch(
				setSearchMatchCounts({ currentIndex: 1, totalMatches: 3 }),
			);
		});

		// Assert

		expect(onNavigate).toHaveBeenCalledWith({ key: "1" });
	});

	describe("with a pending match", () => {
		const ELEMENT_ID = { type: "extract", id: "extract-1" } as const;

		function storeOnElement() {
			const store = setupStore(preloadedSearchState({ opened: false }));
			store.dispatch(
				setCurrentElement({
					type: "extract",
					data: { meta: { elementId: ELEMENT_ID } },
				} as unknown as AnyElementDto),
			);
			return store;
		}

		function requestMatch(store: AppStore, elementId: typeof ELEMENT_ID) {
			store.dispatch(
				openSearchAtMatch({
					query: "needle",
					caseSensitive: false,
					elementId,
					index: 2,
				}),
			);
		}

		afterEach(() => {
			vi.useRealTimers();
		});

		it("Should start on the pending match when its element counts enough matches", () => {
			// Arrange

			const store = storeOnElement();
			const resolveInitialIndex = vi.fn(() => 0);
			requestMatch(store, ELEMENT_ID);

			// Act

			renderSync(store, { totalMatches: 4, resolveInitialIndex });

			// Assert

			expect(resolveInitialIndex).not.toHaveBeenCalled();
			expect(store.getState().search.currentIndex).toBe(2);
			expect(store.getState().search.pendingMatch).toBeNull();
		});

		it("Should wait for more matches when fewer than the pending index are counted", () => {
			// Arrange

			const store = storeOnElement();
			requestMatch(store, ELEMENT_ID);
			const { rerender } = renderSync(store, { totalMatches: 1 });

			// Act

			const waiting = store.getState().search.currentIndex;
			rerender({ totalMatches: 3 });

			// Assert

			expect(waiting).toBe(-1);
			expect(store.getState().search.currentIndex).toBe(2);
		});

		it("Should wait for complete counts when enough matches are counted early", () => {
			// Arrange

			const store = storeOnElement();
			requestMatch(store, ELEMENT_ID);
			const { rerender } = renderSync(store, {
				totalMatches: 5,
				countsComplete: false,
			});

			// Act

			const waiting = store.getState().search.currentIndex;
			rerender({ totalMatches: 8, countsComplete: true });

			// Assert

			expect(waiting).toBe(-1);
			expect(store.getState().search.currentIndex).toBe(2);
			expect(store.getState().search.pendingMatch).toBeNull();
		});

		it("Should settle on the last match when counting never reaches the pending index", () => {
			// Arrange

			vi.useFakeTimers();
			const store = storeOnElement();
			requestMatch(store, ELEMENT_ID);
			renderSync(store, { totalMatches: 1 });

			// Act

			act(() => {
				vi.advanceTimersByTime(PENDING_MATCH_TIMEOUT_IN_MILLISECONDS);
			});

			// Assert

			expect(store.getState().search.currentIndex).toBe(0);
			expect(store.getState().search.pendingMatch).toBeNull();
		});

		it("Should ignore the pending match when it belongs to another element", () => {
			// Arrange

			const store = storeOnElement();
			requestMatch(store, { type: "extract", id: "other" } as never);

			// Act

			renderSync(store, {
				totalMatches: 4,
				resolveInitialIndex: () => 1,
			});

			// Assert

			expect(store.getState().search.currentIndex).toBe(1);
			expect(store.getState().search.pendingMatch).not.toBeNull();
		});
	});
});
