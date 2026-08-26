import { screen } from "@testing-library/react";
import { Button } from "@mantine/core";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useIsCoarsePointer } from "../../../hooks/useIsCoarsePointer";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

vi.mock(import("../../../hooks/useIsCoarsePointer"));

// The tooltip is rendered `opened` because floating-ui's hover handling needs
// a layout engine jsdom doesn't have, so hovering never opens it here.
function renderTooltip(props: { label?: string; shortcut?: string }) {
	return renderWithProviders(
		<AppTooltip opened {...props}>
			<Button>Palette</Button>
		</AppTooltip>,
	);
}

function getTooltip() {
	return screen.getByRole("tooltip");
}

describe("AppTooltip", () => {
	it("Should append the formatted shortcut to the label when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		renderTooltip({ label: "Open command palette", shortcut: "mod+K" });

		// Assert

		expect(getTooltip()).toHaveTextContent(
			"Open command palette (Ctrl + K)",
		);
	});

	it("Should render the shortcut alone when there is no label", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);

		// Act

		renderTooltip({ shortcut: "mod+K" });

		// Assert

		expect(getTooltip()).toHaveTextContent("(Ctrl + K)");
	});

	it("Should render the target without a tooltip when only a shortcut is given and the pointer is coarse", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);

		// Act

		renderTooltip({ shortcut: "mod+K" });

		// Assert

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Palette" }),
		).toBeInTheDocument();
	});

	it("Should leave the shortcut out of the label when the pointer is coarse", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);

		// Act

		renderTooltip({ label: "Open command palette", shortcut: "mod+K" });

		// Assert

		expect(getTooltip()).toHaveTextContent("Open command palette");
		expect(getTooltip()).not.toHaveTextContent("Ctrl");
	});
});
