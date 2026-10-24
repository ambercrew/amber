import { useCallback } from "react";
import {
	AnnotationLayer,
	BoxedAnnotationRenderer,
} from "@embedpdf/plugin-annotation/react";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import { GlyphPointer } from "@embedpdf/plugin-selection";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";
import { useRecordExtractReadPoint } from "../../readPoint/readPointContext";
import PdfFloatingMenu from "../highlights/PdfFloatingMenu";
import PdfPageMarks from "../marks/PdfPageMarks";
import { PDF_PAGE_ATTRIBUTE } from "./PdfContextMenu";
import { usePdfCore } from "./pdfCoreContext";

interface PdfPageProps {
	pageIndex: number;
	/** Shared by every page, so they're built once by the document rather than per page. */
	annotationRenderers: BoxedAnnotationRenderer[];
	selectionAnchor: GlyphPointer | null;
}

/** One PDF page with its layers: rendering, annotations, text selection, search matches and marks. */
export default function PdfPage({
	pageIndex,
	annotationRenderers,
	selectionAnchor,
}: PdfPageProps) {
	const { documentId, learningAssetId } = usePdfCore();
	const recordExtractReadPoint = useRecordExtractReadPoint();
	const handleHighlightCreated = useCallback(
		(lastPageIndex: number) => recordExtractReadPoint(lastPageIndex + 1, 0),
		[recordExtractReadPoint],
	);

	return (
		<PagePointerProvider
			documentId={documentId}
			pageIndex={pageIndex}
			{...{ [PDF_PAGE_ATTRIBUTE]: pageIndex + 1 }}>
			{/* Without `draggable={false}`, the native image drag fires pointercancel with no
			    pointerup, leaving embedpdf's text selection stuck "selecting". */}
			<RenderLayer
				documentId={documentId}
				pageIndex={pageIndex}
				draggable={false}
			/>
			<AnnotationLayer
				documentId={documentId}
				pageIndex={pageIndex}
				annotationRenderers={annotationRenderers}
			/>
			<SelectionLayer
				documentId={documentId}
				pageIndex={pageIndex}
				selectionMenu={props => (
					<PdfFloatingMenu
						{...props}
						learningAssetId={learningAssetId}
						selectionAnchor={selectionAnchor}
						onHighlightCreated={handleHighlightCreated}
					/>
				)}
			/>
			<SearchLayer documentId={documentId} pageIndex={pageIndex} />
			<PdfPageMarks pageNumber={pageIndex + 1} />
		</PagePointerProvider>
	);
}
