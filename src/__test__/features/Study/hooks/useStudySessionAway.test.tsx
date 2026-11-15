import { act, fireEvent, screen } from "@testing-library/react";
import {
	MemoryRouterProps,
	Outlet,
	Route,
	Routes,
	useNavigate,
} from "react-router";
import { useStudySessionAway } from "../../../../features/Study/hooks/useStudySessionAway";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { answerShown, StudyState } from "../../../../stores/study/studyReducer";
import { REVIEW_NAVIGATION_STATE } from "../../../../types/study/reviewNavigationState";

const NOW = new Date("2026-01-01T10:00:00Z").getTime();
const REVIEWED = { type: "card" as const, id: "1" };
const OTHER_QUEUED = { type: "card" as const, id: "2" };

const STUDYING_STATE: StudyState = {
	status: "studying",
	queue: [
		{ elementId: REVIEWED, title: "Card 1" },
		{ elementId: OTHER_QUEUED, title: "Card 2" },
	],
	totalCount: 2,
	cardPhase: "question",
	shownAt: NOW - 10_000,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
	studyScope: null,
	away: false,
	timedElementId: REVIEWED,
	timeSpent: {},
	startedAt: null,
};

const LINKS: [string, string, boolean][] = [
	["/card/1", "reviewed", false],
	["/card/2", "other-queued", false],
	["/card/2", "other-queued-from-queue", true],
	["/extract/9", "outside", false],
	["/browser", "browser", false],
];

function Layout() {
	useStudySessionAway();
	const navigate = useNavigate();
	return (
		<>
			{LINKS.map(([path, testId, choosesReview]) => (
				<button
					key={testId}
					type="button"
					data-testid={testId}
					onClick={() =>
						void navigate(
							path,
							choosesReview
								? { state: REVIEW_NAVIGATION_STATE }
								: undefined,
						)
					}>
					{testId}
				</button>
			))}
			<button
				type="button"
				data-testid="back"
				onClick={() => void navigate(-1)}>
				back
			</button>
			<Outlet />
		</>
	);
}

function renderHook(
	study: StudyState,
	initialEntries: MemoryRouterProps["initialEntries"] = ["/card/1"],
) {
	return renderWithProviders(
		<Routes>
			<Route path="/" element={<Layout />}>
				<Route path=":type/:id" element={null} />
				<Route path="*" element={null} />
			</Route>
		</Routes>,
		{
			preloadedState: { study },
			memoryRouterProps: {
				initialEntries,
				initialIndex: (initialEntries?.length ?? 1) - 1,
			},
		},
	);
}

describe("useStudySessionAway", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Should mark the user away when navigating to an element outside the queue", () => {
		// Arrange

		const { store } = renderHook(STUDYING_STATE);

		// Act

		fireEvent.click(screen.getByTestId("outside"));

		// Assert

		const { study } = store.getState();
		expect(study.status).toBe("studying");
		expect(study.away).toBe(true);
		expect(study.timedElementId).toEqual(REVIEWED);
	});

	it("Should mark the user away when navigating to a page without an element", () => {
		// Arrange

		const { store } = renderHook(STUDYING_STATE);

		// Act

		fireEvent.click(screen.getByTestId("browser"));

		// Assert

		expect(store.getState().study.away).toBe(true);
	});

	it("Should keep the element under review when visiting a queued element from outside the queue", () => {
		// Arrange

		const { store } = renderHook(STUDYING_STATE);

		// Act

		fireEvent.click(screen.getByTestId("other-queued"));

		// Assert

		const { study } = store.getState();
		expect(study.away).toBe(true);
		expect(study.timedElementId).toEqual(REVIEWED);
		expect(study.shownAt).toBe(NOW - 10_000);
	});

	it("Should switch the element under review when the queue chooses another one", () => {
		// Arrange

		const { store } = renderHook(STUDYING_STATE);

		// Act

		fireEvent.click(screen.getByTestId("other-queued-from-queue"));

		// Assert

		const { study } = store.getState();
		expect(study.away).toBe(false);
		expect(study.timedElementId).toEqual(OTHER_QUEUED);
		expect(study.timeSpent).toEqual({ "card:1": 10_000 });
	});

	it("Should keep the element under review when going back to an entry the queue chose earlier", () => {
		// Arrange

		const { store } = renderHook(STUDYING_STATE, [
			{ pathname: "/card/2", state: REVIEW_NAVIGATION_STATE },
			"/card/1",
		]);

		// Act

		fireEvent.click(screen.getByTestId("back"));

		// Assert

		const { study } = store.getState();
		expect(study.away).toBe(true);
		expect(study.timedElementId).toEqual(REVIEWED);
	});

	it("Should keep the revealed answer and the running clock when coming back to the element under review", () => {
		// Arrange

		const { store } = renderHook(STUDYING_STATE);
		act(() => {
			store.dispatch(answerShown());
		});
		fireEvent.click(screen.getByTestId("other-queued"));
		vi.setSystemTime(NOW + 60_000);

		// Act

		fireEvent.click(screen.getByTestId("reviewed"));

		// Assert

		const { study } = store.getState();
		expect(study.away).toBe(false);
		expect(study.cardPhase).toBe("answer");
		expect(study.shownAt).toBe(NOW - 10_000);
	});

	it("Should not mark the user away when not studying", () => {
		// Arrange

		const { store } = renderHook({ ...STUDYING_STATE, status: "editing" });

		// Act

		fireEvent.click(screen.getByTestId("outside"));

		// Assert

		expect(store.getState().study.away).toBe(false);
	});
});
