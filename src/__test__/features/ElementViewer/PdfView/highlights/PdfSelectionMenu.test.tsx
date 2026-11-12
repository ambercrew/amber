import { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import PdfSelectionMenu from "../../../../../features/ElementViewer/PdfView/highlights/PdfSelectionMenu";

const { useSelectionMock, useSelectionStateMock } = vi.hoisted(() => ({
	useSelectionMock: vi.fn(),
	useSelectionStateMock: vi.fn(),
}));
vi.mock("@embedpdf/react/selection", () => ({
	SelectionToken: "selection",
	useSelection: useSelectionMock,
	useSelectionState: useSelectionStateMock,
}));
// Reads the selection the way a subscription would, from the faked capability.
vi.mock("@embedpdf/react/runtime", () => ({
	useSelector: (_token: unknown, select: (capability: unknown) => unknown) =>
		select(useSelectionMock()),
}));
// Shows where it was asked to sit instead of projecting onto a page.
vi.mock("@embedpdf/react/anchored", () => ({
	Anchored: ({
		anchor,
		placement,
		children,
	}: {
		anchor: { bounds: { x: number } };
		placement: string;
		children: ReactNode;
	}) => (
		<div
			data-testid="anchored"
			data-placement={placement}
			data-x={anchor.bounds.x}>
			{children}
		</div>
	),
}));
vi.mock(
	"../../../../../features/ElementViewer/PdfView/highlights/PdfFloatingMenu",
	() => ({ default: () => <div data-testid="menu" /> }),
);
vi.mock(
	"../../../../../features/ElementViewer/readPoint/readPointContext",
	() => ({
		useRecordExtractReadPoint: () => vi.fn(),
	}),
);
vi.mock(
	"../../../../../features/ElementViewer/PdfView/core/pdfCoreContext",
	() => ({
		usePdfCore: () => ({ learningAssetId: "learningAsset-1" }),
	}),
);

const PAGE = { kind: "objectNumber", objectNumber: 7 };
const RANGE = {
	start: { page: PAGE, index: 0 },
	end: { page: PAGE, index: 5 },
};
const START_RECT = { x: 10, y: 0, width: 1, height: 10 };
const END_RECT = { x: 90, y: 20, width: 1, height: 10 };

function renderSelectionMenu({
	direction = "forward",
	settled = true,
}: {
	direction?: "forward" | "backward";
	settled?: boolean;
}) {
	useSelectionStateMock.mockImplementation(
		(select: (state: unknown) => unknown) =>
			select({
				hasSelection: true,
				isSelecting: !settled,
				range: RANGE,
			}),
	);
	useSelectionMock.mockReturnValue({
		getSnapshot: () => ({
			direction,
			start: { page: PAGE, rect: START_RECT },
			end: { page: PAGE, rect: END_RECT },
		}),
	});
	render(<PdfSelectionMenu onConfirmRemoval={vi.fn()} />);
}

describe("PdfSelectionMenu", () => {
	it("Should open below the selection's end when it was dragged forwards", () => {
		// Act

		renderSelectionMenu({ direction: "forward" });

		// Assert

		const anchored = screen.getByTestId("anchored");
		expect(anchored).toHaveAttribute("data-placement", "bottom");
		expect(anchored).toHaveAttribute("data-x", String(END_RECT.x));
	});

	it("Should open above the selection's start when it was dragged backwards", () => {
		// Act

		renderSelectionMenu({ direction: "backward" });

		// Assert

		const anchored = screen.getByTestId("anchored");
		expect(anchored).toHaveAttribute("data-placement", "top");
		expect(anchored).toHaveAttribute("data-x", String(START_RECT.x));
	});

	it("Should not show the menu while the selection is still being dragged", () => {
		// Act

		renderSelectionMenu({ settled: false });

		// Assert

		expect(screen.queryByTestId("menu")).toBeNull();
	});
});
