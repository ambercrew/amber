import { useVirtualizer } from "@tanstack/react-virtual";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { DueElementDto } from "../../../../api/study/dto/dueElementDto";
import PriorityQueueList from "../../../../features/Sidebar/components/PriorityQueueList";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock("@tanstack/react-virtual", async importOriginal => ({
	...(await importOriginal<typeof import("@tanstack/react-virtual")>()),
	useVirtualizer: vi.fn(),
}));

const ROW_HEIGHT = 50;

const QUEUE = Array.from({ length: 10 }, (_, index) => ({
	elementId: { type: "card", id: `card-${index}` },
	title: `Card ${index}`,
})) as DueElementDto[];

function mockRows(indexes: number[]) {
	vi.mocked(useVirtualizer).mockReturnValue({
		getVirtualItems: () =>
			indexes.map(index => ({
				index,
				key: `card-${index}`,
				start: index * ROW_HEIGHT,
				end: (index + 1) * ROW_HEIGHT,
			})),
		getTotalSize: () => QUEUE.length * ROW_HEIGHT,
		measureElement: () => undefined,
	} as never);
}

function extractRange() {
	const options = vi.mocked(useVirtualizer).mock.lastCall?.[0];
	return options?.rangeExtractor?.({
		startIndex: 5,
		endIndex: 6,
		overscan: 0,
		count: QUEUE.length,
	});
}

describe("PriorityQueueList", () => {
	it("Should keep a row mounted when it has focus", () => {
		// Arrange

		mockRows([1]);
		renderWithProviders(<PriorityQueueList queue={QUEUE} />);

		// Act

		fireEvent.focus(screen.getByText("Card 1"));

		// Assert

		expect(extractRange()).toEqual([1, 5, 6]);
	});

	it("Should highlight the element under review rather than the open page when studying", () => {
		// Arrange

		mockRows([3, 5]);

		// Act

		renderWithProviders(
			<Routes>
				<Route
					path=":type/:id"
					element={<PriorityQueueList queue={QUEUE} />}
				/>
			</Routes>,
			{
				preloadedState: {
					study: {
						status: "studying",
						queue: QUEUE,
						totalCount: QUEUE.length,
						cardPhase: "question",
						shownAt: null,
						counts: {
							cards: 0,
							learningAssets: 0,
							extracts: 0,
							finished: 0,
						},
						summary: null,
						studyScope: null,
						away: true,
						timedElementId: QUEUE[3].elementId,
						timeSpent: {},
						startedAt: null,
					},
				},
				memoryRouterProps: { initialEntries: ["/card/card-5"] },
			},
		);

		// Assert

		expect(
			screen.getByText("Card 3").closest("[data-active]"),
		).not.toBeNull();
		expect(screen.getByText("Card 5").closest("[data-active]")).toBeNull();
	});
});
