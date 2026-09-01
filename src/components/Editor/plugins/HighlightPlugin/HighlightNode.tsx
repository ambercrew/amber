import {
	$applyNodeReplacement,
	type DOMConversionMap,
	type DOMConversionOutput,
	type EditorConfig,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type Spread,
} from "lexical";
import { MarkNode, type SerializedMarkNode } from "@lexical/mark";
import { type MantineColor } from "@mantine/core";
import styles from "./HighlightNode.module.css";

export type SerializedHighlightNode = Spread<
	{ color: MantineColor },
	SerializedMarkNode
>;

const HIGHLIGHT_TAG_NAME = "mark";
const HIGHLIGHT_ID_ATTRIBUTE = "data-highlight-id";
const HIGHLIGHT_COLOR_ATTRIBUTE = "data-highlight-color";

function applyHighlightAttributes(
	element: HTMLElement,
	id: string,
	color: MantineColor,
) {
	element.classList.add(styles.highlight);
	element.style.setProperty(
		"--highlight-bg-light",
		`var(--mantine-color-${color}-2)`,
	);
	element.style.setProperty(
		"--highlight-bg-dark",
		`var(--mantine-color-${color}-9)`,
	);
	element.setAttribute(HIGHLIGHT_ID_ATTRIBUTE, id);
	element.setAttribute(HIGHLIGHT_COLOR_ATTRIBUTE, color);
}

// HighlightNode returns a real DOMConversionMap from importDOM() so highlights
// survive this app's HTML-based persistence. MarkNode used to declare its own
// importDOM() typed to always return null, which needed a @ts-expect-error for
// the static-side variance; since @lexical/mark 0.49 it inherits LexicalNode's
// signature instead and the override is well-typed.
export class HighlightNode extends MarkNode {
	__color: MantineColor;

	static getType(): string {
		return "highlight";
	}

	static clone(node: HighlightNode): HighlightNode {
		return new HighlightNode(node.__ids, node.__color, node.__key);
	}

	afterCloneFrom(prevNode: this): void {
		super.afterCloneFrom(prevNode);
		this.__color = prevNode.__color;
	}

	constructor(
		ids: readonly string[] = [],
		color: MantineColor = "yellow",
		key?: NodeKey,
	) {
		super(ids, key);
		this.__color = color;
	}

	createDOM(config: EditorConfig): HTMLElement {
		const element = super.createDOM(config);
		applyHighlightAttributes(element, this.getIDs()[0] ?? "", this.__color);
		return element;
	}

	updateDOM(
		prevNode: this,
		element: HTMLElement,
		config: EditorConfig,
	): boolean {
		super.updateDOM(prevNode, element, config);
		applyHighlightAttributes(element, this.getIDs()[0] ?? "", this.__color);
		return false;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			[HIGHLIGHT_TAG_NAME]: node => {
				if (
					!(node instanceof HTMLElement) ||
					!node.hasAttribute(HIGHLIGHT_ID_ATTRIBUTE)
				) {
					return null;
				}
				return {
					conversion: $convertHighlightElement,
					priority: 1,
				};
			},
		};
	}

	exportJSON(): SerializedHighlightNode {
		return {
			...super.exportJSON(),
			color: this.__color,
		};
	}

	static importJSON(serialized: SerializedHighlightNode): HighlightNode {
		return $createHighlightNode(
			serialized.ids,
			serialized.color,
		).updateFromJSON(serialized);
	}

	updateFromJSON(
		serializedNode: LexicalUpdateJSON<SerializedHighlightNode>,
	): this {
		const self = super.updateFromJSON(serializedNode);
		self.__color = serializedNode.color;
		return self;
	}

	getColor(): MantineColor {
		return this.getLatest().__color;
	}

	getHighlightId(): string {
		return this.getIDs()[0] ?? "";
	}

	excludeFromCopy(): boolean {
		return false;
	}
}

function $convertHighlightElement(element: HTMLElement): DOMConversionOutput {
	const id = element.getAttribute(HIGHLIGHT_ID_ATTRIBUTE) ?? "";
	const color = (element.getAttribute(HIGHLIGHT_COLOR_ATTRIBUTE) ??
		"yellow") as MantineColor;
	return { node: $createHighlightNode([id], color) };
}

export function $createHighlightNode(
	ids: readonly string[],
	color: MantineColor,
): HighlightNode {
	return $applyNodeReplacement(new HighlightNode(ids, color));
}

export function $isHighlightNode(
	node: LexicalNode | null | undefined,
): node is HighlightNode {
	return node instanceof HighlightNode;
}
