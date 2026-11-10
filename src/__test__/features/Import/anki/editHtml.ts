/** Runs an in-place document pass over `html`, returning the body it leaves. */
export function editHtml(html: string, edit: (doc: Document) => void): string {
	const doc = new DOMParser().parseFromString(html, "text/html");
	edit(doc);
	return doc.body.innerHTML;
}
