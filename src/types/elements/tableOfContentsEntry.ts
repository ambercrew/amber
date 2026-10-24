/** A heading in the open view's table of contents; the view that published it resolves `id` back to its place. */
export interface TableOfContentsEntry {
	id: string;
	title: string;
	/** False for a heading with nowhere to jump, only a parent for its children. */
	selectable: boolean;
	children?: TableOfContentsEntry[];
}
