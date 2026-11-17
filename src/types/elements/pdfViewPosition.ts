/** Where a PDF was scrolled to: the 0-based page in view and the fraction of it at the viewport's anchor point, as embedpdf's viewpoint records it. */
export interface PdfViewPosition {
	pageIndex: number;
	fractionX: number;
	fractionY: number;
}
