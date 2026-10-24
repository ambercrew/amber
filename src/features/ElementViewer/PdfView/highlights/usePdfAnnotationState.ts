import { useCallback, useSyncExternalStore } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";

/** The annotation plugin's state for a document, re-rendering whenever it changes; `null` before it's ready. */
export function usePdfAnnotationState(documentId: string | null) {
	const { provides: annotation } = useAnnotationCapability();
	return useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => {
				if (!annotation || !documentId) return () => undefined;
				return annotation
					.forDocument(documentId)
					.onStateChange(onStoreChange);
			},
			[annotation, documentId],
		),
		() =>
			annotation && documentId
				? annotation.forDocument(documentId).getState()
				: null,
	);
}
