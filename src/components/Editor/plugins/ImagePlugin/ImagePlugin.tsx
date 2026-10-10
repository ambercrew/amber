import { useEffect } from "react";
import { Alert } from "@mantine/core";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import {
	isMimeType,
	mediaFileReader,
	$wrapNodeInElement,
} from "@lexical/utils";
import {
	$insertNodes,
	$isRootOrShadowRoot,
	COMMAND_PRIORITY_EDITOR,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	$createParagraphNode,
	type LexicalEditor,
	mergeRegister,
	PASTE_COMMAND,
} from "lexical";
import { $createImageNode, ImageNode } from "./ImageNode";
import { INSERT_IMAGE_COMMAND } from "./imageCommands";
import { createAsset } from "../../../../api/assets/api/assetsApi";
import useApi, { type CallApiFn } from "../../../../hooks/useApi";

const ACCEPTABLE_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/heic",
	"image/heif",
];

export function ImagePlugin() {
	const [editor] = useLexicalComposerContext();
	const { errorMessage, callApi, clearErrorMessage } = useApi();

	useEffect(() => {
		if (!editor.hasNodes([ImageNode])) {
			throw new Error("ImagePlugin: ImageNode not registered in editor");
		}

		return mergeRegister(
			editor.registerCommand(
				INSERT_IMAGE_COMMAND,
				payload => {
					const imageNode = $createImageNode(payload);
					$insertNodes([imageNode]);
					if ($isRootOrShadowRoot(imageNode.getParentOrThrow())) {
						$wrapNodeInElement(
							imageNode,
							$createParagraphNode,
						).selectEnd();
					}
					return true;
				},
				COMMAND_PRIORITY_EDITOR,
			),
			editor.registerCommand(
				PASTE_COMMAND,
				event => {
					if (!("clipboardData" in event)) return false;
					const items = (event as ClipboardEvent).clipboardData
						?.items;
					if (!items) return false;

					const files = getPastedImageFiles(items);
					if (files.length > 0) {
						event.preventDefault();
						void insertImageFiles(editor, callApi, files);
						return true;
					}

					if (!hasTextItem(items)) {
						event.preventDefault();
						void insertImageFromNativeClipboard(editor, callApi);
						return true;
					}

					return false;
				},
				COMMAND_PRIORITY_HIGH,
			),
			editor.registerCommand(
				DRAG_DROP_PASTE,
				files => {
					void insertImageFiles(editor, callApi, files);
					return true;
				},
				COMMAND_PRIORITY_LOW,
			),
		);
	}, [editor, callApi]);

	if (!errorMessage) return null;
	return (
		<Alert
			color="red"
			icon={<WarningCircleIcon />}
			title="Couldn't store the image"
			withCloseButton
			onClose={clearErrorMessage}>
			{errorMessage}
		</Alert>
	);
}

// Stores the image before inserting it, so base64 never enters the document and autosaves don't resend it.
async function insertStoredImage(
	editor: LexicalEditor,
	callApi: CallApiFn,
	dataUri: string,
	altText: string,
) {
	const asset = await callApi(() => createAsset({ dataUri }));
	if (!asset) return;
	editor.dispatchCommand(INSERT_IMAGE_COMMAND, { altText, src: asset.src });
}

function getPastedImageFiles(items: DataTransferItemList): File[] {
	const files: File[] = [];
	for (const item of items) {
		if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
		const file = item.getAsFile();
		if (file) files.push(file);
	}
	return files;
}

async function insertImageFiles(
	editor: LexicalEditor,
	callApi: CallApiFn,
	files: File[],
) {
	let filesResult: Awaited<ReturnType<typeof mediaFileReader>>;
	try {
		filesResult = await mediaFileReader(files, ACCEPTABLE_IMAGE_TYPES);
	} catch {
		// A file failed to decode; nothing to paste.
		return;
	}
	for (const { file, result } of filesResult) {
		if (isMimeType(file, ACCEPTABLE_IMAGE_TYPES)) {
			await insertStoredImage(editor, callApi, result, file.name);
		}
	}
}

// A paste that carries actual text (text/plain or text/html) has something
// for the default rich-text paste handler to do; leave it alone.
function hasTextItem(items: DataTransferItemList): boolean {
	for (const item of items) {
		if (
			item.kind === "string" &&
			(item.type === "text/plain" || item.type === "text/html")
		) {
			return true;
		}
	}
	return false;
}

// Some webviews (notably WebKitGTK, which Tauri uses on Linux) don't expose
// a pasted image through clipboardData at all -- copying a screenshot or a
// file from a file manager shows up as a single "text/uri-list" string item,
// with no "file" kind item to read. The clipboard-manager plugin reads the
// OS clipboard natively instead of through the webview's DOM paste event, so
// it sees the actual image bytes regardless of what the DOM exposed.
async function insertImageFromNativeClipboard(
	editor: LexicalEditor,
	callApi: CallApiFn,
) {
	let src: string;
	try {
		const image = await readImage();
		const [rgba, { width, height }] = await Promise.all([
			image.rgba(),
			image.size(),
		]);
		src = rgbaToPngDataUrl(rgba, width, height);
	} catch {
		// Clipboard didn't actually contain a readable image; nothing to paste.
		return;
	}
	await insertStoredImage(editor, callApi, src, "Pasted image");
}

function rgbaToPngDataUrl(
	rgba: Uint8Array,
	width: number,
	height: number,
): string {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D context unavailable");
	ctx.putImageData(
		new ImageData(new Uint8ClampedArray(rgba), width, height),
		0,
		0,
	);
	return canvas.toDataURL("image/png");
}
