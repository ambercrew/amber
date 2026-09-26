import { fireEvent, waitFor } from "@testing-library/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";
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

interface TestHighlight {
	commitState: "synced" | "deleted";
	object: {
		id: string;
		type: PdfAnnotationSubtype;
		pageIndex: number;
		rect: typeof RECT;
		segmentRects: (typeof RECT)[];
		custom: { elementId: string; elementType: "extract" | "card" };
	};
}

/** A tracked highlight annotation as the plugin keeps it in `byUid`. */
function buildHighlight({
	id,
	commitState = "synced",
}: {
	id: string;
	commitState?: TestHighlight["commitState"];
}): TestHighlight {
	return {
		commitState,
		object: {
			id,
			type: PdfAnnotationSubtype.HIGHLIGHT,
			pageIndex: 0,
			rect: RECT,
			segmentRects: [RECT],
			custom: { elementId: "element-1", elementType: "extract" },
		},
	};
}

function renderMenu({
	selectedText,
	pageText,
	slice,
	highlights = [],
}: {
	selectedText: string;
	pageText: string;
	slice: { start: number; count: number };
	highlights?: TestHighlight[];
}) {
	const selectionScope = {
		getHighlightRects: vi.fn(() => ({ 0: [RECT] })),
		getSelectedText: vi.fn(() => ({
			toPromise: () => Promise.resolve([selectedText]),
		})),
		getState: vi.fn(() => ({ slices: { 0: slice } })),
		clear: vi.fn(),
	};
	let state = {
		byUid: Object.fromEntries(
			highlights.map(highlight => [highlight.object.id, highlight]),
		) as Record<string, TestHighlight>,
	};
	const stateListeners = new Set<(state: unknown) => void>();
	const annotationScope = {
		getState: vi.fn(() => state),
		onStateChange: vi.fn((listener: (state: unknown) => void) => {
			stateListeners.add(listener);
			return () => stateListeners.delete(listener);
		}),
		createAnnotation: vi.fn(),
		deleteAnnotations: vi.fn(
			(toDelete: { pageIndex: number; id: string }[]) => {
				// Soft delete: a new `byUid` with the entry marked `deleted`.
				const byUid = { ...state.byUid };
				for (const { id } of toDelete) {
					const tracked = byUid[id];
					if (tracked)
						byUid[id] = { ...tracked, commitState: "deleted" };
				}
				state = { byUid };
				for (const listener of stateListeners) listener(state);
			},
		),
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

	it("Should offer Open and Remove when the selection overlaps a highlight", () => {
		// Arrange

		const highlight = buildHighlight({ id: "h1" });

		// Act

		renderMenu({
			selectedText: "Selected phrase",
			pageText: "Full page text",
			slice: { start: 0, count: 8 },
			highlights: [highlight],
		});

		// Assert

		expect(document.querySelector('[aria-label="Open"]')).not.toBeNull();
		expect(
			document.querySelector('[aria-label="Remove Highlight"]'),
		).not.toBeNull();
	});

	it("Should not offer Open or Remove when the overlapping highlight is soft-deleted", () => {
		// Arrange

		const deletedHighlight = buildHighlight({
			id: "h1",
			commitState: "deleted",
		});

		// Act

		renderMenu({
			selectedText: "Selected phrase",
			pageText: "Full page text",
			slice: { start: 0, count: 8 },
			highlights: [deletedHighlight],
		});

		// Assert

		expect(document.querySelector('[aria-label="Open"]')).toBeNull();
		expect(
			document.querySelector('[aria-label="Remove Highlight"]'),
		).toBeNull();
	});

	it("Should delete the highlight when Remove Highlight is clicked", () => {
		// Arrange

		const { annotationScope } = renderMenu({
			selectedText: "Selected phrase",
			pageText: "Full page text",
			slice: { start: 0, count: 8 },
			highlights: [buildHighlight({ id: "h1" })],
		});

		// Act

		fireEvent.click(
			document.querySelector('[aria-label="Remove Highlight"]')!,
		);

		// Assert

		expect(annotationScope.deleteAnnotations).toHaveBeenCalledWith([
			{ pageIndex: 0, id: "h1" },
		]);
	});

	it("Should hide the highlight actions when the highlight is removed", async () => {
		// Arrange

		renderMenu({
			selectedText: "Selected phrase",
			pageText: "Full page text",
			slice: { start: 0, count: 8 },
			highlights: [buildHighlight({ id: "h1" })],
		});

		// Act

		fireEvent.click(
			document.querySelector('[aria-label="Remove Highlight"]')!,
		);

		// Assert

		await waitFor(() =>
			expect(
				document.querySelector('[aria-label="Remove Highlight"]'),
			).toBeNull(),
		);
		expect(document.querySelector('[aria-label="Open"]')).toBeNull();
	});
});
