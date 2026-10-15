import { fireEvent, screen } from "@testing-library/react";
import AppearanceTab from "../../../../features/Settings/components/AppearanceTab";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import SettingsDto from "../../../../api/settings/dto/settingsDto";
import {
	listSystemFonts,
	updateSettings,
} from "../../../../api/settings/api/settingsApi";
import { useIsSmallScreen } from "../../../../hooks/useIsSmallScreen";

vi.mock(import("../../../../api/settings/api/settingsApi"));
vi.mock(import("../../../../hooks/useIsSmallScreen"));

const settings: SettingsDto = {
	baseDatabaseDirectory: "/home/user/amber",
	theme: "Light",
	font: { type: "systemDefault" },
	fontHeadings: { type: "systemDefault" },
	fontMonospace: { type: "systemDefault" },
	zoomPercentage: 100,
	lineWidth: "Narrow",
	autoSync: true,
	trashRetentionDays: 30,
	enableAi: false,
	aiProvider: "ollama",
	aiProviders: {
		ollama: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
		openAI: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
		openRouter: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
		gemini: {
			modelName: null,
			embeddingsModelName: null,
			apiKeyIsSet: false,
		},
	},
};

function renderTab() {
	return renderWithProviders(<AppearanceTab />, {
		preloadedState: { settings: { settings } },
	});
}

describe("AppearanceTab", () => {
	beforeEach(() => {
		vi.mocked(listSystemFonts).mockResolvedValue([]);
		vi.mocked(useIsSmallScreen).mockReturnValue(false);
	});

	it("Should show the line width control when the screen is not small", async () => {
		// Arrange

		// Act

		renderTab();

		// Assert

		expect(await screen.findByText("Line width")).toBeInTheDocument();
	});

	it("Should hide the line width control when the screen is small", async () => {
		// Arrange

		vi.mocked(useIsSmallScreen).mockReturnValue(true);

		// Act

		renderTab();

		// Assert

		expect(await screen.findByText("Theme")).toBeInTheDocument();
		expect(screen.queryByText("Line width")).not.toBeInTheDocument();
	});

	it("Should save the chosen line width when an option is clicked", async () => {
		// Arrange

		renderTab();

		// Act

		fireEvent.click(await screen.findByText("Wide"));

		// Assert

		expect(updateSettings).toHaveBeenCalledWith(
			expect.objectContaining({ lineWidth: "Wide" }),
		);
	});
});
