import {
	$applyNodeReplacement,
	TextNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type SerializedTextNode,
	type Spread,
} from "lexical";
import styles from "./ClozeHiddenNode.module.css";
import {
	CLOZE_HIDDEN_ATTRIBUTE,
	CLOZE_HIDDEN_TAG_NAME,
	CLOZE_PLACEHOLDER,
} from "./clozeHiddenConstants";

export type SerializedClozeHiddenNode = Spread<
	{ hiddenText: string },
	SerializedTextNode
>;

// Displays a literal "[...]" and keeps the hidden phrase as data (e.g. to seed a nested cloze). A
// TextNode rather than a DecoratorNode, so the placeholder styles and edits like any text run.
export class ClozeHiddenNode extends TextNode {
	__hiddenText: string;

	static getType(): string {
		return "cloze-hidden";
	}

	static clone(node: ClozeHiddenNode): ClozeHiddenNode {
		return new ClozeHiddenNode(node.__hiddenText, node.__text, node.__key);
	}

	constructor(
		hiddenText: string,
		text: string = CLOZE_PLACEHOLDER,
		key?: NodeKey,
	) {
		super(text, key);
		this.__hiddenText = hiddenText;
	}

	createDOM(config: EditorConfig): HTMLElement {
		const element = super.createDOM(config);
		element.classList.add(styles["cloze-hidden"]);
		return element;
	}

	updateDOM(
		prevNode: this,
		element: HTMLElement,
		config: EditorConfig,
	): boolean {
		const updated = super.updateDOM(prevNode, element, config);
		element.classList.add(styles["cloze-hidden"]);
		return updated;
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement(CLOZE_HIDDEN_TAG_NAME);
		element.classList.add(styles["cloze-hidden"]);
		element.setAttribute(CLOZE_HIDDEN_ATTRIBUTE, this.__hiddenText);
		element.textContent = this.getTextContent();
		return { element };
	}

	static importDOM(): DOMConversionMap | null {
		return {
			[CLOZE_HIDDEN_TAG_NAME]: node => {
				if (
					!(node instanceof HTMLElement) ||
					!node.hasAttribute(CLOZE_HIDDEN_ATTRIBUTE)
				) {
					return null;
				}
				return {
					conversion: $convertClozeHiddenElement,
					priority: 1,
				};
			},
		};
	}

	exportJSON(): SerializedClozeHiddenNode {
		return {
			...super.exportJSON(),
			hiddenText: this.__hiddenText,
		};
	}

	static importJSON(serialized: SerializedClozeHiddenNode): ClozeHiddenNode {
		return $createClozeHiddenNode(
			serialized.hiddenText,
			serialized.text,
		).updateFromJSON(serialized);
	}

	updateFromJSON(
		serializedNode: LexicalUpdateJSON<SerializedClozeHiddenNode>,
	): this {
		const self = super.updateFromJSON(serializedNode);
		self.__hiddenText = serializedNode.hiddenText;
		return self;
	}

	getHiddenText(): string {
		return this.getLatest().__hiddenText;
	}
}

function $convertClozeHiddenElement(element: HTMLElement): DOMConversionOutput {
	const hiddenText = element.getAttribute(CLOZE_HIDDEN_ATTRIBUTE) ?? "";
	return {
		node: $createClozeHiddenNode(
			hiddenText,
			element.textContent ?? undefined,
		),
	};
}

export function $createClozeHiddenNode(
	hiddenText: string,
	text?: string,
): ClozeHiddenNode {
	return $applyNodeReplacement(new ClozeHiddenNode(hiddenText, text));
}

export function $isClozeHiddenNode(
	node: LexicalNode | null | undefined,
): node is ClozeHiddenNode {
	return node instanceof ClozeHiddenNode;
}
