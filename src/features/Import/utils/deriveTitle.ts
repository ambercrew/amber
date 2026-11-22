const TITLE_WORD_COUNT = 8;

/** First heading in the content, else the first ~8 words of the first
 * paragraph, so even an abandoned import is identifiable in the tree. */
export function deriveTitle(html: string, fallbackText: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html");

	const heading = doc.querySelector("h1, h2, h3, h4, h5, h6");
	const headingText = heading?.textContent?.trim();
	if (headingText) return headingText;

	const paragraphText = doc.querySelector("p")?.textContent?.trim();
	const words = firstWords(paragraphText, TITLE_WORD_COUNT);
	if (words.length > 0) return words.join(" ");

	const fallbackWords = firstWords(fallbackText, TITLE_WORD_COUNT);
	return fallbackWords.length > 0 ? fallbackWords.join(" ") : "Untitled";
}

function firstWords(text: string | undefined, count: number): string[] {
	if (!text) return [];
	return text.trim().split(/\s+/).filter(Boolean).slice(0, count);
}
