import { useEffect, useRef } from "react";
import {
	AnnotationTransferItem,
	useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";
import {
	getPdfHighlights,
	updatePdfHighlights,
} from "../../../../api/elements/api/elementsApi";
import { isPdfHighlightAnnotation } from "../components/pdfHighlightAnnotations";

/** Loads a PDF learning asset's persisted highlight annotations into
 * `@embedpdf/plugin-annotation` once its document is ready, and writes them
 * back (as `AnnotationTransferItem[]` JSON) whenever they change. The
 * backend's `highlights` column is an opaque JSON blob it never parses, so
 * the annotation plugin's own transfer format is what gets stored.
 *
 * `exportAnnotations()` returns *every* annotation the plugin knows about,
 * including the PDF's own native ones (links, etc.) that `getAllAnnotations`
 * loads on every open — those must never be persisted here, both because
 * they're not ours to own and because a large PDF can have thousands of
 * them, ballooning the blob and making every future import crawl. */
export function usePdfAnnotationsPersistence(
	documentId: string | null | undefined,
	learningAssetId: string,
) {
	const { provides: annotation } = useAnnotationCapability();
	const loadedRef = useRef(false);

	useEffect(() => {
		if (!annotation || !documentId) return;
		loadedRef.current = false;
		const scope = annotation.forDocument(documentId);

		let cancelled = false;
		void getPdfHighlights(learningAssetId).then(({ highlightsJson }) => {
			if (cancelled) return;
			const items = JSON.parse(
				highlightsJson,
			) as AnnotationTransferItem[];
			// `importAnnotations` dispatches straight into plugin state without
			// emitting an event (unlike a real create), so there's nothing to
			// echo-wait for — mark loaded once it's called.
			scope.importAnnotations(items);
			loadedRef.current = true;
		});

		const unsubscribe = scope.onAnnotationEvent(event => {
			if (event.type === "loaded") return;
			if (!loadedRef.current) return;
			void scope
				.exportAnnotations()
				.toPromise()
				.then(exported => {
					const highlights = exported.filter(item =>
						isPdfHighlightAnnotation(item.annotation),
					);
					void updatePdfHighlights({
						learningAssetId,
						highlightsJson: JSON.stringify(highlights),
					});
				});
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [annotation, documentId, learningAssetId]);
}
