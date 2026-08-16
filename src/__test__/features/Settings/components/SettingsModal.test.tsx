import { screen, waitFor } from "@testing-library/react";
import SettingsModal from "../../../../features/Settings/components/SettingsModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import SettingsDto from "../../../../api/settings/dto/settingsDto";
import { listSystemFonts } from "../../../../api/settings/api/settingsApi";

vi.mock(import("../../../../api/settings/api/settingsApi"));

const settings: SettingsDto = {
	baseDatabaseDirectory: "/home/user/amber",
	theme: "Light",
	font: { type: "systemDefault" },
	fontHeadings: { type: "systemDefault" },
	fontMonospace: { type: "systemDefault" },
	zoomPercentage: 100,
	autoSync: true,
	trashRetentionDays: 30,
	enableAi: false,
	aiProvider: "ollama",
	ollama: { modelName: null, embeddingsModelName: null },
	openai: { modelName: null, embeddingsModelName: null },
	openaiApiKeyIsSet: false,
};

function renderModal(opened: boolean) {
	return renderWithProviders(<SettingsModal />, {
		preloadedState: {
			app: {
				startedInitialStateLoading: false,
				importModalOpened: false,
				studyProfileModalOpened: false,
				settingsModalOpened: opened,
				priorityModalOpened: false,
				studySessionSettingsModalOpened: false,
				authModalOpened: false,
				authModalInitialTab: "sign-in",
			},
			settings: { settings },
		},
	});
}

describe("SettingsModal", () => {
	beforeEach(() => {
		vi.mocked(listSystemFonts).mockResolvedValue([]);
	});

	it("Should not render settings content when the modal is closed", () => {
		// Arrange

		// Act

		renderModal(false);

		// Assert

		expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
	});

	it("Should render the appearance controls when the modal is opened", async () => {
		// Arrange

		// Act

		renderModal(true);

		// Assert

		expect(screen.getByText("Appearance")).toBeInTheDocument();
		expect(screen.getByText("Follow system")).toBeInTheDocument();
		await waitFor(() => expect(listSystemFonts).toHaveBeenCalled());
	});
});
