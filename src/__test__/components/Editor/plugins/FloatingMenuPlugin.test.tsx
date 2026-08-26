import { useEffect } from "react";
import { act, screen } from "@testing-library/react";
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
import { useIsCoarsePointer } from "../../../../hooks/useIsCoarsePointer";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../hooks/useIsCoarsePointer"), () => ({
	useIsCoarsePointer: vi.fn().mockReturnValue(false),
}));

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

function setTextAndSelectAll(editor: LexicalEditor, text: string) {
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

	act(() => {
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const textNode = paragraph.getFirstChild();
				if (!$isTextNode(textNode)) return;
				textNode.select(0, textNode.getTextContent().length);
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

	it("Should render an icon-only button when showLabel is not set", () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(
			screen.getByRole("button", { name: "Bold" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Bold")).toBeNull();
	});

	it("Should render a labelled button when showLabel is true", () => {
		// Arrange

		const button = makeButton({ showLabel: true });
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.getByText("Bold")).toBeInTheDocument();
	});

	it("Should not render a button when isVisible returns false for the current selection", () => {
		// Arrange

		const button = makeButton({ isVisible: () => false });
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
	});

	it("Should render a button when isVisible returns true for the current selection", () => {
		// Arrange

		const button = makeButton({ isVisible: () => true });
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(
			screen.getByRole("button", { name: "Bold" }),
		).toBeInTheDocument();
	});

	it("Should mark the button as active when isActive returns true for the current selection", () => {
		// Arrange

		const button = makeButton({ isActive: () => true });
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
			"data-variant",
			"filled",
		);
	});

	it("Should mark the button as inactive when isActive returns false for the current selection", () => {
		// Arrange

		const button = makeButton({ isActive: () => false });
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

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
		setTextAndSelectAll(editor, "Hello world");
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
		setTextAndSelectAll(editor, "Hello world");
		const user = userEvent.setup();

		// Act

		await user.click(screen.getByRole("button", { name: "Bold" }));

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "hidden" });
	});

	it("Should hide the menu when the selection is collapsed", () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");
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

	it("Should show the menu once there is a non-collapsed selection and the editor is focused", () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "visible" });
	});

	it("Should hide the menu when Escape is pressed", async () => {
		// Arrange

		const button = makeButton();
		const { editor } = renderPlugin([button]);
		setTextAndSelectAll(editor, "Hello world");
		expect(getMenuPaper()).toHaveStyle({ visibility: "visible" });
		const user = userEvent.setup();

		// Act

		await user.keyboard("{Escape}");

		// Assert

		expect(getMenuPaper()).toHaveStyle({ visibility: "hidden" });
	});

	it("Should use an upward transform when the pointer is fine", () => {
		// Arrange

		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		const button = makeButton();
		const { editor } = renderPlugin([button]);

		// Act

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(getMenuPaper()).toHaveStyle({ transform: "translateY(-100%)" });
	});

	it("Should evaluate isActive with a RangeSelection reflecting the current selection", () => {
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

		setTextAndSelectAll(editor, "Hello world");

		// Assert

		expect(receivedTextContent).toBe("Hello world");
	});
});
