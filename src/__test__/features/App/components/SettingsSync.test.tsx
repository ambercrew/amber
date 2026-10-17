import { act } from "@testing-library/react";
import { useMantineColorScheme } from "@mantine/core";
import SettingsSync from "../../../../features/App/components/SettingsSync";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { setSettings } from "../../../../stores/settings/settingsReducer";
import SettingsDto from "../../../../api/settings/dto/settingsDto";

vi.mock(import("../../../../features/App/components/systemChrome"), () => ({
	applySystemChrome: vi.fn().mockResolvedValue(undefined),
	applyDocumentColorScheme: vi.fn(),
	syncThemeColorMeta: vi.fn(),
}));

vi.mock(import("../../../../utils/tauriUtils"), () => ({
	isMobile: vi.fn(() => false),
	tryGetCurrentWebView: vi.fn(() => null),
}));

vi.mock(import("../../../../managers/closeRequestedEventManager"), () => ({
	defaultCloseRequestedEventManager: {
		addHandler: vi.fn(),
		removeHandler: vi.fn(),
	} as never,
}));

const setColorScheme = vi.fn();
vi.mock(import("@mantine/core"), async importOriginal => {
	const actual = await importOriginal();
	return {
		...actual,
		useMantineColorScheme: vi.fn(() => ({
			colorScheme: "light" as const,
			setColorScheme,
			clearColorScheme: vi.fn(),
			toggleColorScheme: vi.fn(),
		})),
	};
});

const SETTINGS = {
	theme: "Light",
	lineWidth: "Medium",
	zoomPercentage: 100,
	autoSync: false,
	font: { type: "systemDefault" },
	fontHeadings: { type: "systemDefault" },
	fontMonospace: { type: "systemDefault" },
} as unknown as SettingsDto;

function renderSync() {
	return renderWithProviders(<SettingsSync />, {
		preloadedState: { settings: { settings: SETTINGS } },
	});
}

describe("SettingsSync", () => {
	beforeEach(() => {
		setColorScheme.mockClear();
	});

	it("Should keep transitions running when it changes the color scheme", () => {
		// Arrange & Act

		renderSync();

		// Assert

		expect(useMantineColorScheme).toHaveBeenCalledWith({
			keepTransitions: true,
		});
	});

	it("Should not reapply the color scheme when a setting other than the theme changes", () => {
		// Arrange

		const { store } = renderSync();

		// Act

		act(() => {
			store.dispatch(setSettings({ ...SETTINGS, lineWidth: "Wide" }));
		});

		// Assert

		expect(setColorScheme).not.toHaveBeenCalled();
	});

	it("Should apply the color scheme when the theme changes", () => {
		// Arrange

		const { store } = renderSync();

		// Act

		act(() => {
			store.dispatch(setSettings({ ...SETTINGS, theme: "Dark" }));
		});

		// Assert

		expect(setColorScheme).toHaveBeenCalledWith("dark");
	});
});
