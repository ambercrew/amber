interface Rule {
	selectors: string[];
	declarations: Map<string, string>;
}

/** Formatting that carries meaning, e.g. a template's "highlighted part" that only its CSS makes bold. */
interface Effects {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	hidden?: boolean;
	block?: boolean;
	boxed?: boolean;
}

const WRAPPERS: [keyof Effects, string][] = [
	["bold", "b"],
	["italic", "i"],
	["underline", "u"],
	["strike", "s"],
];
// The card as a whole, night mode and pseudo-elements say nothing about a part of it.
const SKIPPED_SELECTOR =
	/nightMode|night_mode|\.card\b|(^|[\s>+~,])(html|body|\*)(?=$|[\s.#:[>+~])|::?(before|after|hover|focus|active)/i;
const INLINE_TAGS = new Set([
	"SPAN",
	"A",
	"B",
	"I",
	"U",
	"EM",
	"STRONG",
	"SMALL",
	"FONT",
	"LABEL",
]);
const parsed = new Map<string, Rule[]>();

/** Replaces the meaning a card's note type CSS gives its classes with markup the editor keeps. */
export function applyCardStyles(html: string): string {
	if (!html.includes("<style")) return html;
	const doc = new DOMParser().parseFromString(html, "text/html");
	const css = Array.from(doc.querySelectorAll("style"))
		.map(style => style.textContent ?? "")
		.join("\n");
	const effects = new Map<Element, Effects>();
	for (const rule of rulesOf(css)) {
		const ruleEffects = effectsOf(rule.declarations);
		if (Object.keys(ruleEffects).length === 0) continue;
		for (const selector of rule.selectors) {
			for (const element of select(doc, selector))
				effects.set(element, {
					...effects.get(element),
					...ruleEffects,
				});
		}
	}
	for (const [element, effect] of effects) apply(doc, element, effect);
	return doc.body.innerHTML;
}

function rulesOf(css: string): Rule[] {
	const cached = parsed.get(css);
	if (cached) return cached;
	const rules: Rule[] = [];
	const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
	let depth = 0;
	let start = 0;
	let selector = "";
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "{") {
			if (depth === 0) {
				selector = source.slice(start, i).trim();
				start = i + 1;
			}
			depth++;
		} else if (source[i] === "}") {
			depth = Math.max(0, depth - 1);
			// At-rules (media queries, fonts) hold their own rules: night mode and the like.
			if (depth === 0) {
				if (!selector.startsWith("@"))
					rules.push({
						selectors: selector
							.split(",")
							.map(part => part.trim())
							.filter(
								part => part && !SKIPPED_SELECTOR.test(part),
							),
						declarations: declarationsOf(source.slice(start, i)),
					});
				start = i + 1;
			}
		}
	}
	parsed.set(css, rules);
	return rules;
}

function declarationsOf(body: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (const declaration of body.split(";")) {
		const colon = declaration.indexOf(":");
		if (colon < 0) continue;
		declarations.set(
			declaration.slice(0, colon).trim().toLowerCase(),
			declaration
				.slice(colon + 1)
				.replace(/!important/i, "")
				.trim()
				.toLowerCase(),
		);
	}
	return declarations;
}

function effectsOf(declarations: Map<string, string>): Effects {
	const effects: Effects = {};
	const weight = declarations.get("font-weight");
	if (weight !== undefined)
		effects.bold = /^(bold|bolder)$/.test(weight) || Number(weight) >= 600;
	const style = declarations.get("font-style");
	if (style !== undefined) effects.italic = /italic|oblique/.test(style);
	const decoration =
		declarations.get("text-decoration-line") ??
		declarations.get("text-decoration");
	if (decoration !== undefined) {
		effects.underline = decoration.includes("underline");
		effects.strike = decoration.includes("line-through");
	}
	const display = declarations.get("display");
	if (display === "none" || declarations.get("visibility") === "hidden")
		effects.hidden = true;
	if (
		display !== undefined &&
		/^(block|flex|grid|list-item|table)$/.test(display)
	)
		effects.block = true;
	if (
		display !== undefined &&
		/^inline-(block|flex|grid|table)$/.test(display)
	)
		effects.boxed = true;
	return effects;
}

function select(doc: Document, selector: string): Element[] {
	try {
		return Array.from(doc.body.querySelectorAll(selector));
	} catch {
		// A selector the parser doesn't support matches nothing, as in Anki's older webviews.
		return [];
	}
}

function apply(doc: Document, element: Element, effects: Effects) {
	if (effects.hidden) {
		element.setAttribute("hidden", "");
		return;
	}
	for (const [effect, tag] of WRAPPERS) {
		if (!effects[effect] || element.closest(tag)) continue;
		const wrapper = doc.createElement(tag);
		wrapper.append(...Array.from(element.childNodes));
		element.append(wrapper);
	}
	// An inline element shown as its own line or box would otherwise run into its neighbours.
	if (!INLINE_TAGS.has(element.tagName)) return;
	if (effects.block) {
		const line = doc.createElement("div");
		line.append(...Array.from(element.childNodes));
		element.replaceWith(line);
	} else if (effects.boxed && element.nextSibling) {
		element.after(doc.createTextNode(" "));
	}
}
