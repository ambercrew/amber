import { useEffect, useRef } from "react";
import { notifications } from "@mantine/notifications";
import {
	AnnotationTransferItem,
	useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";
import {
	getPdfHighlights,
	updatePdfHighlights,
} from "../../../../api/elements/api/elementsApi";
import errorToString from "../../../../utils/errorToString";
import { isPdfHighlightAnnotation } from "../components/pdfHighlightAnnotations";

function showHighlightError(message: string, error: unknown) {
	// eslint-disable-next-line no-console
	console.error(error);
	notifications.show({
		message: `${message} ${errorToString(error)}`,
		color: "red",
	});
}

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
	// Bumped per write attempt; a write only applies if still latest by the
	// time its export resolves, so an earlier one can't clobber a later.
	const writeTokenRef = useRef(0);

	useEffect(() => {
		if (!annotation || !documentId) return;
		loadedRef.current = false;
		const scope = annotation.forDocument(documentId);

		// A create event that fires before load resolves can't be persisted
		// yet (see save() below); remember to save once loading finishes so
		// it isn't silently lost.
		let missedWriteWhileLoading = false;

		function save() {
			const token = ++writeTokenRef.current;
			void scope
				.exportAnnotations()
				.toPromise()
				.then(exported => {
					if (writeTokenRef.current !== token) return;
					const highlights = exported.filter(item =>
						isPdfHighlightAnnotation(item.annotation),
					);
					return updatePdfHighlights({
						learningAssetId,
						highlightsJson: JSON.stringify(highlights),
					});
				})
				.catch((error: unknown) =>
					showHighlightError(
						"Could not save this PDF's highlights.",
						error,
					),
				);
		}

		let cancelled = false;
		void getPdfHighlights(learningAssetId)
			.then(({ highlightsJson }) => {
				if (cancelled) return;
				const items = JSON.parse(
					highlightsJson,
				) as AnnotationTransferItem[];
				// `importAnnotations` dispatches straight into plugin state
				// without emitting an event (unlike a real create), so there's
				// nothing to echo-wait for — mark loaded once it's called.
				scope.importAnnotations(items);
				loadedRef.current = true;
				if (missedWriteWhileLoading) save();
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				// `loadedRef` stays false on purpose: writing back now would
				// replace the highlights we failed to read with an empty set.
				showHighlightError(
					"Could not load this PDF's highlights — new highlights won't be saved.",
					error,
				);
			});

		const unsubscribe = scope.onAnnotationEvent(event => {
			if (event.type === "loaded") return;
			if (!loadedRef.current) {
				missedWriteWhileLoading = true;
				return;
			}
			save();
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [annotation, documentId, learningAssetId]);
}
