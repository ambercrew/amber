import { useEffect, useRef } from "react";
import {
	AnnotationTransferItem,
	useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";
import {
	getPdfHighlights,
	updatePdfHighlights,
} from "../../../../api/elements/api/elementsApi";

/** Loads a PDF learning asset's persisted highlight annotations into
 * `@embedpdf/plugin-annotation` once its document is ready, and writes them
 * back (as `AnnotationTransferItem[]` JSON) whenever they change. The
 * backend's `highlights` column is an opaque JSON blob it never parses, so
 * the annotation plugin's own transfer format is what gets stored. */
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
			if (items.length > 0) scope.importAnnotations(items);
			loadedRef.current = true;
		});

		const unsubscribe = scope.onAnnotationEvent(event => {
			if (event.type === "loaded" || !event.committed) return;
			if (!loadedRef.current) return;
			void scope
				.exportAnnotations()
				.toPromise()
				.then(exported => {
					void updatePdfHighlights({
						learningAssetId,
						highlightsJson: JSON.stringify(exported),
					});
				});
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [annotation, documentId, learningAssetId]);
}
