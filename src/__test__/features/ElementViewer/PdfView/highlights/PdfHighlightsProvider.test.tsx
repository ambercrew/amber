import { act, render, waitFor } from "@testing-library/react";
import PdfHighlightsProvider from "../../../../../features/ElementViewer/PdfView/highlights/PdfHighlightsProvider";
import {
	buildHighlightAnnotations,
	PdfHighlightAnnotation,
	serializeHighlights,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightAnnotations";
import {
	PdfHighlightsValue,
	usePdfHighlights,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightsContext";

const { getPdfHighlightsMock, updatePdfHighlightsMock, notificationsShowMock } =
	vi.hoisted(() => ({
		getPdfHighlightsMock: vi.fn(),
		updatePdfHighlightsMock: vi.fn(),
		notificationsShowMock: vi.fn(),
	}));
vi.mock("../../../../../api/elements/api/elementsApi", () => ({
	getPdfHighlights: getPdfHighlightsMock,
	updatePdfHighlights: updatePdfHighlightsMock,
}));
vi.mock("@mantine/notifications", () => ({
	notifications: { show: notificationsShowMock },
}));

const LEARNING_ASSET_ID = "learningAsset-1";

function highlight(elementId: string, pageIndex = 0): PdfHighlightAnnotation {
	return buildHighlightAnnotations(
		[{ pageIndex, rect: { x: 0, y: 0, width: 10, height: 10 } }],
		elementId,
		"extract",
		"#FFCD45",
	)[0];
}

/** Renders the provider and hands back its latest value. */
function renderProvider() {
	const latest: { current: PdfHighlightsValue | null } = { current: null };
	function Probe() {
		latest.current = usePdfHighlights();
		return null;
	}
	render(
		<PdfHighlightsProvider learningAssetId={LEARNING_ASSET_ID}>
			<Probe />
		</PdfHighlightsProvider>,
	);
	return latest;
}

function savedHighlights(): PdfHighlightAnnotation[] {
	const { highlightsJson } = updatePdfHighlightsMock.mock.lastCall![0] as {
		highlightsJson: string;
	};
	return (
		JSON.parse(highlightsJson) as { annotation: PdfHighlightAnnotation }[]
	).map(({ annotation }) => annotation);
}

describe("PdfHighlightsProvider", () => {
	beforeEach(() => {
		updatePdfHighlightsMock.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Should provide the learning asset's saved highlights once they load", async () => {
		// Arrange

		const saved = highlight("element-1");
		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: serializeHighlights([saved]),
		});

		// Act

		const latest = renderProvider();

		// Assert

		await waitFor(() =>
			expect(latest.current?.highlights).toEqual([saved]),
		);
		expect(getPdfHighlightsMock).toHaveBeenCalledWith(LEARNING_ASSET_ID);
	});

	it("Should not save when nothing changed after loading", async () => {
		// Arrange

		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: serializeHighlights([highlight("element-1")]),
		});

		// Act

		const latest = renderProvider();
		await waitFor(() => expect(latest.current?.highlights).toHaveLength(1));

		// Assert

		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();
	});

	it("Should save every highlight when one is added", async () => {
		// Arrange

		const saved = highlight("element-1");
		const added = highlight("element-2", 3);
		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: serializeHighlights([saved]),
		});
		const latest = renderProvider();
		await waitFor(() => expect(latest.current?.highlights).toHaveLength(1));

		// Act

		act(() => latest.current!.addHighlights([added]));

		// Assert

		await waitFor(() => expect(updatePdfHighlightsMock).toHaveBeenCalled());
		expect(savedHighlights()).toEqual([saved, added]);
	});

	it("Should save without the removed highlights when some are removed", async () => {
		// Arrange

		const kept = highlight("element-1");
		const removed = highlight("element-2");
		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: serializeHighlights([kept, removed]),
		});
		const latest = renderProvider();
		await waitFor(() => expect(latest.current?.highlights).toHaveLength(2));

		// Act

		act(() => latest.current!.removeHighlights([removed.id]));

		// Assert

		await waitFor(() => expect(updatePdfHighlightsMock).toHaveBeenCalled());
		expect(savedHighlights()).toEqual([kept]);
	});

	it("Should keep and save a highlight added before the saved ones finished loading", async () => {
		// Arrange

		const saved = highlight("element-1");
		const added = highlight("element-2");
		let finishLoading: (value: {
			highlightsJson: string;
		}) => void = () => {};
		getPdfHighlightsMock.mockReturnValue(
			new Promise(resolve => {
				finishLoading = resolve;
			}),
		);
		const latest = renderProvider();
		act(() => latest.current!.addHighlights([added]));
		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();

		// Act

		await act(async () =>
			finishLoading({ highlightsJson: serializeHighlights([saved]) }),
		);

		// Assert

		await waitFor(() => expect(updatePdfHighlightsMock).toHaveBeenCalled());
		expect(savedHighlights()).toEqual([saved, added]);
	});

	it("Should never save and should warn when the saved highlights fail to load", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => {});
		getPdfHighlightsMock.mockRejectedValue(new Error("disk on fire"));
		const latest = renderProvider();
		await waitFor(() => expect(notificationsShowMock).toHaveBeenCalled());

		// Act

		act(() => latest.current!.addHighlights([highlight("element-1")]));

		// Assert

		expect(latest.current?.highlights).toHaveLength(1);
		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();
	});
});
