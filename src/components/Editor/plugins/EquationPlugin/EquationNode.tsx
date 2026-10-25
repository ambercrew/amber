import {
	$applyNodeReplacement,
	DecoratorNode,
	type DOMExportOutput,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import "katex/dist/katex.min.css";
import { renderEquation } from "./renderEquation";
import {
	createEquationElement,
	decodeEquation,
	EQUATION_ATTRIBUTE_NAME,
	EQUATION_DISPLAY_ATTRIBUTE_NAME,
	EQUATION_TAG_NAME,
} from "./equationElement";

// `display` is optional so equations saved before display math still load.
export type SerializedEquationNode = Spread<
	{ equation: string; display?: boolean },
	SerializedLexicalNode
>;

/** The span holding the rendered equation inside an equation node's DOM element. */
export function equationContentOf(
	element: HTMLElement | null,
): HTMLElement | null {
	return (element?.firstElementChild as HTMLElement | null) ?? null;
}

// Rendered straight into the DOM rather than by a React decorator: a portal per equation makes
// mounting an equation-heavy split hundreds of milliseconds slower. Editing is EquationEditingPlugin's.
export class EquationNode extends DecoratorNode<null> {
	__equation: string;
	__display: boolean;

	static getType(): string {
		return "equation";
	}

	static clone(node: EquationNode): EquationNode {
		return new EquationNode(node.__equation, node.__display, node.__key);
	}

	constructor(equation = "", display = false, key?: NodeKey) {
		super(key);
		this.__equation = equation;
		this.__display = display;
	}

	createDOM(): HTMLElement {
		const element = document.createElement(this.__display ? "div" : "span");
		const content = document.createElement("span");
		Object.assign(content.style, {
			cursor: "pointer",
			display: this.__display ? "block" : "inline-block",
			maxWidth: "100%",
			// KaTeX's invisible struts overflow by a few px; the padding
			// absorbs them and the negative margin keeps the line height.
			overflowX: "auto",
			overflowY: "hidden",
			padding: "0.2em 2px",
			margin: "-0.2em 0",
			verticalAlign: "top",
			borderRadius: "var(--mantine-radius-xs)",
		});
		content.innerHTML = renderEquation(this.__equation, this.__display);
		element.appendChild(content);
		return element;
	}

	updateDOM(prevNode: EquationNode, dom: HTMLElement): boolean {
		if (prevNode.__display !== this.__display) return true;
		const content = equationContentOf(dom);
		if (prevNode.__equation !== this.__equation && content)
			content.innerHTML = renderEquation(this.__equation, this.__display);
		return false;
	}

	exportDOM(): DOMExportOutput {
		const element = createEquationElement(
			document,
			this.__equation,
			this.__display,
		);
		element.innerHTML = renderEquation(this.__equation, this.__display);
		return { element };
	}

	static importDOM() {
		const convert = (node: Node) => {
			if (
				!(node instanceof HTMLElement) ||
				!node.hasAttribute(EQUATION_ATTRIBUTE_NAME)
			) {
				return null;
			}
			return {
				conversion: $convertEquationElement,
				priority: 0,
			};
		};
		return { [EQUATION_TAG_NAME]: convert } as unknown as null;
	}

	exportJSON(): SerializedEquationNode {
		return {
			...super.exportJSON(),
			equation: this.__equation,
			display: this.__display,
		};
	}

	static importJSON(serialized: SerializedEquationNode): EquationNode {
		return $createEquationNode(
			serialized.equation,
			serialized.display ?? false,
		);
	}

	getEquation(): string {
		return this.getLatest().__equation;
	}

	setEquation(equation: string): this {
		const writable = this.getWritable();
		writable.__equation = equation;
		return writable;
	}

	getTextContent(): string {
		const delimiter = this.__display ? "$$" : "$";
		return `${delimiter}${this.__equation}${delimiter}`;
	}

	decorate(): null {
		return null;
	}
}

function $convertEquationElement(element: HTMLElement) {
	const encoded = element.getAttribute(EQUATION_ATTRIBUTE_NAME);
	const equation = encoded ? decodeEquation(encoded) : "";
	const display =
		element.getAttribute(EQUATION_DISPLAY_ATTRIBUTE_NAME) === "true";
	return { node: $createEquationNode(equation, display) };
}

export function $createEquationNode(
	equation = "",
	display = false,
): EquationNode {
	return $applyNodeReplacement(new EquationNode(equation, display));
}

export function $isEquationNode(
	node: LexicalNode | null | undefined,
): node is EquationNode {
	return node instanceof EquationNode;
}
