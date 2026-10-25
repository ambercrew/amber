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
import { isPdfHighlightAnnotation } from "./pdfHighlightAnnotations";

function showHighlightError(message: string, error: unknown) {
	// eslint-disable-next-line no-console
	console.error(error);
	notifications.show({
		message: `${message} ${errorToString(error)}`,
		color: "red",
	});
}

/** Loads a PDF's saved highlights into the annotation plugin and saves them back, in its own transfer format, as they change.
 * Only our highlights are saved: the PDF's native annotations (links, …) aren't ours, and can number in the thousands. */
export function usePdfAnnotationsPersistence(
	documentId: string | null | undefined,
	learningAssetId: string,
) {
	const { provides: annotation } = useAnnotationCapability();
	const loadedRef = useRef(false);
	// Bumped per write; a write applies only if still the latest when its export resolves, so an earlier can't clobber a later.
	const writeTokenRef = useRef(0);

	useEffect(() => {
		if (!annotation || !documentId) return;
		loadedRef.current = false;
		const scope = annotation.forDocument(documentId);

		// A change made before loading finishes can't be saved yet; save once it does, so it isn't lost.
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
				// Importing emits no annotation event, so there's no echo to wait for.
				scope.importAnnotations(items);
				loadedRef.current = true;
				if (missedWriteWhileLoading) save();
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				// Stays unloaded on purpose: saving now would replace the unread highlights with none.
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
