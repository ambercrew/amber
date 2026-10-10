import { useEffect } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LexicalEditor } from "lexical";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { ImagePlugin } from "../../../../components/Editor/plugins/ImagePlugin/ImagePlugin";
import { ImageNode } from "../../../../components/Editor/plugins/ImagePlugin/ImageNode";
import { INSERT_IMAGE_COMMAND } from "../../../../components/Editor/plugins/ImagePlugin/imageCommands";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { createAsset } from "../../../../api/assets/api/assetsApi";

vi.mock(import("@tauri-apps/plugin-clipboard-manager"), () => ({
	readImage: vi.fn(),
}));
vi.mock(import("../../../../api/assets/api/assetsApi"));

function EditorCapture({
	onReady,
}: {
	onReady: (editor: LexicalEditor) => void;
}) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => onReady(editor), [editor, onReady]);
	return null;
}

function renderEditor() {
	let capturedEditor: LexicalEditor | null = null;

	renderWithProviders(
		<LexicalComposer
			initialConfig={{
				namespace: "test",
				nodes: [ImageNode],
				onError: error => {
					throw error;
				},
			}}>
			<RichTextPlugin
				contentEditable={<ContentEditable aria-label="editor" />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<ImagePlugin />
			<EditorCapture
				onReady={editor => {
					capturedEditor = editor;
				}}
			/>
		</LexicalComposer>,
	);

	if (!capturedEditor) throw new Error("Editor was not captured");
	return capturedEditor as LexicalEditor;
}

const ASSET_SRC = `amber-asset:${"a".repeat(64)}`;

describe("ImagePlugin", () => {
	beforeEach(() => {
		vi.mocked(createAsset).mockResolvedValue({
			id: "a".repeat(64),
			src: ASSET_SRC,
		});
	});

	it("Should insert an image into the DOM when INSERT_IMAGE_COMMAND is dispatched", async () => {
		// Arrange

		const editor = renderEditor();

		// Act

		act(() => {
			editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
				src: "data:image/png;base64,iVBORw0KGgo=",
				altText: "a cat",
			});
		});

		// Assert

		const img = await waitFor(() => {
			const el = editor.getRootElement()?.querySelector("img");
			if (!el) throw new Error("Image not yet rendered");
			return el;
		});
		expect(img).toHaveAttribute(
			"src",
			"data:image/png;base64,iVBORw0KGgo=",
		);
		expect(img).toHaveAttribute("alt", "a cat");
	});

	it("Should insert an image into the DOM when an image file is dropped", async () => {
		// Arrange

		const editor = renderEditor();
		const file = new File(["fake-bytes"], "photo.png", {
			type: "image/png",
		});

		// Act

		act(() => {
			editor.dispatchCommand(DRAG_DROP_PASTE, [file]);
		});

		// Assert

		const img = await waitFor(() => {
			const el = editor.getRootElement()?.querySelector("img");
			if (!el) throw new Error("Image not yet rendered");
			return el;
		});
		expect(img).toHaveAttribute("alt", "photo.png");
		expect(JSON.stringify(editor.getEditorState().toJSON())).toContain(
			ASSET_SRC,
		);
	});

	it("Should insert an image into the DOM when an image is pasted via clipboardData.items", async () => {
		// Arrange

		const editor = renderEditor();
		const file = new File(["fake-bytes"], "screenshot.png", {
			type: "image/png",
		});
		const item = {
			kind: "file",
			type: "image/png",
			getAsFile: () => file,
		} as DataTransferItem;
		const pasteEvent = new Event("paste", {
			bubbles: true,
			cancelable: true,
		});
		Object.defineProperty(pasteEvent, "clipboardData", {
			value: { items: [item], types: ["Files"], files: [file] },
		});

		// Act

		act(() => {
			editor.getRootElement()?.dispatchEvent(pasteEvent);
		});

		// Assert

		const img = await waitFor(() => {
			const el = editor.getRootElement()?.querySelector("img");
			if (!el) throw new Error("Image not yet rendered");
			return el;
		});
		expect(img).toHaveAttribute("alt", "screenshot.png");
	});

	it("Should fall back to the native clipboard when the paste only exposes a text/uri-list item", async () => {
		// Arrange

		// jsdom doesn't implement canvas 2D contexts or ImageData; stub them
		// so the RGBA-to-PNG conversion has something to call.
		vi.stubGlobal(
			"ImageData",
			class {
				constructor(
					public data: Uint8ClampedArray,
					public width: number,
					public height: number,
				) {}
			},
		);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			putImageData: vi.fn(),
		} as unknown as CanvasRenderingContext2D);
		vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
			"data:image/png;base64,mocked",
		);
		vi.mocked(readImage).mockResolvedValue({
			rgba: () => Promise.resolve(new Uint8Array([255, 0, 0, 255])),
			size: () => Promise.resolve({ width: 1, height: 1 }),
		} as unknown as Awaited<ReturnType<typeof readImage>>);

		const editor = renderEditor();
		const uriListItem = {
			kind: "string",
			type: "text/uri-list",
			getAsFile: () => null,
		} as DataTransferItem;
		const pasteEvent = new Event("paste", {
			bubbles: true,
			cancelable: true,
		});
		Object.defineProperty(pasteEvent, "clipboardData", {
			value: {
				items: [uriListItem],
				types: ["text/uri-list"],
				files: [],
			},
		});

		// Act

		act(() => {
			editor.getRootElement()?.dispatchEvent(pasteEvent);
		});

		// Assert

		await waitFor(() => {
			if (!editor.getRootElement()?.querySelector("img"))
				throw new Error("Image not yet rendered");
		});
		expect(createAsset).toHaveBeenCalledWith({
			dataUri: "data:image/png;base64,mocked",
		});
		expect(JSON.stringify(editor.getEditorState().toJSON())).toContain(
			ASSET_SRC,
		);

		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("Should show the error and insert nothing when storing a dropped image fails", async () => {
		// Arrange

		vi.mocked(createAsset).mockRejectedValue(
			"The image could not be read.",
		);
		const editor = renderEditor();
		const file = new File(["fake-bytes"], "photo.png", {
			type: "image/png",
		});

		// Act

		act(() => {
			editor.dispatchCommand(DRAG_DROP_PASTE, [file]);
		});

		// Assert

		expect(
			await screen.findByText("The image could not be read."),
		).toBeInTheDocument();
		expect(editor.getRootElement()?.querySelector("img")).toBeNull();
	});
});
