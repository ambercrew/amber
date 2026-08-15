import { screen } from "@testing-library/react";
import SettingsModal from "../../../../features/Settings/components/SettingsModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import SettingsDto from "../../../../api/settings/dto/settingsDto";

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
			},
			settings: { settings },
		},
	});
}

describe("SettingsModal", () => {
	it("Should not render settings content when the modal is closed", () => {
		// Arrange

		// Act

		renderModal(false);

		// Assert

		expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
	});

	it("Should render the appearance controls when the modal is opened", () => {
		// Arrange

		// Act

		renderModal(true);

		// Assert

		expect(screen.getByText("Appearance")).toBeInTheDocument();
		expect(screen.getByText("Follow system")).toBeInTheDocument();
	});
});
