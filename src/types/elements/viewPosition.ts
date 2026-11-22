/** Where a learning asset was scrolled to: the block at the viewport top, and how far past its top `scrollTop` sat. */
export interface ViewPosition {
	split: number;
	block: number;
	offset: number;
}
