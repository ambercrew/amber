import type { JSX } from "react";
import {
	$applyNodeReplacement,
	DecoratorNode,
	type DOMExportOutput,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import { render } from "katex";
import EquationComponent from "./EquationComponent";
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

export class EquationNode extends DecoratorNode<JSX.Element> {
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
		return document.createElement(this.__display ? "div" : "span");
	}

	updateDOM(): boolean {
		return false;
	}

	exportDOM(): DOMExportOutput {
		const element = createEquationElement(
			document,
			this.__equation,
			this.__display,
		);
		render(this.__equation, element, {
			displayMode: this.__display,
			throwOnError: false,
			output: "html",
		});
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

	decorate(): JSX.Element {
		return (
			<EquationComponent
				equation={this.__equation}
				display={this.__display}
				nodeKey={this.__key}
			/>
		);
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
