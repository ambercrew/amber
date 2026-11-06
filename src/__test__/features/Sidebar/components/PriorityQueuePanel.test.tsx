import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getReviewedTodayCount } from "../../../../api/statistics/api/statisticsApi";
import { getDueElements } from "../../../../api/study/api/studyApi";
import { DueElementDto } from "../../../../api/study/dto/dueElementDto";
import PriorityQueuePanel from "../../../../features/Sidebar/components/PriorityQueuePanel";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/statistics/api/statisticsApi"));
vi.mock(import("../../../../api/study/api/studyApi"));
vi.mock(
	import("../../../../features/Sidebar/components/StudyScopeBanner"),
	() => ({ default: () => <></> }),
);

const QUEUE: DueElementDto[] = [
	{ elementId: { type: "card", id: "card-1" }, title: "Capital of Spain" },
	{ elementId: { type: "extract", id: "extract-1" }, title: "Key passage" },
	{ elementId: { type: "card", id: "card-2" }, title: "Capital of France" },
];

describe("PriorityQueuePanel", () => {
	beforeEach(() => {
		vi.mocked(getDueElements).mockResolvedValue(QUEUE);
		vi.mocked(getReviewedTodayCount).mockResolvedValue(1);
	});

	it("Should list every due element with its breakdown when elements are due", async () => {
		// Act

		renderWithProviders(<PriorityQueuePanel />);

		// Assert

		expect(await screen.findByText("Key passage")).toBeInTheDocument();
		expect(screen.getByText("Capital of France")).toBeInTheDocument();
		expect(screen.getByText("1 extract · 2 cards due")).toBeInTheDocument();
	});

	it("Should show the share reviewed today when some are done", async () => {
		// Act

		renderWithProviders(<PriorityQueuePanel />);

		// Assert

		expect(await screen.findByText("25%")).toBeInTheDocument();
	});

	it("Should show no progress when nothing was reviewed today", async () => {
		// Arrange

		vi.mocked(getReviewedTodayCount).mockResolvedValue(0);

		// Act

		renderWithProviders(<PriorityQueuePanel />);

		// Assert

		expect(await screen.findByText("0%")).toBeInTheDocument();
	});

	it("Should keep the latest progress when an older request resolves last", async () => {
		// Arrange

		let resolveOldest: (count: number) => void = () => {};
		vi.mocked(getReviewedTodayCount).mockReturnValueOnce(
			new Promise(resolve => {
				resolveOldest = resolve;
			}),
		);
		renderWithProviders(<PriorityQueuePanel />);
		await screen.findByText("25%");

		// Act

		await act(async () => resolveOldest(9));

		// Assert

		expect(screen.getByText("25%")).toBeInTheDocument();
	});

	it("Should open the element when its row is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		renderWithProviders(<PriorityQueuePanel />);

		// Act

		await user.click(await screen.findByText("Key passage"));

		// Assert

		await waitFor(() =>
			expect(
				screen.getByTestId(LOCATION_DISPLAY_TEST_ID),
			).toHaveTextContent("/extract/extract-1"),
		);
	});

	it("Should say nothing is due when the queue is empty", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([]);

		// Act

		renderWithProviders(<PriorityQueuePanel />);

		// Assert

		expect(
			await screen.findByText("Nothing due right now."),
		).toBeInTheDocument();
	});
});
