import { fireEvent, waitFor } from "@testing-library/react";
import PdfFloatingMenu from "../../../../../features/ElementViewer/PdfView/components/PdfFloatingMenu";
import {
	createCardAction,
	createExtractAction,
} from "../../../../../stores/elements/elementsActions";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../stores/elements/elementsActions"));

const { useRegistryMock } = vi.hoisted(() => ({
	useRegistryMock: vi.fn(),
}));
vi.mock("@embedpdf/core/react", () => ({
	useRegistry: useRegistryMock,
}));

const { useAnnotationCapabilityMock } = vi.hoisted(() => ({
	useAnnotationCapabilityMock: vi.fn(),
}));
vi.mock("@embedpdf/plugin-annotation/react", () => ({
	useAnnotationCapability: useAnnotationCapabilityMock,
}));

const { useActiveDocumentMock, useDocumentManagerCapabilityMock } = vi.hoisted(
	() => ({
		useActiveDocumentMock: vi.fn(),
		useDocumentManagerCapabilityMock: vi.fn(),
	}),
);
vi.mock("@embedpdf/plugin-document-manager/react", () => ({
	useActiveDocument: useActiveDocumentMock,
	useDocumentManagerCapability: useDocumentManagerCapabilityMock,
}));

const { useSelectionCapabilityMock } = vi.hoisted(() => ({
	useSelectionCapabilityMock: vi.fn(),
}));
vi.mock("@embedpdf/plugin-selection/react", () => ({
	useSelectionCapability: useSelectionCapabilityMock,
}));

const RECT = { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } };
const PLACEMENT = {
	pageIndex: 0,
	rect: RECT,
	spaceAbove: 100,
	spaceBelow: 100,
	suggestTop: false,
	isVisible: true,
};
const DOCUMENT_ID = "doc-1";
const LEARNING_ASSET_ID = "learningAsset-1";

function renderMenu({
	selectedText,
	pageText,
	slice,
}: {
	selectedText: string;
	pageText: string;
	slice: { start: number; count: number };
}) {
	const selectionScope = {
		getHighlightRects: vi.fn(() => ({ 0: [RECT] })),
		getSelectedText: vi.fn(() => ({
			toPromise: () => Promise.resolve([selectedText]),
		})),
		getState: vi.fn(() => ({ slices: { 0: slice } })),
		clear: vi.fn(),
	};
	const annotationScope = {
		getAnnotations: vi.fn(() => []),
		createAnnotation: vi.fn(),
		deleteAnnotations: vi.fn(),
	};
	useSelectionCapabilityMock.mockReturnValue({
		provides: { forDocument: () => selectionScope },
	});
	useAnnotationCapabilityMock.mockReturnValue({
		provides: { forDocument: () => annotationScope },
	});
	useActiveDocumentMock.mockReturnValue({ activeDocumentId: DOCUMENT_ID });
	useDocumentManagerCapabilityMock.mockReturnValue({
		provides: { getActiveDocument: () => ({}) },
	});
	useRegistryMock.mockReturnValue({
		registry: {
			getEngine: () => ({
				extractText: () => ({
					toPromise: () => Promise.resolve(pageText),
				}),
			}),
		},
	});
	vi.mocked(createExtractAction).mockReturnValue(() => Promise.resolve());
	vi.mocked(createCardAction).mockReturnValue(() => Promise.resolve());

	const onHighlightCreated = vi.fn();
	renderWithProviders(
		<PdfFloatingMenu
			rect={RECT}
			menuWrapperProps={{ style: {}, ref: () => {} }}
			selected
			placement={PLACEMENT}
			context={{ type: "selection", pageIndex: 0 }}
			learningAssetId={LEARNING_ASSET_ID}
			onHighlightCreated={onHighlightCreated}
		/>,
	);

	return { selectionScope, annotationScope, onHighlightCreated };
}

describe("PdfFloatingMenu", () => {
	it("Should clear the selection after creating an extract", async () => {
		// Arrange

		const { selectionScope } = renderMenu({
			selectedText: "Selected phrase",
			pageText: "Full page text",
			slice: { start: 0, count: 8 },
		});

		// Act

		fireEvent.click(
			document.querySelector('[aria-label="Create Extract"]')!,
		);

		// Assert

		await waitFor(() => expect(selectionScope.clear).toHaveBeenCalled());
	});

	it("Should clear the selection after creating a cloze card", async () => {
		// Arrange

		const { selectionScope } = renderMenu({
			selectedText: "Selected phrase",
			pageText: "Full page text with Selected phrase",
			slice: { start: 20, count: 15 },
		});

		// Act

		fireEvent.click(document.querySelector('[aria-label="Create Cloze"]')!);

		// Assert

		await waitFor(() => expect(selectionScope.clear).toHaveBeenCalled());
	});
});
