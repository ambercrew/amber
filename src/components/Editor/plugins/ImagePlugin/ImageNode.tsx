import type { JSX } from "react";
import {
	$applyNodeReplacement,
	DecoratorNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	type LexicalEditor,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import ImageComponent from "./ImageComponent";
import {
	assetIdFromSrc,
	toCanonicalImageSrc,
} from "../../../../utils/assetUrl";

export interface ImagePayload {
	src: string;
	altText: string;
	width?: "inherit" | number;
	height?: "inherit" | number;
	key?: NodeKey;
}

export type SerializedImageNode = Spread<
	{
		src: string;
		altText: string;
		width?: number;
		height?: number;
	},
	SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<JSX.Element> {
	__src: string;
	__altText: string;
	__width: "inherit" | number;
	__height: "inherit" | number;

	static getType(): string {
		return "image";
	}

	static clone(node: ImageNode): ImageNode {
		return new ImageNode(
			node.__src,
			node.__altText,
			node.__width,
			node.__height,
			node.__key,
		);
	}

	constructor(
		src: string,
		altText: string,
		width?: "inherit" | number,
		height?: "inherit" | number,
		key?: NodeKey,
	) {
		super(key);
		this.__src = src;
		this.__altText = altText;
		this.__width = width ?? "inherit";
		this.__height = height ?? "inherit";
	}

	static importDOM(): DOMConversionMap | null {
		return {
			img: () => ({ conversion: $convertImageElement, priority: 0 }),
		};
	}

	static importJSON(serialized: SerializedImageNode): ImageNode {
		return $createImageNode({
			altText: serialized.altText,
			height: serialized.height,
			src: serialized.src,
			width: serialized.width,
		}).updateFromJSON(serialized);
	}

	updateFromJSON(
		serializedNode: LexicalUpdateJSON<SerializedImageNode>,
	): this {
		const node = super.updateFromJSON(serializedNode);
		node.__src = serializedNode.src;
		node.__altText = serializedNode.altText;
		node.__width = serializedNode.width ?? "inherit";
		node.__height = serializedNode.height ?? "inherit";
		return node;
	}

	exportJSON(): SerializedImageNode {
		return {
			...super.exportJSON(),
			altText: this.getAltText(),
			height: this.__height === "inherit" ? undefined : this.__height,
			src: this.getSrc(),
			width: this.__width === "inherit" ? undefined : this.__width,
		};
	}

	exportDOM(editor: LexicalEditor): DOMExportOutput {
		const element = document.createElement("img");
		element.setAttribute("src", $exportableImageSrc(editor, this));
		element.setAttribute("alt", this.__altText);
		element.setAttribute("width", this.__width.toString());
		element.setAttribute("height", this.__height.toString());
		return { element };
	}

	createDOM(config: EditorConfig): HTMLElement {
		const span = document.createElement("span");
		const className = config.theme.image;
		if (className !== undefined) span.className = className;
		return span;
	}

	updateDOM(): false {
		return false;
	}

	getSrc(): string {
		return this.getLatest().__src;
	}

	getAltText(): string {
		return this.getLatest().__altText;
	}

	setWidthAndHeight(
		width: "inherit" | number,
		height: "inherit" | number,
	): this {
		const writable = this.getWritable();
		writable.__width = width;
		writable.__height = height;
		return writable;
	}

	decorate(): JSX.Element {
		return (
			<ImageComponent
				src={this.__src}
				altText={this.__altText}
				width={this.__width}
				height={this.__height}
				nodeKey={this.getKey()}
			/>
		);
	}
}

export function $createImageNode({
	src,
	altText,
	width,
	height,
	key,
}: ImagePayload): ImageNode {
	return $applyNodeReplacement(
		new ImageNode(src, altText, width, height, key),
	);
}

export function $isImageNode(
	node: LexicalNode | null | undefined,
): node is ImageNode {
	return node instanceof ImageNode;
}

// Exported HTML only reaches the clipboard, where other apps can't load `amber-asset:`, so inline the rendered pixels.
function $exportableImageSrc(editor: LexicalEditor, node: ImageNode): string {
	const src = node.getSrc();
	if (assetIdFromSrc(src) === null) return src;
	const img = editor.getElementByKey(node.getKey())?.querySelector("img");
	if (!img?.complete || img.naturalWidth === 0) return src;
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	try {
		canvas.getContext("2d")?.drawImage(img, 0, 0);
		return canvas.toDataURL();
	} catch {
		return src;
	}
}

// Reads the width/height *attributes* rather than the img.width/img.height
// IDL properties. Those properties fall back to 0 when the element hasn't
// loaded and has no attribute to reflect -- which is always true for the
// detached DOMParser document Editor.tsx parses saved HTML with. Since 0
// isn't null/undefined, that 0 would otherwise get treated as an explicit
// size and permanently baked into every subsequent save.
function $parsePositiveIntAttribute(
	element: HTMLElement,
	name: string,
): number | undefined {
	const value = Number(element.getAttribute(name));
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

function $convertImageElement(domNode: Node): DOMConversionOutput | null {
	if (!(domNode instanceof HTMLImageElement)) return null;
	const { src, alt } = domNode;
	if (!src) return null;
	return {
		node: $createImageNode({
			altText: alt,
			src: toCanonicalImageSrc(src),
			width: $parsePositiveIntAttribute(domNode, "width"),
			height: $parsePositiveIntAttribute(domNode, "height"),
		}),
	};
}
