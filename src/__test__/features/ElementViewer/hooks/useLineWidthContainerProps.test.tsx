import { PropsWithChildren } from "react";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { useLineWidthContainerProps } from "../../../../features/ElementViewer/hooks/useLineWidthContainerProps";
import SettingsDto, {
	LineWidth,
} from "../../../../api/settings/dto/settingsDto";
import { setupStore } from "../../../../stores/store";

function renderWithLineWidth(lineWidth: LineWidth | null) {
	const settings = lineWidth === null ? null : ({ lineWidth } as SettingsDto);
	const store = setupStore({ settings: { settings } });
	return renderHook(() => useLineWidthContainerProps(), {
		wrapper: ({ children }: PropsWithChildren) => (
			<Provider store={store}>{children}</Provider>
		),
	});
}

describe("useLineWidthContainerProps", () => {
	it.each([
		["Narrow", "sm"],
		["Medium", "md"],
		["Wide", "lg"],
	] as const)(
		"Should return the matching container size when the line width is %s",
		(lineWidth, expected) => {
			// Arrange

			// Act

			const { result } = renderWithLineWidth(lineWidth);

			// Assert

			expect(result.current.size).toBe(expected);
		},
	);

	it("Should fall back to the narrow size when settings are not loaded", () => {
		// Arrange

		// Act

		const { result } = renderWithLineWidth(null);

		// Assert

		expect(result.current.size).toBe("sm");
	});
});
