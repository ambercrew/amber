import { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { setupStore } from "../../../../../stores/store";
import {
	goToNextMatch,
	goToPreviousMatch,
} from "../../../../../stores/search/searchReducer";
import { usePdfFindInPage } from "../../../../../features/ElementViewer/PdfView/search/usePdfFindInPage";

const hits = [
	{ pageIndex: 0, bounds: { x: 0, y: 300, width: 10, height: 10 } },
	{ pageIndex: 1, bounds: { x: 0, y: 100, width: 10, height: 10 } },
];
const search = {
	search: vi.fn(() => Promise.resolve()),
	clear: vi.fn(),
	goToHit: vi.fn((index: number) => hits[index]),
};
let visiblePages = [{ pageIndex: 0, visibleRect: { y: 0 } }];

vi.mock("@embedpdf/react/search", () => ({
	useSearch: () => search,
	useSearchHits: () => hits,
	useSearchState: (select: (state: { status: string }) => unknown) =>
		select({ status: "complete" }),
}));
vi.mock("@embedpdf/react/stage", () => ({
	useStage: () => ({ listVisiblePages: () => visiblePages }),
}));
vi.mock(
	"../../../../../features/ElementViewer/PdfView/core/pdfCoreContext",
	() => ({ usePdfCore: () => ({ announceJump: vi.fn() }) }),
);

function renderFindInPage() {
	const store = setupStore({
		search: {
			opened: true,
			query: "availa",
			caseSensitive: false,
			currentIndex: -1,
			totalMatches: 0,
			pendingMatch: null,
		},
	});
	function Wrapper({ children }: PropsWithChildren) {
		return <Provider store={store}>{children}</Provider>;
	}
	renderHook(() => usePdfFindInPage(), { wrapper: Wrapper });
	return store;
}

describe("usePdfFindInPage", () => {
	beforeEach(() => {
		search.goToHit.mockClear();
		visiblePages = [{ pageIndex: 0, visibleRect: { y: 0 } }];
	});

	it("Should go to every hit when stepping through the matches", () => {
		// Arrange

		const store = renderFindInPage();
		const seeded = search.goToHit.mock.calls.map(call => call[0]);

		// Act

		act(() => {
			store.dispatch(goToNextMatch());
		});
		act(() => {
			store.dispatch(goToNextMatch());
		});
		act(() => {
			store.dispatch(goToPreviousMatch());
		});

		// Assert

		expect([
			seeded,
			search.goToHit.mock.calls.map(call => call[0]),
		]).toEqual([[0], [0, 1, 0, 1]]);
	});
});
