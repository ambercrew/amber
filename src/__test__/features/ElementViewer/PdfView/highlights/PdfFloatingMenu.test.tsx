import { ReactNode, useCallback, useMemo, useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import PdfFloatingMenu from "../../../../../features/ElementViewer/PdfView/highlights/PdfFloatingMenu";
import {
	buildHighlightAnnotations,
	PdfHighlightAnnotation,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightAnnotations";
import {
	groupHighlightsByPage,
	PdfHighlightsContext,
} from "../../../../../features/ElementViewer/PdfView/highlights/pdfHighlightsContext";
import {
	createCardAction,
	createExtractAction,
	existsInTree,
} from "../../../../../stores/elements/elementsActions";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";
import SettingsDto from "../../../../../api/settings/dto/settingsDto";
import { CONVERT_SNIPPET_TO_CARDS_PROMPT } from "../../../../../features/Ai/aiPrompts";

vi.mock(import("../../../../../stores/elements/elementsActions"));

const { useSelectionMock, useDocumentsMock } = vi.hoisted(() => ({
	useSelectionMock: vi.fn(),
	useDocumentsMock: vi.fn(),
}));
vi.mock("@embedpdf/react/selection", () => ({
	SelectionToken: "selection",
	useSelection: useSelectionMock,
}));
vi.mock("@embedpdf/react/runtime", () => ({
	useDocuments: useDocumentsMock,
	useSelector: (_token: unknown, select: (capability: unknown) => unknown) =>
		select(useSelectionMock()),
}));

const RECT = { x: 0, y: 0, width: 10, height: 10 };
const LEARNING_ASSET_ID = "learningAsset-1";
// Page refs carry the page index plus this, so the fake documents can map them back.
const PAGE_OBJECT_OFFSET = 100;

function pageRef(pageIndex: number) {
	return {
		kind: "objectNumber" as const,
		objectNumber: PAGE_OBJECT_OFFSET + pageIndex,
	};
}

function buildHighlight(id: string, pageIndex = 0): PdfHighlightAnnotation {
	const [highlight] = buildHighlightAnnotations(
		[{ pageIndex, rect: RECT }],
		"element-1",
		"extract",
		"#FFCD45",
	);
	return { ...highlight, id };
}

/** Holds highlights in state, as `PdfHighlightsProvider` does, without loading or saving them. */
function TestHighlights({
	initial,
	onRemove,
	children,
}: {
	initial: PdfHighlightAnnotation[];
	onRemove: (ids: string[]) => void;
	children: ReactNode;
}) {
	const [highlights, setHighlights] = useState(initial);
	const addHighlights = useCallback(
		(added: PdfHighlightAnnotation[]) =>
			setHighlights(current => [...current, ...added]),
		[],
	);
	const removeHighlights = useCallback(
		(ids: string[]) => {
			onRemove(ids);
			setHighlights(current =>
				current.filter(({ id }) => !ids.includes(id)),
			);
		},
		[onRemove],
	);
	const value = useMemo(
		() => ({
			highlights,
			highlightsByPage: groupHighlightsByPage(highlights),
			addHighlights,
			removeHighlights,
		}),
		[highlights, addHighlights, removeHighlights],
	);
	return (
		<PdfHighlightsContext value={value}>{children}</PdfHighlightsContext>
	);
}

/** Selects `[start, end)` of page 0's `pageText`; the fake reads ranges as string offsets. */
function renderMenu({
	pageText,
	start,
	end,
	highlights = [],
	aiEnabled = false,
}: {
	pageText: string;
	start: number;
	end: number;
	highlights?: PdfHighlightAnnotation[];
	aiEnabled?: boolean;
}) {
	const page = pageRef(0);
	const selection = {
		getSnapshot: vi.fn(() => ({
			pages: [{ page, segments: [{ rect: RECT }] }],
			range: {
				start: { page, index: start },
				end: { page, index: end },
			},
			direction: "forward",
		})),
		readTextInRange: vi.fn(
			(range: { start: { index: number }; end: { index: number } }) =>
				Promise.resolve(
					pageText.slice(range.start.index, range.end.index),
				),
		),
		clear: vi.fn(),
	};
	useSelectionMock.mockReturnValue(selection);
	useDocumentsMock.mockReturnValue({
		getPageIndex: (ref: { objectNumber: number }) =>
			ref.objectNumber - PAGE_OBJECT_OFFSET,
	});
	vi.mocked(createExtractAction).mockReturnValue(() => Promise.resolve(true));
	vi.mocked(createCardAction).mockReturnValue(() => Promise.resolve(true));

	const onHighlightCreated = vi.fn();
	const onConfirmRemoval = vi.fn();
	const onRemove = vi.fn();
	const { store } = renderWithProviders(
		<TestHighlights initial={highlights} onRemove={onRemove}>
			<PdfFloatingMenu
				learningAssetId={LEARNING_ASSET_ID}
				above={false}
				onHighlightCreated={onHighlightCreated}
				onConfirmRemoval={onConfirmRemoval}
			/>
		</TestHighlights>,
		{
			preloadedState: {
				settings: {
					settings: { enableAi: aiEnabled } as SettingsDto,
				},
			},
		},
	);

	return { selection, onHighlightCreated, onConfirmRemoval, onRemove, store };
}

describe("PdfFloatingMenu", () => {
	afterEach(() => {
		vi.mocked(existsInTree).mockReset();
	});

	it("Should attach the selection and ask the AI for cards when Make Cards with AI is clicked", async () => {
		// Arrange

		const { selection, store } = renderMenu({
			pageText: "Selected passage",
			start: 0,
			end: 16,
			aiEnabled: true,
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Make Cards with AI" }),
		);

		// Assert

		await waitFor(() => {
			expect(store.getState().ai.snippets).toEqual([
				expect.objectContaining({ text: "Selected passage" }),
			]);
		});
		expect(store.getState().ai.pendingPrompt).toBe(
			CONVERT_SNIPPET_TO_CARDS_PROMPT,
		);
		expect(selection.clear).toHaveBeenCalledOnce();
	});

	it("Should not offer Make Cards with AI when AI is disabled", async () => {
		// Arrange & Act

		renderMenu({ pageText: "a", start: 0, end: 1 });

		// Assert

		await screen.findByRole("button", { name: "Create Extract" });
		expect(
			screen.queryByRole("button", { name: "Make Cards with AI" }),
		).toBeNull();
	});

	it("Should create an extract from the selected text and highlight it when Create Extract is clicked", async () => {
		// Arrange

		const { selection, onHighlightCreated } = renderMenu({
			pageText: "Before Selected phrase after",
			start: 7,
			end: 22,
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Create Extract" }),
		);

		// Assert

		await waitFor(() => expect(selection.clear).toHaveBeenCalled());
		const dto = vi.mocked(createExtractAction).mock.calls[0][0];
		expect(dto.content).toContain("Selected phrase");
		expect(dto.content).not.toContain("Before");
		expect(onHighlightCreated).toHaveBeenCalledWith(0);
	});

	it("Should keep the selection and add no highlight when creating the extract fails", async () => {
		// Arrange

		const { selection, onHighlightCreated } = renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
		});
		vi.mocked(createExtractAction).mockReturnValue(() =>
			Promise.resolve(false),
		);

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Create Extract" }),
		);

		// Assert

		await waitFor(() => expect(createExtractAction).toHaveBeenCalled());
		await act(async () => {});
		expect(selection.clear).not.toHaveBeenCalled();
		expect(onHighlightCreated).not.toHaveBeenCalled();
	});

	it("Should hide only the selected occurrence when the selected text repeats on the page", async () => {
		// Arrange

		const { selection } = renderMenu({
			pageText: "Selected first, Selected second",
			start: 16,
			end: 24,
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Create Cloze" }),
		);

		// Assert

		await waitFor(() => expect(selection.clear).toHaveBeenCalled());
		const dto = vi.mocked(createCardAction).mock.calls[0][0];
		expect(dto.front).toContain("Selected first, ");
		expect(dto.front).toContain(" second");
		expect(dto.back).toContain("Selected");
	});

	it("Should offer Open and Remove when the selection overlaps a highlight", async () => {
		// Arrange & Act

		renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
			highlights: [buildHighlight("h1")],
		});

		// Assert

		expect(
			await screen.findByRole("button", { name: "Open" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove Highlight" }),
		).toBeInTheDocument();
	});

	it("Should not offer Open or Remove when the highlight is on another page", async () => {
		// Arrange & Act

		renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
			highlights: [buildHighlight("h1", 1)],
		});

		// Assert

		await screen.findByRole("button", { name: "Create Extract" });
		expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Remove Highlight" }),
		).toBeNull();
	});

	it("Should delete the highlight without asking when its element no longer exists", async () => {
		// Arrange

		const { onRemove, onConfirmRemoval } = renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
			highlights: [buildHighlight("h1")],
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Remove Highlight" }),
		);

		// Assert

		expect(onRemove).toHaveBeenCalledWith(["h1"]);
		expect(onConfirmRemoval).not.toHaveBeenCalled();
	});

	it("Should hide the highlight actions when the highlight is removed", async () => {
		// Arrange

		renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
			highlights: [buildHighlight("h1")],
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Remove Highlight" }),
		);

		// Assert

		await waitFor(() =>
			expect(
				screen.queryByRole("button", { name: "Remove Highlight" }),
			).toBeNull(),
		);
		expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
	});

	it("Should ask to confirm instead of deleting when the highlight's element still exists", async () => {
		// Arrange

		vi.mocked(existsInTree).mockReturnValue(true);
		const { onRemove, onConfirmRemoval } = renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
			highlights: [buildHighlight("h1")],
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Remove Highlight" }),
		);

		// Assert

		expect(onConfirmRemoval).toHaveBeenCalledWith({
			highlightIds: ["h1"],
			elementIds: [{ type: "extract", id: "element-1" }],
		});
		expect(onRemove).not.toHaveBeenCalled();
	});

	it("Should remove the element's highlights on other pages too when its highlight is removed", async () => {
		// Arrange

		vi.mocked(existsInTree).mockReturnValue(true);
		const { onConfirmRemoval } = renderMenu({
			pageText: "Selected phrase",
			start: 0,
			end: 8,
			highlights: [buildHighlight("h1"), buildHighlight("h2", 1)],
		});

		// Act

		fireEvent.click(
			await screen.findByRole("button", { name: "Remove Highlight" }),
		);

		// Assert

		expect(onConfirmRemoval).toHaveBeenCalledWith(
			expect.objectContaining({ highlightIds: ["h1", "h2"] }),
		);
	});
});
