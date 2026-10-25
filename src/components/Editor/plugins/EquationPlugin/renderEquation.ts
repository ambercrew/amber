import { renderToString } from "katex";
import { escapeHtml } from "../../../../utils/escapeHtml";

const MAX_CACHED = 2000;
const cache = new Map<string, string>();

/** KaTeX HTML for an equation, cached since remounted splits and exports render the same ones again. */
export function renderEquation(equation: string, display: boolean): string {
	const cacheKey = `${display ? "d" : "i"}${equation}`;
	const cached = cache.get(cacheKey);
	if (cached !== undefined) {
		// Re-inserting keeps recently used entries last, so eviction drops the oldest.
		cache.delete(cacheKey);
		cache.set(cacheKey, cached);
		return cached;
	}

	let html: string;
	try {
		html = renderToString(equation, {
			displayMode: display,
			throwOnError: false,
			output: "html",
			// Imported math often has Unicode KaTeX renders fine but warns about once per equation.
			strict: "ignore",
		});
	} catch {
		// The result becomes innerHTML, and equations come from imported content.
		html = escapeHtml(equation);
	}
	if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
	cache.set(cacheKey, html);
	return html;
}
