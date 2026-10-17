import { useEffect } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isElementNode,
	$isTextNode,
	LexicalEditor,
} from "lexical";
import {
	FloatingMenuButton,
	FloatingMenuPlugin,
} from "../../../../components/Editor/plugins/FloatingMenuPlugin";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { computePosition } from "@floating-ui/dom";
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";

vi.mock(import("@floating-ui/dom"), async importOriginal => {
	const actual = await importOriginal();
	return { ...actual, computePosition: vi.fn(actual.computePosition) };
});

vi.mock(import("../../../../hooks/useIsCoarsePointer"), () => ({
	useIsCoarsePointer: vi.fn().mockReturnValue(false),
}));

// jsdom lays nothing out and has no `Range.getClientRects`, so the menu anchors to an empty rect.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

function TestIcon() {
	return <span data-testid="test-icon" />;
}

function makeButton(
	overrides: Partial<FloatingMenuButton> = {},
): FloatingMenuButton {
	return {
		name: "bold",
		title: "Bold",
		Icon: TestIcon,
		onClick: vi.fn(),
		isActive: () => false,
		...overrides,
	};
}

function EditorCapture({
	onReady,
}: {
	onReady: (editor: LexicalEditor) => void;
}) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => onReady(editor), [editor, onReady]);
	return null;
}

function renderPlugin(buttons: FloatingMenuButton[]) {
	let capturedEditor: LexicalEditor | null = null;

	const utils = renderWithProviders(
		<LexicalComposer
			initialConfig={{
				namespace: "test",
				onError: error => {
					throw error;
				},
			}}>
			<RichTextPlugin
				contentEditable={<ContentEditable aria-label="editor" />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<FloatingMenuPlugin buttons={buttons} />
			<EditorCapture
				onReady={editor => {
					capturedEditor = editor;
				}}
			/>
		</LexicalComposer>,
	);

	if (!capturedEditor) throw new Error("Editor was not captured");

	return { ...utils, editor: capturedEditor as LexicalEditor };
}

async function setTextAndSelectAll(
	editor: LexicalEditor,
	text: string,
	backward = false,
) {
	act(() => {
		editor.update(
			() => {
				const root = $getRoot();
				root.clear();
				const paragraph = $createParagraphNode();
				paragraph.append($createTextNode(text));
				root.append(paragraph);
			},
			{ discrete: true },
		);
	});

	act(() => {
		editor.getRootElement()?.focus();
	});

	// Floating UI positions the menu asynchronously.
	await act(async () => {
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const textNode = paragraph.getFirstChild();
				if (!$isTextNode(textNode)) return;
				const length = textNode.getTextContent().length;
				if (backward) textNode.select(length, 0);
				else textNode.select(0, length);
			},
			{ discrete: true },
		);
	});
}

function getMenuPaper() {
	const paper = document.querySelector(".mantine-Paper-root");
	if (!(paper instanceof HTMLElement))
		throw new Error("Menu paper not found");
	return paper;
}

describe("FloatingMenuPlugin", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"requestAnimationFrame",
			(callback: FrameRequestCallback) => {
				callback(0);
				return 0;
			},
		);
		// jsdom does not implement Range.getBoundingClientRect
		Range.prototype.getBoundingClientRect = () =>
			({
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				toJSON: () => "",
			}) as DOMRect;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("Should render an icon-only button when showLabel is not set", async () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(
			screen.getByRole("button", { name: "Bold" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Bold")).toBeNull();
	});

	it("Should render a labelled button when showLabel is true", async () => {
		// Arrange

		const button = makeButton({ showLabel: true });
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.getByText("Bold")).toBeInTheDocument();
	});

	it("Should not render a button when isVisible returns false for the current selection", async () => {
		// Arrange

		const button = makeButton({ isVisible: () => false });
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
	});

	it("Should render a button when isVisible returns true for the current selection", async () => {
		// Arrange

		const button = makeButton({ isVisible: () => true });
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(
			screen.getByRole("button", { name: "Bold" }),
		).toBeInTheDocument();
	});

	it("Should mark the button as active when isActive returns true for the current selection", async () => {
		// Arrange

		const button = makeButton({ isActive: () => true });
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
			"data-variant",
			"filled",
		);
	});

	it("Should mark the button as inactive when isActive returns false for the current selection", async () => {
		// Arrange

		const button = makeButton({ isActive: () => false });
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
			"data-variant",
			"subtle",
		);
	});

	it("Should call onClick with the editor and the current active state when the button is clicked", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const onClick = vi.fn();
		const button = makeButton({ onClick, isActive: () => true });
		const { editor } = renderPlugin([button]);
		await setTextAndSelectAll(editor, "Hello world");
		const user = userEvent.setup();

		// Act

		await user.click(screen.getByRole("button", { name: "Bold" }));

		// Assert

		expect(onClick).toHaveBeenCalledWith(
			editor,
			true,
			expect.any(Function),
		);
	});

	it("Should hide the menu when the button calls the closeMenu callback", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const button = makeButton({
			onClick: (_editor, _isActive, closeMenu) => closeMenu(),
		});
		const { editor } = renderPlugin([button]);
		await setTextAndSelectAll(editor, "Hello world");
		const user = userEvent.setup();

		// Act

		await user.click(screen.getByRole("button", { name: "Bold" }));

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "hidden" });
	});

	it("Should hide the menu when the selection is collapsed", async () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");
		act(() => {
			editor.update(
				() => {
					const paragraph = $getRoot().getFirstChild();
					if (!$isElementNode(paragraph)) return;
					const textNode = paragraph.getFirstChild();
					if (!$isTextNode(textNode)) return;
					textNode.select(0, 0);
				},
				{ discrete: true },
			);
		});

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "hidden" });
	});

	it("Should show the menu once there is a non-collapsed selection and the editor is focused", async () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "visible" });
	});

	it("Should hide the menu when Escape is pressed", async () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);
		await setTextAndSelectAll(editor, "Hello world");
		expect(getMenuPaper()).toHaveStyle({ visibility: "visible" });
		const user = userEvent.setup();

		// Act

		await user.keyboard("{Escape}");

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "hidden" });
	});

	function requestedPlacement() {
		return vi.mocked(computePosition).mock.lastCall?.[2]?.placement;
	}

	it("Should open below where a forward selection ended and grow downwards", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		const { editor } = renderPlugin([makeButton()]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(requestedPlacement()).toBe("bottom");
		expect(getMenuPaper()).toHaveStyle({
			transform: "scale(1)",
			transformOrigin: "top center",
		});
	});

	it("Should open above where a backward selection ended", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		const { editor } = renderPlugin([makeButton()]);

		// Act

		await setTextAndSelectAll(editor, "Hello world", true);

		// Assert

		expect(requestedPlacement()).toBe("top");
	});

	it("Should open above the selection on touch even when it was made forwards", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(true);
		const { editor } = renderPlugin([makeButton()]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(requestedPlacement()).toBe("top");
	});

	it("Should grow upwards from where Floating UI placed it when it flips above", async () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		vi.mocked(computePosition).mockResolvedValueOnce({
			x: 12,
			y: 40,
			placement: "top",
			strategy: "absolute",
			middlewareData: {},
		});
		const { editor } = renderPlugin([makeButton()]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(getMenuPaper()).toHaveStyle({
			top: "40px",
			left: "12px",
			transformOrigin: "bottom center",
			visibility: "visible",
		});
	});

	function selectRange(editor: LexicalEditor, start: number, end: number) {
		act(() => {
			editor.update(
				() => {
					const paragraph = $getRoot().getFirstChild();
					if (!$isElementNode(paragraph)) return;
					const textNode = paragraph.getFirstChild();
					if (!$isTextNode(textNode)) return;
					textNode.select(start, end);
				},
				{ discrete: true },
			);
		});
	}

	it("Should fade out where it was instead of jumping when the selection is collapsed", async () => {
		// Arrange

		vi.mocked(computePosition).mockResolvedValueOnce({
			x: 12,
			y: 40,
			placement: "bottom",
			strategy: "absolute",
			middlewareData: {},
		});
		const { editor } = renderPlugin([makeButton()]);
		await setTextAndSelectAll(editor, "Hello world");

		// Act

		selectRange(editor, 0, 0);

		// Assert

		expect(getMenuPaper()).toHaveStyle({
			top: "40px",
			left: "12px",
			visibility: "hidden",
		});
	});

	it("Should stay open while a triple click re-selects the paragraph", async () => {
		// Arrange

		const { editor } = renderPlugin([makeButton()]);
		await setTextAndSelectAll(editor, "Hello world");
		selectRange(editor, 0, 5);

		// Act

		fireEvent.pointerDown(document);
		fireEvent.mouseDown(document, { detail: 3 });
		selectRange(editor, 0, 11);

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "visible" });
	});

	it("Should hide while a single click starts a new selection", async () => {
		// Arrange

		const { editor } = renderPlugin([makeButton()]);
		await setTextAndSelectAll(editor, "Hello world");

		// Act

		fireEvent.pointerDown(document);
		fireEvent.mouseDown(document, { detail: 1 });
		selectRange(editor, 0, 5);

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "hidden" });
	});

	it("Should rest in Mantine's pop out state when there is no selection", () => {
		// Arrange & Act

		renderPlugin([makeButton()]);

		// Assert

		expect(getMenuPaper()).toHaveStyle({
			opacity: "0",
			transform: "scale(.9) translateY(10px)",
		});
	});

	it("Should evaluate isActive with a RangeSelection reflecting the current selection", async () => {
		// Arrange

		let receivedTextContent: string | null = null;
		const button = makeButton({
			isActive: selection => {
				receivedTextContent = selection.getTextContent();
				return false;
			},
		});
		const { editor } = renderPlugin([button]);

		// Act

		await setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(receivedTextContent).toBe("Hello world");
	});
});
