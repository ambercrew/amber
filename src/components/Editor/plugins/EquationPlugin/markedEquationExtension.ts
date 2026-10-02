import type { MarkedExtension, Tokens } from "marked";
import { createEquationElement } from "./equationElement";
import {
	BRACKET_SOURCE,
	DISPLAY_DOLLAR_SOURCE,
	INLINE_DOLLAR_SOURCE,
	PAREN_SOURCE,
} from "./equationSyntax";

interface EquationToken extends Tokens.Generic {
	equation: string;
	display: boolean;
}

const MATH_ENVIRONMENTS =
	"equation|align|alignat|gather|multline|flalign|eqnarray|split";

const BLOCK_END = String.raw` *(?:\n+|$)`;

// `\end{…}` must close the same environment, so nested ones (`split` inside
// `equation`) stay whole.
const BLOCK_RULES = [
	new RegExp(String.raw`^ {0,3}${DISPLAY_DOLLAR_SOURCE}${BLOCK_END}`),
	new RegExp(String.raw`^ {0,3}${BRACKET_SOURCE}${BLOCK_END}`),
	new RegExp(
		String.raw`^ {0,3}(\\begin\{((?:${MATH_ENVIRONMENTS})\*?)\}[\s\S]+?\\end\{\2\})${BLOCK_END}`,
	),
	// GitHub/GitLab's ```math fences; extensions run before marked's own.
	...["`", "~"].map(
		fence =>
			new RegExp(
				String.raw`^ {0,3}${fence}{3}math *\n([\s\S]+?)\n {0,3}${fence}{3}${BLOCK_END}`,
			),
	),
];

// No inline `\[…\]`: Markdown escapes literal brackets that way, e.g. `\[1\]`.
const INLINE_RULES: [RegExp, boolean][] = [
	[new RegExp(`^${DISPLAY_DOLLAR_SOURCE}`), true],
	[new RegExp(`^${PAREN_SOURCE}`), false],
	// GitHub's inline form, $`…`$.
	[/^\$`([^`]+)`\$/, false],
	[new RegExp(`^${INLINE_DOLLAR_SOURCE}`), false],
];

function equationHtml(equation: string, display: boolean): string {
	return createEquationElement(document, equation, display).outerHTML;
}

function equationToken(
	type: string,
	match: RegExpExecArray,
	display: boolean,
): EquationToken {
	return { type, raw: match[0], equation: match[1].trim(), display };
}

/** Parses TeX math delimiters into equation nodes' canonical HTML. */
export const markedEquationExtension: MarkedExtension = {
	extensions: [
		{
			name: "blockEquation",
			level: "block",
			start: src =>
				/^ {0,3}(?:\$\$|\\\[|\\begin\{|```math|~~~math)/m.exec(src)
					?.index,
			tokenizer(src) {
				for (const rule of BLOCK_RULES) {
					const match = rule.exec(src);
					if (match)
						return equationToken("blockEquation", match, true);
				}
				return undefined;
			},
			renderer: token =>
				`<p>${equationHtml((token as EquationToken).equation, true)}</p>`,
		},
		{
			name: "inlineEquation",
			level: "inline",
			start: src => /\$|\\\(/.exec(src)?.index,
			tokenizer(src) {
				for (const [rule, display] of INLINE_RULES) {
					const match = rule.exec(src);
					if (match)
						return equationToken("inlineEquation", match, display);
				}
				return undefined;
			},
			renderer(token) {
				const { equation, display } = token as EquationToken;
				return equationHtml(equation, display);
			},
		},
	],
};
