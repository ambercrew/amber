import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import StudyModeToggle from "../../../../features/Study/components/StudyModeToggle";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../test-utils/renderWithProviders";
import { getDueElements } from "../../../../api/study/api/studyApi";

vi.mock(import("../../../../api/study/api/studyApi.ts"));
vi.mock(import("../../../../api/elements/api/elementsApi.ts"));
vi.mock(import("@mantine/notifications"));

describe("StudyModeToggle", () => {
	it("Should show unchecked switch with editing tooltip when not studying", () => {
		// Arrange & Act

		renderWithProviders(<StudyModeToggle />);

		// Assert

		expect(screen.getByRole("switch")).not.toBeChecked();
	});

	it("Should show checked switch when a study session is active", () => {
		// Arrange & Act

		renderWithProviders(<StudyModeToggle />, {
			preloadedState: {
				study: {
					status: "studying",
					queue: [
						{
							elementId: { type: "card", id: "card-1" },
							title: "Card 1",
						},
					],
					totalCount: 1,
					cardPhase: "question",
					shownAt: null,
					counts: {
						cards: 0,
						learningAssets: 0,
						extracts: 0,
						finished: 0,
					},
					summary: null,
				},
			},
		});

		// Assert

		expect(screen.getByRole("switch")).toBeChecked();
	});

	it("Should navigate to the first due element when clicked while editing", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([
			{ elementId: { type: "card", id: "card-1" }, title: "Card 1" },
		]);
		const user = userEvent.setup();

		// Act

		renderWithProviders(<StudyModeToggle />);
		await user.click(screen.getByRole("switch"));

		// Assert

		expect(
			await screen.findByTestId(LOCATION_DISPLAY_TEST_ID),
		).toHaveTextContent("/card/card-1");
		expect(screen.getByRole("switch")).toBeChecked();
	});

	it("Should show a notification when clicked while editing with nothing due", async () => {
		// Arrange

		vi.mocked(getDueElements).mockResolvedValue([]);
		const user = userEvent.setup();

		// Act

		renderWithProviders(<StudyModeToggle />);
		await user.click(screen.getByRole("switch"));

		// Assert

		await vi.waitFor(() => {
			expect(notifications.show).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Nothing due" }),
			);
		});
		expect(screen.getByRole("switch")).not.toBeChecked();
	});

	it("Should stop the study session when clicked while studying", async () => {
		// Arrange

		const user = userEvent.setup();

		// Act

		const { store } = renderWithProviders(<StudyModeToggle />, {
			preloadedState: {
				study: {
					status: "studying",
					queue: [
						{
							elementId: { type: "card", id: "card-1" },
							title: "Card 1",
						},
					],
					totalCount: 1,
					cardPhase: "question",
					shownAt: null,
					counts: {
						cards: 0,
						learningAssets: 0,
						extracts: 0,
						finished: 0,
					},
					summary: null,
				},
			},
		});
		await user.click(screen.getByRole("switch"));

		// Assert

		expect(store.getState().study.status).toBe("editing");
		expect(screen.getByRole("switch")).not.toBeChecked();
	});
});
