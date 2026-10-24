import { ReactNode, useEffect, useRef } from "react";
import { act, waitFor } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalEditor } from "lexical";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runReadingCommand } from "../../../../commands/readingCommands";
import {
	HIGHLIGHT_CREATED_COMMAND,
	HighlightCreatedPayload,
} from "../../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { MainScrollContext } from "../../../../features/App/context/mainScrollContext";
import LearningAssetView from "../../../../features/ElementViewer/LearningAssetView/LearningAssetView";
import { MetaResponseDto } from "../../../../api/elements/dto/anyElementDto";
import { SearchState } from "../../../../stores/search/searchReducer";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { NO_READ_POINT } from "../../../../features/ElementViewer/readPoint/readingPosition";
import { notifications } from "@mantine/notifications";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const BLOCKS_PER_SPLIT = 3;

const api = vi.hoisted(() => ({
	getLearningAssetSplitManifest: vi.fn(),
	getLearningAssetSplitContent: vi.fn(),
	getLearningAssetSplitTexts: vi.fn(),
	getLearningAssetMarks: vi.fn(),
	setLearningAssetMark: vi.fn(),
	clearLearningAssetMark: vi.fn(),
	updateLearningAsset: vi.fn(),
	updateReadPoint: vi.fn(),
}));
vi.mock("../../../../api/elements/api/elementsApi", () => api);

const editors = vi.hoisted(() => ({
	lexical: new Map<string, LexicalEditor>(),
}));

function CaptureEditor({ id }: { id: string }) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		editors.lexical.set(id, editor);
	}, [editor, id]);
	return null;
}

// A stand-in for the Lexical editor: a root with a few blocks, reported like `RootElementPlugin` does,
// and an empty Lexical editor for the split's plugins.
vi.mock("../../../../features/ElementViewer/ElementEditor", () => ({
	default: function MockElementEditor({
		initialContent,
		onRootElement,
		children,
	}: {
		initialContent: string;
		onRootElement?: (element: HTMLElement | null) => void;
		children?: ReactNode;
	}) {
		const rootRef = useRef<HTMLDivElement>(null);
		useEffect(() => {
			onRootElement?.(rootRef.current);
			return () => onRootElement?.(null);
		}, [onRootElement]);
		return (
			<LexicalComposer
				initialConfig={{
					namespace: initialContent,
					onError: (error: Error) => {
						throw error;
					},
				}}>
				<CaptureEditor id={initialContent} />
				{children}
				<div ref={rootRef} data-testid={initialContent}>
					{Array.from({ length: BLOCKS_PER_SPLIT }, (_, i) => (
						<p key={i} />
					))}
				</div>
			</LexicalComposer>
		);
	},
}));

vi.mock("../../../../features/ElementViewer/ContentOriginPanel", () => ({
	default: () => null,
}));

vi.mock("../../../../stores/sync/managers/syncEventManager", () => ({
	defaultGlobalSyncEventManager: {
		addListener: vi.fn(),
		removeListener: vi.fn(),
	},
	ListenerType: {
		PreSyncStart: "PreSyncStart",
		PreSyncComplete: "PreSyncComplete",
		PostSyncComplete: "PostSyncComplete",
	},
}));

vi.mock("../../../../managers/closeRequestedEventManager", () => ({
	defaultCloseRequestedEventManager: {
		addHandler: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

const SEARCH_CLOSED: SearchState = {
	opened: false,
	query: "",
	caseSensitive: false,
	currentIndex: -1,
	totalMatches: 0,
};

function renderView({
	readPoint = NO_READ_POINT,
	search = SEARCH_CLOSED,
}: { readPoint?: ReadingPosition; search?: SearchState } = {}) {
	const scrollElement = document.createElement("div");
	const scrollTo = vi.fn();
	scrollElement.scrollTo = scrollTo;
	const rendered = renderWithProviders(
		<MainScrollContext value={scrollElement}>
			<LearningAssetView
				learningAssetId="asset"
				readPoint={readPoint}
				meta={{} as MetaResponseDto}
				buttons={[]}
			/>
		</MainScrollContext>,
		{ preloadedState: { search } },
	);
	return { ...rendered, scrollTo };
}

/** The block `block` of split `seq`'s editor, once that split has mounted. */
async function findBlock(
	findByTestId: (id: string) => Promise<HTMLElement>,
	seq: number,
	block: number,
) {
	const root = await findByTestId(`split-${seq}`);
	return root.children[block];
}

describe("LearningAssetView", () => {
	let scrolledInto: Element[];
	const originalClientWidth = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"clientWidth",
	);

	beforeEach(() => {
		scrolledInto = [];
		HTMLElement.prototype.scrollIntoView = function (this: Element) {
			scrolledInto.push(this);
		};
		// Splits only render once the container has a width to size placeholders by.
		Object.defineProperty(HTMLElement.prototype, "clientWidth", {
			configurable: true,
			get: () => 800,
		});
		editors.lexical.clear();
		api.getLearningAssetSplitManifest.mockResolvedValue(
			[0, 1, 2, 3].map(seq => ({
				seq,
				charCount: 100,
				blockCount: BLOCKS_PER_SPLIT,
			})),
		);
		api.getLearningAssetSplitContent.mockImplementation(
			({ seq }: { seq: number }) => Promise.resolve(`split-${seq}`),
		);
		api.getLearningAssetSplitTexts.mockResolvedValue([]);
		api.getLearningAssetMarks.mockResolvedValue([]);
		api.updateReadPoint.mockResolvedValue(undefined);
	});

	afterEach(() => {
		HTMLElement.prototype.scrollIntoView = () => {};
		if (originalClientWidth) {
			Object.defineProperty(
				HTMLElement.prototype,
				"clientWidth",
				originalClientWidth,
			);
		}
	});

	it("Should scroll the saved read point's block into view when the learning asset opens", async () => {
		// Arrange & Act

		const { findByTestId } = renderView({
			readPoint: { split: 2, block: 1 },
		});

		// Assert

		const block = await findBlock(findByTestId, 2, 1);
		await waitFor(() => expect(scrolledInto).toContain(block));
	});

	it("Should flash the saved read point's block when the learning asset opens", async () => {
		// Arrange

		const flashed: Element[] = [];
		HTMLElement.prototype.animate = function (this: Element) {
			flashed.push(this);
			return {} as Animation;
		};

		// Act

		const { findByTestId } = renderView({
			readPoint: { split: 2, block: 1 },
		});

		// Assert

		const block = await findBlock(findByTestId, 2, 1);
		await waitFor(() => expect(flashed).toContain(block));
		delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
	});

	it("Should mount the split and land on the mark when going to a mark in an unmounted split", async () => {
		// Arrange

		api.getLearningAssetMarks.mockResolvedValue([
			{ slot: 2, anchor: { split: 3, block: 2 } },
		]);
		const { findByTestId, queryByTestId } = renderView();
		await findByTestId("split-0");
		await waitFor(() =>
			expect(api.getLearningAssetMarks).toHaveBeenCalled(),
		);
		expect(queryByTestId("split-3")).toBeNull();

		// Act

		await act(async () => {
			runReadingCommand({ type: "go-to-mark", slot: 2 });
		});

		// Assert

		const block = await findBlock(findByTestId, 3, 2);
		await waitFor(() => expect(scrolledInto).toContain(block));
	});

	it("Should save the read point at the extract's end when a highlight is created in a split", async () => {
		// Arrange

		const { findByTestId, unmount } = renderView();
		await findByTestId("split-1");

		// Act

		act(() => {
			editors.lexical
				.get("split-1")
				?.dispatchCommand(HIGHLIGHT_CREATED_COMMAND, {
					endBlockIndex: 2,
				} as HighlightCreatedPayload);
		});
		// Unmounting flushes the debounced save.
		unmount();

		// Assert

		await waitFor(() =>
			expect(api.updateReadPoint).toHaveBeenCalledWith({
				learningAssetId: "asset",
				readPoint: { split: 1, block: 2 },
			}),
		);
	});

	it("Should pre-scroll and mount the split holding the first match when search finds one in an unmounted split", async () => {
		// Arrange

		api.getLearningAssetSplitTexts.mockResolvedValue([
			{ seq: 0, text: "" },
			{ seq: 1, text: "" },
			{ seq: 2, text: "" },
			{ seq: 3, text: "a cat" },
		]);

		// Act

		const { findByTestId, store, scrollTo } = renderView({
			search: { ...SEARCH_CLOSED, opened: true, query: "cat" },
		});

		// Assert

		await waitFor(() =>
			expect(store.getState().search.totalMatches).toBe(1),
		);
		const root = await findByTestId("split-3");
		await waitFor(() => expect(scrolledInto).toContain(root));
		expect(scrollTo).toHaveBeenCalled();
	});

	it("Should tell the reader there's no read point when going to it with none set", async () => {
		// Arrange

		const show = vi.spyOn(notifications, "show");
		const { findByTestId } = renderView();
		await findByTestId("split-0");

		// Act

		act(() => runReadingCommand({ type: "go-to-read-point" }));

		// Assert

		expect(show).toHaveBeenCalledWith({ message: "No read point set" });
	});
});
