import { act, screen } from "@testing-library/react";
import { getHomeStatistics } from "../../../../api/statistics/api/statisticsApi";
import HomeStatistics from "../../../../features/ElementViewer/HomeStatistics/HomeStatistics";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../../stores/sync/managers/syncEventManager";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/statistics/api/statisticsApi"));

describe("HomeStatistics", () => {
	it("Should show today's study time and reviewed element counts when the statistics load", async () => {
		// Arrange

		vi.mocked(getHomeStatistics).mockResolvedValue({
			learningAssetCount: 12,
			extractCount: 34,
			cardCount: 1250,
			todayStudyDurationMs: 65 * 60_000,
			dailyActivity: [],
			dailyForecast: [],
		});

		// Act

		renderWithProviders(<HomeStatistics />);

		// Assert

		expect(await screen.findByText("1 h 5 min")).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText("34")).toBeInTheDocument();
		expect(screen.getByText((1250).toLocaleString())).toBeInTheDocument();
	});

	it("Should show the error when the statistics fail to load", async () => {
		// Arrange

		vi.mocked(getHomeStatistics).mockRejectedValue(
			new Error("database is busy"),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});

		// Act

		renderWithProviders(<HomeStatistics />);

		// Assert

		expect(
			await screen.findByText("Couldn't load your statistics"),
		).toBeInTheDocument();
		expect(screen.getByText(/database is busy/)).toBeInTheDocument();
	});

	it("Should keep the statistics and show the error when a later refresh fails", async () => {
		// Arrange

		vi.mocked(getHomeStatistics).mockResolvedValueOnce({
			learningAssetCount: 12,
			extractCount: 0,
			cardCount: 0,
			todayStudyDurationMs: 0,
			dailyActivity: [],
			dailyForecast: [],
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		renderWithProviders(<HomeStatistics />);
		await screen.findByText("12");
		vi.mocked(getHomeStatistics).mockRejectedValueOnce(
			new Error("database is busy"),
		);

		// Act

		await act(() =>
			defaultGlobalSyncEventManager.notifyListeners(
				ListenerType.PostSyncComplete,
			),
		);

		// Assert

		expect(
			screen.getByText("Couldn't refresh your statistics"),
		).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
	});
});
